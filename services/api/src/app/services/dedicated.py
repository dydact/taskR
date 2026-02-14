from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.core import Assignment, AssignmentEvent
from app.services.notifications import NotificationEvent, notification_service
from common_agents import (
    AssignmentEventPayload,
    AssignmentEventType,
    AssignmentPayload,
    AssignmentPriority,
    AssignmentStatus,
)


@dataclass(slots=True)
class AssignmentFilters:
    statuses: Sequence[str] | None = None
    agent_slugs: Sequence[str] | None = None
    node_id: str | None = None
    tags: Sequence[str] | None = None


def _ensure_tenant(row_tenant: uuid.UUID, tenant_id: uuid.UUID) -> None:
    if row_tenant != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="assignment_not_found")


def build_stub_assignment_payload(tenant_id: uuid.UUID) -> AssignmentPayload:
    now = datetime.now(UTC)
    payload_data = {
        "assignment_id": str(uuid.uuid4()),
        "tenant_id": str(tenant_id),
        "agent_slug": "xoxo.demo",
        "agent_version": "2025.01",
        "status": AssignmentStatus.RESERVED.value,
        "priority": AssignmentPriority.NORMAL.value,
        "service_owner": "taskr",
        "overlay": {
            "overlay_id": "demo-overlay",
            "overlay_type": "persona",
            "label": "Demo Overlay",
        },
        "capabilities": {
            "cpu": "8",
            "memory_gb": 32,
            "gpu": "L4",
            "gpu_memory_gb": 24,
            "tee": "sev-snp",
            "zones": ["iad-1"],
        },
        "model": {
            "family": "dydact-mini",
            "size": "8B",
            "provider": "dydact",
        },
        "prompt_profile": {
            "initial_prompt": "You are a dedicated dydact demo agent.",
            "adaptation_method": "few-shot",
            "notes": "seeded by stub",
        },
        "prompt_history": [
            {
                "role": "system",
                "content": "Demo prompt seeded by stub.",
                "metadata": {"source": "stub"},
            },
        ],
        "policy": {
            "preemption": "never",
            "max_idle_seconds": 900,
        },
        "polaris_obligations": [],
        "feature_flags": ["demo"],
        "tags": ["stubbed"],
        "metadata": {"source": "stub"},
        "created_at": now,
        "updated_at": now,
    }
    return AssignmentPayload(**payload_data)


ALERT_STATUSES = {"failed", "cancelled"}


def _as_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def _normalized_status(value: Any, fallback: str | None = None) -> str:
    if isinstance(value, str):
        return value.lower()
    if value is None:
        return (fallback or "").lower()
    return str(value).lower()


def _build_notification_events(
    tenant_id: uuid.UUID,
    assignment: Assignment,
    payload: AssignmentEventPayload,
) -> list[NotificationEvent]:
    events: list[NotificationEvent] = []
    base_payload = {
        "assignment_id": _as_str(getattr(assignment, "assignment_id", "")),
        "agent_slug": getattr(assignment, "agent_slug", ""),
        "node_id": getattr(assignment, "node_id", None),
        "event_at": payload.occurred_at.isoformat(),
        "cta_path": "/dedicated",
    }

    body = payload.payload or {}

    if payload.event_type is AssignmentEventType.STATUS_CHANGED:
        status_value = _normalized_status(body.get("status"), getattr(assignment, "status", ""))
        if status_value:
            base_payload = {**base_payload, "status": status_value}
            if status_value in ALERT_STATUSES:
                events.append(
                    NotificationEvent(
                        tenant_id=tenant_id,
                        event_type="dedicated.assignment.status_changed",
                        payload=base_payload,
                    )
                )
    elif payload.event_type is AssignmentEventType.NODE_DETACHED:
        events.append(
            NotificationEvent(
                tenant_id=tenant_id,
                event_type="dedicated.assignment.node_detached",
                payload={**base_payload, "reason": body.get("reason"), "node_id": body.get("node_id") or base_payload.get("node_id")},
            )
        )

    return events

async def upsert_assignment(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    payload: AssignmentPayload,
) -> Assignment:
    payload_tenant = uuid.UUID(payload.tenant_id)
    if payload_tenant != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_tenant_context")

    assignment_uuid = uuid.UUID(payload.assignment_id)
    assignment = await session.get(Assignment, assignment_uuid, with_for_update=True)

    overlay = payload.overlay.model_dump() if payload.overlay else {}
    capabilities = payload.capabilities.model_dump() if payload.capabilities else {}
    model_descriptor = payload.model.model_dump() if payload.model else {}
    prompt_profile = payload.prompt_profile.model_dump() if payload.prompt_profile else {}
    policy = payload.policy.model_dump() if payload.policy else {}
    prompt_history = [entry.model_dump() for entry in payload.prompt_history]
    obligations = [entry.model_dump() for entry in payload.polaris_obligations]
    agent_uuid = uuid.UUID(payload.agent_id) if payload.agent_id else None
    department_uuid = uuid.UUID(payload.department_id) if payload.department_id else None

    now = datetime.now(UTC)

    if assignment:
        _ensure_tenant(assignment.tenant_id, tenant_id)
        assignment.agent_slug = payload.agent_slug
        assignment.agent_version = payload.agent_version
        assignment.agent_id = agent_uuid
        assignment.department_id = department_uuid
        assignment.status = payload.status.value
        assignment.priority = payload.priority.value if hasattr(payload.priority, "value") else str(payload.priority)
        assignment.service_owner = payload.service_owner
        assignment.node_id = payload.node_id
        assignment.overlay = overlay
        assignment.capabilities_json = capabilities
        assignment.model_json = model_descriptor
        assignment.prompt_profile_json = prompt_profile
        assignment.policy_json = policy
        assignment.prompt_history = prompt_history
        assignment.polaris_obligations = obligations
        assignment.feature_flags = list(payload.feature_flags)
        assignment.tags = list(payload.tags)
        assignment.metadata_json = dict(payload.metadata)
        assignment.context = dict(payload.context)
        assignment.expires_at = payload.expires_at
        assignment.updated_at = payload.updated_at or now
    else:
        assignment = Assignment(
            assignment_id=assignment_uuid,
            tenant_id=tenant_id,
            agent_slug=payload.agent_slug,
            agent_version=payload.agent_version,
            agent_id=agent_uuid,
            department_id=department_uuid,
            status=payload.status.value,
            priority=payload.priority.value if hasattr(payload.priority, "value") else str(payload.priority),
            service_owner=payload.service_owner,
            node_id=payload.node_id,
            overlay=overlay,
            capabilities_json=capabilities,
            model_json=model_descriptor,
            prompt_profile_json=prompt_profile,
            policy_json=policy,
            prompt_history=prompt_history,
            polaris_obligations=obligations,
            feature_flags=list(payload.feature_flags),
            tags=list(payload.tags),
            metadata_json=dict(payload.metadata),
            context=dict(payload.context),
            expires_at=payload.expires_at,
        )
        assignment.created_at = payload.created_at or now
        assignment.updated_at = payload.updated_at or now
        session.add(assignment)

    await session.flush()
    await session.refresh(assignment)
    return assignment


async def get_assignment(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    assignment_id: uuid.UUID,
) -> Assignment:
    row = await session.get(
        Assignment,
        assignment_id,
        options=(selectinload(Assignment.events).limit(10),),
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="assignment_not_found")
    _ensure_tenant(row.tenant_id, tenant_id)
    return row


async def list_assignments(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    filters: AssignmentFilters,
) -> list[Assignment]:
    stmt = select(Assignment).where(Assignment.tenant_id == tenant_id).order_by(Assignment.created_at.desc())
    if filters.statuses:
        stmt = stmt.where(Assignment.status.in_(list(filters.statuses)))
    if filters.agent_slugs:
        stmt = stmt.where(Assignment.agent_slug.in_(list(filters.agent_slugs)))
    if filters.node_id:
        stmt = stmt.where(Assignment.node_id == filters.node_id)

    rows = (await session.execute(stmt)).scalars().all()

    if filters.tags:
        tag_set = set(filters.tags)
        rows = [row for row in rows if tag_set.intersection(row.tags or [])]

    return list(rows)


async def ensure_stub_assignment(
    session: AsyncSession,
    tenant_id: uuid.UUID,
) -> Optional[Assignment]:
    if settings.environment not in {"local", "dev", "development"}:
        return None
    existing = await list_assignments(session, tenant_id, AssignmentFilters())
    if existing:
        return None
    payload = build_stub_assignment_payload(tenant_id)
    assignment = await upsert_assignment(session, tenant_id, payload)
    return assignment


async def record_assignment_event(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    payload: AssignmentEventPayload,
) -> AssignmentEvent:
    payload_tenant = uuid.UUID(payload.tenant_id)
    if payload_tenant != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_tenant_context")

    assignment_uuid = uuid.UUID(payload.assignment_id)
    assignment = await session.get(Assignment, assignment_uuid, with_for_update=True)
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="assignment_not_found")
    _ensure_tenant(assignment.tenant_id, tenant_id)

    event_uuid = uuid.UUID(payload.event_id)
    event = await session.get(AssignmentEvent, event_uuid)
    if event:
        _ensure_tenant(event.tenant_id, tenant_id)
        return event

    event = AssignmentEvent(
        event_id=event_uuid,
        tenant_id=tenant_id,
        assignment_id=assignment.assignment_id,
        event_type=payload.event_type.value,
        source=payload.source,
        payload=dict(payload.payload),
        metadata_json=dict(payload.metadata),
        occurred_at=payload.occurred_at,
    )
    session.add(event)

    if payload.event_type is AssignmentEventType.STATUS_CHANGED:
        status_value = payload.payload.get("status")
        if isinstance(status_value, str):
            assignment.status = status_value
    elif payload.event_type is AssignmentEventType.OVERLAY_UPDATED and payload.payload:
        assignment.overlay = dict(payload.payload)
    elif payload.event_type is AssignmentEventType.PROMPT_APPENDED:
        history = assignment.prompt_history or []
        history.append(payload.payload)
        assignment.prompt_history = history
    elif payload.event_type is AssignmentEventType.CAPABILITIES_UPDATED and payload.payload:
        assignment.capabilities_json = dict(payload.payload)
    elif payload.event_type is AssignmentEventType.MODEL_UPDATED and payload.payload:
        assignment.model_json = dict(payload.payload)
    assignment.updated_at = payload.occurred_at

    await session.flush()
    await session.refresh(event)
    await session.refresh(assignment)

    notification_events = _build_notification_events(tenant_id, assignment, payload)
    for notification in notification_events:
        await notification_service.enqueue(notification)

    return event


async def list_assignment_events(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    assignment_id: uuid.UUID,
    limit: int = 100,
) -> list[AssignmentEvent]:
    stmt = (
        select(AssignmentEvent)
        .where(
            and_(
                AssignmentEvent.tenant_id == tenant_id,
                AssignmentEvent.assignment_id == assignment_id,
            )
        )
        .order_by(AssignmentEvent.occurred_at.desc())
        .limit(limit)
    )
    return list((await session.execute(stmt)).scalars().all())
