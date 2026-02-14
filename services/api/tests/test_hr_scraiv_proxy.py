from __future__ import annotations

import sys
from pathlib import Path

from decimal import Decimal

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/api/src"))
sys.path.insert(0, str(REPO_ROOT / "packages/common_auth/src"))
sys.path.insert(0, str(REPO_ROOT / "packages/common_events/src"))

from app.core.config import settings
from app.integrations.scraiv import ScrAivClient, ScrAivError, get_scraiv_client
from app.routes.hr import router as hr_router
from common_auth import TenantHeaders


@pytest.mark.asyncio
async def test_clock_in_proxies_to_scraiv(monkeypatch):
    app = FastAPI()
    app.include_router(hr_router)

    class StubClient:
        def __init__(self) -> None:
            self.calls: list[tuple[TenantHeaders, dict[str, str]]] = []

        async def clock_in(self, tenant: TenantHeaders, payload: dict[str, str]):
            self.calls.append((tenant, payload))
            return {"status": "ok"}

    stub = StubClient()
    app.dependency_overrides[get_scraiv_client] = lambda: stub

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/hr/timeclock/in",
            json={"notes": "hello"},
            headers={"x-tenant-id": "acme", "x-user-id": "user-1"},
        )

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
    assert stub.calls[0][0].tenant_id == "acme"
    assert stub.calls[0][0].user_id == "user-1"
    assert stub.calls[0][1] == {"notes": "hello"}


@pytest.mark.asyncio
async def test_scraiv_error_propagates(monkeypatch):
    app = FastAPI()
    app.include_router(hr_router)

    class FailingClient:
        async def clock_in(self, tenant: TenantHeaders, payload: dict[str, str]):
            raise ScrAivError(status_code=502, detail="bad gateway")

    app.dependency_overrides[get_scraiv_client] = lambda: FailingClient()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/hr/timeclock/in",
            json={},
            headers={"x-tenant-id": "acme"},
        )

    assert resp.status_code == 502
    assert resp.json() == {"detail": "bad gateway"}


@pytest.mark.asyncio
async def test_missing_scraiv_config_returns_503(monkeypatch):
    app = FastAPI()
    app.include_router(hr_router)
    app.dependency_overrides.clear()

    monkeypatch.setattr(settings, "scraiv_base_url", None, raising=False)
    monkeypatch.setattr(settings, "scraiv_api_key", None, raising=False)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/hr/timeclock/in",
            json={},
            headers={"x-tenant-id": "acme"},
        )

    assert resp.status_code == 503
    assert resp.json() == {"detail": "scrAIv base URL not configured"}


@pytest.mark.asyncio
async def test_scraiv_client_builds_headers_and_sends(monkeypatch):
    captured: dict[str, object] = {}

    async def sender(**kwargs):
        captured.update(kwargs)
        return Response(200, json={"ok": True})

    client = ScrAivClient(base_url="https://scr.example", api_key="secret", sender=sender)
    tenant = TenantHeaders(
        tenant_id="acme",
        user_id="user-1",
        request_id="req-1",
        idempotency_key="idem-1",
        scopes=("taskr.hr.read", "taskr.hr.write"),
        token_balance=Decimal("12.50"),
    )

    result = await client.clock_in(tenant, {"notes": "hi"})

    assert result == {"ok": True}
    assert captured.get("url") == "https://scr.example/api/timeclock/clock-in"
    headers_obj = captured.get("headers")
    assert isinstance(headers_obj, dict)
    headers = headers_obj
    assert headers["x-tenant-id"] == "acme"
    assert headers["x-user-id"] == "user-1"
    assert headers["x-request-id"] == "req-1"
    assert headers["idempotency-key"] == "idem-1"
    assert headers["x-scopes"] == "taskr.hr.read taskr.hr.write"
    assert headers["x-token-balance"] == "12.50"
    assert headers["x-api-key"] == "secret"


@pytest.mark.asyncio
async def test_scraiv_client_error_parsing(monkeypatch):
    async def sender(**kwargs):
        return Response(409, json={"error": "duplicate"})

    client = ScrAivClient(base_url="https://scr.example", sender=sender)
    tenant = TenantHeaders(tenant_id="acme")

    with pytest.raises(ScrAivError) as exc:
        await client.clock_out(tenant, {})

    assert exc.value.status_code == 409
    assert exc.value.detail == "duplicate"
