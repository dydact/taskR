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
    async def fake_get_tenant(_session, _identifier):
        return SimpleNamespace(tenant_id="demo")

    app.dependency_overrides[get_db_session] = override_db_session
    monkeypatch.setattr("app.routes.hr_views.get_tenant", fake_get_tenant)
    yield
    app.dependency_overrides.clear()


def test_hr_timeclock_and_payroll_endpoints():
    client = TestClient(app)
    open_resp = client.get("/hr/timeclock/open", headers={"x-tenant-id": "demo"})
    assert open_resp.status_code == 200
    assert isinstance(open_resp.json()["data"], list)

    history_resp = client.get("/hr/timeclock/history", headers={"x-tenant-id": "demo"})
    assert history_resp.status_code == 200
    assert isinstance(history_resp.json()["data"], list)

    sheets_resp = client.get("/hr/timesheets", headers={"x-tenant-id": "demo"})
    assert sheets_resp.status_code == 200
    sheets = sheets_resp.json()["data"]
    assert len(sheets) >= 1
    assert sheets[0]["user_id"]

    payroll_resp = client.get("/hr/payroll", headers={"x-tenant-id": "demo"})
    assert payroll_resp.status_code == 200
    payroll = payroll_resp.json()["data"]
    assert payroll["total_pay"] >= 0
