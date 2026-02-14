from __future__ import annotations

import sys
import types
import uuid

from fastapi import HTTPException

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

pytest.importorskip("aiosqlite")

if "asyncpg" not in sys.modules:
    sys.modules["asyncpg"] = types.ModuleType("asyncpg")

from app.main import app
from app.models.base import Base
from app.models.core import CustomFieldDefinition, Space, Tenant
from app.schemas import CustomFieldDefinitionRead
from app.routes.custom_fields import _normalize_field_value


@pytest.mark.asyncio
async def test_custom_field_option_lifecycle(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    tenant_id = uuid.uuid4()
    async with SessionLocal() as session:
        tenant = Tenant(tenant_id=tenant_id, slug="acme", name="Acme Corp", status="active")
        session.add(tenant)
        await session.flush()
        space = Space(tenant_id=tenant.tenant_id, slug="alpha", name="Alpha Space")
        session.add(space)
        await session.commit()

    async def override_db_session():
        async with SessionLocal() as session:
            yield session

    from app.core.deps import get_db_session

    app.dependency_overrides[get_db_session] = override_db_session

    client = TestClient(app)

    base_url = "/custom-fields/spaces/alpha"
    create_payload = {
        "name": "Status",
        "slug": "status",
        "field_type": "select",
        "config": {},
        "options": [
            {"label": "In Progress", "value": "in_progress", "position": 0},
            {"label": "Blocked", "value": "blocked", "position": 1}
        ]
    }

    headers = {"x-tenant-id": str(tenant_id)}

    try:
        response = client.post(base_url, json=create_payload, headers=headers)
        assert response.status_code == 201
        body = response.json()
        field_id = body["field_id"]
        assert len(body["options"]) == 2
        assert body["config"]["options"] == ["in_progress", "blocked"]

        option_resp = client.post(
            f"/custom-fields/{field_id}/options",
            json={"label": "Done", "value": "done"},
            headers=headers,
        )
        assert option_resp.status_code == 201
        option_id = option_resp.json()["option_id"]

        patch_resp = client.patch(
            f"/custom-fields/{field_id}/options/{option_id}",
            json={"label": "Completed", "color": "#22c55e"},
            headers=headers,
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["label"] == "Completed"

        list_resp = client.get(f"/custom-fields/{field_id}/options", headers=headers)
        assert list_resp.status_code == 200
        assert len(list_resp.json()) == 3

        delete_resp = client.delete(f"/custom-fields/{field_id}/options/{option_id}", headers=headers)
        assert delete_resp.status_code == 200

        refreshed = client.get(base_url, headers=headers)
        assert refreshed.status_code == 200
        data = refreshed.json()
        assert len(data) == 1
        definition = CustomFieldDefinitionRead.model_validate(data[0])
        assert [opt.value for opt in definition.options] == ["in_progress", "blocked"]
        assert definition.config["options"] == ["in_progress", "blocked"]

        async with SessionLocal() as session:
            definition_db = await session.get(CustomFieldDefinition, uuid.UUID(field_id))
            await session.refresh(definition_db, attribute_names=["options"])
            assert len([opt for opt in definition_db.options if opt.is_active]) == 2
            with pytest.raises(HTTPException):
                _normalize_field_value(definition_db, "unknown")
    finally:
        app.dependency_overrides.clear()
