from __future__ import annotations

import importlib
import logging
import sys
import types
from dataclasses import dataclass, field
from datetime import datetime
import uuid
from typing import Any
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = TESTS_DIR.parents[2]
API_SRC_PATH = (REPO_ROOT / "services" / "api" / "src").resolve()
COMMON_AUTH_PATH = (REPO_ROOT / "packages" / "common_auth" / "src").resolve()
COMMON_EVENTS_PATH = (REPO_ROOT / "packages" / "common_events" / "src").resolve()
DOC_INGEST_PATH = (REPO_ROOT / "packages" / "doc_ingest" / "src").resolve()
COMMON_BILLING_PATH = (REPO_ROOT / "packages" / "common_billing" / "src").resolve()
COMMON_AGENTS_PATH = (REPO_ROOT / "packages" / "common_agents" / "src").resolve()

if API_SRC_PATH.exists():
    sys.path.insert(0, str(API_SRC_PATH))
if COMMON_AUTH_PATH.exists():
    sys.path.insert(0, str(COMMON_AUTH_PATH))
try:
    import common_auth as _common_auth  # noqa: F401
except Exception:  # pragma: no cover - fall back to stub if import fails
    _common_auth = None
if COMMON_EVENTS_PATH.exists():
    sys.path.insert(0, str(COMMON_EVENTS_PATH))
if DOC_INGEST_PATH.exists():
    sys.path.insert(0, str(DOC_INGEST_PATH))
if COMMON_BILLING_PATH.exists():
    sys.path.insert(0, str(COMMON_BILLING_PATH))
if COMMON_AGENTS_PATH.exists():
    sys.path.insert(0, str(COMMON_AGENTS_PATH))
    try:
        import common_agents as _common_agents  # noqa: F401
    except Exception:  # pragma: no cover - optional dependency may be missing in tests
        pass

if "asyncpg" not in sys.modules:
    sys.modules["asyncpg"] = types.ModuleType("asyncpg")

try:
    from app.core.migrations import apply_migrations as _apply_sql_migrations
except Exception:  # pragma: no cover - defer when dependencies missing
    _apply_sql_migrations = None


def pytest_sessionstart(session):  # noqa: D401 - hook signature defined by pytest
    """Ensure SQL migrations run before the test suite interacts with Postgres."""

    if _apply_sql_migrations is None:
        logging.getLogger(__name__).debug("Migration helper unavailable; skipping auto-run.")
        return

    try:
        _apply_sql_migrations()
    except Exception as exc:  # pragma: no cover - defensive guard for flaky DBs
        logging.getLogger(__name__).warning("Failed to auto-apply migrations for tests: %s", exc)

if "nats" not in sys.modules:
    nats_module = types.ModuleType("nats")
    aio_module = types.ModuleType("nats.aio")
    client_module = types.ModuleType("nats.aio.client")

    class DummyNatsClient:
        def __init__(self, *_, **__):
            self.is_connected = False

        async def connect(self, *_, **__):
            self.is_connected = True

        async def drain(self):
            self.is_connected = False

    class DummyMsg:  # type: ignore[valid-type]
        def __init__(self, data: bytes | None = None):
            self.data = data or b""

    client_module.Client = DummyNatsClient  # type: ignore[attr-defined]
    client_module.Msg = DummyMsg  # type: ignore[attr-defined]

    aio_module.client = client_module  # type: ignore[attr-defined]

    msg_module = types.ModuleType("nats.aio.msg")
    msg_module.Msg = DummyMsg  # type: ignore[attr-defined]

    nats_module.aio = aio_module  # type: ignore[attr-defined]
    sys.modules["nats"] = nats_module
    sys.modules["nats.aio"] = aio_module
    sys.modules["nats.aio.client"] = client_module
    sys.modules["nats.aio.msg"] = msg_module

if "common_auth" not in sys.modules:
    common_auth_module = types.ModuleType("common_auth")

    @dataclass
    class TenantHeaders:  # type: ignore[valid-type]
        tenant_id: str
        user_id: str | None = None

    async def get_tenant_headers(x_tenant_id: str = "", x_user_id: str | None = None) -> TenantHeaders:
        if not x_tenant_id:
            raise ValueError("tenant header required")
        return TenantHeaders(tenant_id=x_tenant_id, user_id=x_user_id)

    def add_tenant_middleware(app):  # type: ignore[missing-return-annotation]
        return app

    common_auth_module.TenantHeaders = TenantHeaders  # type: ignore[attr-defined]
    common_auth_module.get_tenant_headers = get_tenant_headers  # type: ignore[attr-defined]
    common_auth_module.add_tenant_middleware = add_tenant_middleware  # type: ignore[attr-defined]
    sys.modules["common_auth"] = common_auth_module

if "doc_ingest" not in sys.modules:
    doc_ingest_module = types.ModuleType("doc_ingest")

    async def extract_text_async(**_kwargs):  # noqa: D401
        """Stub extractor used in tests."""

        return {"content": "", "metadata": {}}

    doc_ingest_module.DOCSTRANGE_AVAILABLE = False  # type: ignore[attr-defined]
    doc_ingest_module.extract_text_async = extract_text_async  # type: ignore[attr-defined]
    sys.modules["doc_ingest"] = doc_ingest_module

try:
    importlib.import_module("common_events")
except Exception:
    common_events_module = types.ModuleType("common_events")

    @dataclass
    class OutboxEvent:  # type: ignore[valid-type]
        event_id: str
        topic: str
        tenant_id: str
        payload: dict[str, Any]
        created_at: datetime | None = None
        published_at: datetime | None = None

    common_events_module.OutboxEvent = OutboxEvent  # type: ignore[attr-defined]
    sys.modules["common_events"] = common_events_module

try:
    importlib.import_module("common_billing")
except Exception:
    from sqlalchemy.dialects.postgresql import UUID as PG_UUID
    from sqlalchemy.orm import Mapped, mapped_column

    common_billing_module = types.ModuleType("common_billing")

    class BillingService:  # type: ignore[valid-type]
        def __init__(self, *_, **__):
            pass

        async def ensure_subscription(self, *_args, **_kwargs):
            return None

        async def is_feature_enabled(self, *_args, **_kwargs) -> bool:
            return True

        async def set_feature_override(self, *_args, **_kwargs):
            return None

        async def assign_plan(self, *_args, **_kwargs):
            return None

    class TenantSubscriptionMixin:  # type: ignore[valid-type]
        __abstract__ = True
        subscription_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    class TenantFeatureOverrideMixin:  # type: ignore[valid-type]
        __abstract__ = True
        override_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    common_billing_module.BillingService = BillingService  # type: ignore[attr-defined]
    common_billing_module.TenantSubscriptionMixin = TenantSubscriptionMixin  # type: ignore[attr-defined]
    common_billing_module.TenantFeatureOverrideMixin = TenantFeatureOverrideMixin  # type: ignore[attr-defined]
    sys.modules["common_billing"] = common_billing_module

if "toolfront_registry_client" not in sys.modules:
    toolfront_module = types.ModuleType("toolfront_registry_client")

    class ToolFrontError(Exception):
        pass

    class Registry:  # type: ignore[valid-type]
        def __init__(self, *_args, **_kwargs):
            pass

        def toolfront_base(self, *_args, **_kwargs):
            return None

    class ToolFrontClient:  # type: ignore[valid-type]
        def __init__(self, *_, **__):
            pass

        async def ask(self, *_, **__):
            return {"data": {"output": "stub"}}

    toolfront_module.ToolFrontError = ToolFrontError  # type: ignore[attr-defined]
    toolfront_module.Registry = Registry  # type: ignore[attr-defined]
    toolfront_module.ToolFrontClient = ToolFrontClient  # type: ignore[attr-defined]
    sys.modules["toolfront_registry_client"] = toolfront_module

if "common_agents" not in sys.modules:
    from enum import Enum

    common_agents_module = types.ModuleType("common_agents")

    class AssignmentEventType(str, Enum):  # type: ignore[valid-type]
        CREATED = "assignment.created"
        UPDATED = "assignment.updated"
        STATUS_CHANGED = "assignment.status_changed"
        AUDIT = "assignment.audit"
        PROMPT_APPENDED = "assignment.prompt_appended"
        OVERLAY_UPDATED = "assignment.overlay_updated"
        OBLIGATION_ADDED = "assignment.obligation_added"
        OBLIGATION_FULFILLED = "assignment.obligation_fulfilled"
        HEARTBEAT = "assignment.heartbeat"
        NODE_ATTACHED = "assignment.node_attached"
        NODE_DETACHED = "assignment.node_detached"
        CAPABILITIES_UPDATED = "assignment.capabilities_updated"
        MODEL_UPDATED = "assignment.model_updated"

    class AssignmentPriority(str, Enum):  # type: ignore[valid-type]
        NORMAL = "normal"
        HIGH = "high"

    class AssignmentStatus(str, Enum):  # type: ignore[valid-type]
        RESERVED = "reserved"
        ACTIVE = "active"

    @dataclass
    class AssignmentPayload:  # type: ignore[valid-type]
        assignment_id: str
        tenant_id: str
        agent_slug: str
        agent_version: str | None = None
        agent_id: str | None = None
        department_id: str | None = None
        status: str = "pending"
        priority: str = "normal"
        service_owner: str | None = None
        node_id: str | None = None
        overlay: dict[str, Any] | None = None
        capabilities: dict[str, Any] | None = None
        model: dict[str, Any] | None = None
        prompt_profile: dict[str, Any] | None = None
        policy: dict[str, Any] | None = None
        prompt_history: list[dict[str, Any]] = field(default_factory=list)
        polaris_obligations: list[dict[str, Any]] = field(default_factory=list)
        feature_flags: list[str] = field(default_factory=list)
        tags: list[str] = field(default_factory=list)
        metadata: dict[str, Any] = field(default_factory=dict)
        context: dict[str, Any] = field(default_factory=dict)
        expires_at: datetime | None = None
        created_at: datetime | None = None
        updated_at: datetime | None = None

    @dataclass
    class AssignmentEventPayload:  # type: ignore[valid-type]
        event_id: str
        assignment_id: str
        tenant_id: str
        event_type: AssignmentEventType
        occurred_at: datetime = field(default_factory=datetime.utcnow)
        source: str | None = None
        payload: dict[str, Any] = field(default_factory=dict)
        metadata: dict[str, Any] = field(default_factory=dict)

    common_agents_module.AssignmentEventType = AssignmentEventType  # type: ignore[attr-defined]
    common_agents_module.AssignmentPriority = AssignmentPriority  # type: ignore[attr-defined]
    common_agents_module.AssignmentStatus = AssignmentStatus  # type: ignore[attr-defined]
    common_agents_module.AssignmentPayload = AssignmentPayload  # type: ignore[attr-defined]
    common_agents_module.AssignmentEventPayload = AssignmentEventPayload  # type: ignore[attr-defined]
    sys.modules["common_agents"] = common_agents_module
