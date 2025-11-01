from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import NotificationChannel

logger = logging.getLogger(__name__)

SUPPORTED_CHANNELS = {"slack", "discord", "sms"}


def _normalize_channel(name: str) -> str:
    return name.strip().lower()


async def fetch_channels(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    enabled_only: bool = False,
) -> list[NotificationChannel]:
    stmt = select(NotificationChannel).where(NotificationChannel.tenant_id == tenant_id)
    if enabled_only:
        stmt = stmt.where(NotificationChannel.enabled.is_(True))
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def replace_channels(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    entries: Sequence["ChannelConfigInput"],
) -> list[NotificationChannel]:
    """Replace the tenant's channel configuration with the provided entries."""

    result = await session.execute(
        select(NotificationChannel).where(NotificationChannel.tenant_id == tenant_id)
    )
    existing = {row.channel: row for row in result.scalars().all()}
    seen: set[str] = set()

    for entry in entries:
        channel_name = _normalize_channel(entry.channel)
        if channel_name not in SUPPORTED_CHANNELS:
            raise ValueError(f"Unsupported channel '{entry.channel}'")
        seen.add(channel_name)
        events = entry.events or []
        config = entry.config or {}
        enabled = bool(entry.enabled)

        row = existing.get(channel_name)
        if row:
            row.enabled = enabled
            row.events = events
            row.config = config
        else:
            row = NotificationChannel(
                tenant_id=tenant_id,
                channel=channel_name,
                enabled=enabled,
                events=events,
                config=config,
            )
            session.add(row)
            existing[channel_name] = row

    for channel_name, row in list(existing.items()):
        if channel_name not in seen:
            await session.delete(row)
            existing.pop(channel_name, None)

    await session.flush()
    return list(existing.values())


def latest_updated_at(channels: Iterable[NotificationChannel]) -> datetime | None:
    latest: datetime | None = None
    for channel in channels:
        if channel.updated_at and (latest is None or channel.updated_at > latest):
            latest = channel.updated_at
    return latest


class ChannelConfigInput:
    """Lightweight representation of a channel config used by the repository."""

    __slots__ = ("channel", "enabled", "events", "config")

    def __init__(self, channel: str, enabled: bool, events: Iterable[str], config: dict):
        self.channel = channel
        self.enabled = enabled
        self.events = list(events)
        self.config = dict(config or {})
