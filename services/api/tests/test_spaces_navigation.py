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

from app.core.deps import get_db_session
from app.main import app
from app.models.base import Base
from app.models.core import Folder, List, Space, Tenant


@pytest.mark.asyncio
async def test_spaces_navigation_endpoints():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    tenant_id = uuid.uuid4()
    async with SessionLocal() as session:
        tenant = Tenant(tenant_id=tenant_id, slug="acme", name="Acme Corp", status="active")
        session.add(tenant)
        await session.flush()

        space_alpha = Space(
            tenant_id=tenant_id,
            slug="alpha",
            name="Alpha Space",
            color="#ff0000",
            metadata_json={"category": "Operations"},
        )
        space_beta = Space(tenant_id=tenant_id, slug="beta", name="Beta Space")
        session.add_all([space_alpha, space_beta])
        await session.flush()

        folder = Folder(tenant_id=tenant_id, space_id=space_alpha.space_id, name="Backlog")
        session.add(folder)
        await session.flush()

        inbox = List(
            tenant_id=tenant_id,
            space_id=space_alpha.space_id,
            folder_id=None,
            name="Inbox",
            position=0,
        )
        sprint = List(
            tenant_id=tenant_id,
            space_id=space_alpha.space_id,
            folder_id=folder.folder_id,
            name="Sprint Board",
            position=1,
        )
        session.add_all([inbox, sprint])
        await session.commit()

    async def override_db_session():
        async with SessionLocal() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_db_session

    client = TestClient(app)
    headers = {"x-tenant-id": str(tenant_id)}

    try:
        spaces_resp = client.get("/spaces", headers=headers)
        assert spaces_resp.status_code == 200
        spaces = spaces_resp.json()
        assert len(spaces) == 2
        alpha_entry = next(entry for entry in spaces if entry["slug"] == "alpha")
        assert alpha_entry["id"] == alpha_entry["space_id"]
        assert alpha_entry["metadata_json"].get("category") == "Operations"

        list_nav_resp = client.get("/spaces/navigation", headers=headers)
        assert list_nav_resp.status_code == 200
        nav_payload = list_nav_resp.json()
        assert len(nav_payload) == 2

        alpha_nav = next(entry for entry in nav_payload if entry["slug"] == "alpha")
        assert alpha_nav["space_id"] == str(alpha_entry["space_id"])
        assert alpha_nav["category"] == "Operations"
        assert alpha_nav["metadata_json"].get("category") == "Operations"
        assert len(alpha_nav["root_lists"]) == 1
        assert alpha_nav["root_lists"][0]["name"] == "Inbox"
        assert len(alpha_nav["folders"]) == 1
        assert alpha_nav["folders"][0]["lists"][0]["name"] == "Sprint Board"

        single_nav_resp = client.get("/spaces/alpha/navigation", headers=headers)
        assert single_nav_resp.status_code == 200
        single_nav = single_nav_resp.json()
        assert single_nav["slug"] == "alpha"
        assert single_nav["category"] == "Operations"
        assert single_nav["root_lists"][0]["name"] == "Inbox"
        assert single_nav["folders"][0]["lists"][0]["name"] == "Sprint Board"
    finally:
        app.dependency_overrides.clear()
