from __future__ import annotations

import uuid
from types import SimpleNamespace
from datetime import datetime, timezone
import sys
import types
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/api/src"))
sys.path.insert(0, str(REPO_ROOT / "packages/common_auth/src"))

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

if "nats" not in sys.modules:
    nats_stub = types.ModuleType("nats")
    aio_stub = types.ModuleType("nats.aio")
    client_stub = types.ModuleType("nats.aio.client")

    class DummyNATS:
        def __init__(self, *_, **__):
            self.is_connected = False

        async def connect(self, *_, **__):
            self.is_connected = True

        async def drain(self):
            self.is_connected = False

    client_stub.Client = DummyNATS
    aio_stub.client = client_stub
    nats_stub.aio = aio_stub
    sys.modules["nats"] = nats_stub
    sys.modules["nats.aio"] = aio_stub
    sys.modules["nats.aio.client"] = client_stub

from app.core.deps import get_db_session
from app.main import app
from app.routes.utils import get_tenant
from app.models.core import UserPreference


class FakeResult:
    def __init__(self, items):
        self._items = list(items)

    def scalars(self):
        return self

    def all(self):
        return list(self._items)

    def scalar_one_or_none(self):
        return self._items[0] if self._items else None


class FakeSession:
    def __init__(self, tenant_id: uuid.UUID, user_id: str):
        self.preferences: list[UserPreference] = []
        self.tenant_id = tenant_id
        self.user_id = user_id

    async def execute(self, query):
        entity = query.column_descriptions[0]["entity"]
        if entity.__name__ != "UserPreference":
            return FakeResult([])

        results = [
            pref
            for pref in self.preferences
            if pref.tenant_id == self.tenant_id and pref.user_id == self.user_id
        ]

        if query._where_criteria:
            for criterion in query._where_criteria:
                key = getattr(criterion.left, "key", getattr(criterion.left, "name", None))
                value = getattr(criterion.right, "value", getattr(criterion.right, "literal_execute", None))
                if key == "key":
                    results = [pref for pref in results if pref.key == value]

        return FakeResult(results)

    def add(self, preference):
        preference.created_at = datetime.now(timezone.utc)
        preference.updated_at = preference.created_at
        self.preferences.append(preference)

    async def flush(self):
        return None

    async def refresh(self, _obj):
        return None


TENANT_UUID = uuid.uuid4()
TEST_USER_ID = "user-abc"
SESSION = FakeSession(TENANT_UUID, TEST_USER_ID)


async def override_db_session():
    yield SESSION


async def override_get_tenant(_session, _identifier):
    return SimpleNamespace(tenant_id=TENANT_UUID)


@pytest.fixture(autouse=True)
def _override_dependencies(monkeypatch):
    app.dependency_overrides[get_db_session] = override_db_session
    monkeypatch.setattr("app.routes.user_preferences.get_tenant", override_get_tenant)
    yield
    app.dependency_overrides.clear()


def test_user_preferences_round_trip():
    client = TestClient(app)
    headers = {"x-tenant-id": str(TENANT_UUID), "x-user-id": TEST_USER_ID}

    response = client.get("/user-preferences", headers=headers)
    assert response.status_code == 200
    assert response.json() == []

    payload = {"value": ["status", "priority"]}
    response = client.put("/user-preferences/list_columns", headers=headers, json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["key"] == "list_columns"
    assert body["value"] == payload["value"]

    response = client.get("/user-preferences/list_columns", headers=headers)
    assert response.status_code == 200
    assert response.json()["value"] == payload["value"]

    response = client.get("/user-preferences", headers=headers)
    assert response.status_code == 200
    prefs = response.json()
    assert len(prefs) == 1
    assert prefs[0]["value"] == payload["value"]


def test_user_preferences_missing_user_header():
    client = TestClient(app)
    response = client.get("/user-preferences", headers={"x-tenant-id": str(TENANT_UUID)})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing user identifier"
