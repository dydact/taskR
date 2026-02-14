from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Iterable, List

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import ScheduleTimeline


@dataclass
class TimelineFilters:
    start: datetime | None = None
    end: datetime | None = None
    staff_id: uuid.UUID | None = None
    patient_id: uuid.UUID | None = None
    statuses: Iterable[str] | None = None


async def list_timelines(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    filters: TimelineFilters,
) -> List[ScheduleTimeline]:
    stmt = select(ScheduleTimeline).where(ScheduleTimeline.tenant_id == tenant_id)
    if filters.start:
        stmt = stmt.where(ScheduleTimeline.scheduled_start >= filters.start)
    if filters.end:
        stmt = stmt.where(ScheduleTimeline.scheduled_start <= filters.end)
    if filters.staff_id:
        stmt = stmt.where(ScheduleTimeline.staff_id == filters.staff_id)
    if filters.patient_id:
        stmt = stmt.where(ScheduleTimeline.patient_id == filters.patient_id)
    if filters.statuses:
        stmt = stmt.where(ScheduleTimeline.status.in_(list(filters.statuses)))
    stmt = stmt.order_by(ScheduleTimeline.scheduled_start.asc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def _get_timeline_by_session(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    session_id: uuid.UUID,
) -> ScheduleTimeline:
    stmt = select(ScheduleTimeline).where(
        and_(
            ScheduleTimeline.tenant_id == tenant_id,
            ScheduleTimeline.session_id == session_id,
        )
    )
    result = await session.execute(stmt)
    row = result.scalars().first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="session_not_found",
        )
    return row


async def update_worklog(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    session_id: uuid.UUID,
    *,
    worked_start: datetime | None,
    worked_end: datetime | None,
    duration_minutes: int | None,
    metadata: dict | None,
) -> ScheduleTimeline:
    row = await _get_timeline_by_session(session, tenant_id, session_id)
    row.worked_start = worked_start
    row.worked_end = worked_end
    if duration_minutes is not None:
        row.duration_minutes = duration_minutes
    elif worked_start and worked_end:
        delta = worked_end - worked_start
        row.duration_minutes = max(0, int(delta.total_seconds() // 60))
    if metadata:
        row.metadata_json = {**(row.metadata_json or {}), **metadata}
    row.status = "worked" if row.status == "scheduled" else row.status
    await session.flush()
    await session.refresh(row)
    return row


async def set_status(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    session_id: uuid.UUID,
    *,
    status_value: str,
    metadata: dict | None,
) -> ScheduleTimeline:
    row = await _get_timeline_by_session(session, tenant_id, session_id)
    row.status = status_value
    if metadata:
        row.metadata_json = {**(row.metadata_json or {}), **metadata}
    await session.flush()
    await session.refresh(row)
    return row


async def mark_exported(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    timeline_id: uuid.UUID,
    *,
    transport_job_id: uuid.UUID,
    metadata: dict | None,
) -> ScheduleTimeline:
    stmt = select(ScheduleTimeline).where(
        and_(
            ScheduleTimeline.tenant_id == tenant_id,
            ScheduleTimeline.timeline_id == timeline_id,
        )
    )
    result = await session.execute(stmt)
    row = result.scalars().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="timeline_not_found")
    row.transport_job_id = transport_job_id
    row.status = "exported"
    if metadata:
        row.metadata_json = {**(row.metadata_json or {}), **metadata}
    await session.flush()
    await session.refresh(row)
    return row


async def update_claim_status(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    timeline_id: uuid.UUID,
    *,
    claim_id: uuid.UUID,
    status_value: str,
    metadata: dict | None,
) -> ScheduleTimeline:
    stmt = select(ScheduleTimeline).where(
        and_(
            ScheduleTimeline.tenant_id == tenant_id,
            ScheduleTimeline.timeline_id == timeline_id,
        )
    )
    result = await session.execute(stmt)
    row = result.scalars().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="timeline_not_found")
    row.claim_id = claim_id
    row.status = status_value
    if metadata:
        row.metadata_json = {**(row.metadata_json or {}), **metadata}
    await session.flush()
    await session.refresh(row)
    return row


async def reconcile_payroll(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    payroll_entry_id: uuid.UUID,
    timeline_ids: Iterable[uuid.UUID],
    status_value: str,
    metadata: dict | None,
) -> list[ScheduleTimeline]:
    matched: list[ScheduleTimeline] = []
    for timeline_id in timeline_ids:
        stmt = select(ScheduleTimeline).where(
            and_(
                ScheduleTimeline.tenant_id == tenant_id,
                ScheduleTimeline.timeline_id == timeline_id,
            )
        )
        result = await session.execute(stmt)
        row = result.scalars().first()
        if row is None:
            continue
        row.payroll_entry_id = payroll_entry_id
        row.status = status_value
        if metadata:
            row.metadata_json = {**(row.metadata_json or {}), **metadata}
        matched.append(row)
    await session.flush()
    for row in matched:
        await session.refresh(row)
    return matched


def compute_units(duration_minutes: int | None) -> float | None:
    if duration_minutes is None:
        return None
    return round(duration_minutes / 15.0, 2)


def build_billing_preview(row: ScheduleTimeline) -> dict:
    units = compute_units(row.duration_minutes)
    return {
        "timeline_id": str(row.timeline_id),
        "session_id": str(row.session_id),
        "service_type": row.service_type,
        "cpt_code": row.cpt_code,
        "modifiers": row.modifiers or [],
        "units": units,
        "rate": None,
        "authorization_id": str(row.authorization_id) if row.authorization_id else None,
        "metadata": row.metadata_json or {},
    }


async def seed_stub_timeline(session: AsyncSession, tenant_id: uuid.UUID) -> ScheduleTimeline:
    now = datetime.now(UTC).replace(microsecond=0)
    entry = ScheduleTimeline(
        tenant_id=tenant_id,
        session_id=uuid.uuid4(),
        patient_id=None,
        staff_id=None,
        location_id=None,
        service_type="therapy.session",
        authorization_id=None,
        cpt_code="97110",
        modifiers=["GN"],
        scheduled_start=now,
        scheduled_end=now + timedelta(minutes=60),
        worked_start=None,
        worked_end=None,
        duration_minutes=60,
        status="scheduled",
        payroll_entry_id=None,
        claim_id=None,
        transport_job_id=None,
        metadata_json={"source": "stub", "note": "Seeded via /bridge/stubs/timeline"},
    )
    session.add(entry)
    await session.flush()
    await session.refresh(entry)
    return entry
