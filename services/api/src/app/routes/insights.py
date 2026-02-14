from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import AiJob, Notification, Task
from app.routes.utils import get_tenant
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/feed")
async def insights_feed(
    limit: int = Query(default=25, ge=1, le=100),
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> dict[str, Any]:
    tenant = await get_tenant(session, headers.tenant_id)

    items: list[dict[str, Any]] = []

    task_rows = await session.execute(
        select(Task)
            .where(Task.tenant_id == tenant.tenant_id)
            .order_by(Task.updated_at.desc())
            .limit(limit)
    )
    for task in task_rows.scalars():
        items.append(
            {
                "type": "task",
                "title": task.title,
                "detail": task.status,
                "timestamp": task.updated_at.isoformat() if task.updated_at else task.created_at.isoformat(),
                "metadata": {
                    "task_id": str(task.task_id),
                    "space_id": str(task.space_id) if task.space_id else None,
                    "list_id": str(task.list_id),
                    "priority": task.priority,
                    "due_at": task.due_at.isoformat() if task.due_at else None,
                },
            }
        )

    notification_rows = await session.execute(
        select(Notification)
        .where(Notification.tenant_id == tenant.tenant_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    for notification in notification_rows.scalars():
        items.append(
            {
                "type": "notification",
                "title": notification.title,
                "detail": notification.body[:160],
                "timestamp": notification.created_at.isoformat(),
                "metadata": {
                    "notification_id": str(notification.notification_id),
                    "event_type": notification.event_type,
                    "cta_path": notification.cta_path,
                    "status": notification.status,
                },
            }
        )

    ai_job_rows = await session.execute(
        select(AiJob)
        .where(AiJob.tenant_id == tenant.tenant_id)
        .order_by(AiJob.created_at.desc())
        .limit(limit)
    )
    for job in ai_job_rows.scalars():
        items.append(
            {
                "type": "ai_job",
                "title": f"AI job {job.status}",
                "detail": job.metadata_json.get("summary") if isinstance(job.metadata_json, dict) else None,
                "timestamp": job.updated_at.isoformat(),
                "metadata": {
                    "job_id": str(job.job_id),
                    "prompt_id": job.prompt_id,
                    "status": job.status,
                },
            }
        )

    items.sort(key=lambda entry: entry["timestamp"], reverse=True)
    return {"data": items[:limit]}
