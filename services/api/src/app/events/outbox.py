from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol, Sequence

from nats.aio.client import Client as NATS


@dataclass
class OutboxEvent:
    event_id: str
    topic: str
    tenant_id: str
    payload: dict
    created_at: datetime | None = None
    published_at: datetime | None = None


class OutboxRepository(Protocol):
    async def enqueue(self, event: OutboxEvent) -> None: ...

    async def dequeue_batch(self, limit: int = 100) -> list[OutboxEvent]: ...

    async def mark_published(self, event_ids: Sequence[str]) -> None: ...

    async def mark_failed(self, event_ids: Sequence[str], error: str) -> None: ...


@dataclass
class EventPublisher:
    repository: OutboxRepository
    nats: NATS | None = None

    async def publish(self, topic: str, tenant_id: str, payload: dict) -> None:
        event = OutboxEvent(event_id=str(uuid.uuid4()), topic=topic, tenant_id=tenant_id, payload=payload)
        await self.repository.enqueue(event)
        await self._flush()

    async def _flush(self) -> None:
        batch = await self.repository.dequeue_batch(limit=10)
        for event in batch:
            if self.nats is None or not getattr(self.nats, "is_connected", False):
                await self.repository.mark_failed([event.event_id], "nats_unavailable")
                continue
            try:
                await self.nats.publish(
                    event.topic,
                    json.dumps({"tenant_id": event.tenant_id, "payload": event.payload}).encode(),
                )
            except Exception as exc:  # pragma: no cover - NATS failure
                await self.repository.mark_failed([event.event_id], str(exc))
            else:
                await self.repository.mark_published([event.event_id])
