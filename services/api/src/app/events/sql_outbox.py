from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Sequence

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from app.events.outbox import OutboxEvent, OutboxRepository
from app.models.core import OutboxMessage


class SqlOutboxRepository(OutboxRepository):
    """Persistent outbox backed by Postgres."""

    def __init__(self, session_factory: sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def enqueue(self, event: OutboxEvent) -> None:
        async with self._session_factory() as session:
            message = OutboxMessage(
                event_id=uuid.UUID(event.event_id),
                topic=event.topic,
                tenant_id=event.tenant_id,
                payload=event.payload,
                status="pending",
                attempts=0,
                error=None,
            )
            session.add(message)
            await session.commit()

    async def dequeue_batch(self, limit: int = 100) -> list[OutboxEvent]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(OutboxMessage)
                .where(OutboxMessage.status == "pending")
                .order_by(OutboxMessage.created_at)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
            rows = result.scalars().all()
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            events: list[OutboxEvent] = []
            for row in rows:
                row.status = "publishing"
                row.attempts = (row.attempts or 0) + 1
                row.error = None
                row.updated_at = now
                events.append(
                    OutboxEvent(
                        event_id=str(row.event_id),
                        topic=row.topic,
                        tenant_id=row.tenant_id,
                        payload=row.payload,
                        created_at=row.created_at,
                        published_at=row.published_at,
                    )
                )
            await session.commit()
            return events

    async def mark_published(self, event_ids: Sequence[str]) -> None:
        if not event_ids:
            return
        async with self._session_factory() as session:
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            uuid_ids = [uuid.UUID(value) for value in event_ids]
            await session.execute(
                update(OutboxMessage)
                .where(OutboxMessage.event_id.in_(uuid_ids))
                .values(status="published", published_at=now, updated_at=now, error=None)
            )
            await session.commit()

    async def mark_failed(self, event_ids: Sequence[str], error: str) -> None:
        if not event_ids:
            return
        async with self._session_factory() as session:
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            uuid_ids = [uuid.UUID(value) for value in event_ids]
            await session.execute(
                update(OutboxMessage)
                .where(OutboxMessage.event_id.in_(uuid_ids))
                .values(status="pending", updated_at=now, error=error)
            )
            await session.commit()
