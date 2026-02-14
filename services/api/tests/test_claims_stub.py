from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.deps import get_db_session


class DummySession:
    async def close(self) -> None:
        return None


async def override_db_session():
    session = DummySession()
    try:
        yield session
    finally:
        await session.close()


@pytest.fixture(autouse=True)
def _setup(monkeypatch):
    from common_auth import TenantHeaders

    async def fake_get_tenant(_session, _identifier):
        return SimpleNamespace(tenant_id="demo")

    app.dependency_overrides[get_db_session] = override_db_session
    monkeypatch.setattr("app.routes.claims.get_tenant", fake_get_tenant)
    yield
    app.dependency_overrides.clear()


def test_list_claims_and_search():
    client = TestClient(app)
    resp = client.get("/v1/claims", headers={"x-tenant-id": "demo"})
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["meta"]["count"] == len(payload["data"])
    assert any(claim["claim_id"] == "CLM-1001" for claim in payload["data"])

    search_resp = client.get("/v1/claims", params={"search": "aetna"}, headers={"x-tenant-id": "demo"})
    assert search_resp.status_code == 200
    results = search_resp.json()["data"]
    assert all("aetna" in claim["payer"].lower() for claim in results)


def test_claim_events():
    client = TestClient(app)
    resp = client.get("/v1/scr/api/claims/CLM-1001/events", headers={"x-tenant-id": "demo"})
    assert resp.status_code == 200
    events = resp.json()
    assert len(events) >= 1
    assert events[0]["status"]
