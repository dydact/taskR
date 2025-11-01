from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, Dict


class EventBus:
    """Simple in-memory pub/sub bus for local dev and SSE streams."""

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[Dict[str, Any]]] = set()
        self._lock = asyncio.Lock()

    async def publish(self, event: Dict[str, Any]) -> None:
        async with self._lock:
            for queue in list(self._subscribers):
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    # drop if slow consumer; could add metrics/logging
                    pass

    @asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue[Dict[str, Any]]]:
        queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue(maxsize=100)
        async with self._lock:
            self._subscribers.add(queue)
        try:
            yield queue
        finally:
            async with self._lock:
                self._subscribers.discard(queue)


event_bus = EventBus()


__all__ = ["EventBus", "event_bus"]
