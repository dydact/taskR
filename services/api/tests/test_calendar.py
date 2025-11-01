from __future__ import annotations

import sys
import types
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

if "pydantic_settings" not in sys.modules:
    stub = types.ModuleType("pydantic_settings")

    class _BaseSettings:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

    class _SettingsConfigDict(dict):
        pass

    stub.BaseSettings = _BaseSettings
    stub.SettingsConfigDict = _SettingsConfigDict
    sys.modules["pydantic_settings"] = stub

if "asyncpg" not in sys.modules:
    sys.modules["asyncpg"] = types.ModuleType("asyncpg")

if "common_auth" not in sys.modules:
    mod = types.ModuleType("common_auth")

    class TenantHeaders:
        def __init__(self, tenant_id: str, user_id: uuid.UUID | None = None):
            self.tenant_id = tenant_id
            self.user_id = user_id or uuid.uuid4()

    async def get_tenant_headers(*_args, **_kwargs):  # pragma: no cover - stub
        raise RuntimeError("get_tenant_headers stub should not be called in tests")

    mod.TenantHeaders = TenantHeaders
    mod.get_tenant_headers = get_tenant_headers
    sys.modules["common_auth"] = mod

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/api/src"))

from app.models.core import CalendarEvent, CalendarSlot
from app.schemas import FreeBusyRequest
from app.routes.calendar import calculate_freebusy


class FakeSession:
    def __init__(self, events, slots):
        self._events = events
        self._slots = slots

    async def execute(self, statement):
        entity = statement.column_descriptions[0]["entity"]
        if entity is CalendarEvent:
            return FakeResult(self._events)
        if entity is CalendarSlot:
            return FakeResult(self._slots)
        return FakeResult([])

    async def get(self, *_args, **_kwargs):
        return None


class FakeResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return self

    def all(self):
        return self._items


class FakeHeaders:
    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id


class FakeTenant:
    def __init__(self, tenant_id: uuid.UUID):
        self.tenant_id = tenant_id


async def fake_get_tenant(_session, identifier):
    return FakeTenant(uuid.UUID(identifier))


@pytest.mark.asyncio
async def test_calculate_freebusy_returns_busy_windows(monkeypatch):
    tenant_id = uuid.uuid4()
    start = datetime.now(UTC)
    event = CalendarEvent(
        tenant_id=tenant_id,
        source_id=uuid.uuid4(),
        title="Daily standup",
        start_at=start,
        end_at=start + timedelta(minutes=30),
    )
    slot = CalendarSlot(
        tenant_id=tenant_id,
        owner_id=uuid.uuid4(),
        start_at=start + timedelta(hours=1),
        end_at=start + timedelta(hours=2),
        status="busy",
    )
    session = FakeSession([event], [slot])

    monkeypatch.setattr("app.routes.calendar.get_tenant", fake_get_tenant)

    payload = FreeBusyRequest(
        owner_ids=[slot.owner_id],
        start_at=start - timedelta(minutes=15),
        end_at=start + timedelta(hours=3),
    )
    headers = FakeHeaders(str(tenant_id))

    windows = await calculate_freebusy(payload, session, headers)
    assert len(windows) == 2
    assert any(window.status == "busy" for window in windows)
