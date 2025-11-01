from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/api/src"))

from app.events.bus import event_bus
from app.models.core import ApprovalQueueItem, AutoPMSuggestion
from app.services.approvals import enqueue_suggestion, resolve_approval


class FakeScalarResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return self

    def first(self):
        return self._items[0] if self._items else None

    def all(self):
        return list(self._items)


class FakeSession:
    def __init__(self):
        self.approvals: list[ApprovalQueueItem] = []
        self.executed: list = []

    async def execute(self, _query):
        self.executed.append(_query)
        return FakeScalarResult([item for item in self.approvals if item.status == "pending"])

    def add(self, obj):
        if isinstance(obj, ApprovalQueueItem):
            if obj.approval_id is None:
                obj.approval_id = uuid.uuid4()
            self.approvals.append(obj)

    async def flush(self):
        return None

    async def refresh(self, _obj):
        return None


@pytest.mark.asyncio
async def test_enqueue_suggestion_creates_queue_item_and_event():
    session = FakeSession()
    suggestion = AutoPMSuggestion(
        tenant_id=uuid.uuid4(),
        flow_run_id=uuid.uuid4(),
        task_id=uuid.uuid4(),
        title="Follow up on incident",
        details="",
        status="proposed",
        metadata_json={},
    )
    suggestion.suggestion_id = uuid.uuid4()

    async with event_bus.subscribe() as queue:
        approval = await enqueue_suggestion(session, suggestion, reason="high_priority_task")
        assert approval.status == "pending"
        assert approval.reason == "high_priority_task"
        assert approval.tenant_id == suggestion.tenant_id
        event = await asyncio.wait_for(queue.get(), timeout=1)
        assert event["type"] == "approvals.queue.created"
        assert event["approval_id"] == str(approval.approval_id)


@pytest.mark.asyncio
async def test_resolve_approval_updates_status_and_publishes_event():
    session = FakeSession()
    approval = ApprovalQueueItem(
        tenant_id=uuid.uuid4(),
        suggestion_id=uuid.uuid4(),
        source="autopm",
        status="pending",
        metadata_json={},
    )
    approval.approval_id = uuid.uuid4()
    suggestion = AutoPMSuggestion(
        tenant_id=approval.tenant_id,
        flow_run_id=uuid.uuid4(),
        task_id=uuid.uuid4(),
        title="Review contract",
        details="",
        status="proposed",
        metadata_json={},
    )
    suggestion.suggestion_id = approval.suggestion_id
    approval.suggestion = suggestion
    session.approvals.append(approval)

    async with event_bus.subscribe() as queue:
        resolved = await resolve_approval(
            session,
            approval,
            action="approve",
            notes="Looks good",
            metadata={"approved_by": "manager"},
        )
        assert resolved.status == "approved"
        assert resolved.resolution_notes == "Looks good"
        assert "approved_by" in resolved.metadata_json
        assert suggestion.status == "approved"
        assert suggestion.resolved_at is not None
        event = await asyncio.wait_for(queue.get(), timeout=1)
        assert event["type"] == "approvals.queue.resolved"
        assert event["approval_id"] == str(resolved.approval_id)
