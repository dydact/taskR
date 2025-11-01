from __future__ import annotations

import uuid

import pytest

from app.core.db import SessionLocal, engine
from app.models.core import UsageStat
from app.services.usage import adjust_usage, get_usage


@pytest.mark.asyncio
async def test_adjust_usage_creates_and_updates_record():
    try:
        async with engine.begin() as conn:
            await conn.run_sync(UsageStat.__table__.create, checkfirst=True)
            await conn.execute(UsageStat.__table__.delete())
    except Exception as exc:
        pytest.skip(f"Database not available: {exc}")

    tenant_id = uuid.uuid4()
    async with SessionLocal() as session:
        await adjust_usage(session, tenant_id, "tasks_total", 3)
        await session.commit()

    async with SessionLocal() as session:
        stats = await get_usage(session, tenant_id, metric="tasks_total", limit=1)
        assert stats and stats[0].count == 3
        await adjust_usage(session, tenant_id, "tasks_total", -1)
        await session.commit()

    async with SessionLocal() as session:
        stats = await get_usage(session, tenant_id, metric="tasks_total", limit=1)
        assert stats and stats[0].count == 2
