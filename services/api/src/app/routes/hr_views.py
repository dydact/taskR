from __future__ import annotations

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends

from app.core.deps import get_db_session
from app.routes.utils import get_tenant
from app.schemas import (
    HRTimesheetRead,
    HRTimeclockEntryRead,
    HRPayrollSummaryRead,
)
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/hr", tags=["hr"])

_NOW = datetime.now(timezone.utc)

_SAMPLE_OPENS = [
    HRTimeclockEntryRead(
        id="clock-1",
        user_id="morgan.gray",
        started_at=(_NOW - timedelta(hours=2)).isoformat(),
        ended_at=None,
    ),
    HRTimeclockEntryRead(
        id="clock-2",
        user_id="avery.edwards",
        started_at=(_NOW - timedelta(hours=1, minutes=20)).isoformat(),
        ended_at=None,
    ),
]

_SAMPLE_HISTORY = [
    HRTimeclockEntryRead(
        id="history-1",
        user_id="riley.monroe",
        started_at=(_NOW - timedelta(hours=6)).isoformat(),
        ended_at=(_NOW - timedelta(hours=4, minutes=45)).isoformat(),
    ),
    HRTimeclockEntryRead(
        id="history-2",
        user_id="casey.anderson",
        started_at=(_NOW - timedelta(hours=5)).isoformat(),
        ended_at=(_NOW - timedelta(hours=3, minutes=30)).isoformat(),
    ),
]

_SAMPLE_TIMESHEETS = [
    HRTimesheetRead(
        id="sheet-1",
        user_id="morgan.gray",
        period_start=(_NOW - timedelta(days=7)).date().isoformat(),
        period_end=_NOW.date().isoformat(),
        status="submitted",
        total_hours=37.5,
    ),
    HRTimesheetRead(
        id="sheet-2",
        user_id="avery.edwards",
        period_start=(_NOW - timedelta(days=7)).date().isoformat(),
        period_end=_NOW.date().isoformat(),
        status="approved",
        total_hours=40.0,
    ),
]

_SAMPLE_PAYROLL = HRPayrollSummaryRead(
    period_start=(_NOW - timedelta(days=7)).date().isoformat(),
    period_end=_NOW.date().isoformat(),
    total_pay=158750,
    pending=24500,
)


@router.get("/timeclock/open", response_model=dict)
async def list_open_timeclocks(
    headers: TenantHeaders = Depends(get_tenant_headers),
    session=Depends(get_db_session),
) -> dict:
    await get_tenant(session, headers.tenant_id)
    return {"data": _SAMPLE_OPENS}


@router.get("/timeclock/history", response_model=dict)
async def list_timeclock_history(
    headers: TenantHeaders = Depends(get_tenant_headers),
    session=Depends(get_db_session),
) -> dict:
    await get_tenant(session, headers.tenant_id)
    return {"data": _SAMPLE_HISTORY}


@router.get("/timesheets", response_model=dict)
async def list_timesheets(
    headers: TenantHeaders = Depends(get_tenant_headers),
    session=Depends(get_db_session),
) -> dict:
    await get_tenant(session, headers.tenant_id)
    return {"data": _SAMPLE_TIMESHEETS}


@router.get("/payroll", response_model=dict)
async def get_payroll_summary(
    headers: TenantHeaders = Depends(get_tenant_headers),
    session=Depends(get_db_session),
) -> dict:
    await get_tenant(session, headers.tenant_id)
    return {"data": _SAMPLE_PAYROLL}
