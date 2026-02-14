from __future__ import annotations

import sys
import types
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

pytest.importorskip("aiosqlite")

if "asyncpg" not in sys.modules:
    sys.modules["asyncpg"] = types.ModuleType("asyncpg")

from app.main import app
from app.models.base import Base
from app.models.core import Space, Tenant


@pytest.mark.asyncio
async def test_docs_endpoints_include_content(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    tenant_id = uuid.uuid4()
    async with SessionLocal() as session:
        tenant = Tenant(tenant_id=tenant_id, slug="acme", name="Acme")
        session.add(tenant)
        await session.flush()
        space = Space(tenant_id=tenant.tenant_id, slug="alpha", name="Alpha")
        session.add(space)
        await session.commit()

    async def override_db_session():
        async with SessionLocal() as session:
            yield session

    async def override_get_tenant(session, tenant_identifier):
        result = await session.get(Tenant, tenant_id)
        return result

    from app.core.deps import get_db_session
    from app.routes.utils import get_tenant

    app.dependency_overrides[get_db_session] = override_db_session
    app.dependency_overrides[get_tenant] = override_get_tenant

    client = TestClient(app)

    try:
        create_resp = client.post(
            "/docs",
            headers={"x-tenant-id": str(tenant_id)},
            json={
                "title": "Research Plan",
                "slug": "research-plan",
                "summary": "Latest research initiatives",
                "tags": ["research", "planning"],
                "space_id": str(space.space_id),
                "text": "Initial research outline."
            },
        )
        assert create_resp.status_code == 201
        created = create_resp.json()
        doc_id = created["doc_id"]
        assert created["content"] == "Initial research outline."
        assert created["current_revision_version"] == 1

        list_resp = client.get("/docs", headers={"x-tenant-id": str(tenant_id)})
        assert list_resp.status_code == 200
        listing = list_resp.json()
        assert listing[0]["content"] is None
        assert listing[0]["current_revision_id"] is not None

        detail_resp = client.get(f"/docs/{doc_id}", headers={"x-tenant-id": str(tenant_id)})
        assert detail_resp.status_code == 200
        detail = detail_resp.json()
        assert detail["content"] == "Initial research outline."
        assert detail["current_revision_version"] == 1

        revision_resp = client.post(
            f"/docs/{doc_id}/revisions",
            headers={"x-tenant-id": str(tenant_id)},
            json={"text": "Second draft."}
        )
        assert revision_resp.status_code == 201

        updated_detail = client.get(f"/docs/{doc_id}", headers={"x-tenant-id": str(tenant_id)})
        assert updated_detail.json()["content"] == "Second draft."
        assert updated_detail.json()["current_revision_version"] == 2
    finally:
        app.dependency_overrides.clear()
