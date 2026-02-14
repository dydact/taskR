from __future__ import annotations

import sys
import types
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

pytest.importorskip("aiosqlite")

if "asyncpg" not in sys.modules:
    sys.modules["asyncpg"] = types.ModuleType("asyncpg")

from app.main import app
from app.models.base import Base
from app.models.core import DigestHistory, List, Space, Task, Tenant
from app.services.digests import generate_digest
from common_auth import TenantHeaders


@pytest.mark.asyncio
async def test_generate_digest_persists_summary():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    now = datetime.now(UTC).replace(microsecond=0)
    start = now - timedelta(days=1)

    async with SessionLocal() as session:
        tenant = Tenant(slug="acme", name="Acme Corp", status="active")
        session.add(tenant)
        await session.flush()

        space = Space(tenant_id=tenant.tenant_id, slug="alpha", name="Alpha")
        session.add(space)
        await session.flush()

        task_list = List(tenant_id=tenant.tenant_id, space_id=space.space_id, name="Sprint")
        session.add(task_list)
        await session.flush()

        session.add_all(
            [
                Task(
                    tenant_id=tenant.tenant_id,
                    space_id=space.space_id,
                    list_id=task_list.list_id,
                    title="Ship feature",
                    status="completed",
                    updated_at=start + timedelta(hours=1),
                    due_at=start + timedelta(hours=2),
                ),
                Task(
                    tenant_id=tenant.tenant_id,
                    space_id=space.space_id,
                    list_id=task_list.list_id,
                    title="QA",
                    status="in_progress",
                    updated_at=start + timedelta(hours=3),
                ),
                Task(
                    tenant_id=tenant.tenant_id,
                    space_id=space.space_id,
                    list_id=task_list.list_id,
                    title="Backlog grooming",
                    status="backlog",
                    updated_at=start + timedelta(hours=4),
                    due_at=start + timedelta(hours=2),
                ),
            ]
        )

        await session.flush()

        digest = await generate_digest(
            session,
            tenant.tenant_id,
            period_start=start,
            period_end=now,
        )

        assert isinstance(digest, DigestHistory)
        assert "Digest for" in digest.summary_text
        assert "1 tasks completed" in digest.summary_text
        stats = digest.metadata_json.get("stats")
        assert stats["total"] == 3
        assert stats["completed"] == 1


def test_create_digest_summary_endpoint(monkeypatch):
    fake_digest_id = uuid.uuid4()

    async def fake_generate(*_args, **_kwargs):
        return SimpleNamespace(
            digest_id=fake_digest_id,
            summary_text="Digest body",
            metadata_json={"stats": {"total": 0}},
            period_start=datetime(2024, 1, 1, tzinfo=UTC),
            period_end=datetime(2024, 1, 2, tzinfo=UTC),
        )

    class DummySession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

    async def override_db_session():
        session = DummySession()
        try:
            yield session
        finally:
            pass

    async def fake_get_tenant(_session, tenant_id):
        return SimpleNamespace(tenant_id=uuid.UUID(tenant_id))

    from app.core.deps import get_db_session
    from app.routes.utils import get_tenant

    app.dependency_overrides[get_db_session] = override_db_session
    app.dependency_overrides[get_tenant] = fake_get_tenant
    monkeypatch.setattr("app.routes.summaries.generate_digest", fake_generate)

    client = TestClient(app)
    response = client.post(
        "/summaries/digest",
        json={"period_start": "2024-01-01T00:00:00Z", "period_end": "2024-01-02T00:00:00Z"},
        headers={"x-tenant-id": str(uuid.uuid4())},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["digest_id"] == str(fake_digest_id)
    assert body["summary_text"] == "Digest body"
    assert body["metadata"]["stats"]["total"] == 0

    app.dependency_overrides.clear()
