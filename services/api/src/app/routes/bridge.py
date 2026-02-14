from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db_session
from app.routes.utils import get_tenant
from app.schemas import (
    BillingExportRequest,
    BillingPreviewResponse,
    ClaimStatusUpdate,
    PayrollReconcileRequest,
    ScheduleTimelineLockRequest,
    ScheduleTimelineRead,
    ScheduleTimelineWorklogUpdate,
)
from app.services.bridge import (
    TimelineFilters,
    build_billing_preview,
    list_timelines,
    mark_exported,
    reconcile_payroll,
    seed_stub_timeline,
    set_status,
    update_claim_status,
    update_worklog,
)
from app.services.billing import is_feature_enabled
from app.models.core import ScheduleTimeline
from common_auth import TenantHeaders, get_tenant_headers
from app.services.schedule_orchestration import ScheduleOrchestrator
from app.integrations import (
    OpenEmrClient,
    OpenEmrError,
    ScrAivClient,
    ScrAivError,
    get_openemr_client,
    get_scraiv_client,
)
from app.schemas import ScheduleSyncResponse, ScheduleSyncConflict

router = APIRouter(prefix="/bridge", tags=["bridge"])

BRIDGE_FEATURE_CODE = "schedule.bridge"


async def _ensure_bridge_enabled(session: AsyncSession, tenant_id: uuid.UUID) -> None:
    if not settings.bridge_schedule_enabled:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="bridge_disabled")
    allowed = await is_feature_enabled(session, tenant_id, BRIDGE_FEATURE_CODE)
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="bridge_feature_disabled")


def _to_schema(row: ScheduleTimeline) -> ScheduleTimelineRead:
    return ScheduleTimelineRead.model_validate(row)


@router.get("/schedule", response_model=list[ScheduleTimelineRead])
async def list_schedule_entries(
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    staff_id: uuid.UUID | None = Query(default=None),
    patient_id: uuid.UUID | None = Query(default=None),
    status_filter: List[str] | None = Query(default=None, alias="status"),
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
):
    tenant = await get_tenant(session, headers.tenant_id)
    await _ensure_bridge_enabled(session, tenant.tenant_id)
    filters = TimelineFilters(
        start=start,
        end=end,
        staff_id=staff_id,
        patient_id=patient_id,
        statuses=status_filter,
    )
    rows = await list_timelines(session, tenant.tenant_id, filters)
    return [_to_schema(row) for row in rows]


@router.post("/schedule/{session_id}/worklog", response_model=ScheduleTimelineRead)
async def update_schedule_worklog(
    session_id: uuid.UUID,
    payload: ScheduleTimelineWorklogUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
):
    tenant = await get_tenant(session, headers.tenant_id)
    await _ensure_bridge_enabled(session, tenant.tenant_id)
    row = await update_worklog(
        session,
        tenant.tenant_id,
        session_id=session_id,
        worked_start=payload.worked_start,
        worked_end=payload.worked_end,
        duration_minutes=payload.duration_minutes,
        metadata=payload.metadata,
    )
    return _to_schema(row)


@router.post("/schedule/{session_id}/lock", response_model=ScheduleTimelineRead)
async def lock_schedule_entry(
    session_id: uuid.UUID,
    payload: ScheduleTimelineLockRequest,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
):
    tenant = await get_tenant(session, headers.tenant_id)
    await _ensure_bridge_enabled(session, tenant.tenant_id)
    row = await set_status(
        session,
        tenant.tenant_id,
        session_id=session_id,
        status_value=payload.status,
        metadata=payload.lock_metadata,
    )
    return _to_schema(row)


@router.get("/billing/preview", response_model=BillingPreviewResponse)
async def billing_preview(
    timeline_id: uuid.UUID | None = Query(default=None),
    session_id: uuid.UUID | None = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
):
    if not timeline_id and not session_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="timeline_or_session_required")

    tenant = await get_tenant(session, headers.tenant_id)
    await _ensure_bridge_enabled(session, tenant.tenant_id)

    stmt = None
    if timeline_id:
        stmt = await session.execute(
            select(ScheduleTimeline).where(
                (ScheduleTimeline.tenant_id == tenant.tenant_id)
                & (ScheduleTimeline.timeline_id == timeline_id)
            )
        )
        row = stmt.scalars().first()
    else:
        stmt = await session.execute(
            select(ScheduleTimeline).where(
                (ScheduleTimeline.tenant_id == tenant.tenant_id)
                & (ScheduleTimeline.session_id == session_id)
            )
        )
        row = stmt.scalars().first()

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="timeline_not_found")
    return BillingPreviewResponse.model_validate(build_billing_preview(row))


@router.post("/billing/export", response_model=ScheduleTimelineRead)
async def billing_export(
    payload: BillingExportRequest,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
):
    tenant = await get_tenant(session, headers.tenant_id)
    await _ensure_bridge_enabled(session, tenant.tenant_id)
    row = await mark_exported(
        session,
        tenant.tenant_id,
        payload.timeline_id,
        transport_job_id=payload.transport_job_id,
        metadata=payload.metadata,
    )
    return _to_schema(row)


def _resolve_scraiv_client() -> ScrAivClient | None:
    try:
        return get_scraiv_client()
    except ScrAivError:
        return None


def _resolve_openemr_client() -> OpenEmrClient | None:
    try:
        return get_openemr_client()
    except OpenEmrError:
        return None


@router.post("/schedule/sync", response_model=ScheduleSyncResponse)
async def sync_schedule_bridge(
    since: str | None = Query(default=None, description="Optional ISO timestamp for incremental sync"),
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
):
    tenant = await get_tenant(session, headers.tenant_id)
    await _ensure_bridge_enabled(session, tenant.tenant_id)

    scraiv_client = _resolve_scraiv_client()
    openemr_client = _resolve_openemr_client()

    orchestrator = ScheduleOrchestrator(
        scr_client=scraiv_client,
        openemr_client=openemr_client,
    )
    summary = await orchestrator.sync(
        session,
        tenant_id=tenant.tenant_id,
        headers=headers,
        since=since,
    )
    conflicts = [
        ScheduleSyncConflict(
            timeline_id=conflict.timeline_id,
            reason=conflict.reason,
            details=conflict.details,
        )
        for conflict in summary.conflicts
    ]
    return ScheduleSyncResponse(
        created=summary.created,
        updated=summary.updated,
        unchanged=summary.unchanged,
        sources=summary.sources,
        conflicts=conflicts,
    )


@router.post("/claims/status", response_model=ScheduleTimelineRead)
async def update_claim(
    payload: ClaimStatusUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
):
    tenant = await get_tenant(session, headers.tenant_id)
    await _ensure_bridge_enabled(session, tenant.tenant_id)
    metadata: dict[str, Any] = payload.metadata or {}
    if payload.status_code:
        metadata.setdefault("status_code", payload.status_code)
    if payload.status_message:
        metadata.setdefault("status_message", payload.status_message)
    row = await update_claim_status(
        session,
        tenant.tenant_id,
        timeline_id=payload.timeline_id,
        claim_id=payload.claim_id,
        status_value=payload.status,
        metadata=metadata,
    )
    return _to_schema(row)


@router.post("/payroll/reconcile", response_model=list[ScheduleTimelineRead])
async def reconcile_payroll_endpoint(
    payload: PayrollReconcileRequest,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
):
    tenant = await get_tenant(session, headers.tenant_id)
    await _ensure_bridge_enabled(session, tenant.tenant_id)
    rows = await reconcile_payroll(
        session,
        tenant.tenant_id,
        payroll_entry_id=payload.payroll_entry_id,
        timeline_ids=payload.timeline_ids,
        status_value=payload.status,
        metadata=payload.metadata,
    )
    return [_to_schema(row) for row in rows]


@router.post("/stubs/timeline", response_model=ScheduleTimelineRead, status_code=status.HTTP_201_CREATED)
async def seed_timeline_stub(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
):
    """
    Local-only helper to seed a demo schedule timeline row for bridge validation scripts.
    """

    if settings.environment not in {"local", "dev", "development"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="stub_unavailable")

    tenant = await get_tenant(session, headers.tenant_id)
    await _ensure_bridge_enabled(session, tenant.tenant_id)
    row = await seed_stub_timeline(session, tenant.tenant_id)
    return _to_schema(row)
