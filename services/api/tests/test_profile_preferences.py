from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_db_session
from app.main import app
from app.schemas import PreferencesState


class DummySession:
    async def close(self) -> None:
        return None

    async def flush(self) -> None:
        return None


async def override_db_session():
    session = DummySession()
    try:
        yield session
    finally:
        await session.close()


TENANT_ID = uuid.uuid4()


@pytest.fixture(autouse=True)
def _setup(monkeypatch):
    app.dependency_overrides[get_db_session] = override_db_session
    async def fake_get_tenant(session, tenant_identifier):
        return SimpleNamespace(tenant_id=TENANT_ID, slug="demo")

    monkeypatch.setattr("app.routes.profile.get_tenant", fake_get_tenant)
    monkeypatch.setattr("app.routes.preferences.get_tenant", fake_get_tenant)
    yield
    app.dependency_overrides.clear()


def test_profile_endpoint(monkeypatch):
    profile_user = SimpleNamespace(
        user_id=uuid.uuid4(),
        email="demo@example.com",
        given_name="Demo",
        family_name="User",
        roles=["operator"],
        identity_metadata={"avatar_url": "https://example.com/avatar.png"},
    )

    async def fake_resolve(session, tenant, identifier):
        return profile_user

    monkeypatch.setattr("app.routes.profile._resolve_profile_user", fake_resolve)

    client = TestClient(app)
    response = client.get("/profile", headers={"x-tenant-id": "demo"})
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "demo@example.com"
    assert body["full_name"] == "Demo User"
    assert body["roles"] == ["operator"]


def test_preferences_get(monkeypatch):
    async def fake_load(session, tenant_id, user_key):
        return PreferencesState(
            theme="light",
            view_density="compact",
            favorites=["space-1"],
            last_view="board",
            right_panel_open=True,
            ai_persona="detailed",
            list_view_columns={"status": True},
        )

    monkeypatch.setattr("app.routes.preferences._load_preferences_state", fake_load)

    client = TestClient(app)
    response = client.get("/preferences", headers={"x-tenant-id": "demo", "x-user-id": "demo-user"})
    assert response.status_code == 200
    data = response.json()
    assert data["theme"] == "light"
    assert data["favorites"] == ["space-1"]
    assert data["right_panel_open"] is True


def test_preferences_patch(monkeypatch):
    captured: list[tuple[str, str, object]] = []

    async def fake_upsert(session, tenant_id, user_key, key, value):
        captured.append((user_key, key, value))

    async def fake_load(session, tenant_id, user_key):
        return PreferencesState(
            theme="dark",
            view_density="comfortable",
            favorites=["space-a"],
            last_view="list",
            right_panel_open=False,
            ai_persona="balanced",
            list_view_columns={"priority": True},
        )

    monkeypatch.setattr("app.routes.preferences._upsert_preference_entry", fake_upsert)
    monkeypatch.setattr("app.routes.preferences._load_preferences_state", fake_load)

    client = TestClient(app)
    payload = {"favorites": ["space-a", "space-b"], "right_panel_open": True}
    response = client.patch(
        "/preferences",
        json=payload,
        headers={"x-tenant-id": "demo", "x-user-id": "demo-user"},
    )
    assert response.status_code == 200
    assert captured
    keys = {entry[1] for entry in captured}
    assert "favorites" in keys
    assert "right_panel_open" in keys
