from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from starlette.requests import Request

import sys
from pathlib import Path

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/api/src"))
sys.path.insert(0, str(REPO_ROOT / "packages/common_auth/src"))
sys.path.insert(0, str(REPO_ROOT / "packages/common_events/src"))

from app.core.config import settings
from app.routes.tasks import _linkage_payload, _emit_linkage_event
from app.schemas import TaskRead


def _sample_task_read() -> TaskRead:
    now = datetime.now(UTC)
    return TaskRead(
        task_id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        title="Example",
        description=None,
        status="backlog",
        priority="medium",
        due_at=None,
        assignee_id=None,
        created_by_id=None,
        metadata_json={"scr_link": {"session_id": "sess-1", "client_id": "client-9"}},
        list_id=uuid.uuid4(),
        space_id=uuid.uuid4(),
        created_at=now,
        updated_at=now,
        custom_fields=[],
    )


def test_linkage_payload_structure():
    task = _sample_task_read()
    payload = _linkage_payload("created", task)

    assert payload["action"] == "created"
    assert payload["task"]["id"] == str(task.task_id)
    assert payload["scr"]["session_id"] == "sess-1"
    assert payload["scr"]["client_id"] == "client-9"
    assert "occurred_at" in payload


class FakePublisher:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict]] = []

    async def publish(self, topic: str, tenant_id: str, payload: dict) -> None:
        self.calls.append((topic, tenant_id, payload))


@pytest.mark.asyncio
async def test_emit_linkage_event_uses_app_state_publisher():
    task = _sample_task_read()
    app = FastAPI()
    publisher = FakePublisher()
    app.state.event_publisher = publisher

    async def receive() -> dict:
        await asyncio.sleep(0)
        return {"type": "http.request"}

    request = Request({"type": "http", "app": app}, receive)  # type: ignore[arg-type]

    await _emit_linkage_event(request, "created", task)

    assert publisher.calls
    topic, tenant_id, payload = publisher.calls[0]
    assert tenant_id == str(task.tenant_id)
    assert payload["task"]["title"] == task.title
    assert topic == settings.scr_linkage_subject
