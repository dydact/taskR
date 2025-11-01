from __future__ import annotations

import asyncio
import sys
import types
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

if "pydantic_settings" not in sys.modules:
    import types

    stub = types.ModuleType("pydantic_settings")

    class _BaseSettings:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

    stub.BaseSettings = _BaseSettings
    stub.SettingsConfigDict = dict
    sys.modules["pydantic_settings"] = stub

if "asyncpg" not in sys.modules:
    sys.modules["asyncpg"] = types.ModuleType("asyncpg")

if "aiosqlite" not in sys.modules:
    sys.modules["aiosqlite"] = types.ModuleType("aiosqlite")

pytest.skip("aiosqlite not installed; skipping retention integration test", allow_module_level=True)

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/api/src"))

from app.models.base import Base
from app.models.core import (
    MeetingNote,
    PreferenceFeedback,
    RetentionPolicy,
    Tenant,
)
from app.services.retention import apply_retention


@pytest.mark.asyncio
async def test_apply_retention_prunes_old_records():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with SessionLocal() as session:
        tenant = Tenant(slug="acme", name="Acme", status="active")
        session.add(tenant)
        await session.flush()

        old_timestamp = datetime.now(UTC) - timedelta(days=400)
        recent_timestamp = datetime.now(UTC) - timedelta(days=10)

        old_note = MeetingNote(
            tenant_id=tenant.tenant_id,
            title="Old",
            content="Old content",
            action_items=[],
            metadata_json={},
            created_at=old_timestamp,
            updated_at=old_timestamp,
        )
        new_note = MeetingNote(
            tenant_id=tenant.tenant_id,
            title="New",
            content="New content",
            action_items=[],
            metadata_json={},
            created_at=recent_timestamp,
            updated_at=recent_timestamp,
        )
        session.add_all([old_note, new_note])

        feedback = PreferenceFeedback(
            tenant_id=tenant.tenant_id,
            model_id=uuid.uuid4(),
            variant_id=None,
            source="ui",
            signal_type="thumbs",
            rating=-1,
            metadata_json={},
            created_at=old_timestamp,
            recorded_at=old_timestamp,
        )
        session.add(feedback)

        policy = RetentionPolicy(
            tenant_id=tenant.tenant_id,
            resource_type="meeting_note",
            retention_days=365,
            metadata_json={},
        )
        session.add(policy)
        await session.commit()

    async with SessionLocal() as session:
        tenant = (await session.execute(select(Tenant))).scalars().first()
        policies = [
            RetentionPolicy(
                tenant_id=tenant.tenant_id,
                resource_type="meeting_note",
                retention_days=365,
            ),
            RetentionPolicy(
                tenant_id=tenant.tenant_id,
                resource_type="preference_feedback",
                retention_days=180,
            ),
        ]
        deletions = await apply_retention(session, tenant.tenant_id, policies)
        await session.commit()

    async with SessionLocal() as session:
        note_count = (await session.execute(select(MeetingNote))).scalars().all()
        feedback_count = (await session.execute(select(PreferenceFeedback))).scalars().all()
        assert len(note_count) == 1
        assert len(feedback_count) == 0
        assert deletions["meeting_note"] == 1
        assert deletions["preference_feedback"] == 1

    await engine.dispose()
