from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any, Dict, Optional

from nats.aio.client import Client as NATS
from nats.aio.msg import Msg
from pydantic import ValidationError

from app.core.config import settings
from app.core.db import get_session
from app.schemas import AssignmentEventRead, AssignmentRead
from app.services.dedicated import get_assignment, record_assignment_event, upsert_assignment
from app.services.dedicated_events import DEDICATED_TOPIC, emit_assignment_event
from common_agents import AssignmentEventPayload, AssignmentEventType, AssignmentPayload, AssignmentStatus

logger = logging.getLogger(__name__)

EXO_ASSIGNMENT_EVENTS = {
    "exo.agent.assigned",
    "exo.agent.updated",
    "exo.agent.released",
}


def _parse_dt(value: Any) -> Optional[datetime]:
    if value in (None, "", 0):
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def build_assignment_payload(tenant_id: str, data: Dict[str, Any]) -> AssignmentPayload:
    """Build the canonical AssignmentPayload directly from the upstream schema."""

    payload: Dict[str, Any] = dict(data or {})
    payload.setdefault("tenant_id", tenant_id)

    assignment_id = payload.get("assignment_id")
    if assignment_id is not None:
        payload["assignment_id"] = str(assignment_id)

    tenant_value = payload.get("tenant_id")
    if tenant_value is not None:
        payload["tenant_id"] = str(tenant_value)

    # Preserve upstream UUID types but normalise to strings when present.
    if payload.get("agent_id") is not None:
        payload["agent_id"] = str(payload["agent_id"])
    if payload.get("department_id") is not None:
        payload["department_id"] = str(payload["department_id"])

    # Support legacy timestamp keys during rollout.
    if "expires_at" not in payload and "expires_ts" in payload:
        payload["expires_at"] = _parse_dt(payload.pop("expires_ts"))
    if "created_at" not in payload and "created_ts" in payload:
        payload["created_at"] = _parse_dt(payload.pop("created_ts"))
    if "updated_at" not in payload and "updated_ts" in payload:
        payload["updated_at"] = _parse_dt(payload.pop("updated_ts"))

    return AssignmentPayload.model_validate(payload)


def build_event_payload(
    tenant_id: str,
    event_name: str,
    occurred_at: Optional[datetime],
    assignment: AssignmentPayload,
    envelope: Dict[str, Any],
    headers: Dict[str, Any],
) -> AssignmentEventPayload:
    event_type = AssignmentEventType.STATUS_CHANGED
    if event_name == "exo.agent.assigned":
        event_type = AssignmentEventType.STATUS_CHANGED
    elif event_name == "exo.agent.released":
        event_type = AssignmentEventType.STATUS_CHANGED

    metadata: Dict[str, Any] = {}
    actor = envelope.get("actor")
    if actor:
        metadata["actor"] = actor
    correlation = envelope.get("correlation_id")
    if correlation:
        metadata["correlation_id"] = correlation
    if headers:
        metadata["headers"] = headers
    metadata["source_event"] = event_name

    payload = {
        "status": assignment.status.value if isinstance(assignment.status, AssignmentStatus) else assignment.status,
        "node_id": assignment.node_id,
    }
    if assignment.agent_id:
        payload["agent_id"] = str(assignment.agent_id)

    occurred = occurred_at or assignment.updated_at or datetime.now(UTC)

    return AssignmentEventPayload(
        event_id=str(uuid.uuid4()),
        assignment_id=assignment.assignment_id,
        tenant_id=str(tenant_id),
        event_type=event_type,
        occurred_at=occurred,
        source="exo",
        payload=payload,
        metadata=metadata,
    )


class ExoAssignmentConsumer:
    def __init__(self) -> None:
        self._subject = settings.exo_assignment_subject
        self._queue = settings.exo_assignment_queue
        self._enabled = settings.enable_exo_consumer
        self._subscription = None
        self._nats: NATS | None = None
        self._tasks: set[asyncio.Task] = set()
        self._closing = False

    async def start(self, nats_client: NATS | None) -> None:
        if not self._enabled:
            logger.info("Exo assignment consumer disabled via configuration")
            return
        if nats_client is None or not getattr(nats_client, "is_connected", False):
            logger.warning("NATS unavailable; Exo assignment consumer not started")
            return
        self._nats = nats_client
        self._subscription = await self._nats.subscribe(
            self._subject,
            queue=self._queue,
            cb=self._on_message,
        )
        logger.info("Subscribed to Exo assignment events on subject %s (queue=%s)", self._subject, self._queue)

    async def stop(self) -> None:
        self._closing = True
        if self._subscription is not None:
            try:
                await self._subscription.unsubscribe()
            except Exception as exc:  # pragma: no cover - defensive
                logger.debug("Error unsubscribing from Exo assignment subject: %s", exc)
            self._subscription = None
        for task in list(self._tasks):
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._tasks.clear()
        self._nats = None

    async def _on_message(self, msg: Msg) -> None:
        if self._closing:
            return
        try:
            data = json.loads(msg.data.decode("utf-8"))
        except json.JSONDecodeError:
            logger.debug("Dropped malformed Exo payload: %r", msg.data)
            return
        payload = data.get("payload") or {}
        event_name = payload.get("event")
        if event_name not in EXO_ASSIGNMENT_EVENTS:
            return
        assignment_data = payload.get("assignment") or {}
        tenant_id = assignment_data.get("tenant_id") or data.get("tenant_id")
        if not tenant_id:
            logger.debug("Exo event missing tenant_id: %s", payload)
            return
        task = asyncio.create_task(
            self._process_message(
                tenant_id=str(tenant_id),
                event_name=str(event_name),
                assignment_data=assignment_data,
                envelope=payload,
                headers=data.get("headers") or {},
            )
        )
        task.add_done_callback(self._tasks.discard)
        self._tasks.add(task)

    async def _process_message(
        self,
        *,
        tenant_id: str,
        event_name: str,
        assignment_data: Dict[str, Any],
        envelope: Dict[str, Any],
        headers: Dict[str, Any],
    ) -> None:
        try:
            assignment_payload = build_assignment_payload(tenant_id, assignment_data)
        except ValidationError as exc:
            logger.error("Failed to normalise Exo assignment payload: %s", exc)
            return

        occurred_at = _parse_dt(envelope.get("occurred_ts"))
        try:
            event_payload = build_event_payload(tenant_id, event_name, occurred_at, assignment_payload, envelope, headers)
        except ValidationError as exc:
            logger.error("Failed to build assignment event payload: %s", exc)
            return

        tenant_uuid = uuid.UUID(str(assignment_payload.tenant_id or tenant_id))
        assignment_uuid = uuid.UUID(assignment_payload.assignment_id)

        assignment_body: Dict[str, Any] | None = None
        event_body: Dict[str, Any] | None = None

        async with get_session() as session:
            try:
                await upsert_assignment(session, tenant_uuid, assignment_payload)
                event_record = await record_assignment_event(session, tenant_uuid, event_payload)
                assignment_row = await get_assignment(session, tenant_uuid, assignment_uuid)
            except Exception:
                logger.exception("Failed to ingest Exo assignment event (tenant=%s, assignment=%s)", tenant_id, assignment_uuid)
                raise
            else:
                assignment_body = AssignmentRead.model_validate(assignment_row).model_dump(mode="json")
                event_body = AssignmentEventRead.model_validate(event_record).model_dump(mode="json")

        # Broadcast over SSE once the transaction is safely committed.
        try:
            if assignment_body is not None:
                await emit_assignment_event(tenant_uuid, "assignment_upserted", assignment_body)
            if event_body is not None:
                await emit_assignment_event(tenant_uuid, "assignment_event", event_body)
        except Exception:  # pragma: no cover - best effort broadcast
            logger.exception("Failed to publish assignment SSE update for tenant %s", tenant_uuid)


__all__ = ["ExoAssignmentConsumer", "build_assignment_payload", "build_event_payload"]
