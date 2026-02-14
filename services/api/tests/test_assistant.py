from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
import app.routes.assistant as assistant_module
from app.routes.assistant import AssistantPersistenceResult
from app.services.memory import MemorySearchResult

TEST_TENANT_ID = uuid.uuid4()
SESSION_ID = uuid.uuid4()
MESSAGE_ID = uuid.uuid4()


class DummySession:
    pass


async def _override_db_session():
    session = DummySession()
    try:
        yield session
    finally:
        pass


async def _override_get_tenant(_db, tenant_id):
    assert uuid.UUID(str(tenant_id)) == TEST_TENANT_ID
    return SimpleNamespace(tenant_id=TEST_TENANT_ID)


@pytest.fixture(autouse=True)
def _setup(monkeypatch):
    app.dependency_overrides.clear()
    from app.core.deps import get_db_session
    from app.routes.utils import get_tenant
    from common_auth import TenantHeaders, get_tenant_headers

    app.dependency_overrides[get_db_session] = _override_db_session
    monkeypatch.setattr("app.routes.utils.get_tenant", _override_get_tenant)
    monkeypatch.setattr(assistant_module, "get_tenant", _override_get_tenant)
    async def _fake_headers(x_tenant_id: str = str(TEST_TENANT_ID), x_user_id: str | None = None) -> TenantHeaders:
        return TenantHeaders(tenant_id=x_tenant_id, user_id=x_user_id)

    app.dependency_overrides[get_tenant_headers] = _fake_headers
    yield
    app.dependency_overrides.clear()


def _mock_dependencies(monkeypatch, *, rate_ok: bool = True):
    async def fake_search(*_args, **_kwargs):
        return [
            MemorySearchResult(
                resource_type="task",
                resource_id=uuid.uuid4(),
                title="Weekly sync",
                content="Completed backlog grooming and assigned follow-ups.",
                snippet="Completed backlog grooming and assigned follow-ups.",
                metadata={},
            )
        ]

    async def fake_query(*_args, **_kwargs):
        return "All follow-ups are on track."

    async def fake_persist(*_args, **_kwargs):
        return AssistantPersistenceResult(session_id=SESSION_ID, answer_message_id=MESSAGE_ID)

    async def fake_publish(event):
        fake_publish.called = event  # type: ignore[attr-defined]

    async def fake_rate_limit(_tenant_id):
        return rate_ok

    monkeypatch.setattr(assistant_module.memory_search_client, "search", fake_search)
    monkeypatch.setattr(assistant_module, "query_assistant", fake_query)
    monkeypatch.setattr(assistant_module, "_persist_interaction", fake_persist)
    monkeypatch.setattr(assistant_module.event_bus, "publish", fake_publish)
    monkeypatch.setattr(assistant_module._RATE_LIMITER, "check", fake_rate_limit)


def test_assistant_query_success(monkeypatch):
    _mock_dependencies(monkeypatch)
    client = TestClient(app)
    response = client.post(
        "/assistant/query",
        json={"question": "What happened this week?", "mode": "summary"},
        headers={"x-tenant-id": str(TEST_TENANT_ID), "x-user-id": "analyst@example.com"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == "All follow-ups are on track."
    assert body["session_id"] == str(SESSION_ID)
    assert body["message_id"] == str(MESSAGE_ID)
    assert body["sources"]
    assert getattr(assistant_module.event_bus.publish, "called", None)["type"] == "assistant.reply"  # type: ignore[attr-defined]


def test_assistant_query_rate_limited(monkeypatch):
    _mock_dependencies(monkeypatch, rate_ok=False)
    client = TestClient(app)
    response = client.post(
        "/assistant/query",
        json={"question": "What happened this week?", "mode": "summary"},
        headers={"x-tenant-id": str(TEST_TENANT_ID)},
    )
    assert response.status_code == 429


def test_assistant_query_requires_question(monkeypatch):
    _mock_dependencies(monkeypatch)
    client = TestClient(app)
    response = client.post(
        "/assistant/query",
        json={"question": "   "},
        headers={"x-tenant-id": str(TEST_TENANT_ID)},
    )
    assert response.status_code == 400
