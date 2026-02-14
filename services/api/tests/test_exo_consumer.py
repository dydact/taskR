from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.events.exo_consumer import build_assignment_payload, build_event_payload
from common_agents import AssignmentEventType, AssignmentPriority, AssignmentStatus


def test_build_assignment_payload_defaults() -> None:
    tenant_id = str(uuid.uuid4())
    assignment_id = str(uuid.uuid4())
    agent_id = str(uuid.uuid4())
    data = {
        "assignment_id": assignment_id,
        "tenant_id": tenant_id,
        "agent_id": agent_id,
        "node_id": "node-001",
        "agent_slug": "exo.agent.demo",
        "tags": ["exo", "demo"],
        "metadata": {"source": "exo"},
        "context": {"source": "exo"},
    }

    payload = build_assignment_payload(tenant_id, data)

    assert payload.assignment_id == assignment_id
    assert payload.tenant_id == tenant_id
    assert payload.agent_id == agent_id
    assert payload.status == AssignmentStatus.RESERVED
    assert payload.priority == AssignmentPriority.NORMAL
    assert payload.agent_slug.startswith("exo.")
    assert "exo" in payload.tags
    assert payload.feature_flags == []
    assert payload.metadata["source"] == "exo"
    assert payload.context["source"] == "exo"


def test_build_event_payload_with_metadata() -> None:
    tenant_id = str(uuid.uuid4())
    assignment_id = str(uuid.uuid4())
    data = {
        "assignment_id": assignment_id,
        "tenant_id": tenant_id,
        "agent_id": str(uuid.uuid4()),
        "node_id": "node-002",
        "status": "active",
        "priority": "high",
        "agent_slug": "exo.agent.demo",
        "tags": ["exo", "demo"],
        "metadata": {"source": "exo"},
        "context": {"source": "exo"},
    }
    assignment_payload = build_assignment_payload(tenant_id, data)
    occurred_at = datetime.now(UTC)
    envelope = {"actor": "exo.scheduler", "correlation_id": "corr-123"}
    headers = {"x-request-id": "req-123"}

    event_payload = build_event_payload(
        tenant_id,
        "exo.agent.updated",
        occurred_at,
        assignment_payload,
        envelope,
        headers,
    )

    assert event_payload.event_type == AssignmentEventType.STATUS_CHANGED
    assert event_payload.assignment_id == assignment_id
    assert event_payload.tenant_id == tenant_id
    assert event_payload.payload["status"] == AssignmentStatus.ACTIVE.value
    assert event_payload.metadata["source_event"] == "exo.agent.updated"
    assert event_payload.metadata["actor"] == "exo.scheduler"
    assert event_payload.metadata["correlation_id"] == "corr-123"
    assert event_payload.metadata["headers"] == headers
