from __future__ import annotations

import sys
import types
import uuid

if "asyncpg" not in sys.modules:
    sys.modules["asyncpg"] = types.ModuleType("asyncpg")

import pytest

from app.services.memory import MemoryJob, MemoryQueueService


@pytest.fixture
def service() -> MemoryQueueService:
    return MemoryQueueService()


@pytest.mark.asyncio
async def test_handle_job_success_calls_ingest(monkeypatch, service: MemoryQueueService):
    job = MemoryJob(
        queue_id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        resource_type="task",
        resource_id=uuid.uuid4(),
        payload={},
        attempts=0,
    )

    captured: dict[str, object] = {}

    async def fake_build(job_arg: MemoryJob):
        assert job_arg is job
        return {
            "tenant_id": str(job.tenant_id),
            "resource_type": job.resource_type,
            "resource_id": str(job.resource_id),
            "title": "Example Task",
            "content": "Task description",
            "tags": [],
            "metadata": {},
        }

    async def fake_send(job_arg: MemoryJob, dossier: dict):
        captured["dossier"] = dossier

    async def fake_store(job_arg: MemoryJob, dossier: dict):
        captured["embedding_called"] = True

    async def fake_complete(queue_id):
        captured["completed"] = queue_id

    monkeypatch.setattr(service, "_build_dossier", fake_build)
    monkeypatch.setattr(service, "_send_to_mempods", fake_send)
    monkeypatch.setattr(service, "_maybe_store_embedding", fake_store)
    monkeypatch.setattr(service, "_mark_completed", fake_complete)

    await service._handle_job(job)

    assert captured["completed"] == job.queue_id
    dossier = captured["dossier"]
    assert dossier["resource_id"] == str(job.resource_id)
    assert "Task description" in dossier["content"]
    assert captured["embedding_called"] is True


@pytest.mark.asyncio
async def test_handle_job_failure_marks_retry(monkeypatch, service: MemoryQueueService):
    job = MemoryJob(
        queue_id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        resource_type="task",
        resource_id=uuid.uuid4(),
        payload={},
        attempts=1,
    )

    async def fake_build(job_arg: MemoryJob):
        return {
            "tenant_id": str(job_arg.tenant_id),
            "resource_type": job_arg.resource_type,
            "resource_id": str(job_arg.resource_id),
            "title": "Example Task",
            "content": "Task description",
            "tags": [],
            "metadata": {},
        }

    async def fake_store(*_args, **_kwargs):
        pass

    async def fake_fail(*_args, **_kwargs):
        raise RuntimeError("boom")

    recorded: dict[str, object] = {}

    async def fake_mark_failed(queue_id, error, previous_attempts):
        recorded["queue_id"] = queue_id
        recorded["error"] = error
        recorded["attempts"] = previous_attempts

    async def fake_mark_completed(_queue_id):
        pytest.fail("mark_completed should not be called on failure path")

    monkeypatch.setattr(service, "_build_dossier", fake_build)
    monkeypatch.setattr(service, "_send_to_mempods", fake_fail)
    monkeypatch.setattr(service, "_maybe_store_embedding", fake_store)
    monkeypatch.setattr(service, "_mark_failed", fake_mark_failed)
    monkeypatch.setattr(service, "_mark_completed", fake_mark_completed)

    await service._handle_job(job)

    assert recorded["queue_id"] == job.queue_id
    assert "boom" in str(recorded["error"])
    assert recorded["attempts"] == job.attempts


@pytest.mark.asyncio
async def test_send_to_mempods_requests_with_token(service: MemoryQueueService):
    job = MemoryJob(
        queue_id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        resource_type="task",
        resource_id=uuid.uuid4(),
        payload={},
        attempts=0,
    )

    from app.core.config import settings

    original_url = settings.mempods_url
    original_token = settings.mempods_api_token
    try:
        settings.mempods_url = "https://mempods.example"
        settings.mempods_api_token = "token-123"

        requests: dict[str, object] = {}

        class DummyClient:
            async def post(self, url, json=None, headers=None):
                requests["url"] = url
                requests["json"] = json
                requests["headers"] = headers

                class DummyResponse:
                    def raise_for_status(self):
                        return None

                return DummyResponse()

        service._http = DummyClient()

        dossier = {
            "tenant_id": str(job.tenant_id),
            "resource_type": job.resource_type,
            "resource_id": str(job.resource_id),
            "title": "Example Task",
            "content": "Task description",
            "tags": [],
            "metadata": {},
        }

        await service._send_to_mempods(job, dossier)

        assert requests["url"] == "https://mempods.example/api/v1/dossiers"
        assert requests["json"]["title"] == "Example Task"
        assert requests["headers"]["Authorization"] == "Bearer token-123"
    finally:
        settings.mempods_url = original_url
        settings.mempods_api_token = original_token
