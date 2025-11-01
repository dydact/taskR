from __future__ import annotations

from datetime import UTC, datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.events.bus import event_bus
from app.models.core import CalendarEvent, MeetingNote, Task
from app.routes.utils import get_list, get_tenant
from app.schemas import ActionItemsToTasksRequest, MeetingNoteCreate, MeetingNoteRead, TaskRead
from app.services.billing import require_feature
from app.services.insight import summarize_meeting
from app.services.notifications import notification_service
from app.services.usage import adjust_usage
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/meetings", tags=["meetings"])


def _note_to_read(note: MeetingNote) -> MeetingNoteRead:
    """Convert ORM instance to API schema with summary metadata."""

    result = MeetingNoteRead.model_validate(note)
    summary_meta: dict | None = None
    metadata = getattr(note, "metadata_json", None)
    if isinstance(metadata, dict):
        candidate = metadata.get("summary")
        if isinstance(candidate, dict):
            summary_meta = candidate
    if summary_meta:
        result = result.model_copy(update={"summary_meta": summary_meta})
    return result


@router.get("/notes", response_model=list[MeetingNoteRead])
async def list_notes(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    event_id: str | None = Query(default=None),
    task_id: str | None = Query(default=None),
) -> list[MeetingNoteRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    statement = select(MeetingNote).where(MeetingNote.tenant_id == tenant.tenant_id)
    if event_id:
        statement = statement.where(MeetingNote.event_id == event_id)
    if task_id:
        statement = statement.where(MeetingNote.task_id == task_id)
    statement = statement.order_by(MeetingNote.created_at.desc())
    result = await session.execute(statement)
    return [_note_to_read(note) for note in result.scalars().all()]


@router.post("/notes", response_model=MeetingNoteRead, status_code=status.HTTP_201_CREATED)
async def create_note(
    payload: MeetingNoteCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    _: None = Depends(require_feature("meetings.core")),
) -> MeetingNoteRead:
    tenant = await get_tenant(session, headers.tenant_id)
    if payload.event_id:
        event = await session.get(CalendarEvent, payload.event_id)
        if event is None or event.tenant_id != tenant.tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar event not found")
    note = MeetingNote(tenant_id=tenant.tenant_id, **payload.model_dump())
    if not note.summary:
        summary_result = await summarize_meeting(tenant.tenant_id, note.content, note.action_items or [])
        note.summary = summary_result.text
        metadata = dict(note.metadata_json or {})
        summary_metadata = dict(metadata.get("summary") or {})
        summary_metadata.update(
            source=summary_result.source,
            generated_at=datetime.now(UTC).isoformat(),
        )
        if getattr(summary_result, "id", None):
            summary_metadata["summary_id"] = summary_result.id
        metadata["summary"] = summary_metadata
        note.metadata_json = metadata
    session.add(note)
    await session.flush()
    await session.refresh(note)
    await notification_service.notify_meeting_note(
        tenant.tenant_id,
        note_id=note.note_id,
        title=note.title,
        summary=note.summary,
        event_type="meeting.note.created",
    )
    await adjust_usage(session, tenant.tenant_id, "meetings_logged", 1)
    return _note_to_read(note)


@router.post("/notes/{note_id}/regenerate", response_model=MeetingNoteRead)
async def regenerate_note_summary(
    note_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    _: None = Depends(require_feature("meetings.core")),
) -> MeetingNoteRead:
    tenant = await get_tenant(session, headers.tenant_id)
    note = await session.get(MeetingNote, note_id)
    if note is None or note.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting note not found")

    summary_result = await summarize_meeting(
        tenant.tenant_id,
        note.content,
        note.action_items or [],
    )

    metadata = dict(note.metadata_json or {})
    summary_metadata = dict(metadata.get("summary") or {})
    summary_metadata.update(
        source=summary_result.source,
        generated_at=datetime.now(UTC).isoformat(),
    )
    if getattr(summary_result, "id", None):
        summary_metadata["summary_id"] = summary_result.id
    metadata["summary"] = summary_metadata

    note.summary = summary_result.text
   note.metadata_json = metadata
   await session.flush()
   await session.refresh(note)
    await notification_service.notify_meeting_note(
        tenant.tenant_id,
        note_id=note.note_id,
        title=note.title,
        summary=note.summary,
        event_type="meeting.note.updated",
    )

    await event_bus.publish(
        {
            "type": "taskr.meeting.summary.regenerated",
            "tenant_id": str(tenant.tenant_id),
            "note_id": str(note.note_id),
            "event_id": str(note.event_id) if note.event_id else None,
            "task_id": str(note.task_id) if note.task_id else None,
            "summary_id": summary_metadata.get("summary_id"),
            "source": summary_result.source,
        }
    )

    return _note_to_read(note)


@router.post("/notes/{note_id}/convert", response_model=list[TaskRead])
async def convert_action_items(
    note_id: uuid.UUID,
    payload: ActionItemsToTasksRequest,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[TaskRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    note = await session.get(MeetingNote, note_id)
    if note is None or note.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting note not found")

    if not note.action_items:
        return []

    list_obj = await get_list(session, tenant.tenant_id, payload.list_id)
    space_id = payload.space_id or list_obj.space_id

    created_tasks: list[TaskRead] = []
    for item in note.action_items:
        title = item.get("title") or item.get("summary") or f"Follow up: {note.title}"
        description = item.get("description") or item.get("notes") or note.summary or note.content
        task = Task(
            tenant_id=tenant.tenant_id,
            space_id=space_id,
            list_id=list_obj.list_id,
            title=title[:255],
            description=description,
            status="backlog",
        )
        session.add(task)
        await session.flush()
        await session.refresh(task)
        created_tasks.append(TaskRead.model_validate(task))

    note.metadata_json = {
        **(note.metadata_json or {}),
        "converted_action_items": datetime.utcnow().isoformat(),
    }
    await session.flush()
    return created_tasks
