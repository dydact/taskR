from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/api/src"))
sys.path.insert(0, str((REPO_ROOT / "..").resolve() / "toolfront_registry_client"))

from app.core.config import settings
from toolfront_registry_client import Registry, ToolFrontClient


@pytest.mark.integration
@pytest.mark.asyncio
async def test_toolfront_manifest_and_insight_contract() -> None:
    registry_path = settings.toolfront_registry_path or os.getenv("TOOLFRONT_REGISTRY_PATH")
    if not registry_path:
        pytest.skip("ToolFront registry path not configured")

    registry = Registry(registry_path)
    provider = registry.require_provider("insight.llm")
    assert "invoke" in provider.operations

    base_url = os.getenv("TOOLFRONT_BASE_URL") or settings.toolfront_base_url
    if not base_url:
        pytest.skip("ToolFront base URL is not configured")

    environment = settings.toolfront_env or os.getenv("TOOLFRONT_ENV") or "cloud"
    token = os.getenv("TOOLFRONT_API_TOKEN") or settings.toolfront_api_token

    async with ToolFrontClient(
        base_url=base_url,
        api_token=token,
        registry=registry,
        environment=environment,
    ) as client:
        result = await client.ask(
            tenant_id=os.getenv("TOOLFRONT_TEST_TENANT", "demo"),
            provider_id="insight.llm",
            operation="invoke",
            parameters={
                "prompt": "Respond with the word pong.",
                "task_profile": "general",
            },
        )

    data = result.get("data") if isinstance(result, dict) else None
    output = data.get("output") if isinstance(data, dict) else None
    assert isinstance(output, str) and "pong" in output.lower()
