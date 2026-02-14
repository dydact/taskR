from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.deps import get_db_session
from app.main import app
from common_auth import TenantHeaders, get_tenant_headers
from app.services.schedule_orchestration import ScheduleSyncResult, ScheduleSyncConflict


class DummySession:
    async def close(self) -> None:
        return None


async def override_db_session():
    session = DummySession()
    try:
        yield session
    finally:
        await session.close()


async def fake_get_tenant(_session, _identifier):
    return SimpleNamespace(tenant_id=uuid.uuid4())


@pytest.fixture(autouse=True)
def _setup(monkeypatch):
    original_bridge = settings.bridge_schedule_enabled
    app.dependency_overrides[get_db_session] = override_db_session
    monkeypatch.setattr("app.routes.bridge.get_tenant", fake_get_tenant)
    app.dependency_overrides[get_tenant_headers] = lambda: TenantHeaders(
        tenant_id=str(uuid.uuid4()),
        user_id=None,
    )
    settings.bridge_schedule_enabled = False
    yield
    app.dependency_overrides.clear()
    settings.bridge_schedule_enabled = original_bridge


def test_bridge_disabled_returns_503():
    client = TestClient(app)
    response = client.get("/bridge/schedule", headers={"x-tenant-id": "demo"})
    assert response.status_code == 503
    assert response.json()["detail"] == "bridge_disabled"


def test_bridge_schedule_list(monkeypatch):
    async def fake_ensure(session, tenant_id):
        return None

    monkeypatch.setattr("app.routes.bridge._ensure_bridge_enabled", fake_ensure)

    fake_row = SimpleNamespace(
        timeline_id=uuid.uuid4(),
        session_id=uuid.uuid4(),
        patient_id=None,
        staff_id=None,
        location_id=None,
        service_type="therapy",
        authorization_id=None,
        cpt_code="97110",
        modifiers=["GN"],
        scheduled_start=datetime.now(timezone.utc),
        scheduled_end=datetime.now(timezone.utc),
        worked_start=None,
        worked_end=None,
        duration_minutes=None,
        status="scheduled",
        payroll_entry_id=None,
        claim_id=None,
        transport_job_id=None,
        metadata_json={},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    async def fake_list_timelines(session, tenant_id, filters):
        return [fake_row]

    monkeypatch.setattr("app.routes.bridge.list_timelines", fake_list_timelines)

    client = TestClient(app)
    response = client.get("/bridge/schedule", headers={"x-tenant-id": "demo"})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["service_type"] == "therapy"


def test_bridge_feature_disabled(monkeypatch):
    async def fake_ensure(session, tenant_id):
        raise HTTPException(status_code=403, detail="bridge_feature_disabled")

    monkeypatch.setattr("app.routes.bridge._ensure_bridge_enabled", fake_ensure)

    client = TestClient(app)
    response = client.get("/bridge/schedule", headers={"x-tenant-id": "demo"})
    assert response.status_code == 403
    assert response.json()["detail"] == "bridge_feature_disabled"


def test_bridge_schedule_sync(monkeypatch):
    async def fake_ensure(session, tenant_id):
        return None

    async def fake_sync(*_, **__):
        summary = ScheduleSyncResult()
        summary.created = 1
        summary.updated = 2
        summary.unchanged = 0
        summary.sources = {"scr": 1, "openemr": 0}
        summary.conflicts.append(
            ScheduleSyncConflict(
                timeline_id=uuid.uuid4(),
                reason="demo_conflict",
                details={"source": "test"},
            )
        )
        return summary

    class StubOrchestrator:
        def __init__(self, *_, **__):
            pass

        async def sync(self, *args, **kwargs):
            return await fake_sync()

    async def fake_get_tenant(_session, _identifier):
        return SimpleNamespace(tenant_id=uuid.uuid4())

    monkeypatch.setattr("app.routes.bridge._ensure_bridge_enabled", fake_ensure)
    monkeypatch.setattr("app.routes.bridge.ScheduleOrchestrator", lambda **kwargs: StubOrchestrator())
    monkeypatch.setattr("app.routes.bridge.get_tenant", fake_get_tenant)

    client = TestClient(app)
    response = client.post("/bridge/schedule/sync", headers={"x-tenant-id": "demo"})
    assert response.status_code == 200
    body = response.json()
    assert body["created"] == 1
    assert body["updated"] == 2
    assert body["sources"]["scr"] == 1
    assert body["conflicts"][0]["reason"] == "demo_conflict"


def test_bridge_stub_timeline(monkeypatch):
    async def fake_ensure(session, tenant_id):
        return None

    fake_row = SimpleNamespace(
        timeline_id=uuid.uuid4(),
        session_id=uuid.uuid4(),
        patient_id=None,
        staff_id=None,
        location_id=None,
        service_type="therapy.session",
        authorization_id=None,
        cpt_code="97110",
        modifiers=["GN"],
        scheduled_start=datetime.now(timezone.utc),
        scheduled_end=datetime.now(timezone.utc),
        worked_start=None,
        worked_end=None,
        duration_minutes=60,
        status="scheduled",
        payroll_entry_id=None,
        claim_id=None,
        transport_job_id=None,
        metadata_json={"source": "stub"},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    async def fake_seed(session, tenant_id):
        return fake_row

    monkeypatch.setattr("app.routes.bridge._ensure_bridge_enabled", fake_ensure)
    monkeypatch.setattr("app.routes.bridge.seed_stub_timeline", fake_seed)
    monkeypatch.setattr(settings, "environment", "local", raising=False)

    client = TestClient(app)
    response = client.post("/bridge/stubs/timeline", headers={"x-tenant-id": "demo"})
    assert response.status_code == 201
    body = response.json()
    assert body["metadata_json"]["source"] == "stub"
