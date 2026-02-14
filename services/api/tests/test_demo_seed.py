from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.deps import get_db_session
from app.main import app


class DummySession:
    async def close(self) -> None:
        return None


async def override_session():
    session = DummySession()
    try:
        yield session
    finally:
        await session.close()


async def fake_get_tenant(_session, identifier):
    return SimpleNamespace(tenant_id=uuid.uuid4(), slug=identifier)


@pytest.fixture(autouse=True)
def _setup(monkeypatch):
    original_env = settings.environment
    settings.environment = "local"
    app.dependency_overrides[get_db_session] = override_session
    monkeypatch.setattr("app.routes.admin.get_tenant", fake_get_tenant)
    yield
    app.dependency_overrides.clear()
    settings.environment = original_env


def test_demo_seed_endpoint(monkeypatch):
    async def fake_populate(_session, tenant_slug, options):
        assert tenant_slug == "demo"
        assert options.spaces == 2
        return SimpleNamespace(
            tenant_id=uuid.uuid4(),
            spaces=2,
            lists=4,
            tasks=10,
            comments=20,
            docs=3,
            employees=6,
            operators=2,
            clients=5,
            schedule_entries=1,
        )

    monkeypatch.setattr("app.routes.admin.populate_demo", fake_populate)

    client = TestClient(app)
    response = client.post(
        "/admin/demo/populate",
        json={"spaces": 2},
        headers={"x-tenant-id": "demo"},
    )
    assert response.status_code == 202
    body = response.json()
    assert body["spaces"] == 2
    assert body["lists"] == 4
