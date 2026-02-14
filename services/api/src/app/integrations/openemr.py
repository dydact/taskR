from __future__ import annotations

from typing import Any, Awaitable, Callable

import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from common_auth import TenantHeaders

Sender = Callable[..., Awaitable[httpx.Response]]


class OpenEmrError(HTTPException):
    """Error raised when openemr proxying fails."""


class OpenEmrClient:
    """Thin async client used to synchronize TaskR schedule data with openemr."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None = None,
        timeout: float = 5.0,
        sender: Sender | None = None,
    ) -> None:
        if not base_url:
            raise ValueError("base_url is required for OpenEmrClient")
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self._sender = sender

    async def list_appointments(
        self,
        tenant: TenantHeaders,
        *,
        since: str | None = None,
    ) -> list[dict[str, Any]]:
        params = {"since": since} if since else None
        payload = await self._request(
            "GET",
            "/api/appointments",
            tenant=tenant,
            params=params,
        )
        return self._unwrap_list(payload)

    async def push_exception(self, tenant: TenantHeaders, payload: dict[str, Any]) -> Any:
        """Send an orchestration exception back to openemr for reconciliation."""
        return await self._request(
            "POST",
            "/api/appointments/exceptions",
            tenant=tenant,
            json=payload,
        )

    async def update_booking(
        self,
        tenant: TenantHeaders,
        appointment_id: str,
        payload: dict[str, Any],
    ) -> Any:
        return await self._request(
            "PATCH",
            f"/api/appointments/{appointment_id}",
            tenant=tenant,
            json=payload,
        )

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
            raise OpenEmrError(status_code=response.status_code, detail=self._parse_error(response))
        try:
            return response.json()
        except ValueError as exc:  # pragma: no cover - unexpected scenario
            raise OpenEmrError(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="openemr response was not valid JSON",
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
            raise OpenEmrError(status.HTTP_400_BAD_REQUEST, detail="missing tenant id")
        headers: dict[str, str] = {
            "x-tenant-id": tenant.tenant_id,
            "accept": "application/json",
        }
        if tenant.user_id:
            headers["x-user-id"] = tenant.user_id
        if tenant.request_id:
            headers["x-request-id"] = tenant.request_id
        if self._api_key:
            headers["x-api-key"] = self._api_key
        return headers

    @staticmethod
    def _unwrap_list(payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, dict) and "data" in payload and isinstance(payload["data"], list):
            return payload["data"]  # type: ignore[return-value]
        if isinstance(payload, list):
            return payload  # type: ignore[return-value]
        return []

    @staticmethod
    def _parse_error(response: httpx.Response) -> Any:
        try:
            payload = response.json()
        except ValueError:
            text = (response.text or "").strip()
            if not text:
                text = f"openemr error ({response.status_code})"
            return {"error": text}
        if isinstance(payload, dict):
            return payload.get("error") or payload
        return payload


def get_openemr_client() -> OpenEmrClient:
    base = settings.openemr_base_url
    if not base:
        raise OpenEmrError(status.HTTP_503_SERVICE_UNAVAILABLE, detail="openemr base URL not configured")
    return OpenEmrClient(
        base_url=base,
        api_key=settings.openemr_api_key,
        timeout=settings.openemr_timeout_seconds,
    )


__all__ = ["OpenEmrClient", "OpenEmrError", "get_openemr_client"]
