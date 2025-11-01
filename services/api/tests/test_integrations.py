from __future__ import annotations

import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/api/src"))
sys.path.insert(0, str(REPO_ROOT / "packages/common_auth/src"))
sys.path.insert(0, str(REPO_ROOT / "packages/common_events/src"))

from app.core.config import settings
from app.core.deps import get_db_session
from app.events.bus import event_bus
from app.models.core import ScrAlert, Tenant
from app.routes.integrations import router as integrations_router
from app.routes.utils import get_tenant


class FakeSession:
    def __init__(self, alert: ScrAlert | None, tenant: Tenant):
        self.alert = alert
        self.tenant = tenant

    async def execute(self, query):
        entity = query.column_descriptions[0]["entity"]
        if entity is Tenant:
            class Result:
                def __init__(self, tenant):
                    self._tenant = tenant

                def scalar_one_or_none(self):
                    return self._tenant

            return Result(self.tenant)
        if entity is ScrAlert:
            class Result:
                def __init__(self, alert):
                    self._alert = alert

                def scalar_one_or_none(self):
                    return self._alert

                def scalars(self):
                    class Scalars:
                        def __init__(self, alert):
                            self._alert = alert

                        def all(self):
                            return [self._alert] if self._alert else []

                    return Scalars(self._alert)

            return Result(self.alert)
        raise NotImplementedError

    async def get(self, model_cls, identifier, **kwargs):
        if model_cls is ScrAlert:
            if self.alert and self.alert.alert_id == identifier:
                return self.alert
            return None
        if model_cls is Tenant and identifier == self.tenant.tenant_id:
            return self.tenant
        return None

    async def flush(self):
        return None

    async def refresh(self, obj, attribute_names=None):
        return None

    def add(self, obj):
        self.alert = obj


@pytest.mark.asyncio
async def test_ingest_scr_alert_creates_event_and_record(monkeypatch):
    tenant = Tenant(tenant_id=uuid.uuid4(), slug="acme", name="Acme", status="active")
    session = FakeSession(alert=None, tenant=tenant)
    alert_id = uuid.uuid4()

    app = FastAPI()
    app.include_router(integrations_router)
    app.dependency_overrides[get_db_session] = lambda: session
    app.dependency_overrides[get_tenant] = lambda _session, identifier: tenant

    object.__setattr__(settings, "scr_alert_token", "secret-token")

    payload = {
        "alert_id": str(alert_id),
        "tenant_id": str(tenant.tenant_id),
        "taskr_task_id": None,
        "severity": "warning",
        "kind": "compliance",
        "message": "Check session",
        "source": "scrAIv",
        "metadata": {"session_id": "sess"},
    }

    async with event_bus.subscribe() as queue:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                "/integrations/scr-alerts",
                json=payload,
                headers={"Authorization": "Bearer secret-token"},
            )
        event = await queue.get()

    assert response.status_code == 202
    assert event["type"] == "scr.alert.created"
    assert str(event["payload"]["alert_id"]) == str(alert_id)


@pytest.mark.asyncio
async def test_acknowledge_alert(monkeypatch):
    tenant = Tenant(tenant_id=uuid.uuid4(), slug="acme", name="Acme", status="active")
    alert = ScrAlert(
        alert_id=uuid.uuid4(),
        tenant_id=tenant.tenant_id,
        taskr_task_id=None,
        severity="warning",
        kind="compliance",
        message="Check session",
        source="scrAIv",
        metadata_json={},
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session = FakeSession(alert=alert, tenant=tenant)

    app = FastAPI()
    app.include_router(integrations_router)
    app.dependency_overrides[get_db_session] = lambda: session
    app.dependency_overrides[get_tenant] = lambda _session, identifier: tenant

    object.__setattr__(settings, "scr_alert_token", None)

    async with event_bus.subscribe() as queue:
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                f"/integrations/alerts/scr/{alert.alert_id}/ack",
                json={"notes": "ack"},
                headers={"x-tenant-id": str(tenant.tenant_id)},
            )
        event = await queue.get()

    assert response.status_code == 200
    assert event["type"] == "scr.alert.acknowledged"
    assert str(event["payload"]["alert_id"]) == str(alert.alert_id)
