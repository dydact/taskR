from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Header, HTTPException
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


@dataclass
class TenantHeaders:
    tenant_id: str
    request_id: Optional[str] = None
    idempotency_key: Optional[str] = None
    user_id: Optional[str] = None


async def get_tenant_headers(
    x_tenant_id: str | None = Header(default=None, alias="x-tenant-id"),
    x_scr_tenant: str | None = Header(default=None, alias="X-SCR-Tenant"),
    x_request_id: str | None = Header(default=None, alias="x-request-id"),
    idempotency_key: str | None = Header(default=None, alias="idempotency-key"),
    x_user_id: str | None = Header(default=None, alias="x-user-id"),
) -> TenantHeaders:
    tenant_id = x_tenant_id or x_scr_tenant
    if tenant_id is None:
        raise HTTPException(status_code=400, detail={"error": "missing_tenant"})
    return TenantHeaders(
        tenant_id=tenant_id,
        request_id=x_request_id,
        idempotency_key=idempotency_key,
        user_id=x_user_id,
    )


class _TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        tenant = request.headers.get("x-tenant-id") or request.headers.get("x-scr-tenant")
        if tenant is None:
            return JSONResponse(status_code=400, content={"error": "missing_tenant"})
        request.state.tenant_id = tenant
        return await call_next(request)


def add_tenant_middleware(app) -> None:
    app.add_middleware(_TenantMiddleware)


__all__ = ["TenantHeaders", "add_tenant_middleware", "get_tenant_headers"]
