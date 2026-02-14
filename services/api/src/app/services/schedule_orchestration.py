from __future__ import annotations

import math
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Iterable

from sqlalchemy.ext.asyncio import AsyncSession

from app.events.bus import EventBus, event_bus
from app.models.core import ScheduleTimeline

# Namespaces for deterministic UUID generation so cross-system identifiers remain stable.
SCR_TIMELINE_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "taskr.scraiv.timeline")
SCR_SESSION_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "taskr.scraiv.session")
SCR_STAFF_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "taskr.scraiv.staff")
SCR_CLIENT_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "taskr.scraiv.client")
SCR_CLAIM_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "taskr.scraiv.claim")
OPENEMR_APPOINTMENT_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "taskr.openemr.appointment")
OPENEMR_PROVIDER_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "taskr.openemr.provider")
OPENEMR_PATIENT_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "taskr.openemr.patient")

# Status normalization maps
SCR_STATUS_MAP = {
    "planned": "scheduled",
    "confirmed": "scheduled",
    "in_progress": "worked",
    "completed": "worked",
    "billed": "exported",
    "voided": "void",
    "cancelled": "cancelled",
}

OPENEMR_STATUS_MAP = {
    "scheduled": "scheduled",
    "checked_in": "worked",
    "in_progress": "worked",
    "completed": "worked",
    "billed": "exported",
    "cancelled": "cancelled",
    "no_show": "no_show",
}


@dataclass
class ScheduleSyncConflict:
    timeline_id: uuid.UUID
    reason: str
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class ScheduleSyncResult:
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    sources: dict[str, int] = field(default_factory=dict)
    conflicts: list[ScheduleSyncConflict] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "created": self.created,
            "updated": self.updated,
            "unchanged": self.unchanged,
            "sources": self.sources,
            "conflicts": [
                {"timeline_id": str(conflict.timeline_id), "reason": conflict.reason, "details": conflict.details}
                for conflict in self.conflicts
            ],
        }


def _deterministic_uuid(namespace: uuid.UUID, tenant_id: uuid.UUID, external_id: Any | None) -> uuid.UUID | None:
    if external_id is None:
        return None
    value = str(external_id).strip()
    if not value:
        return None
    return uuid.uuid5(namespace, f"{tenant_id}:{value}")


def _parse_dt(raw: Any) -> datetime | None:
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=UTC)
    value = str(raw).strip()
    if not value:
        return None
    # Normalize trailing Z
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _minutes_between(start: datetime | None, end: datetime | None) -> int | None:
    if not start or not end:
        return None
    seconds = (end - start).total_seconds()
    if seconds < 0:
        return None
    return int(math.ceil(seconds / 60))


def _merge_metadata(existing: dict[str, Any] | None, source_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    metadata = dict(existing or {})
    sources = dict(metadata.get("sources") or {})
    sources[source_key] = payload
    metadata["sources"] = sources
    return metadata


def _metadata_conflicts(metadata: dict[str, Any]) -> list[dict[str, Any]]:
    alerts = metadata.get("alerts")
    if isinstance(alerts, list):
        return alerts
    return []


def _update_conflicts(metadata: dict[str, Any], conflict: dict[str, Any]) -> dict[str, Any]:
    updated = dict(metadata)
    alerts = list(metadata.get("alerts") or [])
    alerts.append(conflict)
    updated["alerts"] = alerts
    return updated


async def _get_timeline(session: AsyncSession, timeline_id: uuid.UUID) -> ScheduleTimeline | None:
    return await session.get(ScheduleTimeline, timeline_id)


def _apply_scr_event(
    row: ScheduleTimeline,
    tenant_id: uuid.UUID,
    event: dict[str, Any],
) -> bool:
    changed = False

    timeline_status = str(event.get("status") or "").lower()
    target_status = SCR_STATUS_MAP.get(timeline_status, timeline_status or row.status)

    session_info = event.get("session") or {}
    metadata = event.get("metadata") or {}
    claim_info = event.get("claim")
    timesheet_info = event.get("timesheet") or {}
    schedule_rule = event.get("schedule_rule") or {}
    client_info = event.get("client") or {}

    session_id = _deterministic_uuid(SCR_SESSION_NAMESPACE, tenant_id, session_info.get("session_id"))
    if session_id and row.session_id != session_id:
        row.session_id = session_id
        changed = True

    provider_uuid = _deterministic_uuid(SCR_STAFF_NAMESPACE, tenant_id, session_info.get("provider_user_id"))
    if provider_uuid and row.staff_id != provider_uuid:
        row.staff_id = provider_uuid
        changed = True

    client_uuid = _deterministic_uuid(SCR_CLIENT_NAMESPACE, tenant_id, (session_info.get("pid") or client_info.get("client_id")))
    if client_uuid and row.patient_id != client_uuid:
        row.patient_id = client_uuid
        changed = True

    start = (
        _parse_dt(session_info.get("start_ts"))
        or _parse_dt(metadata.get("start_ts"))
        or _parse_dt(event.get("created_ts"))
        or row.scheduled_start
    )
    end = _parse_dt(session_info.get("end_ts")) or _parse_dt(metadata.get("end_ts"))
    if not end and start and schedule_rule.get("duration_minutes"):
        end = start + timedelta(minutes=int(schedule_rule["duration_minutes"]))  # type: ignore[arg-type]
    if start and row.scheduled_start != start:
        row.scheduled_start = start
        changed = True
    if end and row.scheduled_end != end:
        row.scheduled_end = end
        changed = True

    computed_duration = _minutes_between(start, end)
    if computed_duration is not None and row.duration_minutes != computed_duration:
        row.duration_minutes = computed_duration
        changed = True

    service_code = session_info.get("service_code") or metadata.get("service_code") or row.service_type
    if service_code and row.service_type != service_code:
        row.service_type = service_code
        changed = True

    if metadata.get("cpt_code") and row.cpt_code != metadata["cpt_code"]:
        row.cpt_code = metadata["cpt_code"]
        changed = True

    if target_status and row.status != target_status:
        row.status = target_status
        changed = True

    if claim_info and claim_info.get("claim_id"):
        claim_uuid = _deterministic_uuid(SCR_CLAIM_NAMESPACE, tenant_id, claim_info["claim_id"])
        if claim_uuid and row.claim_id != claim_uuid:
            row.claim_id = claim_uuid
            changed = True

    scr_metadata = {
        "timeline_id": event.get("timeline_id"),
        "status": timeline_status,
        "history": event.get("history"),
        "session": session_info,
        "client": client_info,
        "schedule_rule": schedule_rule,
        "timesheet": timesheet_info,
        "claim": claim_info,
        "metadata": metadata,
    }

    next_metadata = _merge_metadata(row.metadata_json, "scr", scr_metadata)
    if next_metadata != row.metadata_json:
        row.metadata_json = next_metadata
        changed = True

    return changed


def _apply_openemr_event(
    row: ScheduleTimeline,
    tenant_id: uuid.UUID,
    event: dict[str, Any],
) -> tuple[bool, list[ScheduleSyncConflict]]:
    changed = False
    conflicts: list[ScheduleSyncConflict] = []

    appointment_id = event.get("appointment_id")
    status_raw = (event.get("status") or "").lower()
    target_status = OPENEMR_STATUS_MAP.get(status_raw, status_raw or row.status)

    provider_uuid = _deterministic_uuid(OPENEMR_PROVIDER_NAMESPACE, tenant_id, event.get("provider_external_id"))
    if provider_uuid and row.staff_id != provider_uuid:
        row.staff_id = provider_uuid
        changed = True

    patient_uuid = _deterministic_uuid(OPENEMR_PATIENT_NAMESPACE, tenant_id, event.get("patient_external_id"))
    if patient_uuid and row.patient_id != patient_uuid:
        row.patient_id = patient_uuid
        changed = True

    start = _parse_dt(event.get("start")) or row.scheduled_start
    end = _parse_dt(event.get("end")) or row.scheduled_end
    if start and row.scheduled_start != start:
        row.scheduled_start = start
        changed = True
    if end and row.scheduled_end != end:
        row.scheduled_end = end
        changed = True

    duration = _minutes_between(start, end)
    if duration is not None and row.duration_minutes != duration:
        row.duration_minutes = duration
        changed = True

    billing = event.get("billing") or {}
    if billing.get("code") and row.cpt_code != billing["code"]:
        row.cpt_code = billing["code"]
        changed = True

    if billing.get("service_type") and row.service_type != billing["service_type"]:
        row.service_type = billing["service_type"]
        changed = True

    if target_status and row.status != target_status:
        row.status = target_status
        changed = True

    openemr_metadata = {
        "appointment_id": appointment_id,
        "status": status_raw,
        "billing": billing,
        "location_id": event.get("location_id"),
        "notes": event.get("notes"),
        "policy_flags": event.get("policy_flags"),
    }

    next_metadata = _merge_metadata(row.metadata_json, "openemr", openemr_metadata)

    # Conflict detection
    scr_status = (next_metadata.get("sources", {}).get("scr", {}) or {}).get("status")
    if scr_status in {"completed", "billed", "exported"} and target_status in {"cancelled", "no_show"}:
        conflicts.append(
            ScheduleSyncConflict(
                timeline_id=row.timeline_id,
                reason="openemr_status_conflict",
                details={
                    "scr_status": scr_status,
                    "openemr_status": target_status,
                    "appointment_id": appointment_id,
                },
            )
        )
        next_metadata = _update_conflicts(
            next_metadata,
            {
                "type": "status_conflict",
                "scr_status": scr_status,
                "openemr_status": target_status,
                "appointment_id": appointment_id,
            },
        )

    if billing.get("code") and row.cpt_code and billing["code"] != row.cpt_code:
        conflicts.append(
            ScheduleSyncConflict(
                timeline_id=row.timeline_id,
                reason="billing_code_mismatch",
                details={
                    "appointment_id": appointment_id,
                    "openemr_code": billing["code"],
                    "taskr_code": row.cpt_code,
                },
            )
        )
        next_metadata = _update_conflicts(
            next_metadata,
            {
                "type": "billing_code_mismatch",
                "openemr_code": billing["code"],
                "taskr_code": row.cpt_code,
            },
        )

    if next_metadata != row.metadata_json:
        row.metadata_json = next_metadata
        changed = True

    return changed, conflicts


async def merge_schedule_events(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    scr_events: Iterable[dict[str, Any]],
    openemr_events: Iterable[dict[str, Any]],
    guardrail_bus: EventBus | None = None,
) -> ScheduleSyncResult:
    result = ScheduleSyncResult()
    guardrail = guardrail_bus or event_bus

    # Process scrAIv timeline events
    scr_events_list = list(scr_events)
    result.sources["scr"] = len(scr_events_list)

    for event in scr_events_list:
        timeline_ext = event.get("timeline_id")
        if timeline_ext is None:
            continue
        timeline_uuid = _deterministic_uuid(SCR_TIMELINE_NAMESPACE, tenant_id, timeline_ext)
        if timeline_uuid is None:
            continue
        row = await _get_timeline(session, timeline_uuid)
        created = False
        if row is None:
            row = ScheduleTimeline(
                timeline_id=timeline_uuid,
                tenant_id=tenant_id,
                session_id=_deterministic_uuid(
                    SCR_SESSION_NAMESPACE,
                    tenant_id,
                    (event.get("session") or {}).get("session_id") or timeline_ext,
                )
                or uuid.uuid4(),
                service_type="scheduled",
                scheduled_start=datetime.now(UTC),
                scheduled_end=datetime.now(UTC),
                status="scheduled",
            )
            session.add(row)
            created = True
        if _apply_scr_event(row, tenant_id, event):
            if created:
                result.created += 1
            else:
                result.updated += 1
        else:
            if created:
                result.created += 1
            else:
                result.unchanged += 1

    await session.flush()

    # Process openemr appointments
    openemr_events_list = list(openemr_events)
    result.sources["openemr"] = len(openemr_events_list)

    for event in openemr_events_list:
        timeline_uuid: uuid.UUID | None = None
        if event.get("scr_timeline_id") is not None:
            timeline_uuid = _deterministic_uuid(SCR_TIMELINE_NAMESPACE, tenant_id, event["scr_timeline_id"])
        if timeline_uuid is None:
            timeline_uuid = _deterministic_uuid(OPENEMR_APPOINTMENT_NAMESPACE, tenant_id, event.get("appointment_id"))
        if timeline_uuid is None:
            continue

        row = await _get_timeline(session, timeline_uuid)
        created = False
        if row is None:
            row = ScheduleTimeline(
                timeline_id=timeline_uuid,
                tenant_id=tenant_id,
                session_id=_deterministic_uuid(
                    OPENEMR_APPOINTMENT_NAMESPACE,
                    tenant_id,
                    event.get("appointment_id"),
                )
                or uuid.uuid4(),
                service_type=event.get("billing", {}).get("service_type") or "scheduled",
                scheduled_start=_parse_dt(event.get("start")) or datetime.now(UTC),
                scheduled_end=_parse_dt(event.get("end")) or datetime.now(UTC),
                status=OPENEMR_STATUS_MAP.get((event.get("status") or "").lower(), "scheduled"),
            )
            session.add(row)
            created = True

        row_changed, conflicts = _apply_openemr_event(row, tenant_id, event)
        if conflicts:
            result.conflicts.extend(conflicts)
            for conflict in conflicts:
                await guardrail.publish(
                    {
                        "type": "schedule.guardrail",
                        "tenant_id": str(tenant_id),
                        "timeline_id": str(conflict.timeline_id),
                        "reason": conflict.reason,
                        "details": conflict.details,
                    }
                )

        if row_changed:
            if created:
                result.created += 1
            else:
                result.updated += 1
        else:
            if created:
                result.created += 1
            else:
                result.unchanged += 1

    return result


class ScheduleOrchestrator:
    """Coordinates schedule+HR synchronization across scrAIv and openemr."""

    def __init__(
        self,
        *,
        scr_client: Any | None,
        openemr_client: Any | None,
        bus: EventBus | None = None,
    ) -> None:
        self._scr_client = scr_client
        self._openemr_client = openemr_client
        self._bus = bus or event_bus

    async def sync(  # noqa: D401
        self,
        session: AsyncSession,
        *,
        tenant_id: uuid.UUID,
        headers: Any,
        since: str | None = None,
    ) -> ScheduleSyncResult:
        """Fetch timeline data from external systems and reconcile TaskR schedule state."""
        scr_events: list[dict[str, Any]] = []
        if self._scr_client is not None:
            try:
                scr_events = await self._scr_client.timeline_events(headers, from_ts=since)
            except Exception:
                scr_events = []

        openemr_events: list[dict[str, Any]] = []
        if self._openemr_client is not None:
            try:
                openemr_events = await self._openemr_client.list_appointments(headers, since=since)
            except Exception:
                openemr_events = []

        result = await merge_schedule_events(
            session,
            tenant_id=tenant_id,
            scr_events=scr_events,
            openemr_events=openemr_events,
            guardrail_bus=self._bus,
        )
        # Ensure the source counters reflect the actual fetch counts.
        result.sources["scr"] = len(scr_events)
        result.sources["openemr"] = len(openemr_events)
        return result


__all__ = [
    "ScheduleOrchestrator",
    "ScheduleSyncResult",
    "ScheduleSyncConflict",
    "merge_schedule_events",
]
