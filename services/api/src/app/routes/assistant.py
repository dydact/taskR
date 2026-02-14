from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.events.bus import event_bus
from app.models.core import ChatMessage, ChatSession
from app.routes.utils import get_tenant
from app.schemas import AssistantQueryRequest, AssistantResponse, AssistantSource
from app.services.insight import query_assistant
from app.services.memory import MemorySearchResult, memory_search_client
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/assistant", tags=["assistant"])


class _AssistantError(HTTPException):
    pass


class _RateLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self._limit = limit
        self._window = window_seconds
        self._buckets: dict[uuid.UUID, list[float]] = {}
        self._lock = asyncio.Lock()

    async def check(self, tenant_id: uuid.UUID) -> bool:
        now = time.monotonic()
        async with self._lock:
            timestamps = [ts for ts in self._buckets.get(tenant_id, []) if now - ts < self._window]
            if len(timestamps) >= self._limit:
                self._buckets[tenant_id] = timestamps
                return False
            timestamps.append(now)
            self._buckets[tenant_id] = timestamps
            return True


_RATE_LIMITER = _RateLimiter(limit=60, window_seconds=60)


@dataclass(slots=True)
class AssistantPersistenceResult:
    session_id: uuid.UUID
    answer_message_id: uuid.UUID


def _build_prompt(question: str, context: dict[str, Any] | None, sources: list[MemorySearchResult]) -> str:
    lines: list[str] = [
        "You are TaskR's knowledge assistant. Respond with concise, accurate answers grounded in the provided company data.",
        "Use bullet points when helpful and cite source numbers in parentheses (e.g., [S1]).",
    ]
    if context:
        lines.append("Context:")
        for key, value in context.items():
            if key == "filters":
                continue
            lines.append(f"- {key}: {value}")
    if sources:
        lines.append("")
        lines.append("Sources:")
        for idx, source in enumerate(sources, start=1):
            title = source.title or source.resource_type
            snippet = source.content or source.snippet or ""
            snippet = snippet.strip()
            if len(snippet) > 600:
                snippet = snippet[:597].rstrip() + "..."
            lines.append(f"[S{idx}] {title} ({source.resource_type})")
            if snippet:
                lines.append(snippet)
            lines.append("")
    lines.append("Question:")
    lines.append(question.strip())
    lines.append("")
    lines.append("Provide the best possible answer and reference sources where applicable.")
    return "\n".join(lines)


async def _persist_interaction(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_label: str | None,
    question: str,
    answer: str,
    *,
    session_id: uuid.UUID | None,
    sources: list[AssistantSource],
) -> AssistantPersistenceResult:
    if session_id is not None:
        session_row = await db.get(ChatSession, session_id)
        if session_row is None or session_row.tenant_id != tenant_id:
            raise _AssistantError(status_code=status.HTTP_404_NOT_FOUND, detail="session_not_found")
    else:
        session_row = ChatSession(
            tenant_id=tenant_id,
            name="Knowledge Assistant",
            created_by_label=user_label,
        )
        db.add(session_row)
        await db.flush()
        await db.refresh(session_row)

    result = await db.execute(
        select(func.max(ChatMessage.position)).where(
            ChatMessage.tenant_id == tenant_id, ChatMessage.session_id == session_row.session_id
        )
    )
    max_position = result.scalar() or 0

    question_message = ChatMessage(
        tenant_id=tenant_id,
        session_id=session_row.session_id,
        role="user",
        content=question.strip(),
        position=max_position + 1,
    )
    db.add(question_message)
    await db.flush()

    sources_text = ""
    if sources:
        formatted = "\n".join(f"[{idx+1}] {src.resource_type} {src.resource_id}" for idx, src in enumerate(sources))
        sources_text = f"\n\nSources:\n{formatted}"

    answer_message = ChatMessage(
        tenant_id=tenant_id,
        session_id=session_row.session_id,
        role="assistant",
        content=f"{answer.strip()}{sources_text}",
        position=max_position + 2,
    )
    db.add(answer_message)
    await db.flush()
    await db.refresh(answer_message)

    return AssistantPersistenceResult(session_id=session_row.session_id, answer_message_id=answer_message.message_id)


def _format_sources(results: list[MemorySearchResult]) -> list[AssistantSource]:
    formatted: list[AssistantSource] = []
    for item in results:
        snippet = item.snippet or item.content or ""
        snippet = snippet.strip()
        if len(snippet) > 200:
            snippet = snippet[:197].rstrip() + "..."
        formatted.append(
            AssistantSource(
                resource_type=item.resource_type,
                resource_id=str(item.resource_id),
                snippet=snippet,
            )
        )
    return formatted


@router.post("/query", response_model=AssistantResponse)
async def assistant_query(
    payload: AssistantQueryRequest,
    db: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> AssistantResponse:
    question = (payload.question or "").strip()
    if not question:
        raise _AssistantError(status_code=status.HTTP_400_BAD_REQUEST, detail="question_required")

    tenant = await get_tenant(db, headers.tenant_id)
    if not await _RATE_LIMITER.check(tenant.tenant_id):
        raise _AssistantError(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="rate_limited")

    search_results = await memory_search_client.search(
        tenant.tenant_id,
        question,
        context=payload.context or {},
        limit=5,
    )
    prompt = _build_prompt(question, payload.context or {}, search_results)

    answer = await query_assistant(str(tenant.tenant_id), prompt, mode=payload.mode or "summary")
    if not answer:
        answer = "I'm unable to generate an answer right now. Please try again shortly."

    sources = _format_sources(search_results)
    persistence = await _persist_interaction(
        db,
        tenant.tenant_id,
        headers.user_id,
        question,
        answer,
        session_id=payload.session_id,
        sources=sources,
    )

    await event_bus.publish(
        {
            "type": "assistant.reply",
            "tenant_id": str(tenant.tenant_id),
            "session_id": str(persistence.session_id),
            "message_id": str(persistence.answer_message_id),
        }
    )

    return AssistantResponse(
        answer=answer,
        sources=sources,
        session_id=str(persistence.session_id),
        message_id=str(persistence.answer_message_id),
    )
