from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db_session
from app.events.bus import event_bus
from app.metrics import record_scr_alert_acknowledged, record_scr_alert_ingested
from app.models.core import ScrAlert
from app.routes.utils import get_tenant
from app.schemas import ScrAlertAckRequest, ScrAlertCreate, ScrAlertRead
from common_auth import TenantHeaders, get_tenant_headers

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/integrations", tags=["integrations"])


async def _get_alert(session: AsyncSession, tenant_id, alert_id) -> ScrAlert | None:
    result = await session.execute(
        select(ScrAlert).where(ScrAlert.alert_id == alert_id, ScrAlert.tenant_id == tenant_id)
    )
    return result.scalar_one_or_none()


@router.post("/scr-alerts", response_model=ScrAlertRead, status_code=status.HTTP_202_ACCEPTED)
async def ingest_scr_alert(
    payload: ScrAlertCreate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    authorization: str | None = Header(default=None),
) -> ScrAlertRead:
    expected = settings.scr_alert_token
    if expected:
        token = None
        if authorization and authorization.lower().startswith("bearer "):
            token = authorization.split(" ", 1)[1]
        if token != expected:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    tenant = await get_tenant(session, str(payload.tenant_id))

    alert = await session.get(ScrAlert, payload.alert_id)
    created_at = payload.created_at or datetime.now(UTC)
    metadata_json = payload.metadata

    if alert is None:
        alert = ScrAlert(
            alert_id=payload.alert_id,
            tenant_id=tenant.tenant_id,
            taskr_task_id=payload.taskr_task_id,
            severity=payload.severity,
            kind=payload.kind,
            message=payload.message,
            source=payload.source,
            metadata_json=metadata_json,
            created_at=created_at,
            updated_at=created_at,
        )
        session.add(alert)
    else:
        alert.severity = payload.severity
        alert.kind = payload.kind
        alert.message = payload.message
        alert.source = payload.source
        alert.metadata_json = metadata_json
        alert.taskr_task_id = payload.taskr_task_id
        alert.updated_at = datetime.now(UTC)

    await session.flush()
    await session.refresh(alert)

    record_scr_alert_ingested(str(tenant.tenant_id), alert.severity, alert.kind)

    await event_bus.publish(
        {
            "type": "scr.alert.created",
            "tenant_id": str(tenant.tenant_id),
            "alert_id": str(alert.alert_id),
            "payload": ScrAlertRead.model_validate(alert).model_dump(),
        }
    )

    return ScrAlertRead.model_validate(alert)


@router.get("/alerts/scr", response_model=list[ScrAlertRead])
async def list_scr_alerts(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    include_acknowledged: bool = False,
    limit: int = 100,
) -> list[ScrAlertRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    query = select(ScrAlert).where(ScrAlert.tenant_id == tenant.tenant_id)
    if not include_acknowledged:
        query = query.where(ScrAlert.acknowledged_at.is_(None))
    query = query.order_by(ScrAlert.created_at.desc()).limit(limit)
    result = await session.execute(query)
    alerts = result.scalars().all()
    return [ScrAlertRead.model_validate(alert) for alert in alerts]


@router.post("/alerts/scr/{alert_id}/ack", response_model=ScrAlertRead)
async def acknowledge_scr_alert(
    alert_id: uuid.UUID,
    payload: ScrAlertAckRequest,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> ScrAlertRead:
    tenant = await get_tenant(session, headers.tenant_id)
    alert = await _get_alert(session, tenant.tenant_id, alert_id)
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    alert.acknowledged_at = datetime.now(UTC)
    alert.metadata_json = {**(alert.metadata_json or {}), "ack_notes": payload.notes}
    alert.updated_at = datetime.now(UTC)
    await session.flush()
    await session.refresh(alert)

    record_scr_alert_acknowledged(str(tenant.tenant_id), alert.kind)
    await event_bus.publish(
        {
            "type": "scr.alert.acknowledged",
            "tenant_id": headers.tenant_id,
            "alert_id": str(alert.alert_id),
            "payload": ScrAlertRead.model_validate(alert).model_dump(),
        }
    )
    return ScrAlertRead.model_validate(alert)
