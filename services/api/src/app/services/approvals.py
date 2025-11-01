from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.events.bus import event_bus
from app.models.core import ApprovalQueueItem, AutoPMSuggestion


async def enqueue_suggestion(
    session: AsyncSession,
    suggestion: AutoPMSuggestion,
    *,
    source: str = "autopm",
    reason: str | None = None,
) -> ApprovalQueueItem:
    existing = await session.execute(
        select(ApprovalQueueItem)
        .where(
            ApprovalQueueItem.tenant_id == suggestion.tenant_id,
            ApprovalQueueItem.suggestion_id == suggestion.suggestion_id,
            ApprovalQueueItem.status == "pending",
        )
        .limit(1)
    )
    approval = existing.scalars().first()
    if approval:
        return approval

    approval = ApprovalQueueItem(
        tenant_id=suggestion.tenant_id,
        suggestion_id=suggestion.suggestion_id,
        source=source,
        status="pending",
        reason=reason,
        metadata_json={
            **(suggestion.metadata_json or {}),
            "suggestion_title": suggestion.title,
        },
    )
    session.add(approval)
    await session.flush()
    await session.refresh(approval)

    await event_bus.publish(
        {
            "type": "approvals.queue.created",
            "tenant_id": str(approval.tenant_id),
            "approval_id": str(approval.approval_id),
            "payload": {
                "suggestion_id": str(suggestion.suggestion_id) if suggestion.suggestion_id else None,
                "source": approval.source,
                "status": approval.status,
            },
        }
    )
    return approval


async def get_approval(
    session: AsyncSession,
    tenant_id: UUID,
    approval_id: UUID,
) -> ApprovalQueueItem | None:
    result = await session.execute(
        select(ApprovalQueueItem).where(
            ApprovalQueueItem.tenant_id == tenant_id,
            ApprovalQueueItem.approval_id == approval_id,
        )
    )
    return result.scalars().first()


async def resolve_approval(
    session: AsyncSession,
    approval: ApprovalQueueItem,
    *,
    action: str,
    notes: str | None = None,
    metadata: dict | None = None,
) -> ApprovalQueueItem:
    status_map = {
        "approve": ("approved", "approved"),
        "reject": ("rejected", "rejected"),
    }
    if action not in status_map:
        raise ValueError(f"Unsupported action: {action}")

    approval.status = status_map[action][0]
    approval.resolution_notes = notes
    approval.metadata_json = {
        **(approval.metadata_json or {}),
        **(metadata or {}),
        "decision": approval.status,
    }
    approval.resolved_at = datetime.now(UTC)

    if approval.suggestion is not None:
        suggestion = approval.suggestion
        suggestion.status = status_map[action][1]
        suggestion.resolved_at = approval.resolved_at

    await session.flush()
    await session.refresh(approval)

    await event_bus.publish(
        {
            "type": "approvals.queue.resolved",
            "tenant_id": str(approval.tenant_id),
            "approval_id": str(approval.approval_id),
            "payload": {
                "status": approval.status,
                "notes": approval.resolution_notes,
            },
        }
    )
    return approval
