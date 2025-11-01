from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.integrations.scraiv import ScrAivClient, get_scraiv_client
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/hr", tags=["hr"])


_USER_CACHE_TTL_SECONDS = 300
_USER_CACHE: dict[str, tuple[float, Any]] = {}


# Time Clock
@router.post("/timeclock/in")
async def clock_in(
    payload: dict[str, Any],
    th: TenantHeaders = Depends(get_tenant_headers),
    client: ScrAivClient = Depends(get_scraiv_client),
) -> Any:
    return await client.clock_in(th, payload)


@router.post("/timeclock/out")
async def clock_out(
    payload: dict[str, Any],
    th: TenantHeaders = Depends(get_tenant_headers),
    client: ScrAivClient = Depends(get_scraiv_client),
) -> Any:
    return await client.clock_out(th, payload)


@router.get("/timeclock/open")
async def open_clocks(
    user_id: str | None = Query(default=None),
    th: TenantHeaders = Depends(get_tenant_headers),
    client: ScrAivClient = Depends(get_scraiv_client),
) -> Any:
    return await client.open_clocks(th, user_id=user_id)


@router.get("/timeclock/history")
async def clock_history(
    start: str | None = Query(default=None),
    end: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    th: TenantHeaders = Depends(get_tenant_headers),
    client: ScrAivClient = Depends(get_scraiv_client),
) -> Any:
    return await client.clock_history(th, start=start, end=end, user_id=user_id)


# Timesheets
@router.post("/timesheets/generate")
async def timesheets_generate(
    payload: dict[str, Any],
    th: TenantHeaders = Depends(get_tenant_headers),
    client: ScrAivClient = Depends(get_scraiv_client),
) -> Any:
    return await client.timesheets_generate(th, payload)


@router.get("/timesheets")
async def timesheets_list(
    status: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    th: TenantHeaders = Depends(get_tenant_headers),
    client: ScrAivClient = Depends(get_scraiv_client),
) -> Any:
    return await client.timesheets_list(th, status_filter=status, user_id=user_id)


@router.post("/timesheets/{entry_id}/approve")
async def timesheet_approve(
    entry_id: str,
    th: TenantHeaders = Depends(get_tenant_headers),
    client: ScrAivClient = Depends(get_scraiv_client),
) -> Any:
    return await client.timesheet_approve(th, entry_id)


@router.post("/timesheets/{entry_id}/reject")
async def timesheet_reject(
    entry_id: str,
    th: TenantHeaders = Depends(get_tenant_headers),
    client: ScrAivClient = Depends(get_scraiv_client),
) -> Any:
    return await client.timesheet_reject(th, entry_id)


# Alias for submit (maps to approve until scrAIv exposes dedicated submit endpoint)
@router.post("/timesheets/{entry_id}/submit")
async def timesheet_submit(
    entry_id: str,
    th: TenantHeaders = Depends(get_tenant_headers),
    client: ScrAivClient = Depends(get_scraiv_client),
) -> Any:
    return await client.timesheet_submit(th, entry_id)


# Payroll
@router.get("/payroll")
async def payroll_get(
    period: str | None = Query(default=None),
    th: TenantHeaders = Depends(get_tenant_headers),
    client: ScrAivClient = Depends(get_scraiv_client),
) -> Any:
    return await client.payroll(th, period=period)


@router.post("/payroll/export")
async def payroll_export(
    payload: dict[str, Any],
    th: TenantHeaders = Depends(get_tenant_headers),
    client: ScrAivClient = Depends(get_scraiv_client),
) -> Any:
    return await client.payroll_export(th, payload)


# Identity mapping
@router.get("/users")
async def list_users(
    refresh: bool = Query(default=False),
    th: TenantHeaders = Depends(get_tenant_headers),
    client: ScrAivClient = Depends(get_scraiv_client),
) -> Any:
    tenant_key = th.tenant_id or "__default__"
    now = time.time()
    cached = _USER_CACHE.get(tenant_key)
    if not refresh and cached and now - cached[0] < _USER_CACHE_TTL_SECONDS:
        return cached[1]

    data = await client.list_users(th)
    _USER_CACHE[tenant_key] = (now, data)
    return data
