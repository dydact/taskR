from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import sys
import types
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
COMMON_AUTH_PATH = (REPO_ROOT / "packages" / "common_auth" / "src").resolve()
if COMMON_AUTH_PATH.exists() and str(COMMON_AUTH_PATH) not in sys.path:
    sys.path.insert(0, str(COMMON_AUTH_PATH))
COMMON_EVENTS_PATH = (REPO_ROOT / "packages" / "common_events" / "src").resolve()
if COMMON_EVENTS_PATH.exists() and str(COMMON_EVENTS_PATH) not in sys.path:
    sys.path.insert(0, str(COMMON_EVENTS_PATH))
COMMON_BILLING_PATH = (REPO_ROOT / "packages" / "common_billing" / "src").resolve()
if COMMON_BILLING_PATH.exists() and str(COMMON_BILLING_PATH) not in sys.path:
    sys.path.insert(0, str(COMMON_BILLING_PATH))
DOC_INGEST_PATH = (REPO_ROOT / "packages" / "doc_ingest" / "src").resolve()
if DOC_INGEST_PATH.exists() and str(DOC_INGEST_PATH) not in sys.path:
    sys.path.insert(0, str(DOC_INGEST_PATH))
COMMON_AGENTS_PATH = (REPO_ROOT / "packages" / "common_agents" / "src").resolve()
if COMMON_AGENTS_PATH.exists() and str(COMMON_AGENTS_PATH) not in sys.path:
    sys.path.insert(0, str(COMMON_AGENTS_PATH))

if "asyncpg" not in sys.modules:
    asyncpg_module = types.ModuleType("asyncpg")
    sys.modules["asyncpg"] = asyncpg_module

if "nats.aio.client" not in sys.modules:
    nats_module = types.ModuleType("nats")
    aio_module = types.ModuleType("nats.aio")
    client_module = types.ModuleType("nats.aio.client")

    class _StubNATSClient:
        async def connect(self, *args, **kwargs):  # pragma: no cover - stub
            return None

        async def drain(self):  # pragma: no cover - stub
            return None

        @property
        def is_connected(self) -> bool:  # pragma: no cover - stub
            return False

    client_module.Client = _StubNATSClient
    aio_module.client = client_module
    nats_module.aio = aio_module
    sys.modules["nats"] = nats_module
    sys.modules["nats.aio"] = aio_module
    sys.modules["nats.aio.client"] = client_module

from app.main import app
from app.routes import dedicated as dedicated_routes
from app.services import dedicated as dedicated_service
from app.services import dedicated_events
from app.models.core import Assignment, AssignmentEvent
from common_agents import AssignmentEventPayload, AssignmentEventType
from common_auth import get_tenant_headers


class DummySession:
    async def close(self) -> None:
        return None


async def _override_db_session():
    session = DummySession()
    try:
        yield session
    finally:
        await session.close()


def _assignment_stub(tenant_id: uuid.UUID, **overrides: Any):
    base = {
        "assignment_id": uuid.uuid4(),
        "tenant_id": tenant_id,
        "agent_slug": "xoxo.alpha",
        "agent_version": "2025.1",
        "status": "active",
        "priority": "normal",
        "service_owner": "taskr",
        "node_id": None,
        "overlay": {"overlay_id": "demo", "overlay_type": "persona", "label": "Demo"},
        "prompt_history": [],
        "polaris_obligations": [],
        "feature_flags": [],
        "tags": [],
        "metadata_json": {"source": "stub"},
        "context": {},
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def _event_stub(tenant_id: uuid.UUID, assignment_id: uuid.UUID, **overrides: Any):
    base = {
        "event_id": uuid.uuid4(),
        "tenant_id": tenant_id,
        "assignment_id": assignment_id,
        "event_type": "assignment.created",
        "source": "unit-test",
        "payload": {"status": "active"},
        "metadata_json": {},
        "occurred_at": datetime.now(timezone.utc),
        "created_at": datetime.now(timezone.utc),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.fixture
def tenant_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def dedicated_client(monkeypatch, tenant_id):
    overrides = app.dependency_overrides
    overrides.clear()
    overrides[dedicated_routes.get_db_session] = _override_db_session
    overrides[get_tenant_headers] = lambda: SimpleNamespace(tenant_id=str(tenant_id))
    overrides[dedicated_routes.FeatureGuard.dependency] = lambda: None

    async def fake_get_tenant(_session, _identifier):
        return SimpleNamespace(tenant_id=tenant_id)

    monkeypatch.setattr(dedicated_routes, "get_tenant", fake_get_tenant)

    client = TestClient(app)
    yield client

    overrides.clear()


def test_list_assignments_success(monkeypatch, dedicated_client, tenant_id):
    stub_assignment = _assignment_stub(tenant_id)
    captured_filters: dict[str, Any] = {}

    async def fake_list(session, tenant, filters):
        assert tenant == tenant_id
        captured_filters["statuses"] = filters.statuses
        return [stub_assignment]

    monkeypatch.setattr(dedicated_routes, "list_assignments", fake_list)

    response = dedicated_client.get("/dedicated/assignments", headers={"x-tenant-id": str(tenant_id)})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["agent_slug"] == "xoxo.alpha"
    assert captured_filters["statuses"] is None


def test_ingest_assignment_emits_event(monkeypatch, dedicated_client, tenant_id):
    stub_assignment = _assignment_stub(tenant_id)
    recorded: dict[str, Any] = {}

    async def fake_upsert(session, tenant, payload):
        assert tenant == tenant_id
        assert payload.assignment_id == str(stub_assignment.assignment_id)
        stub_assignment.feature_flags = list(payload.feature_flags)
        stub_assignment.tags = list(payload.tags)
        stub_assignment.metadata_json = dict(payload.metadata)
        return stub_assignment

    async def fake_emit(tenant, action, payload):
        recorded["tenant"] = tenant
        recorded["action"] = action
        recorded["payload"] = payload

    monkeypatch.setattr(dedicated_routes, "upsert_assignment", fake_upsert)
    monkeypatch.setattr(dedicated_routes, "emit_assignment_event", fake_emit)

    payload = {
        "assignment_id": str(stub_assignment.assignment_id),
        "tenant_id": str(tenant_id),
        "agent_slug": "xoxo.alpha",
        "agent_version": "2025.1",
        "status": "active",
        "priority": "normal",
        "service_owner": "taskr",
        "overlay": {
            "overlay_id": "ingest-demo",
            "overlay_type": "persona",
            "label": "Demo"
        },
        "feature_flags": ["dedicated"],
        "tags": ["stub"],
        "metadata": {"origin": "unit"},
        "context": {"ticket": "T-1"},
    }

    response = dedicated_client.post(
        "/dedicated/assignments",
        json=payload,
        headers={"x-tenant-id": str(tenant_id)},
    )
    assert response.status_code == 202, response.json()
    assert recorded["tenant"] == tenant_id
    assert recorded["action"] == "assignment_upserted"
    assert recorded["payload"]["agent_slug"] == "xoxo.alpha"
    assert recorded["payload"]["metadata"]["origin"] == "unit"
    assert recorded["payload"]["feature_flags"] == ["dedicated"]


def test_ingest_event_emits_update(monkeypatch, dedicated_client, tenant_id):
    stub_assignment = _assignment_stub(tenant_id)
    stub_event = _event_stub(tenant_id, stub_assignment.assignment_id)
    emitted: list[dict[str, Any]] = []

    async def fake_record(session, tenant, payload):
        assert tenant == tenant_id
        assert payload.assignment_id == str(stub_assignment.assignment_id)
        return stub_event

    async def fake_emit(tenant, action, payload):
        emitted.append({"tenant": tenant, "action": action, "payload": payload})

    monkeypatch.setattr(dedicated_routes, "record_assignment_event", fake_record)
    monkeypatch.setattr(dedicated_routes, "emit_assignment_event", fake_emit)
    async def fake_get_assignment(session, tenant, assignment_id):
        assert tenant == tenant_id
        assert assignment_id == stub_assignment.assignment_id
        return stub_assignment

    monkeypatch.setattr(dedicated_routes, "get_assignment", fake_get_assignment)

    payload = {
        "event_id": str(stub_event.event_id),
        "assignment_id": str(stub_assignment.assignment_id),
        "tenant_id": str(tenant_id),
        "event_type": "assignment.updated",
        "payload": {"status": "active"},
        "metadata": {},
        "occurred_at": datetime.now(timezone.utc).isoformat(),
    }

    response = dedicated_client.post(
        "/dedicated/events",
        json=payload,
        headers={"x-tenant-id": str(tenant_id)},
    )
    assert response.status_code == 202, response.json()
    assert len(emitted) == 2
    assert emitted[0]["tenant"] == tenant_id
    assert emitted[0]["action"] == "assignment_event"
    assert emitted[0]["payload"]["event_type"] == "assignment.created"
    assert emitted[1]["action"] == "assignment_upserted"
    assert emitted[1]["payload"]["assignment_id"] == str(stub_assignment.assignment_id)


def test_ingest_assignment_rejects_mismatched_tenant(monkeypatch, dedicated_client, tenant_id):
    mismatch = uuid.uuid4()
    called = False

    async def fake_upsert(session, tenant, payload):
        nonlocal called
        called = True
        return _assignment_stub(tenant_id)

    monkeypatch.setattr("app.routes.dedicated.upsert_assignment", fake_upsert)

    payload = {
        "assignment_id": str(uuid.uuid4()),
        "tenant_id": str(mismatch),
        "agent_slug": "xoxo.alpha",
        "status": "active",
        "priority": "normal",
        "feature_flags": [],
        "tags": [],
        "metadata": {},
        "context": {},
    }

    response = dedicated_client.post(
        "/dedicated/assignments",
        json=payload,
        headers={"x-tenant-id": str(tenant_id)},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "invalid_tenant_context"
    assert called is False


def test_ingest_event_rejects_mismatched_tenant(monkeypatch, dedicated_client, tenant_id):
    assignment_id = uuid.uuid4()
    mismatch = uuid.uuid4()
    called = False

    async def fake_record(session, tenant, payload):
        nonlocal called
        called = True
        return _event_stub(tenant_id, assignment_id)

    monkeypatch.setattr("app.routes.dedicated.record_assignment_event", fake_record)

    payload = {
        "event_id": str(uuid.uuid4()),
        "assignment_id": str(assignment_id),
        "tenant_id": str(mismatch),
        "event_type": "assignment.updated",
        "payload": {"status": "active"},
        "metadata": {},
        "occurred_at": datetime.now(timezone.utc).isoformat(),
    }

    response = dedicated_client.post(
        "/dedicated/events",
        json=payload,
        headers={"x-tenant-id": str(tenant_id)},
    )

    assert response.status_code == 400, response.json()
    assert response.json()["detail"] == "invalid_tenant_context"
    assert called is False


def test_get_assignment_detail(monkeypatch, dedicated_client, tenant_id):
    stub_assignment = _assignment_stub(tenant_id)

    async def fake_get(session, tenant, assignment_id):
        assert tenant == tenant_id
        assert assignment_id == stub_assignment.assignment_id
        return stub_assignment

    monkeypatch.setattr(dedicated_routes, "get_assignment", fake_get)

    response = dedicated_client.get(
        f"/dedicated/assignments/{stub_assignment.assignment_id}",
        headers={"x-tenant-id": str(tenant_id)},
    )
    assert response.status_code == 200
    assert response.json()["assignment_id"] == str(stub_assignment.assignment_id)


def test_list_assignment_events(monkeypatch, dedicated_client, tenant_id):
    assignment_id = uuid.uuid4()
    stub_event = _event_stub(tenant_id, assignment_id)

    async def fake_list_events(session, tenant, assignment, limit):
        assert tenant == tenant_id
        assert assignment == assignment_id
        assert limit == 100
        return [stub_event]

    monkeypatch.setattr(dedicated_routes, "list_assignment_events", fake_list_events)

    response = dedicated_client.get(
        f"/dedicated/assignments/{assignment_id}/events",
        headers={"x-tenant-id": str(tenant_id)},
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["event_type"] == "assignment.created"


def test_build_notification_events_status_alert(tenant_id):
    assignment_obj = SimpleNamespace(
        assignment_id=uuid.uuid4(),
        agent_slug="xoxo.alpha",
        node_id="exo-node-1",
        status="failed",
    )
    payload = AssignmentEventPayload(
        event_id=str(uuid.uuid4()),
        assignment_id=str(assignment_obj.assignment_id),
        tenant_id=str(tenant_id),
        event_type=AssignmentEventType.STATUS_CHANGED,
        payload={"status": "failed"},
        metadata={},
        occurred_at=datetime.now(timezone.utc),
    )

    events = dedicated_service._build_notification_events(tenant_id, assignment_obj, payload)
    assert len(events) == 1
    event = events[0]
    assert event.event_type == "dedicated.assignment.status_changed"
    assert event.payload["status"] == "failed"
    assert event.payload["cta_path"] == "/dedicated"


def test_build_notification_events_status_non_alert(tenant_id):
    assignment_obj = SimpleNamespace(
        assignment_id=uuid.uuid4(),
        agent_slug="xoxo.alpha",
        node_id="exo-node-1",
        status="active",
    )
    payload = AssignmentEventPayload(
        event_id=str(uuid.uuid4()),
        assignment_id=str(assignment_obj.assignment_id),
        tenant_id=str(tenant_id),
        event_type=AssignmentEventType.STATUS_CHANGED,
        payload={"status": "active"},
        metadata={},
        occurred_at=datetime.now(timezone.utc),
    )

    events = dedicated_service._build_notification_events(tenant_id, assignment_obj, payload)
    assert events == []


def test_build_notification_events_node_detached(tenant_id):
    assignment_obj = SimpleNamespace(
        assignment_id=uuid.uuid4(),
        agent_slug="xoxo.alpha",
        node_id="exo-node-1",
        status="active",
    )
    payload = AssignmentEventPayload(
        event_id=str(uuid.uuid4()),
        assignment_id=str(assignment_obj.assignment_id),
        tenant_id=str(tenant_id),
        event_type=AssignmentEventType.NODE_DETACHED,
        payload={"reason": "heartbeat_timeout", "node_id": "exo-node-1"},
        metadata={},
        occurred_at=datetime.now(timezone.utc),
    )

    events = dedicated_service._build_notification_events(tenant_id, assignment_obj, payload)
    assert len(events) == 1
    event = events[0]
    assert event.event_type == "dedicated.assignment.node_detached"
    assert event.payload["reason"] == "heartbeat_timeout"


@pytest.mark.asyncio
async def test_record_assignment_event_accepts_audit(monkeypatch, tenant_id):
    assignment_id = uuid.uuid4()
    occurred_at = datetime.now(timezone.utc)
    assignment_row = Assignment(
        assignment_id=assignment_id,
        tenant_id=tenant_id,
        agent_slug="xoxo.alpha",
        status="active",
        priority="normal",
        service_owner="taskr",
        node_id="exo-node-1",
    )
    assignment_row.prompt_history = []
    assignment_row.capabilities_json = {}
    assignment_row.model_json = {}
    assignment_row.overlay = {}
    assignment_row.feature_flags = []
    assignment_row.tags = []
    assignment_row.metadata_json = {}
    assignment_row.context = {}
    assignment_row.updated_at = datetime(2025, 1, 1, tzinfo=timezone.utc)

    class FakeSession:
        def __init__(self) -> None:
            self.added: list[AssignmentEvent] = []

        async def get(self, model, key, **kwargs):
            if model is Assignment:
                return assignment_row if key == assignment_id else None
            if model is AssignmentEvent:
                return None
            return None

        def add(self, obj):
            self.added.append(obj)

        async def flush(self):
            return None

        async def refresh(self, _obj):
            return None

    session = FakeSession()
    notifications: list[Any] = []

    async def fake_enqueue(event):
        notifications.append(event)

    monkeypatch.setattr(dedicated_service.notification_service, "enqueue", fake_enqueue)

    payload = AssignmentEventPayload(
        event_id=str(uuid.uuid4()),
        assignment_id=str(assignment_id),
        tenant_id=str(tenant_id),
        event_type=AssignmentEventType.AUDIT,
        occurred_at=occurred_at,
        source="flow.audit",
        payload={
            "status": "ok",
            "node_id": "exo-node-42",
            "agent_id": str(uuid.uuid4()),
            "checks": {"exo": "matched"},
            "summary": "Audit completed successfully.",
        },
        metadata={
            "plan_id": "plan-123",
            "audit_run_id": str(uuid.uuid4()),
            "source_event": "flow.reservation.audit",
        },
    )

    event = await dedicated_service.record_assignment_event(session, tenant_id, payload)

    assert event.event_type == AssignmentEventType.AUDIT.value
    assert event.payload["status"] == "ok"
    assert session.added and session.added[0] is event
    assert notifications == []
    assert assignment_row.status == "active"
    assert assignment_row.prompt_history == []
    assert assignment_row.updated_at == occurred_at


def test_stub_assignment_requires_local_env(monkeypatch, dedicated_client, tenant_id):
    stub_assignment = _assignment_stub(tenant_id)

    async def fake_upsert(_session, _tenant, _payload):
        return stub_assignment

    monkeypatch.setattr(dedicated_routes, "upsert_assignment", fake_upsert)

    response = dedicated_client.post("/dedicated/stubs/assignment", headers={"x-tenant-id": str(tenant_id)})
    assert response.status_code == 201
    assert response.json()["agent_slug"] == "xoxo.alpha"


def test_feature_guard_denied(monkeypatch, tenant_id):
    overrides = app.dependency_overrides
    overrides.clear()
    overrides[dedicated_routes.get_db_session] = _override_db_session
    overrides[get_tenant_headers] = lambda: SimpleNamespace(tenant_id=str(tenant_id))

    def deny():
        raise HTTPException(status_code=403, detail="denied")

    overrides[dedicated_routes.FeatureGuard.dependency] = deny

    async def fake_get_tenant(_session, _identifier):
        return SimpleNamespace(tenant_id=tenant_id)

    monkeypatch.setattr(dedicated_routes, "get_tenant", fake_get_tenant)

    client = TestClient(app)
    response = client.get("/dedicated/assignments", headers={"x-tenant-id": str(tenant_id)})
    assert response.status_code == 403
    overrides.clear()
