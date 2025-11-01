from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

TEST_TENANT_ID = uuid.uuid4()

from app.core.deps import get_db_session  # noqa: E402
from app.main import app  # noqa: E402


class DummySession:
    async def commit(self) -> None:
        return None

    async def close(self) -> None:
        return None


async def override_db_session():
    session = DummySession()
    try:
        yield session
    finally:
        await session.close()


async def override_get_tenant(_session, _identifier):
    return SimpleNamespace(tenant_id=TEST_TENANT_ID)


@pytest.fixture(autouse=True)
def _setup(monkeypatch):
    app.dependency_overrides[get_db_session] = override_db_session
    monkeypatch.setattr("app.routes.tenant_config.get_tenant", override_get_tenant)
    yield
    app.dependency_overrides.clear()


def test_get_notifications_config(monkeypatch):
    updated_at = datetime.now(timezone.utc)

    async def fake_fetch(_session, tenant_id, enabled_only=False):
        assert tenant_id == TEST_TENANT_ID
        return [
            SimpleNamespace(
                channel="slack",
                enabled=True,
                events=["meeting.note.created"],
                config={"webhook_url": "https://hooks.slack.com/services/AAA/BBB/CCC"},
                updated_at=updated_at,
            )
        ]

    monkeypatch.setattr("app.routes.tenant_config.fetch_notification_channels", fake_fetch)

    client = TestClient(app)
    headers = {"x-tenant-id": str(TEST_TENANT_ID)}
    response = client.get("/tenant/config/notifications", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["updated_at"] is not None
    channels = body["channels"]
    assert len(channels) == 1
    channel = channels[0]
    assert channel["channel"] == "slack"
    assert channel["events"] == ["meeting.note.created"]
    # webhook should be masked
    assert "…" in channel["config"]["webhook_url"]


def test_put_notifications_config(monkeypatch):
    captured = {}

    async def fake_replace(_session, tenant_id, inputs):
        captured["tenant_id"] = tenant_id
        captured["inputs"] = inputs
        now = datetime.now(timezone.utc)
        return [
            SimpleNamespace(
                channel=inputs[0].channel,
                enabled=inputs[0].enabled,
                events=list(inputs[0].events),
                config=dict(inputs[0].config),
                updated_at=now,
            )
        ]

    async def fake_fetch(_session, tenant_id, enabled_only=False):
        return []

    invalidate_called = {}

    def fake_invalidate(tenant_id):
        invalidate_called["tenant_id"] = tenant_id

    monkeypatch.setattr("app.routes.tenant_config.replace_notification_channels", fake_replace)
    monkeypatch.setattr("app.routes.tenant_config.fetch_notification_channels", fake_fetch)
    monkeypatch.setattr(
        "app.routes.tenant_config.notification_service.invalidate_cache",
        fake_invalidate,
    )

    client = TestClient(app)
    payload = {
        "channels": [
            {
                "channel": "slack",
                "enabled": True,
                "events": ["meeting.note.created"],
                "config": {"webhook_url": "https://hooks.slack.com/services/AAA/BBB/CCC"},
            }
        ]
    }
    headers = {"x-tenant-id": str(TEST_TENANT_ID)}
    response = client.put("/tenant/config/notifications", headers=headers, json=payload)
    assert response.status_code == 200
    assert captured["tenant_id"] == TEST_TENANT_ID
    assert captured["inputs"][0].channel == "slack"
    assert captured["inputs"][0].events == ["meeting.note.created"]
    assert invalidate_called["tenant_id"] == TEST_TENANT_ID
    body = response.json()
    assert body["channels"][0]["channel"] == "slack"
    assert "…" in body["channels"][0]["config"]["webhook_url"]
