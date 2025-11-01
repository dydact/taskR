from __future__ import annotations

import sys
from pathlib import Path

import pytest

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/api/src"))

from app.metrics import (
    flow_run_duration_histogram,
    flow_run_status_counter,
    record_flow_run_transition,
    observe_flow_run_duration,
    record_retention_deletions,
    retention_deletion_counter,
)


def _counter_value(counter, **labels) -> float:
    sample = counter.labels(**labels)
    return sample._value.get()  # type: ignore[attr-defined]


def _hist_count(tenant_id: str) -> float:
    for metric in flow_run_duration_histogram.collect():
        for sample in metric.samples:
            if sample.name.endswith("_count") and sample.labels.get("tenant_id") == tenant_id:
                return sample.value
    return 0.0


def test_record_flow_run_transition_increments_counter():
    before = _counter_value(flow_run_status_counter, tenant_id="t1", status="running")
    record_flow_run_transition("t1", "running")
    after = _counter_value(flow_run_status_counter, tenant_id="t1", status="running")
    assert after == pytest.approx(before + 1)


def test_observe_flow_run_duration_updates_histogram():
    tenant = "hist-tenant"
    before = _hist_count(tenant)
    observe_flow_run_duration(tenant, 45.0)
    after = _hist_count(tenant)
    assert after == pytest.approx(before + 1)


def test_record_retention_deletions_increments_counter():
    before = _counter_value(retention_deletion_counter, tenant_id="tenant-x", resource_type="meeting_note")
    record_retention_deletions("tenant-x", "meeting_note", 3)
    after = _counter_value(retention_deletion_counter, tenant_id="tenant-x", resource_type="meeting_note")
    assert after == pytest.approx(before + 3)
