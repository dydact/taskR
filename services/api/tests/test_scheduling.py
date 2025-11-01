from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/api/src"))
sys.path.insert(0, str(REPO_ROOT / "packages/common_auth/src"))

from app.routes.scheduling import _serialize_message
from app.schemas import NegotiationMessageCreate, SchedulingNegotiationRead


def test_serialize_message_adds_timestamp_and_defaults():
    payload = NegotiationMessageCreate(author="TaskR", channel="email", body="Checking availability", metadata={"attempt": 1})
    message, recorded_at = _serialize_message(payload)

    assert message["author"] == "TaskR"
    assert message["channel"] == "email"
    assert message["body"] == "Checking availability"
    assert message["metadata"] == {"attempt": 1}
    assert "recorded_at" in message
    parsed_timestamp = datetime.fromisoformat(message["recorded_at"])
    assert parsed_timestamp.tzinfo is not None
    assert abs((parsed_timestamp - recorded_at).total_seconds()) < 1


def test_negotiation_schema_parses_message_records():
    recorded_at = datetime.now(UTC)
    payload = {
        "negotiation_id": "11111111-1111-1111-1111-111111111111",
        "tenant_id": "22222222-2222-2222-2222-222222222222",
        "subject": "Schedule project sync",
        "channel_type": "email",
        "participants": ["lead@acme.co"],
        "metadata_json": {},
        "external_thread_id": None,
        "status": "pending",
        "messages": [
            {
                "recorded_at": recorded_at.isoformat(),
                "author": "TaskR",
                "channel": "email",
                "body": "Can we meet on Tuesday?",
                "metadata": {"attempt": 1},
            }
        ],
        "last_message_at": recorded_at,
        "created_at": recorded_at,
        "updated_at": recorded_at,
    }

    negotiation = SchedulingNegotiationRead.model_validate(payload)
    assert negotiation.messages[0].recorded_at == recorded_at
    assert negotiation.messages[0].metadata == {"attempt": 1}
