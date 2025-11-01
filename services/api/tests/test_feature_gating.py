from __future__ import annotations

import sys
import uuid
from pathlib import Path

import pytest
from fastapi import Depends, FastAPI
from httpx import AsyncClient

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/api/src"))
sys.path.insert(0, str(REPO_ROOT / "packages/common_auth/src"))
sys.path.insert(0, str(REPO_ROOT / "packages/common_billing/src"))

from app.core.deps import get_db_session
from app.services.billing import get_billing_service, require_feature
from common_auth import TenantHeaders, get_tenant_headers


class StubBillingService:
    def __init__(self):
        self.plan_slug = "growth"
        self.feature_sets = {
            "starter": {"tasks.core", "meetings.core"},
            "growth": {"tasks.core", "meetings.core", "flows.core"},
        }

    async def is_feature_enabled(self, _session, _tenant_id, feature_code: str, *, application: str):
        features = self.feature_sets.get(self.plan_slug, set())
        return feature_code in features


@pytest.mark.asyncio
async def test_require_feature_blocks_when_plan_missing_feature():
    tenant_id = uuid.uuid4()
    billing = StubBillingService()

    async def session_dependency():
        yield object()

    def billing_dependency():
        return billing

    def tenant_headers_dependency():
        return TenantHeaders(tenant_id=str(tenant_id))

    app = FastAPI()

    @app.get("/gated", dependencies=[Depends(require_feature("flows.core"))])
    async def gated_endpoint():
        return {"ok": True}

    app.dependency_overrides[get_db_session] = session_dependency
    app.dependency_overrides[get_billing_service] = billing_dependency
    app.dependency_overrides[get_tenant_headers] = tenant_headers_dependency

    async with AsyncClient(app=app, base_url="http://test") as client:
        billing.plan_slug = "growth"
        allowed = await client.get("/gated")
        assert allowed.status_code == 200

        billing.plan_slug = "starter"
        blocked = await client.get("/gated")
        assert blocked.status_code == 403

    app.dependency_overrides.clear()
