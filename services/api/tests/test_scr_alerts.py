from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

pytest.importorskip("aiosqlite")

from app.core.config import settings
from app.main import app
from sqlalchemy.dialects.sqlite import JSON as SQLITE_JSON

from app.models.base import Base
from app.models import core as core_models
from app.models.core import ScrAlert, Tenant
from app.core.deps import get_db_session


@pytest.mark.asyncio
async def test_scr_alert_lifecycle(monkeypatch):
    original_jsonb = getattr(core_models, "JSONB", None)
    core_models.JSONB = SQLITE_JSON  # type: ignore[attr-defined]
    tenant_metadata_type = Tenant.__table__.c.org_metadata.type
    scr_metadata_type = ScrAlert.__table__.c.metadata_json.type
    tenant_schema = Tenant.__table__.schema
    scr_schema = ScrAlert.__table__.schema
    Tenant.__table__.schema = None  # type: ignore[assignment]
    ScrAlert.__table__.schema = None  # type: ignore[assignment]
    Tenant.__table__.c.org_metadata.type = SQLITE_JSON()  # type: ignore[index]
    ScrAlert.__table__.c.metadata_json.type = SQLITE_JSON()  # type: ignore[index]
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")

    def create_tables(connection):
        Tenant.__table__.create(connection)
        ScrAlert.__table__.create(connection)

    async with engine.begin() as conn:
        await conn.run_sync(create_tables)

    SessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    tenant_id = uuid.uuid4()
    tenant_slug = "acme"
    async with SessionLocal() as session:
        tenant = Tenant(tenant_id=tenant_id, slug=tenant_slug, name="Acme Corp")
        session.add(tenant)
        await session.commit()

    async def override_db_session():
        async with SessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise


    async def override_get_tenant(session, tenant_identifier):
        if tenant_identifier in {str(tenant_id), tenant_slug}:
            return await session.get(Tenant, tenant_id)
        return None

    original_token = settings.scr_alert_token
    settings.scr_alert_token = None

    app.dependency_overrides[get_db_session] = override_db_session
    monkeypatch.setattr("app.routes.integrations.get_tenant", override_get_tenant)

    client = TestClient(app)

    alert_id = uuid.uuid4()
    created_at = datetime.now(timezone.utc)

    try:
        ingest_resp = client.post(
            "/integrations/scr-alerts",
            headers={"x-tenant-id": tenant_slug},
            json={
                "alert_id": str(alert_id),
                "tenant_id": str(tenant_id),
                "severity": "high",
                "kind": "overdue_claim",
                "message": "Claim overdue for follow-up",
                "source": "scrAIv",
                "metadata": {"claim_id": "123"},
                "created_at": created_at.isoformat()
            },
        )
        assert ingest_resp.status_code == 202, ingest_resp.json()
        payload = ingest_resp.json()
        assert payload["alert_id"] == str(alert_id)
        assert payload["acknowledged_at"] is None

        list_resp = client.get(
            "/integrations/alerts/scr",
            headers={"x-tenant-id": tenant_slug}
        )
        assert list_resp.status_code == 200
        alerts = list_resp.json()
        assert len(alerts) == 1
        assert alerts[0]["alert_id"] == str(alert_id)

        ack_resp = client.post(
            f"/integrations/alerts/scr/{alert_id}/ack",
            headers={"x-tenant-id": tenant_slug},
            json={"notes": "handled"}
        )
        assert ack_resp.status_code == 200
        acknowledged = ack_resp.json()
        assert acknowledged["acknowledged_at"] is not None

        post_ack_resp = client.get(
            "/integrations/alerts/scr",
            headers={"x-tenant-id": tenant_slug}
        )
        assert post_ack_resp.status_code == 200
        assert post_ack_resp.json() == []

        include_resp = client.get(
            "/integrations/alerts/scr",
            headers={"x-tenant-id": tenant_slug},
            params={"include_acknowledged": True}
        )
        assert include_resp.status_code == 200
        included = include_resp.json()
        assert len(included) == 1
        assert included[0]["alert_id"] == str(alert_id)
        assert included[0]["acknowledged_at"] is not None
    finally:
        app.dependency_overrides.clear()
        settings.scr_alert_token = original_token
        Tenant.__table__.schema = tenant_schema  # type: ignore[assignment]
        ScrAlert.__table__.schema = scr_schema  # type: ignore[assignment]
        Tenant.__table__.c.org_metadata.type = tenant_metadata_type  # type: ignore[index]
        ScrAlert.__table__.c.metadata_json.type = scr_metadata_type  # type: ignore[index]
        if original_jsonb is not None:
            core_models.JSONB = original_jsonb  # type: ignore[attr-defined]
        await engine.dispose()
