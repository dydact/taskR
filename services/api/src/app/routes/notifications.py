from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import Notification
from app.routes.utils import get_tenant
from app.schemas import NotificationCreate, NotificationRead
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[NotificationRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    query = (
        select(Notification)
        .where(Notification.tenant_id == tenant.tenant_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    if status_filter:
        query = query.where(Notification.status == status_filter)
    result = await session.execute(query)
    rows = result.scalars().all()
    return [NotificationRead.model_validate(row) for row in rows]


@router.post("", response_model=NotificationRead, status_code=status.HTTP_201_CREATED)
async def create_notification(
    payload: NotificationCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> NotificationRead:
    tenant = await get_tenant(session, headers.tenant_id)
    row = Notification(
        tenant_id=tenant.tenant_id,
        event_type=payload.event_type,
        title=payload.title,
        body=payload.body,
        cta_path=payload.cta_path,
        payload=payload.payload,
    )
    session.add(row)
    await session.flush()
    await session.refresh(row)
    return NotificationRead.model_validate(row)


@router.post("/{notification_id}/ack", status_code=status.HTTP_202_ACCEPTED)
async def acknowledge_notification(
    notification_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> dict[str, Any]:
    tenant = await get_tenant(session, headers.tenant_id)
    query = (
        update(Notification)
        .where(
            Notification.notification_id == notification_id,
            Notification.tenant_id == tenant.tenant_id,
        )
        .values(
            status="acknowledged",
            acknowledged_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        .returning(Notification.notification_id)
    )
    result = await session.execute(query)
    row = result.fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="notification_not_found")
    return {"success": True, "notification_id": str(row[0])}
