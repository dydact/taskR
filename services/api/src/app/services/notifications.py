from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.core.config import settings
from app.core.db import SessionLocal
from app.services.tenant_notifications import fetch_channels

logger = logging.getLogger(__name__)


@dataclass
class NotificationEvent:
    tenant_id: uuid.UUID
    event_type: str
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class ChannelConfig:
    channel: str
    enabled: bool
    events: list[str]
    config: dict[str, Any]
    updated_at: float

    def matches(self, event_type: str) -> bool:
        if not self.events:
            return True
        if "*" in self.events:
            return True
        return event_type in self.events


@dataclass
class NotificationMessage:
    title: str
    body: str
    cta_path: str | None = None


class NotificationService:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[Any] = asyncio.Queue(maxsize=settings.notification_queue_size)
        self._worker_task: asyncio.Task[None] | None = None
        self._shutdown = asyncio.Event()
        self._http: httpx.AsyncClient | None = None
        self._cache: dict[uuid.UUID, tuple[float, list[ChannelConfig]]] = {}
        self._cache_ttl = max(settings.notification_cache_ttl_seconds, 5.0)
        self._sentinel = object()

    @property
    def running(self) -> bool:
        return self._worker_task is not None and not self._worker_task.done()

    async def start(self) -> None:
        if self.running:
            return
        self._shutdown.clear()
        self._http = httpx.AsyncClient(timeout=10.0)
        self._worker_task = asyncio.create_task(self._worker(), name="taskr-notifications")
        logger.info("NotificationService started (queue size=%s)", settings.notification_queue_size)

    async def stop(self) -> None:
        if not self.running:
            return
        self._shutdown.set()
        try:
            self._queue.put_nowait(self._sentinel)
        except asyncio.QueueFull:
            pass
        if self._worker_task:
            await self._worker_task
        self._worker_task = None
        if self._http:
            await self._http.aclose()
            self._http = None
        self._cache.clear()
        logger.info("NotificationService stopped")

    def invalidate_cache(self, tenant_id: uuid.UUID) -> None:
        self._cache.pop(tenant_id, None)

    async def enqueue(self, event: NotificationEvent) -> None:
        if not self.running:
            logger.debug("NotificationService not running; dropping event %s", event.event_type)
            return
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning(
                "Notification queue at capacity; dropping event",
                extra={"tenant_id": str(event.tenant_id), "event": event.event_type},
            )

    async def notify_meeting_note(
        self,
        tenant_id: uuid.UUID,
        *,
        note_id: uuid.UUID,
        title: str,
        summary: str | None,
        event_type: str,
    ) -> None:
        payload = {
            "note_id": str(note_id),
            "title": title,
            "summary": summary or "",
            "cta_path": f"/meetings/notes/{note_id}",
        }
        await self.enqueue(NotificationEvent(tenant_id=tenant_id, event_type=event_type, payload=payload))

    async def _worker(self) -> None:
        while not self._shutdown.is_set():
            event = await self._queue.get()
            if event is self._sentinel:
                break
            if isinstance(event, NotificationEvent):
                try:
                    await self._process_event(event)
                except Exception as exc:  # pragma: no cover - defensive
                    logger.exception(
                        "Notification dispatch failed",
                        extra={"tenant_id": str(event.tenant_id), "event": event.event_type, "error": str(exc)},
                    )
            self._queue.task_done()

    async def _process_event(self, event: NotificationEvent) -> None:
        message = self._build_message(event)
        if message is None:
            logger.debug("Notification event %s ignored (no template)", event.event_type)
            return
        channels = await self._get_channels(event.tenant_id)
        if not channels:
            return
        recipients = [ch for ch in channels if ch.enabled and ch.matches(event.event_type)]
        if not recipients:
            return
        for channel in recipients:
            await self._dispatch(channel, message, event)

    async def _get_channels(self, tenant_id: uuid.UUID) -> list[ChannelConfig]:
        cached = self._cache.get(tenant_id)
        now = time.time()
        if cached and now - cached[0] < self._cache_ttl:
            return cached[1]

        session = SessionLocal()
        try:
            rows = await fetch_channels(session, tenant_id, enabled_only=True)
        finally:
            await session.close()

        configs = [
            ChannelConfig(
                channel=row.channel,
                enabled=row.enabled,
                events=list(row.events or []),
                config=dict(row.config or {}),
                updated_at=row.updated_at.timestamp() if row.updated_at else now,
            )
            for row in rows
        ]
        self._cache[tenant_id] = (now, configs)
        return configs

    def _build_message(self, event: NotificationEvent) -> NotificationMessage | None:
        payload = event.payload or {}
        if event.event_type == "meeting.note.created":
            title = payload.get("title") or "New meeting summary"
            summary = payload.get("summary") or ""
            body = summary if len(summary) <= 280 else summary[:277] + "..."
            return NotificationMessage(
                title="Meeting summary captured",
                body=f"{title}\n{body}".strip(),
                cta_path=payload.get("cta_path"),
            )
        if event.event_type == "meeting.note.updated":
            title = payload.get("title") or "Meeting summary updated"
            summary = payload.get("summary") or ""
            body = summary if len(summary) <= 280 else summary[:277] + "..."
            return NotificationMessage(
                title="Meeting summary updated",
                body=f"{title}\n{body}".strip(),
                cta_path=payload.get("cta_path"),
            )
        return None

    async def _dispatch(self, channel: ChannelConfig, message: NotificationMessage, event: NotificationEvent) -> None:
        try:
            if channel.channel == "slack":
                await self._send_slack(channel.config, message, event)
            elif channel.channel == "discord":
                await self._send_discord(channel.config, message, event)
            elif channel.channel == "sms":
                await self._send_sms(channel.config, message, event)
            else:
                if settings.notification_log_failures:
                    logger.warning(
                        "Unsupported notification channel",
                        extra={"channel": channel.channel, "tenant_id": str(event.tenant_id)},
                    )
        except Exception as exc:
            if settings.notification_log_failures:
                logger.warning(
                    "Notification delivery error",
                    extra={
                        "tenant_id": str(event.tenant_id),
                        "channel": channel.channel,
                        "event": event.event_type,
                        "error": str(exc),
                    },
                )

    async def _send_slack(self, config: dict[str, Any], message: NotificationMessage, event: NotificationEvent) -> None:
        webhook_url = (config or {}).get("webhook_url")
        if not webhook_url:
            logger.warning("Slack notifier missing webhook URL", extra={"tenant_id": str(event.tenant_id)})
            return
        payload = {
            "text": self._format_text(message),
            "username": config.get("username") or "TaskR",
        }
        if icon := config.get("icon"):
            payload["icon_emoji"] = icon
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=10.0)
        response = await self._http.post(webhook_url, json=payload)
        if response.status_code >= 400 and settings.notification_log_failures:
            logger.warning(
                "Slack webhook delivery failed",
                extra={
                    "tenant_id": str(event.tenant_id),
                    "status": response.status_code,
                    "body": response.text[:200],
                },
            )

    async def _send_discord(
        self,
        config: dict[str, Any],
        message: NotificationMessage,
        event: NotificationEvent,
    ) -> None:
        webhook_url = (config or {}).get("webhook_url")
        if not webhook_url:
            logger.warning("Discord notifier missing webhook URL", extra={"tenant_id": str(event.tenant_id)})
            return
        payload = {
            "username": config.get("username") or "TaskR",
            "content": self._format_text(message),
        }
        if embeds := config.get("embeds"):
            payload["embeds"] = embeds
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=10.0)
        response = await self._http.post(webhook_url, json=payload)
        if response.status_code >= 400 and settings.notification_log_failures:
            logger.warning(
                "Discord webhook delivery failed",
                extra={
                    "tenant_id": str(event.tenant_id),
                    "status": response.status_code,
                    "body": response.text[:200],
                },
            )

    async def _send_sms(self, config: dict[str, Any], message: NotificationMessage, event: NotificationEvent) -> None:
        recipients = list((config or {}).get("recipients") or [])
        if not recipients:
            logger.warning("SMS notifier missing recipients", extra={"tenant_id": str(event.tenant_id)})
            return
        account_sid = config.get("account_sid") or settings.twilio_account_sid
        auth_token = config.get("auth_token") or settings.twilio_auth_token
        from_number = config.get("from_number") or settings.twilio_from_number
        if not account_sid or not auth_token or not from_number:
            logger.warning(
                "SMS notifier missing credentials",
                extra={"tenant_id": str(event.tenant_id)},
            )
            return
        body = message.body if len(message.body) <= 320 else message.body[:317] + "..."
        if message.cta_path:
            body = f"{body}\n{message.cta_path}"
        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=10.0)
        for recipient in recipients:
            data = {"From": from_number, "To": recipient, "Body": body}
            response = await self._http.post(url, data=data, auth=(account_sid, auth_token))
            if response.status_code >= 400 and settings.notification_log_failures:
                logger.warning(
                    "SMS delivery failure",
                    extra={
                        "tenant_id": str(event.tenant_id),
                        "recipient": recipient,
                        "status": response.status_code,
                        "body": response.text[:200],
                    },
                )

    @staticmethod
    def _format_text(message: NotificationMessage) -> str:
        lines = [message.title.strip()]
        if message.body:
            lines.append(message.body.strip())
        if message.cta_path:
            lines.append(message.cta_path.strip())
        return "\n".join(line for line in lines if line)


notification_service = NotificationService()

__all__ = ["notification_service", "NotificationService", "NotificationEvent"]
