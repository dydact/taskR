from __future__ import annotations

import pytest

import sys
from pathlib import Path

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/api/src"))

from app.services.insight import InsightClient, summarize_lines


def test_summarize_lines_truncates_long_output():
    text = summarize_lines(["A" * 300], max_length=50)
    assert len(text) <= 50
    assert text.endswith("...")


@pytest.mark.asyncio
async def test_insight_client_falls_back_without_api():
    client = InsightClient(base_url=None, timeout=1.0)
    result = await client.summarize_meeting(
        tenant_id="test-tenant",
        content="Kickoff discussion. Next steps pending",
        action_items=[{"title": "Prepare handoff deck"}],
    )
    assert result.source == "fallback"
    assert "Kickoff discussion" in result.text
    assert "Action: Prepare handoff deck" in result.text


@pytest.mark.asyncio
async def test_autopm_fallback_includes_context():
    client = InsightClient(base_url=None, timeout=1.0)
    result = await client.summarize_autopm(
        tenant_id="test-tenant",
        task_title="Submit Q3 report",
        due_at="2024-08-01T09:00:00Z",
        metadata={"status": "in_progress", "priority": "high", "assignee": "Jamie"},
    )
    assert result.source == "fallback"
    assert "Submit Q3 report" in result.text
    assert "Jamie" in result.text
    assert "in_progress" in result.text
