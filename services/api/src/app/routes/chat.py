from __future__ import annotations

from typing import Any, Optional
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db_session
from app.models.core import ChatSession as ChatSessionModel, ChatMessage as ChatMessageModel
from app.routes.utils import get_tenant
from app.utils.http import post_with_retry
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/chat", tags=["chat"])


class _ChatError(HTTPException):
    pass


def _select_model(mode: Optional[str]) -> str:
    model = settings.local_openai_model
    if (mode or "").lower() in {"reason", "reasoning"}:
        model = settings.local_openai_reason_model or model
    return model


def _user_label_from_header(x_user_id: Optional[str]) -> Optional[str]:
    value = (x_user_id or "").strip()
    return value or None


@router.post("/completions")
async def chat_completions(
    payload: dict[str, Any],
    headers: TenantHeaders = Depends(get_tenant_headers),
    x_model_profile: Optional[str] = Header(default=None, alias="x-model-profile"),
) -> dict[str, Any]:
    if not settings.local_openai_base_url and not settings.use_toolfront:
        raise _ChatError(status_code=503, detail="LLM backend is not configured")

    base = settings.local_openai_base_url
    if not base:
        raise _ChatError(status_code=503, detail="Local OpenAI endpoint not configured")

    url = f"{base.rstrip('/')}/v1/chat/completions"
    messages = payload.get("messages")
    if not isinstance(messages, list) or not messages:
        raise _ChatError(status_code=400, detail="messages array is required")

    req: dict[str, Any] = {
        "model": _select_model(x_model_profile),
        "messages": messages,
        "temperature": payload.get("temperature", 0.3),
        "max_tokens": payload.get("max_tokens", 1800),
        "stream": bool(payload.get("stream", False)),
    }
    for key in ("top_p", "stop", "frequency_penalty", "presence_penalty", "response_format"):
        if key in payload:
            req[key] = payload[key]

    if req["stream"]:
        async def _iter() -> Any:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", url, json=req) as response:
                    if response.status_code >= 400:
                        body = await response.aread()
                        yield body
                        return
                    async for chunk in response.aiter_raw():
                        if chunk:
                            yield chunk

        return StreamingResponse(_iter(), media_type="text/event-stream")

    response = await post_with_retry(
        url,
        payload=req,
        timeout=settings.insight_api_timeout_seconds,
        retries=1,
    )
    if response.status_code >= 400:
        raise _ChatError(status_code=response.status_code, detail=response.text)
    return JSONResponse(response.json())


@router.get("/sessions")
async def list_sessions(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> Any:
    tenant = await get_tenant(session, headers.tenant_id)
    result = await session.execute(
        select(ChatSessionModel).where(ChatSessionModel.tenant_id == tenant.tenant_id).order_by(ChatSessionModel.updated_at.desc())
    )
    rows = result.scalars().all()
    return {
        "data": [
            {
                "id": str(row.session_id),
                "name": row.name,
                "created": row.created_at.isoformat(),
                "updated": row.updated_at.isoformat(),
            }
            for row in rows
        ]
    }


@router.post("/sessions")
async def create_session(
    payload: dict[str, Any] | None = None,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> Any:
    tenant = await get_tenant(session, headers.tenant_id)
    name = (payload or {}).get("name") or "Session"
    row = ChatSessionModel(
        tenant_id=tenant.tenant_id,
        name=name[:255],
        created_by_label=_user_label_from_header(headers.user_id),
    )
    session.add(row)
    await session.flush()
    await session.refresh(row)
    return {
        "id": str(row.session_id),
        "name": row.name,
        "created": row.created_at.isoformat(),
        "updated": row.updated_at.isoformat(),
    }


@router.patch("/sessions/{session_id}")
async def update_session(
    session_id: uuid.UUID,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> Any:
    tenant = await get_tenant(db, headers.tenant_id)
    row = await db.get(ChatSessionModel, session_id)
    if row is None or row.tenant_id != tenant.tenant_id:
        raise _ChatError(status_code=404, detail="session_not_found")
    name = (payload.get("name") or "").strip()
    if name:
        row.name = name[:255]
    await db.flush()
    await db.refresh(row)
    return {
        "id": str(row.session_id),
        "name": row.name,
        "created": row.created_at.isoformat(),
        "updated": row.updated_at.isoformat(),
    }


async def _get_chat_session(db: AsyncSession, tenant_id: uuid.UUID, session_id: uuid.UUID) -> ChatSessionModel:
    row = await db.get(ChatSessionModel, session_id)
    if row is None or row.tenant_id != tenant_id:
        raise _ChatError(status_code=404, detail="session_not_found")
    return row


@router.get("/sessions/{session_id}/messages")
async def list_messages(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> Any:
    tenant = await get_tenant(db, headers.tenant_id)
    await _get_chat_session(db, tenant.tenant_id, session_id)
    result = await db.execute(
        select(ChatMessageModel).where(
            (ChatMessageModel.tenant_id == tenant.tenant_id) & (ChatMessageModel.session_id == session_id)
        ).order_by(ChatMessageModel.created_at.asc())
    )
    rows = result.scalars().all()
    return {
        "data": [
            {
                "id": str(row.message_id),
                "role": row.role,
                "content": row.content,
                "ts": row.created_at.isoformat(),
            }
            for row in rows
        ]
    }


@router.post("/sessions/{session_id}/messages")
async def create_message(
    session_id: uuid.UUID,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> Any:
    tenant = await get_tenant(db, headers.tenant_id)
    session_row = await _get_chat_session(db, tenant.tenant_id, session_id)

    role = str(payload.get("role") or "").strip().lower()
    if role not in {"user", "assistant", "system"}:
        raise _ChatError(status_code=400, detail="invalid_role")
    content = str(payload.get("content") or "").strip()
    if not content:
        raise _ChatError(status_code=400, detail="content_required")

    result = await db.execute(
        select(func.max(ChatMessageModel.position)).where(
            (ChatMessageModel.tenant_id == tenant.tenant_id) & (ChatMessageModel.session_id == session_row.session_id)
        )
    )
    max_position = result.scalar() or 0

    message = ChatMessageModel(
        tenant_id=tenant.tenant_id,
        session_id=session_row.session_id,
        role=role,
        content=content,
        position=max_position + 1,
    )
    db.add(message)
    await db.flush()
    await db.refresh(message)
    return {
        "id": str(message.message_id),
        "role": message.role,
        "content": message.content,
        "position": message.position,
        "ts": message.created_at.isoformat(),
    }
