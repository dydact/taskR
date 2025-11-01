from __future__ import annotations

import pytest

import sys
from pathlib import Path

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/api/src"))

from app.services.flows import FlowValidationError, validate_flow_definition


def test_validate_flow_definition_accepts_linear_flow():
    payload = {
        "nodes": [
            {"id": "start", "type": "input"},
            {"id": "process", "type": "task"},
            {"id": "done", "type": "output"},
        ],
        "edges": [
            {"from": "start", "to": "process"},
            {"from": "process", "to": "done"},
        ],
    }
    validate_flow_definition(payload)


def test_validate_flow_definition_rejects_cycle():
    payload = {
        "nodes": [
            {"id": "a", "type": "task"},
            {"id": "b", "type": "task"},
        ],
        "edges": [
            {"from": "a", "to": "b"},
            {"from": "b", "to": "a"},
        ],
    }
    with pytest.raises(FlowValidationError):
        validate_flow_definition(payload)
