from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Iterable

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.metrics import record_retention_deletions
from app.models.core import (
    AutoPMSuggestion,
    CalendarEvent,
    CalendarSlot,
    MeetingNote,
    PreferenceFeedback,
    RetentionPolicy,
    SicaSession,
)

RESOURCE_MODEL_MAP = {
    "meeting_note": MeetingNote,
    "calendar_event": CalendarEvent,
    "calendar_slot": CalendarSlot,
    "preference_feedback": PreferenceFeedback,
    "autopm_suggestion": AutoPMSuggestion,
    "sica_session": SicaSession,
}


async def fetch_retention_policies(session: AsyncSession, tenant_id) -> list[RetentionPolicy]:
    result = await session.execute(
        RetentionPolicy.__table__.select().where(RetentionPolicy.tenant_id == tenant_id)
    )
    rows = result.mappings().all()
    policies: list[RetentionPolicy] = []
    for row in rows:
        policy = RetentionPolicy(
            policy_id=row["policy_id"],
            tenant_id=row["tenant_id"],
            resource_type=row["resource_type"],
            retention_days=row["retention_days"],
            metadata_json=row["metadata_json"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
        policies.append(policy)
    return policies


async def apply_retention(
    session: AsyncSession,
    tenant_id,
    policies: Iterable[RetentionPolicy],
    defaults: dict[str, int] | None = None,
) -> dict[str, int]:
    defaults = defaults or {
        "meeting_note": 365,
        "calendar_event": 365,
        "calendar_slot": 30,
        "preference_feedback": 180,
        "autopm_suggestion": 90,
        "sica_session": 365,
    }

    deletions: dict[str, int] = {}
    now = datetime.now(UTC)
    overrides = {policy.resource_type: policy.retention_days for policy in policies}

    for resource, model in RESOURCE_MODEL_MAP.items():
        days = overrides.get(resource, defaults.get(resource))
        if days is None:
            continue
        cutoff = now - timedelta(days=days)
        stmt = delete(model).where(model.tenant_id == tenant_id)
        if hasattr(model, "updated_at"):
            stmt = stmt.where(model.updated_at < cutoff)
        elif hasattr(model, "created_at"):
            stmt = stmt.where(model.created_at < cutoff)
        else:
            continue
        result = await session.execute(stmt)
        deletions[resource] = result.rowcount or 0
        record_retention_deletions(str(tenant_id), resource, deletions[resource])

    await session.flush()
    return deletions
