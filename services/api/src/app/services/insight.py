from __future__ import annotations

import logging
import json
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Callable, Iterable, Literal, Optional

import httpx
from toolfront_registry_client import Registry, ToolFrontClient, ToolFrontError

from app.core.config import settings

logger = logging.getLogger(__name__)

TOOLFRONT_PROVIDER_ID = "insight.llm"


@lru_cache(maxsize=1)
def _get_toolfront_registry() -> Optional[Registry]:
    if not settings.use_toolfront:
        return None
    manifest_path = settings.toolfront_registry_path
    try:
        return Registry(manifest_path)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("ToolFront registry unavailable: %s", exc)
        return None


@lru_cache(maxsize=1)
def _get_toolfront_client() -> Optional[ToolFrontClient]:
    if not settings.use_toolfront:
        return None

    registry = _get_toolfront_registry()
    if registry is None:
        return None

    environment = settings.toolfront_env or os.getenv("TOOLFRONT_ENV") or "cloud"
    base_url = settings.toolfront_base_url or registry.toolfront_base(environment)
    if not base_url:
        return None
    if "example.com" in base_url:
        # Skip placeholder defaults until configured.
        return None

    try:
        return ToolFrontClient(
            base_url=base_url,
            api_token=settings.toolfront_api_token,
            registry=registry,
            environment=environment,
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Failed to configure ToolFront client: %s", exc)
        return None


def summarize_lines(lines: Iterable[str], max_length: int = 200) -> str:
    """Naive summariser that stitches key fragments and truncates."""

    joined = " ".join(part.strip() for part in lines if part)
    if not joined:
        return ""
    if len(joined) <= max_length:
        return joined
    return joined[: max_length - 3].rstrip() + "..."


@dataclass(slots=True)
class SummaryResult:
    text: str
    source: Literal["api", "fallback", "toolfront", "local"]
    id: str | None = None


def _meeting_fallback(content: str, action_items: list[dict]) -> str:
    sentences = content.split(". ") if content else []
    highlights: list[str] = []
    if sentences:
        highlights.append(sentences[0])
    if len(sentences) > 1:
        highlights.append(sentences[-1])
    for item in action_items[:2]:
        label = item.get("title") or item.get("summary")
        if label:
            highlights.append(f"Action: {label}")
    return summarize_lines(highlights)


def _autopm_fallback(task_title: str, due_at: str | None, metadata: dict) -> str:
    details = [f"Task '{task_title}' is overdue."]
    if due_at:
        details.append(f"Due at {due_at}.")
    owner = metadata.get("assignee")
    if owner:
        details.append(f"Assigned to {owner}.")
    if status := metadata.get("status"):
        details.append(f"Current status: {status}.")
    details.append("Recommend notifying owner and updating status.")
    return summarize_lines(details)


def _build_meeting_prompt(content: str, action_items: list[dict]) -> str:
    serialized_items = json.dumps(action_items[:5], ensure_ascii=False, indent=2)
    lines = [
        "You are an assistant that writes concise meeting summaries for project teams.",
        "Summarize the meeting transcript in no more than 120 words and highlight the most important follow-ups.",
        "Meeting transcript:",
        content or "(no transcript provided)",
        "Action items (JSON):",
        serialized_items,
        "Return prose, not JSON."
    ]
    return "\n\n".join(lines)


def _build_autopm_prompt(task_title: str, due_at: str | None, metadata: dict) -> str:
    context_json = json.dumps(metadata, ensure_ascii=False, indent=2)
    lines = [
        "You are assisting a project manager triage overdue tasks.",
        f"Task title: {task_title}",
        f"Due at: {due_at or 'unknown'}",
        "Context metadata (JSON):",
        context_json,
        "Provide a short paragraph explaining why the task needs attention and suggest the next human action.",
    ]
    return "\n\n".join(lines)


class InsightClient:
    def __init__(self, base_url: str | None, timeout: float) -> None:
        self.base_url = base_url.rstrip("/") if base_url else None
        self.timeout = timeout
        self._toolfront_client = _get_toolfront_client()
        self._toolfront_registry = _get_toolfront_registry()
        # Local OpenAI-compatible (LiteLLM /v1/chat/completions)
        self.local_openai_base = settings.local_openai_base_url.rstrip("/") if settings.local_openai_base_url else None
        self.local_openai_model = settings.local_openai_model

    async def _call_local_openai(self, prompt: str, *, mode: str | None = None) -> Optional[str]:
        if not self.local_openai_base or not prompt.strip():
            return None
        url = f"{self.local_openai_base}/v1/chat/completions"
        model = self.local_openai_model
        if (mode or "").lower() in {"reason", "reasoning"}:
            model = settings.local_openai_reason_model or model
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": "You are a helpful assistant that follows instructions and returns concise, high-quality answers."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.3,
            "max_tokens": 1800,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            content = (
                ((data.get("choices") or [{}])[0].get("message") or {}).get("content")
                if isinstance(data, dict)
                else None
            )
            if isinstance(content, str) and content.strip():
                return content.strip()
        except Exception as exc:  # pragma: no cover - local server errors
            logger.warning("Local OpenAI call failed: %s", exc)
        return None

    async def _call_toolfront_llm(
        self,
        *,
        tenant_id: str,
        prompt: str,
        task_profile: str = "general",
    ) -> Optional[str]:
        client = self._toolfront_client
        if not prompt.strip():
            return None
        if client is None:
            # Fallback to local OpenAI-compatible endpoint if configured
            profile = task_profile if task_profile else None
            return await self._call_local_openai(prompt, mode=profile)
        parameters = {
            "prompt": prompt,
            "task_profile": task_profile,
        }
        try:
            result = await client.ask(
                tenant_id=tenant_id,
                provider_id=TOOLFRONT_PROVIDER_ID,
                operation="invoke",
                parameters=parameters,
            )
        except ToolFrontError as exc:  # pragma: no cover - network dependent
            logger.warning("ToolFront insight.llm call failed: %s", exc)
            return None

        data = result.get("data") if isinstance(result, dict) else None
        if not isinstance(data, dict):
            return None
        output = data.get("output") or data.get("text")
        if isinstance(output, str) and output.strip():
            return output.strip()
        return None

    async def summarize_meeting(self, tenant_id: str, content: str, action_items: list[dict]) -> SummaryResult:
        prompt = _build_meeting_prompt(content, action_items)
        toolfront_summary = await self._call_toolfront_llm(
            tenant_id=tenant_id,
            prompt=prompt,
            task_profile="meeting_summary",
        )
        if toolfront_summary:
            return SummaryResult(text=toolfront_summary, source="toolfront" if self._toolfront_client else "local")

        payload = {
            "content": content,
            "action_items": action_items,
        }
        return await self._post_summary(
            "/summaries/meetings",
            payload,
            fallback=lambda: _meeting_fallback(content, action_items),
        )

    async def summarize_autopm(
        self,
        tenant_id: str,
        task_title: str,
        due_at: str | None,
        metadata: dict,
    ) -> SummaryResult:
        prompt = _build_autopm_prompt(task_title, due_at, metadata)
        toolfront_summary = await self._call_toolfront_llm(
            tenant_id=tenant_id,
            prompt=prompt,
            task_profile="autopm",
        )
        if toolfront_summary:
            return SummaryResult(text=toolfront_summary, source="toolfront" if self._toolfront_client else "local")

        payload = {
            "task_title": task_title,
            "due_at": due_at,
            "metadata": metadata,
        }
        return await self._post_summary(
            "/summaries/autopm",
            payload,
            fallback=lambda: _autopm_fallback(task_title, due_at, metadata),
        )

    async def _post_summary(
        self,
        path: str,
        payload: dict,
        fallback: Callable[[], str],
    ) -> SummaryResult:
        url = f"{self.base_url}{path}" if self.base_url else None
        if not url:
            return SummaryResult(text=fallback(), source="fallback")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            summary = data.get("summary") if isinstance(data, dict) else None
            if summary:
                summary_id = None
                if isinstance(data, dict):
                    meta = data.get("meta") or {}
                    if isinstance(meta, dict):
                        summary_id = meta.get("summary_id")
                return SummaryResult(text=summary, source="api", id=summary_id)
            logger.warning("Insight API missing summary field for %s", path)
        except Exception as exc:  # pragma: no cover - network errors
            logger.warning("Insight API request failed: %s", exc)
        return SummaryResult(text=fallback(), source="fallback")


@lru_cache(maxsize=1)
def get_insight_client() -> InsightClient:
    return InsightClient(
        base_url=settings.insight_api_url,
        timeout=settings.insight_api_timeout_seconds,
    )


async def summarize_meeting(tenant_id: str, content: str, action_items: list[dict]) -> SummaryResult:
    client = get_insight_client()
    return await client.summarize_meeting(tenant_id, content, action_items)


async def summarize_autopm(
    tenant_id: str,
    task_title: str,
    due_at: str | None,
    metadata: dict | None = None,
) -> SummaryResult:
    client = get_insight_client()
    return await client.summarize_autopm(tenant_id, task_title, due_at, metadata or {})


def summarize_guardrail(
    status: str,
    total: int,
    negative_ratio: float,
    *,
    stage: str | None = None,
    variant: str | None = None,
) -> str:
    percentage = round(negative_ratio * 100, 1)
    descriptor = f"{status}".upper() if status.lower() in {"warning", "halted"} else status
    subject = "guardrail"
    if variant and variant != "global":
        subject = f"{variant} variant guardrail"
    base = f"{subject} {descriptor} with {percentage}% negative feedback across {total} signals."
    if stage:
        base += f" Stage={stage}."
    if status.lower() == "halted":
        base += " Immediate investigation required; pause rollout."
    elif status.lower() == "warning":
        base += " Monitor closely and prepare mitigation steps."
    else:
        base += " Continue observing guardrail trends."
    return base
