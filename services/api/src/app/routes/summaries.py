from __future__ import annotations

from typing import Any, Optional
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Header

from app.core.config import settings
from common_auth import TenantHeaders, get_tenant_headers
from app.events.bus import event_bus
from app.utils.http import post_with_retry

router = APIRouter(prefix="/summaries", tags=["summaries"])


class _SummaryError(HTTPException):
    pass


def _select_model(profile: Optional[str]) -> str:
    model = settings.local_openai_model
    if (profile or "").lower() in {"reason", "reasoning"}:
        model = settings.local_openai_reason_model or model
    return model


async def _call_json_chat(prompt: str, *, model_profile: Optional[str]) -> dict[str, Any] | None:
    """Call local OpenAI-compatible endpoint asking strictly for JSON output.

    Returns parsed JSON dict or None if unavailable/failed.
    """
    base = settings.local_openai_base_url
    if not base:
        return None
    url = f"{base.rstrip('/')}/v1/chat/completions"
    payload = {
        "model": _select_model(model_profile),
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a service that returns ONLY valid JSON objects conforming to the requested schema. "
                    "Do not include markdown or prose."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 1200,
        "response_format": {"type": "json_object"},
    }
    try:
        resp = await post_with_retry(
            url,
            payload=payload,
            timeout=settings.insight_api_timeout_seconds,
            retries=1,
        )
    except Exception:
        return None
    if resp.status_code >= 400:
        return None
    data = resp.json()
    content = (
        ((data.get("choices") or [{}])[0].get("message") or {}).get("content")
        if isinstance(data, dict)
        else None
    )
    if not isinstance(content, str):
        return None
    try:
        # Parse model JSON output
        return httpx.Response(200, text=content).json()
    except Exception:
        return None


def _fallback_meeting(transcript: str | None, notes: str | None) -> dict[str, Any]:
    text = (transcript or notes or "").strip()
    # naive summary: first 2 sentences
    parts = [p.strip() for p in text.replace("\n", " ").split(". ") if p.strip()]
    summary = ". ".join(parts[:2])[:400] if parts else "No content available."
    return {
        "summary": summary,
        "action_items": [],
        "risks": [],
        "timeline": [],
    }


def _fallback_autopm(thread: list[str] | None, updates: list[str] | None, project_meta: dict[str, Any]) -> dict[str, Any]:
    lines = (thread or []) + (updates or [])
    baseline = " ".join(lines)[:400] if lines else "No updates provided."
    owners: list[dict[str, Any]] = []
    assignee = project_meta.get("assignee") or project_meta.get("owner")
    if assignee:
        owners.append({"name": str(assignee)})
    return {
        "summary": baseline,
        "blockers": [],
        "next_actions": [],
        "owners": owners,
    }


def _meeting_prompt(transcript: str | None, notes: str | None, meeting_meta: dict[str, Any]) -> str:
    return (
        "You will receive meeting content (transcript and/or notes).\n"
        "Return a compact JSON object with this exact shape: {\n"
        "  summary: string,\n  action_items: Array<{text: string, owner?: string, due?: string}>,\n"
        "  risks?: string[],\n  timeline?: Array<{when: string, note: string}>\n}\n"
        "Guidelines: Keep summary <= 120 words. Extract concrete action items if present.\n"
        f"Transcript: {transcript or ''}\nNotes: {notes or ''}\nMeta: {meeting_meta}"
    )


def _autopm_prompt(thread: list[str] | None, updates: list[str] | None, project_meta: dict[str, Any]) -> str:
    return (
        "You will receive a thread of project updates.\n"
        "Return a compact JSON object with this exact shape: {\n"
        "  summary: string,\n  blockers?: string[],\n  next_actions: Array<{text: string, owner?: string, due?: string}>,\n"
        "  owners?: Array<{id?: string, name: string}>\n}\n"
        "Guidelines: Be specific and actionable; keep summary <= 120 words.\n"
        f"Thread: {thread or []}\nUpdates: {updates or []}\nMeta: {project_meta}"
    )


@router.post("/meetings")
async def summarize_meetings(
    payload: dict[str, Any],
    headers: TenantHeaders = Depends(get_tenant_headers),
    x_model_profile: Optional[str] = Header(default=None, alias="x-model-profile"),
) -> dict[str, Any]:
    # Inputs are loosely typed to keep client interop simple
    transcript = payload.get("transcript") or payload.get("content") or payload.get("text")
    notes = payload.get("notes")
    meeting_meta = payload.get("meeting_meta") or {}
    if not isinstance(meeting_meta, dict):
        meeting_meta = {}

    # Prefer local OpenAI-compatible JSON call if configured
    result = await _call_json_chat(_meeting_prompt(transcript, notes, meeting_meta), model_profile=x_model_profile)
    if isinstance(result, dict) and result.get("summary"):
        summary_id = str(uuid.uuid4())
        data = {
            "summary": result.get("summary"),
            "action_items": result.get("action_items") or [],
            "risks": result.get("risks") or [],
            "timeline": result.get("timeline") or [],
            "meta": {
                "source": "local_llm",
                "tenant_id": headers.tenant_id,
                "summary_id": summary_id,
            },
        }
        await event_bus.publish(
            {
                "type": "dydact.summary.meeting.created",
                "tenant_id": headers.tenant_id,
                "user_id": headers.user_id,
                "summary_id": summary_id,
                "meta": {"model_profile": x_model_profile or "general"},
            }
        )
        return data

    # Fallback deterministic output
    data = _fallback_meeting(transcript, notes)
    summary_id = str(uuid.uuid4())
    data["meta"] = {"source": "fallback", "tenant_id": headers.tenant_id, "summary_id": summary_id}
    await event_bus.publish(
        {
            "type": "dydact.summary.meeting.created",
            "tenant_id": headers.tenant_id,
            "user_id": headers.user_id,
            "summary_id": summary_id,
            "meta": {"model_profile": x_model_profile or "general", "fallback": True},
        }
    )
    return data


@router.post("/autopm")
async def summarize_autopm(
    payload: dict[str, Any],
    headers: TenantHeaders = Depends(get_tenant_headers),
    x_model_profile: Optional[str] = Header(default=None, alias="x-model-profile"),
) -> dict[str, Any]:
    thread = payload.get("thread")
    updates = payload.get("updates")
    project_meta = payload.get("project_meta") or {}
    if not isinstance(project_meta, dict):
        project_meta = {}

    result = await _call_json_chat(_autopm_prompt(thread, updates, project_meta), model_profile=x_model_profile)
    if isinstance(result, dict) and result.get("summary"):
        summary_id = str(uuid.uuid4())
        data = {
            "summary": result.get("summary"),
            "blockers": result.get("blockers") or [],
            "next_actions": result.get("next_actions") or [],
            "owners": result.get("owners") or [],
            "meta": {
                "source": "local_llm",
                "tenant_id": headers.tenant_id,
                "summary_id": summary_id,
            },
        }
        await event_bus.publish(
            {
                "type": "dydact.summary.autopm.created",
                "tenant_id": headers.tenant_id,
                "user_id": headers.user_id,
                "summary_id": summary_id,
                "meta": {"model_profile": x_model_profile or "general"},
            }
        )
        return data

    data = _fallback_autopm(thread if isinstance(thread, list) else None, updates if isinstance(updates, list) else None, project_meta)
    summary_id = str(uuid.uuid4())
    data["meta"] = {"source": "fallback", "tenant_id": headers.tenant_id, "summary_id": summary_id}
    await event_bus.publish(
        {
            "type": "dydact.summary.autopm.created",
            "tenant_id": headers.tenant_id,
            "user_id": headers.user_id,
            "summary_id": summary_id,
            "meta": {"model_profile": x_model_profile or "general", "fallback": True},
        }
    )
    return data
