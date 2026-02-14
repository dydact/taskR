from __future__ import annotations

import uuid
from typing import Any

from app.events.bus import event_bus

DEDICATED_TOPIC = "dedicated.assignments"


async def emit_assignment_event(tenant_id: uuid.UUID, action: str, payload: dict[str, Any]) -> None:
    """Broadcast assignment updates to the SSE bus."""

    envelope = {
        "tenant_id": str(tenant_id),
        "topic": DEDICATED_TOPIC,
        "action": action,
        "payload": payload,
    }
    await event_bus.publish(envelope)


__all__ = ["emit_assignment_event", "DEDICATED_TOPIC"]
