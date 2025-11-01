from __future__ import annotations

from typing import Any, Awaitable, Callable

import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from common_auth import TenantHeaders


Sender = Callable[..., Awaitable[httpx.Response]]


class ScrAivError(HTTPException):
    """Error raised when scrAIv proxying fails."""


class ScrAivClient:
    """Thin async client used to proxy taskR HR requests to scrAIv."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None = None,
        timeout: float = 5.0,
        sender: Sender | None = None,
    ) -> None:
        if not base_url:
            raise ValueError("base_url is required for ScrAivClient")
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self._sender = sender

    async def clock_in(self, tenant: TenantHeaders, payload: dict[str, Any]) -> Any:
        return await self._request("POST", "/api/timeclock/clock-in", tenant=tenant, json=payload)

    async def clock_out(self, tenant: TenantHeaders, payload: dict[str, Any]) -> Any:
        return await self._request("POST", "/api/timeclock/clock-out", tenant=tenant, json=payload)

    async def open_clocks(self, tenant: TenantHeaders, *, user_id: str | None = None) -> Any:
        params = {"user_id": user_id} if user_id else None
        return await self._request("GET", "/api/timeclock/open", tenant=tenant, params=params)

    async def clock_history(
        self,
        tenant: TenantHeaders,
        *,
        start: str | None = None,
        end: str | None = None,
        user_id: str | None = None,
    ) -> Any:
        params: dict[str, Any] = {}
        if start:
            params["start"] = start
        if end:
            params["end"] = end
        if user_id:
            params["user_id"] = user_id
        return await self._request("GET", "/api/timeclock/history", tenant=tenant, params=params or None)

    async def timesheets_generate(self, tenant: TenantHeaders, payload: dict[str, Any]) -> Any:
        return await self._request("POST", "/api/timesheets/generate", tenant=tenant, json=payload)

    async def timesheets_list(
        self,
        tenant: TenantHeaders,
        *,
        status_filter: str | None = None,
        user_id: str | None = None,
    ) -> Any:
        params: dict[str, Any] = {}
        if status_filter:
            params["status"] = status_filter
        if user_id:
            params["user_id"] = user_id
        return await self._request("GET", "/api/timesheets", tenant=tenant, params=params or None)

    async def timesheet_approve(self, tenant: TenantHeaders, entry_id: str) -> Any:
        return await self._request("POST", f"/api/timesheets/{entry_id}/approve", tenant=tenant)

    async def timesheet_reject(self, tenant: TenantHeaders, entry_id: str) -> Any:
        return await self._request("POST", f"/api/timesheets/{entry_id}/reject", tenant=tenant)

    async def timesheet_submit(self, tenant: TenantHeaders, entry_id: str) -> Any:
        # scrAIv aliases submit -> approve in dev; call approve endpoint for now.
        return await self._request("POST", f"/api/timesheets/{entry_id}/approve", tenant=tenant)

    async def payroll(self, tenant: TenantHeaders, *, period: str | None = None) -> Any:
        params = {"period": period} if period else None
        return await self._request("GET", "/api/payroll", tenant=tenant, params=params)

    async def payroll_export(self, tenant: TenantHeaders, payload: dict[str, Any]) -> Any:
        return await self._request("POST", "/api/payroll/export", tenant=tenant, json=payload)

    async def list_users(self, tenant: TenantHeaders) -> Any:
        return await self._request("GET", "/api/users", tenant=tenant)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        tenant: TenantHeaders,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        url = f"{self._base_url}{path}"
        headers = self._build_headers(tenant)
        response = await self._send(method, url, params=params, json=json, headers=headers)
        if response.status_code >= 400:
            raise ScrAivError(status_code=response.status_code, detail=self._parse_error(response))
        try:
            return response.json()
        except ValueError as exc:  # pragma: no cover - unexpected scenario
            raise ScrAivError(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="scrAIv response was not valid JSON",
            ) from exc

    async def _send(
        self,
        method: str,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        headers: dict[str, str],
    ) -> httpx.Response:
        if self._sender:
            return await self._sender(method=method, url=url, params=params, json=json, headers=headers)
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            return await client.request(method, url, params=params, json=json, headers=headers)

    def _build_headers(self, tenant: TenantHeaders) -> dict[str, str]:
        if not tenant.tenant_id:
            raise ScrAivError(status.HTTP_400_BAD_REQUEST, detail="missing tenant id")
        headers: dict[str, str] = {
            "x-tenant-id": tenant.tenant_id,
            "accept": "application/json",
        }
        if tenant.user_id:
            headers["x-user-id"] = tenant.user_id
        if tenant.request_id:
            headers["x-request-id"] = tenant.request_id
        if tenant.idempotency_key:
            headers["idempotency-key"] = tenant.idempotency_key
        if self._api_key:
            headers["x-api-key"] = self._api_key
        return headers

    @staticmethod
    def _parse_error(response: httpx.Response) -> Any:
        try:
            payload = response.json()
        except ValueError:
            text = (response.text or "").strip()
            if not text:
                text = f"scrAIv error ({response.status_code})"
            return {"error": text}
        if isinstance(payload, dict):
            return payload.get("error") or payload
        return payload


def get_scraiv_client() -> ScrAivClient:
    base = settings.scraiv_base_url
    if not base:
        raise ScrAivError(status.HTTP_503_SERVICE_UNAVAILABLE, detail="scrAIv base URL not configured")
    return ScrAivClient(
        base_url=base,
        api_key=settings.scraiv_api_key,
        timeout=settings.insight_api_timeout_seconds,
    )
