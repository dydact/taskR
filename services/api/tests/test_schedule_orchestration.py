from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import select

pytest.importorskip("aiosqlite")

from app.models.base import Base
from app.models.core import ScheduleTimeline
from app.services.schedule_orchestration import merge_schedule_events, ScheduleOrchestrator, ScheduleSyncResult


class StubBus:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def publish(self, event: dict) -> None:
        self.events.append(event)


class StubScrClient:
    def __init__(self, events: list[dict]) -> None:
        self._events = events

    async def timeline_events(self, *_args, **_kwargs) -> list[dict]:
        return self._events


class StubOpenEmrClient:
    def __init__(self, appointments: list[dict]) -> None:
        self._appointments = appointments

    async def list_appointments(self, *_args, **_kwargs) -> list[dict]:
        return self._appointments


@pytest.mark.asyncio
async def test_merge_schedule_events_upserts_and_detects_conflicts():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    tenant_id = uuid.uuid4()
    bus = StubBus()

    scr_events = [
        {
            "timeline_id": 101,
            "status": "completed",
            "created_ts": "2025-01-01T10:00:00Z",
            "session": {
                "session_id": 555,
                "service_code": "aba.60",
                "start_ts": "2025-01-01T09:00:00Z",
                "end_ts": "2025-01-01T10:00:00Z",
                "provider_user_id": 42,
                "pid": 77,
            },
            "client": {"client_id": 77, "display_name": "Client One"},
            "metadata": {"service_code": "therapy.session", "cpt_code": "97110"},
        }
    ]

    openemr_events = [
        {
            "scr_timeline_id": 101,
            "appointment_id": "apt-1",
            "status": "cancelled",
            "start": "2025-01-01T09:00:00Z",
            "end": "2025-01-01T10:00:00Z",
            "provider_external_id": "prov-9",
            "patient_external_id": "pat-1",
            "billing": {"code": "99213", "service_type": "therapy"},
        }
    ]

    async with async_session() as session:
        summary = await merge_schedule_events(
            session,
            tenant_id=tenant_id,
            scr_events=scr_events,
            openemr_events=openemr_events,
            guardrail_bus=bus,
        )
        await session.commit()

        assert summary.created >= 1
        assert summary.updated >= 1
        assert summary.sources["scr"] == 1
        assert summary.sources["openemr"] == 1
        assert summary.conflicts, "Expected scr/openemr conflict due to cancelled appointment"
        conflict_reasons = {conflict.reason for conflict in summary.conflicts}
        assert "openemr_status_conflict" in conflict_reasons
        assert bus.events, "Guardrail bus should receive published events"

        rows = (await session.execute(select(ScheduleTimeline))).scalars().all()
        assert len(rows) == 1
        row = rows[0]
        assert row.status in {"cancelled", "scheduled", "worked"}
        metadata = row.metadata_json
        sources = metadata.get("sources", {})
        assert "scr" in sources
        assert "openemr" in sources
        assert metadata.get("alerts"), "Conflict should be stored in metadata alerts"


@pytest.mark.asyncio
async def test_schedule_orchestrator_handles_missing_clients():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    tenant_id = uuid.uuid4()
    headers = type("Headers", (), {"tenant_id": str(tenant_id)})()

    # Orchestrator with stub clients to ensure sync delegates correctly
    bus = StubBus()
    orchestrator = ScheduleOrchestrator(
        scr_client=StubScrClient([]),
        openemr_client=StubOpenEmrClient([]),
        bus=bus,
    )

    async with async_session() as session:
        result: ScheduleSyncResult = await orchestrator.sync(
            session,
            tenant_id=tenant_id,
            headers=headers,
        )
        await session.commit()

    assert result.sources["scr"] == 0
    assert result.sources["openemr"] == 0
    assert result.created == 0
    assert result.updated == 0
    assert not result.conflicts
