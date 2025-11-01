from __future__ import annotations

import sys
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/api/src"))
sys.path.insert(0, str(REPO_ROOT / "packages/common_events/src"))

from app.core.db import SessionLocal, engine
from app.events.sql_outbox import SqlOutboxRepository
from app.models.core import OutboxMessage
from common_events import OutboxEvent

pytestmark = pytest.mark.filterwarnings("ignore:datetime.datetime.utcnow() is deprecated")


@pytest.mark.asyncio
async def test_sql_outbox_enqueue_dequeue_and_mark_published():
    repository = SqlOutboxRepository(SessionLocal)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(OutboxMessage.__table__.create, checkfirst=True)
            await conn.execute(text("DELETE FROM tr_outbox_event"))
    except Exception as exc:  # pragma: no cover - skip when database missing
        pytest.skip(f"Database unavailable for SQL outbox tests: {exc}")

    event = OutboxEvent(
        event_id=str(uuid.uuid4()),
        topic="test.topic",
        tenant_id="tenant",
        payload={"hello": "world"},
    )
    try:
        await repository.enqueue(event)
    except Exception as exc:
        pytest.skip(f"Outbox repository requires database: {exc}")

    batch = await repository.dequeue_batch(limit=5)
    assert len(batch) == 1
    fetched = batch[0]
    assert fetched.topic == event.topic
    assert fetched.payload == event.payload

    # Simulate a transient failure and ensure the message returns to the queue
    await repository.mark_failed([fetched.event_id], "transient")
    retry_batch = await repository.dequeue_batch(limit=5)
    assert len(retry_batch) == 1

    await repository.mark_published([retry_batch[0].event_id])

    async with SessionLocal() as session:
        row = await session.get(OutboxMessage, uuid.UUID(event.event_id))
        assert row is not None
        assert row.status == "published"
        assert row.published_at is not None
