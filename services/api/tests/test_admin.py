from __future__ import annotations

import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import AsyncClient

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/api/src"))
sys.path.insert(0, str(REPO_ROOT / "packages/common_auth/src"))
sys.path.insert(0, str(REPO_ROOT / "packages/common_events/src"))
sys.path.insert(0, str(REPO_ROOT / "packages/doc_ingest/src"))
sys.path.insert(0, str(REPO_ROOT / "packages/common_billing/src"))
sys.path.insert(0, str((REPO_ROOT / "..").resolve() / "toolfront_registry_client"))

from app.events.bus import event_bus
from app.routes import admin as admin_routes
from app.models.billing import TenantFeatureOverride, TenantSubscription
from app.models.core import PreferenceModel, PreferenceRollout, PreferenceVariant, Tenant, UsageStat
from app.routes.utils import get_tenant
from app.schemas import FeatureOverrideRead, PreferenceRolloutRead, SubscriptionRead
from app.core.deps import get_db_session
from app.metrics import guardrail_status_gauge
from app.services.billing import get_billing_service
from common_billing.service import FeatureSnapshot


class FakeSession:
    def __init__(self, rollout, model, variant):
        self.rollout = rollout
        self.model = model
        self.variant = variant

    async def get(self, model_cls, identifier):
        if model_cls is PreferenceRollout and identifier == self.rollout.rollout_id:
            return self.rollout
        if model_cls is PreferenceModel and identifier == self.model.model_id:
            return self.model
        if model_cls is PreferenceVariant and identifier == self.variant.variant_id:
            return self.variant
        return None

    async def flush(self):
        return None

    async def refresh(self, _obj):
        return None

    async def execute(self, _query):
        class Result:
            def __init__(self, tenant_id):
                self._tenant_id = tenant_id

            def scalar_one_or_none(self):
                return type("TenantStub", (), {"tenant_id": self._tenant_id})()

        return Result(self.rollout.tenant_id)


class FakeBillingService:
    def __init__(self, tenant_id: uuid.UUID):
        self.subscription = TenantSubscription(tenant_id=tenant_id, plan_slug="growth", status="active")
        now = datetime.now(UTC)
        self.subscription.active_since = now
        self.subscription.updated_at = now
        self.subscription.created_at = now
        self.subscription.metadata_json = {}
        self._overrides: dict[tuple[str, str], TenantFeatureOverride] = {}
        self._features_by_plan: dict[str, set[str]] = {
            "starter": {"tasks.core", "meetings.core"},
            "growth": {"tasks.core", "meetings.core", "flows.core", "billing.export"},
        }

    async def ensure_subscription(self, _session, _tenant_id: uuid.UUID):
        return self.subscription

    async def get_subscription(self, _session, _tenant_id: uuid.UUID):
        return self.subscription

    async def get_effective_features(self, _session, _tenant_id: uuid.UUID, *, application: str):
        base = set(self._features_by_plan.get(self.subscription.plan_slug, set()))
        for (override_app, _feature), override in self._overrides.items():
            if override_app != application:
                continue
            if override.enabled:
                base.add(override.feature_code)
            else:
                base.discard(override.feature_code)
        return FeatureSnapshot(plan_slug=self.subscription.plan_slug, application=application, features=base)

    async def is_feature_enabled(
        self,
        session,
        tenant_id: uuid.UUID,
        feature_code: str,
        *,
        application: str,
    ) -> bool:
        snapshot = await self.get_effective_features(session, tenant_id, application=application)
        return feature_code in snapshot.features

    async def assign_plan(
        self,
        _session,
        _tenant_id: uuid.UUID,
        *,
        plan_slug: str,
        status: str | None = None,
        active_until: datetime | None = None,
        metadata: dict | None = None,
    ):
        self.subscription.plan_slug = plan_slug
        if status is not None:
            self.subscription.status = status
        self.subscription.active_since = datetime.now(UTC)
        self.subscription.active_until = active_until
        if metadata is not None:
            self.subscription.metadata_json = dict(metadata)
        return self.subscription

    async def list_overrides(self, _session, _tenant_id: uuid.UUID, *, application: str):
        return [
            override
            for (override_app, _), override in self._overrides.items()
            if override_app == application
        ]

    async def set_feature_override(
        self,
        _session,
        tenant_id: uuid.UUID,
        feature_code: str,
        *,
        application: str,
        enabled: bool,
        expires_at: datetime | None = None,
        metadata: dict | None = None,
    ):
        key = (application, feature_code)
        override = self._overrides.get(key)
        if override is None:
            override = TenantFeatureOverride(
                tenant_id=tenant_id,
                application=application,
                feature_code=feature_code,
                enabled=enabled,
            )
            self._overrides[key] = override
        override.enabled = enabled
        override.expires_at = expires_at
        override.metadata_json = dict(metadata or {})
        return override

    async def clear_feature_override(
        self,
        _session,
        _tenant_id: uuid.UUID,
        feature_code: str,
        *,
        application: str,
    ):
        key = (application, feature_code)
        self._overrides.pop(key, None)


class UsageStubSession:
    def __init__(self, tenant: Tenant, stats: list[UsageStat]):
        self._tenant = tenant
        self._stats = stats

    async def execute(self, query):
        entity = query.column_descriptions[0]["entity"]
        if entity is UsageStat:
            class Result:
                def __init__(self_inner, stats):
                    self_inner._stats = stats

                def scalars(self_inner):
                    class ScalarResult:
                        def __init__(self_deep, stats):
                            self_deep._stats = stats

                        def all(self_deep):
                            return self_deep._stats

                    return ScalarResult(self_inner._stats)

            return Result(self._stats)

        class TenantResult:
            def __init__(self_inner, tenant):
                self_inner._tenant = tenant

            def scalar_one_or_none(self_inner):
                return self_inner._tenant

        return TenantResult(self._tenant)

    async def flush(self):
        return None

    async def refresh(self, _obj):
        return None


async def override_db_session():
    yield override_db_session.session


async def override_get_tenant(_session, tenant_id):
    return type("Tenant", (), {"tenant_id": tenant_id})()


@pytest.mark.asyncio
async def test_guardrail_drill_endpoint_updates_rollout_and_metrics():
    tenant_id = uuid.uuid4()
    model = PreferenceModel(
        tenant_id=tenant_id,
        slug="router",
        name="Router",
        base_type="reranker",
        status="active",
    )
    model.model_id = uuid.uuid4()
    variant = PreferenceVariant(
        tenant_id=tenant_id,
        model=model,
        key="beta",
        name="Beta",
        status="active",
    )
    variant.variant_id = uuid.uuid4()
    variant.model_id = model.model_id
    rollout = PreferenceRollout(
        tenant_id=tenant_id,
        model=model,
        model_id=model.model_id,
        variant_id=variant.variant_id,
        stage="monitor",
        target_rate=0.5,
        current_rate=0.4,
        safety_status="healthy",
        guardrail_metrics={},
        metadata_json={},
    )
    rollout.rollout_id = uuid.uuid4()
    now = datetime.now(UTC)
    rollout.created_at = now
    rollout.updated_at = now
    variant.rollouts = [rollout]
    model.rollouts = [rollout]

    fake_session = FakeSession(rollout, model, variant)
    override_db_session.session = fake_session

    test_app = FastAPI()
    test_app.include_router(admin_routes.router)

    test_app.dependency_overrides[get_db_session] = override_db_session
    test_app.dependency_overrides[get_tenant] = override_get_tenant

    payload = {
        "rollout_id": str(rollout.rollout_id),
        "target_status": "warning",
        "negative_ratio": 0.4,
        "total_feedback": 25,
        "notes": "drill",
    }

    async with event_bus.subscribe() as queue:
        async with AsyncClient(app=test_app, base_url="http://test") as client:
            response = await client.post(
                "/admin/chaos/guardrail",
                json=payload,
                headers={"x-tenant-id": str(tenant_id)},
            )
        event = await queue.get()

    test_app.dependency_overrides.clear()

    assert response.status_code == 202
    data = response.json()
    result = PreferenceRolloutRead.model_validate(data)
    assert result.safety_status == "warning"
    gauge_samples = {
        sample.labels["variant_key"]: sample.value
        for metric in guardrail_status_gauge.collect()
        for sample in metric.samples
        if sample.name == guardrail_status_gauge._name and sample.labels.get("rollout_id") == str(rollout.rollout_id)
    }
    assert gauge_samples.get("beta") == pytest.approx(1.0)
    assert event["type"] == "preference.guardrail.updated"
    assert event["payload"]["metrics"]["negative_ratio"] == pytest.approx(0.4)


@pytest.mark.asyncio
async def test_get_usage_stats(monkeypatch):
    tenant = Tenant(tenant_id=uuid.uuid4(), slug="acme", name="Acme", status="active")
    stat = UsageStat(
        tenant_id=tenant.tenant_id,
        metric="tasks_total",
        period_date=datetime.now(UTC).date(),
        count=5,
    )
    session = UsageStubSession(tenant, [stat])

    app = FastAPI()
    app.include_router(admin_routes.router)
    app.dependency_overrides[get_db_session] = lambda: session
    app.dependency_overrides[get_tenant] = lambda _session, _identifier: tenant
    app.dependency_overrides[get_billing_service] = lambda: FakeBillingService(tenant.tenant_id)

    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/admin/usage", headers={"x-tenant-id": str(tenant.tenant_id)})

    assert response.status_code == 200
    body = response.json()
    assert body and body[0]["metric"] == "tasks_total"

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_usage_export_requires_feature_and_returns_csv():
    tenant = Tenant(tenant_id=uuid.uuid4(), slug="acme", name="Acme", status="active")
    stat = UsageStat(
        tenant_id=tenant.tenant_id,
        metric="tasks_total",
        period_date=datetime.now(UTC).date(),
        count=3,
    )
    session = UsageStubSession(tenant, [stat])
    billing = FakeBillingService(tenant.tenant_id)

    async def session_dependency():
        yield session

    async def tenant_dependency(_session, _identifier):
        return tenant

    app = FastAPI()
    app.include_router(admin_routes.router)
    app.dependency_overrides[get_db_session] = session_dependency
    app.dependency_overrides[get_tenant] = tenant_dependency
    app.dependency_overrides[get_billing_service] = lambda: billing

    headers = {"x-tenant-id": str(tenant.tenant_id)}
    async with AsyncClient(app=app, base_url="http://test") as client:
        allowed = await client.get("/admin/usage/export", headers=headers)
        assert allowed.status_code == 200
        assert allowed.headers["content-type"].startswith("text/csv")
        csv_lines = allowed.text.strip().splitlines()
        assert csv_lines[0].startswith("tenant_id")
        assert "tasks_total" in csv_lines[1]
        assert tenant.slug in csv_lines[1]

        bad_format = await client.get(
            "/admin/usage/export",
            headers=headers,
            params={"format": "json"},
        )
        assert bad_format.status_code == 400

        billing.subscription.plan_slug = "starter"
        denied = await client.get("/admin/usage/export", headers=headers)
        assert denied.status_code == 403

    app.dependency_overrides.clear()


class SubscriptionSession:
    def __init__(self, tenant):
        self.tenant = tenant

    async def execute(self, _query):
        class Result:
            def __init__(self_inner, tenant_obj):
                self_inner._tenant = tenant_obj

            def scalar_one_or_none(self_inner):
                return self_inner._tenant

        return Result(self.tenant)


@pytest.mark.asyncio
async def test_subscription_endpoints_round_trip():
    tenant_id = uuid.uuid4()
    tenant = type("TenantStub", (), {"tenant_id": tenant_id})()
    session = SubscriptionSession(tenant)
    billing = FakeBillingService(tenant_id)

    async def session_dependency():
        yield session

    async def tenant_dependency(_session, _identifier):
        return tenant

    app = FastAPI()
    app.include_router(admin_routes.router)
    app.dependency_overrides[get_db_session] = session_dependency
    app.dependency_overrides[get_tenant] = tenant_dependency
    app.dependency_overrides[get_billing_service] = lambda: billing

    headers = {"x-tenant-id": str(tenant_id)}

    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/admin/subscription", headers=headers)
        assert response.status_code == 200
        body = SubscriptionRead.model_validate(response.json())
        assert body.plan_slug == "growth"
        assert "tasks.core" in body.features

        response = await client.put(
            "/admin/subscription",
            json={"plan_slug": "starter"},
            headers=headers,
        )
        assert response.status_code == 200
        updated = SubscriptionRead.model_validate(response.json())
        assert updated.plan_slug == "starter"
        assert "flows.core" not in updated.features

        response = await client.put(
            "/admin/subscription/features",
            json={
                "feature_code": "flows.core",
                "enabled": True,
            },
            headers=headers,
        )
        assert response.status_code == 201
        override = FeatureOverrideRead.model_validate(response.json())
        assert override.feature_code == "flows.core"

        response = await client.get("/admin/subscription/features", headers=headers)
        assert response.status_code == 200
        overrides = [FeatureOverrideRead.model_validate(item) for item in response.json()]
        assert any(item.feature_code == "flows.core" for item in overrides)

        response = await client.delete(
            "/admin/subscription/features/taskr/flows.core",
            headers=headers,
        )
        assert response.status_code == 204

    app.dependency_overrides.clear()
