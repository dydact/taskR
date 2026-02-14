from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict


@dataclass(slots=True)
class OutboxEvent:
    """Shared event payload used across services when publishing to the outbox."""

    event_id: str
    topic: str
    tenant_id: str
    payload: Dict[str, Any]
    created_at: datetime | None = None
    published_at: datetime | None = None


__all__ = ["OutboxEvent"]
