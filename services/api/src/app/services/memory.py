from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.db import SessionLocal
from app.models.core import (
    Document,
    DocumentRevision,
    MemoryQueue,
    MemoryVector,
    MeetingNote,
    Task,
    TaskCustomField,
)

logger = logging.getLogger(__name__)

BACKOFF_SCHEDULE = [60, 300, 900, 3600]


@dataclass(slots=True)
class MemoryJob:
    queue_id: uuid.UUID
    tenant_id: uuid.UUID
    resource_type: str
    resource_id: uuid.UUID
    payload: dict[str, Any]
    attempts: int


@dataclass(slots=True)
class MemorySearchResult:
    resource_type: str
    resource_id: uuid.UUID
    title: str | None
    content: str | None
    snippet: str
    metadata: dict[str, Any]


def _now() -> datetime:
    return datetime.now(UTC)


def _now_naive() -> datetime:
    return datetime.utcnow()


def _add_tag(tags: set[str], tag: str | None) -> None:
    if not tag:
        return
    cleaned = str(tag).strip()
    if cleaned:
        tags.add(cleaned)


class MemoryQueueService:
    def __init__(self) -> None:
        self._shutdown = asyncio.Event()
        self._worker_task: asyncio.Task[None] | None = None
        self._poll_interval = 2.0
        self._batch_size = 10
        self._http: httpx.AsyncClient | None = None

    @property
    def running(self) -> bool:
        return self._worker_task is not None and not self._worker_task.done()

    async def start(self) -> None:
        if self.running:
            return
        self._shutdown.clear()
        timeout = settings.mempods_timeout_seconds or 10.0
        self._http = httpx.AsyncClient(timeout=timeout)
        self._worker_task = asyncio.create_task(self._worker_loop(), name="taskr-memory-queue")
        logger.info("MemoryQueueService started")

    async def stop(self) -> None:
        if not self.running:
            return
        self._shutdown.set()
        if self._worker_task:
            await self._worker_task
        self._worker_task = None
        if self._http:
            await self._http.aclose()
            self._http = None
        logger.info("MemoryQueueService stopped")

    async def enqueue(
        self,
        tenant_id: uuid.UUID,
        resource_type: str,
        resource_id: uuid.UUID,
        *,
        payload: dict[str, Any] | None = None,
        session: AsyncSession | None = None,
    ) -> None:
        payload_data = payload or {}
        now = _now()
        naive_now = _now_naive()
        statement = (
            insert(MemoryQueue)
            .values(
                tenant_id=tenant_id,
                resource_type=resource_type,
                resource_id=resource_id,
                payload=payload_data,
                status="pending",
                attempts=0,
                last_error=None,
                available_at=now,
                updated_at=naive_now,
            )
            .on_conflict_do_update(
                constraint="ux_tr_memory_queue_resource",
                set_=dict(
                    payload=payload_data,
                    status="pending",
                    attempts=0,
                    last_error=None,
                    available_at=now,
                    updated_at=naive_now,
                ),
            )
        )

        if session is not None:
            await session.execute(statement)
            return

        db_session = SessionLocal()
        try:
            await db_session.execute(statement)
            await db_session.commit()
        except Exception:
            await db_session.rollback()
            raise
        finally:
            await db_session.close()

    async def _worker_loop(self) -> None:  # pragma: no cover - wiring
        try:
            while not self._shutdown.is_set():
                jobs = await self._fetch_ready_jobs()
                if not jobs:
                    try:
                        await asyncio.wait_for(self._shutdown.wait(), timeout=self._poll_interval)
                    except asyncio.TimeoutError:
                        continue
                    continue
                for job in jobs:
                    if self._shutdown.is_set():
                        break
                    await self._handle_job(job)
        except Exception:  # pragma: no cover - defensive
            logger.exception("MemoryQueueService worker crashed; restarting")
            if not self._shutdown.is_set():
                asyncio.create_task(self._worker_loop())

    async def _fetch_ready_jobs(self) -> list[MemoryJob]:
        session = SessionLocal()
        try:
            statement = (
                select(MemoryQueue)
                .where(MemoryQueue.status == "pending", MemoryQueue.available_at <= _now())
                .order_by(MemoryQueue.created_at)
                .limit(self._batch_size)
                .with_for_update(skip_locked=True)
            )
            result = await session.execute(statement)
            rows = result.scalars().all()
            if not rows:
                await session.rollback()
                return []

            jobs: list[MemoryJob] = []
            now = _now()
            naive_now = _now_naive()
            for row in rows:
                row.status = "in_progress"
                row.updated_at = naive_now
                jobs.append(
                    MemoryJob(
                        queue_id=row.queue_id,
                        tenant_id=row.tenant_id,
                        resource_type=row.resource_type,
                        resource_id=row.resource_id,
                        payload=dict(row.payload or {}),
                        attempts=row.attempts,
                    )
                )

            await session.flush()
            await session.commit()
            return jobs
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    async def _handle_job(self, job: MemoryJob) -> None:
        try:
            dossier = await self._build_dossier(job)
            if dossier is None:
                await self._mark_completed(job.queue_id)
                return

            if not dossier["content"].strip():
                logger.debug(
                    "Skipping memPODS ingest for resource %s/%s due to empty content",
                    job.resource_type,
                    job.resource_id,
                )
                await self._mark_completed(job.queue_id)
                return

            await self._send_to_mempods(job, dossier)
            await self._maybe_store_embedding(job, dossier)
            await self._mark_completed(job.queue_id)
        except Exception as exc:
            logger.warning(
                "memPODS ingest failed for %s/%s: %s",
                job.resource_type,
                job.resource_id,
                exc,
            )
            await self._mark_failed(job.queue_id, str(exc), job.attempts)

    async def _build_dossier(self, job: MemoryJob) -> dict[str, Any] | None:
        session = SessionLocal()
        try:
            if job.resource_type == "task":
                statement = (
                    select(Task)
                    .where(Task.task_id == job.resource_id, Task.tenant_id == job.tenant_id)
                    .options(selectinload(Task.custom_fields).selectinload(TaskCustomField.field))
                )
                result = await session.execute(statement)
                task = result.scalar_one_or_none()
                if task is None:
                    return None
                return self._task_to_dossier(task)

            if job.resource_type == "meeting":
                note = await session.get(MeetingNote, job.resource_id)
                if note is None or note.tenant_id != job.tenant_id:
                    return None
                return self._meeting_to_dossier(note)

            if job.resource_type == "doc":
                statement = (
                    select(Document)
                    .where(Document.doc_id == job.resource_id, Document.tenant_id == job.tenant_id)
                    .options(selectinload(Document.revisions))
                )
                result = await session.execute(statement)
                doc = result.scalar_one_or_none()
                if doc is None:
                    return None
                return self._doc_to_dossier(doc)

            logger.debug("Unknown memPODS resource type %s", job.resource_type)
            return None
        finally:
            await session.close()

    def _task_to_dossier(self, task: Task) -> dict[str, Any]:
        metadata: dict[str, Any] = {
            "status": task.status,
            "priority": task.priority,
            "assignee_id": str(task.assignee_id) if task.assignee_id else None,
            "due_at": task.due_at.isoformat() if task.due_at else None,
            "list_id": str(task.list_id),
            "space_id": str(task.space_id) if task.space_id else None,
        }
        if isinstance(task.metadata_json, dict):
            metadata["metadata_json"] = task.metadata_json

        custom_fields: dict[str, Any] = {}
        for item in task.custom_fields:
            field = getattr(item, "field", None)
            if field is None:
                continue
            custom_fields[field.slug] = item.value.get("value") if item.value else None
        if custom_fields:
            metadata["custom_fields"] = custom_fields

        tags = set()
        meta_tags = metadata.get("metadata_json", {}).get("tags") if isinstance(metadata.get("metadata_json"), dict) else None
        if isinstance(meta_tags, (list, tuple)):
            tags.update(str(tag) for tag in meta_tags if tag)
        _add_tag(tags, "service:taskr")
        _add_tag(tags, "taskr:task")
        tags.add("type:task")
        if task.status:
            _add_tag(tags, f"taskr:status:{task.status}")
            tags.add(f"status:{task.status}")
        if task.priority:
            _add_tag(tags, f"taskr:priority:{task.priority}")
            tags.add(f"priority:{task.priority}")
        if task.assignee_id:
            _add_tag(tags, "taskr:assignee")
        if task.list_id:
            _add_tag(tags, "taskr:list")
        if task.space_id:
            _add_tag(tags, "taskr:space")

        lines: list[str] = []
        if task.description:
            lines.append(task.description.strip())
        if custom_fields:
            lines.append("")
            lines.append("Custom fields:")
            for key, value in sorted(custom_fields.items()):
                lines.append(f"- {key}: {value}")

        content = "\n".join(line for line in lines if line is not None)
        return {
            "tenant_id": str(task.tenant_id),
            "resource_type": "task",
            "resource_id": str(task.task_id),
            "title": task.title,
            "content": content.strip(),
            "tags": sorted(tags),
            "metadata": metadata,
        }

    def _meeting_to_dossier(self, note: MeetingNote) -> dict[str, Any]:
        metadata: dict[str, Any] = {
            "event_id": str(note.event_id) if note.event_id else None,
            "task_id": str(note.task_id) if note.task_id else None,
            "action_items": note.action_items or [],
        }
        if isinstance(note.metadata_json, dict):
            metadata["metadata_json"] = note.metadata_json

        tags = {"type:meeting", "meeting_note"}
        _add_tag(tags, "service:taskr")
        _add_tag(tags, "taskr:meeting")
        if note.action_items:
            _add_tag(tags, "taskr:meeting:action-items")
        lines: list[str] = []
        if note.summary:
            lines.append("Summary:")
            lines.append(note.summary.strip())
            lines.append("")
        lines.append("Transcript:")
        lines.append(note.content.strip())
        if note.action_items:
            lines.append("")
            lines.append("Action items:")
            for item in note.action_items[:10]:
                label = item.get("title") or item.get("summary") or "Action item"
                lines.append(f"- {label}")

        return {
            "tenant_id": str(note.tenant_id),
            "resource_type": "meeting",
            "resource_id": str(note.note_id),
            "title": note.title,
            "content": "\n".join(lines).strip(),
            "tags": sorted(tags),
            "metadata": metadata,
        }

    def _doc_to_dossier(self, doc: Document) -> dict[str, Any]:
        latest: DocumentRevision | None = None
        if doc.revisions:
            latest = max(doc.revisions, key=lambda rev: rev.version)

        metadata: dict[str, Any] = {
            "space_id": str(doc.space_id) if doc.space_id else None,
            "list_id": str(doc.list_id) if doc.list_id else None,
            "tags": list(doc.tags or []),
        }
        if isinstance(doc.metadata_json, dict):
            metadata["metadata_json"] = doc.metadata_json
        if latest is not None and isinstance(latest.metadata_json, dict):
            metadata["latest_revision_metadata"] = latest.metadata_json

        tags = {"type:doc"}
        _add_tag(tags, "service:taskr")
        _add_tag(tags, "taskr:doc")
        if doc.list_id:
            _add_tag(tags, "taskr:list")
        if doc.space_id:
            _add_tag(tags, "taskr:space")
        for tag in doc.tags or []:
            tags.add(str(tag))

        content_parts: list[str] = []
        if doc.summary:
            content_parts.append("Summary:")
            content_parts.append(doc.summary.strip())
            content_parts.append("")
        if latest and latest.content:
            content_parts.append(latest.content.strip())
        elif latest and latest.plain_text:
            content_parts.append(latest.plain_text.strip())

        return {
            "tenant_id": str(doc.tenant_id),
            "resource_type": "doc",
            "resource_id": str(doc.doc_id),
            "title": latest.title if latest and latest.title else doc.title,
            "content": "\n".join(content_parts).strip(),
            "tags": sorted(tags),
            "metadata": metadata,
        }

    async def _send_to_mempods(self, job: MemoryJob, dossier: dict[str, Any]) -> None:
        base_url = settings.mempods_url
        if not base_url:
            logger.debug("mempods_url not configured; marking job %s as complete", job.queue_id)
            return
        client = self._http
        if client is None:
            raise RuntimeError("MemoryQueueService HTTP client not initialised")

        url = f"{base_url.rstrip('/')}/api/v1/dossiers"
        headers = {"Content-Type": "application/json"}
        if settings.mempods_api_token:
            headers["Authorization"] = f"Bearer {settings.mempods_api_token}"  # unified auth token
        tags = dossier.get("tags")
        tag_list = [str(tag) for tag in tags] if isinstance(tags, list) else []
        logger.debug(
            "memPODS dossier %s/%s tag_count=%s tags=%s",
            job.resource_type,
            job.resource_id,
            len(tag_list),
            tag_list,
        )

        response = await client.post(url, json=dossier, headers=headers)
        response.raise_for_status()

    async def _maybe_store_embedding(self, job: MemoryJob, dossier: dict[str, Any]) -> None:
        provider = (settings.embedding_provider or "").lower()
        if provider != "local":
            return
        base_url = settings.local_embedding_base_url
        if not base_url or not dossier["content"]:
            return

        model = settings.local_embedding_model or "default"
        try:
            async with httpx.AsyncClient(timeout=settings.mempods_timeout_seconds or 10.0) as client:
                response = await client.post(
                    f"{base_url.rstrip('/')}/embeddings",
                    json={"input": dossier["content"], "model": model},
                )
            response.raise_for_status()
            data = response.json()
            embedding = data.get("embedding")
            if not isinstance(embedding, list):
                logger.debug("Local embedding provider returned no embedding for %s/%s", job.resource_type, job.resource_id)
                return
        except Exception as exc:
            logger.debug("Local embedding provider failed for %s/%s: %s", job.resource_type, job.resource_id, exc)
            return

        metadata = {
            "provider": "local",
            "model": model,
            "generated_at": _now().isoformat(),
        }
        statement = (
            insert(MemoryVector)
            .values(
                tenant_id=job.tenant_id,
                resource_type=job.resource_type,
                resource_id=job.resource_id,
                embedding=embedding,
                metadata_json=metadata,
                updated_at=_now_naive(),
            )
            .on_conflict_do_update(
                constraint="ux_tr_memory_vector_resource",
                set_=dict(
                    embedding=embedding,
                    metadata_json=metadata,
                    updated_at=_now_naive(),
                ),
            )
        )
        session = SessionLocal()
        try:
            await session.execute(statement)
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    async def _mark_completed(self, queue_id: uuid.UUID) -> None:
        session = SessionLocal()
        try:
            job = await session.get(MemoryQueue, queue_id)
            if job is None:
                await session.rollback()
                return
            job.status = "completed"
            job.updated_at = _now_naive()
            job.last_error = None
            job.available_at = _now()
            await session.flush()
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    async def _mark_failed(self, queue_id: uuid.UUID, error: str, previous_attempts: int) -> None:
        session = SessionLocal()
        try:
            job = await session.get(MemoryQueue, queue_id)
            if job is None:
                await session.rollback()
                return

            job.attempts = previous_attempts + 1
            job.last_error = error[:1000]
            job.updated_at = _now_naive()

            if job.attempts >= len(BACKOFF_SCHEDULE):
                job.status = "failed"
                job.available_at = _now()
            else:
                delay_seconds = BACKOFF_SCHEDULE[job.attempts - 1]
                job.status = "pending"
                job.available_at = _now() + timedelta(seconds=delay_seconds)

            await session.flush()
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


memory_service = MemoryQueueService()


class MemorySearchClient:
    def __init__(self) -> None:
        self._timeout = settings.mempods_timeout_seconds or 10.0

    async def search(
        self,
        tenant_id: uuid.UUID,
        query: str,
        *,
        context: dict[str, Any] | None = None,
        limit: int = 5,
    ) -> list[MemorySearchResult]:
        base_url = settings.mempods_url
        if not base_url or not query.strip():
            return []

        payload: dict[str, Any] = {
            "query": query,
            "limit": max(1, min(limit, 10)),
            "tenant_id": str(tenant_id),
        }
        if context:
            filters = context.get("filters")
            if filters:
                payload["filters"] = filters
            extra = {k: v for k, v in context.items() if k != "filters"}
            if extra:
                payload["context"] = extra

        headers = {"Content-Type": "application/json"}
        if settings.mempods_api_token:
            headers["Authorization"] = f"Bearer {settings.mempods_api_token}"

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    f"{base_url.rstrip('/')}/api/v1/dossiers/search",
                    json=payload,
                    headers=headers,
                )
            if response.status_code >= 400:
                logger.warning(
                    "memPODS search failed (%s): %s",
                    response.status_code,
                    response.text,
                )
                return []
            data = response.json()
        except Exception as exc:  # pragma: no cover - network dependent
            logger.warning("memPODS search error: %s", exc)
            return []

        results: list[MemorySearchResult] = []
        items = data if isinstance(data, list) else data.get("results") if isinstance(data, dict) else []
        for raw in items[: limit]:
            if not isinstance(raw, dict):
                continue
            resource_type = str(raw.get("resource_type") or "").strip() or "unknown"
            resource_id_raw = raw.get("resource_id") or raw.get("id")
            try:
                resource_uuid = uuid.UUID(str(resource_id_raw))
            except Exception:
                resource_uuid = uuid.uuid4()
            title = raw.get("title")
            content = raw.get("content") if isinstance(raw.get("content"), str) else ""
            snippet = raw.get("snippet") if isinstance(raw.get("snippet"), str) else (content[:240] if content else "")
            metadata = raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {}
            results.append(
                MemorySearchResult(
                    resource_type=resource_type,
                    resource_id=resource_uuid,
                    title=title if isinstance(title, str) else None,
                    content=content if isinstance(content, str) else None,
                    snippet=snippet or "",
                    metadata=metadata,
                )
            )
        return results


memory_search_client = MemorySearchClient()
