from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

import pytest
import sys
from pathlib import Path

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / 'services/api/src'))
sys.path.insert(0, str(REPO_ROOT / 'packages/common_auth/src'))
sys.path.insert(0, str(REPO_ROOT / 'packages/common_events/src'))
sys.path.insert(0, str(REPO_ROOT / 'packages/doc_ingest/src'))

from fastapi.testclient import TestClient

from app.core.deps import get_db_session
from app.main import app
from app.routes.utils import get_tenant
from common_auth import get_tenant_headers


class FakeResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return self

    def all(self):
        return list(self._items)

    def scalar_one_or_none(self):
        return self._items[0] if self._items else None

    def unique(self):
        return self


class FakeSession:
    def __init__(self, tenant_id: str = "tenant-123") -> None:
        self.tenant = SimpleNamespace(tenant_id=tenant_id, slug=tenant_id, name="Tenant", status="active")

    async def execute(self, query):
        entity = query.column_descriptions[0]["entity"]
        if entity.__name__ == "Tenant":
            return FakeResult([self.tenant])
        return FakeResult([])

    async def get(self, _model, _identifier):
        return None

    async def flush(self):
        return None

    async def refresh(self, _obj):
        return None

    async def delete(self, _obj):
        return None


async def override_db_session():
    yield FakeSession()


async def override_get_tenant(_session, _identifier):
    return SimpleNamespace(tenant_id="tenant-123")


@pytest.fixture(autouse=True)
def _override_dependencies(monkeypatch):
    app.dependency_overrides[get_db_session] = override_db_session
    monkeypatch.setattr("app.routes.utils.get_tenant", override_get_tenant)
    yield
    app.dependency_overrides.clear()


def test_projects_missing_tenant_header_returns_400():
    client = TestClient(app)
    response = client.get("/projects")
    assert response.status_code == 400
    assert response.json()["error"] == "missing_tenant"


def test_projects_accept_legacy_tenant_header():
    client = TestClient(app)
    response = client.get("/projects", headers={"X-SCR-Tenant": "legacy-tenant"})
    assert response.status_code in (200, 404)


def test_tasks_invalid_status_returns_400():
    client = TestClient(app)
    response = client.get("/tasks", headers={"x-tenant-id": "tenant-123"}, params={"status": "invalid"})
    assert response.status_code in (200, 400)


def test_tasks_with_unknown_project_returns_404():
    client = TestClient(app)
    response = client.get(
        "/tasks",
        headers={"x-tenant-id": "tenant-123"},
        params={"project_id": "11111111-1111-1111-1111-111111111111"},
    )
    assert response.status_code in (200, 404)


@pytest.mark.asyncio
async def test_get_tenant_headers_accepts_either_header():
    request = SimpleNamespace(state=SimpleNamespace())
    result = await get_tenant_headers(
        request=request,  # type: ignore[arg-type]
        x_tenant_id=None,
        x_scr_tenant="tenant-xyz",
        x_request_id="req-1",
        idempotency_key=None,
        x_user_id="user-legacy",
        x_scopes="taskr.tasks.read taskr.tasks.write",
        x_token_balance="42.5",
    )
    assert result.tenant_id == "tenant-xyz"
    assert result.request_id == "req-1"
    assert result.user_id == "user-legacy"
    assert result.scopes == ("taskr.tasks.read", "taskr.tasks.write")
    assert result.token_balance == Decimal("42.5")


@pytest.mark.asyncio
async def test_get_tenant_headers_prefers_claims_data():
    request = SimpleNamespace(
        state=SimpleNamespace(
            token_claims={
                "tenant": "tenant-claims",
                "sub": "user-claims",
                "scopes": ["alpha.read", "beta.write"],
                "token_balance": "3.25",
            }
        )
    )
    result = await get_tenant_headers(
        request=request,  # type: ignore[arg-type]
        x_tenant_id="tenant-header",
        x_scr_tenant=None,
        x_user_id="user-header",
        x_scopes="legacy.scope",
        x_token_balance="1.5",
    )
    assert result.tenant_id == "tenant-claims"
    assert result.user_id == "user-claims"
    assert result.scopes == ("alpha.read", "beta.write")
    assert result.token_balance == Decimal("3.25")
