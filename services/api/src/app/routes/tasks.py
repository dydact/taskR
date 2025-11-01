from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db_session
from app.core.config import settings
from app.events.bus import event_bus
from app.models.core import CustomFieldDefinition, List, Task, TaskCustomField
from app.routes.analytics import analytics_cache
from app.routes.utils import get_folder, get_list, get_space, get_tenant
from app.schemas import (
    TaskCreate,
    TaskCustomFieldValueRead,
    TaskCustomFieldValueUpsert,
    TaskRead,
    TaskUpdate,
)
from app.services.billing import require_feature
from app.services.usage import adjust_usage
from common_auth import TenantHeaders, get_tenant_headers


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _normalize_field_value(field: CustomFieldDefinition, value: Any) -> dict:
    field_type = field.field_type
    config = field.config or {}

    if field_type == "text":
        normalized = str(value) if value is not None else ""
    elif field_type == "number":
        try:
            normalized = float(value)
        except (TypeError, ValueError):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Value must be numeric")
    elif field_type == "date":
        if value is None or isinstance(value, str):
            normalized = value
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Value must be ISO date string")
    elif field_type == "boolean":
        normalized = bool(value)
    elif field_type == "select":
        options = config.get("options", [])
        if value not in options:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Value not in select options")
        normalized = value
    elif field_type == "multi_select":
        options = set(config.get("options", []))
        if not isinstance(value, (list, tuple)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Value must be list for multi_select")
        invalid = [item for item in value if item not in options]
        if invalid:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid multi_select options")
        normalized = list(value)
    else:
        normalized = value
    return {"value": normalized}


def _deserialize_field_value(field: CustomFieldDefinition, payload: dict | None) -> Any:
    if not payload:
        return None
    return payload.get("value")


def _serialize_task(task: Task) -> TaskRead:
    custom_fields: list[TaskCustomFieldValueRead] = []
    for item in task.custom_fields:
        if item.field is None:
            continue
        custom_fields.append(
            TaskCustomFieldValueRead(
                field_id=item.field.field_id,
                field_slug=item.field.slug,
                field_name=item.field.name,
                field_type=item.field.field_type,
                value=_deserialize_field_value(item.field, item.value),
            )
        )
    task_read = TaskRead.model_validate(task)
    task_read.custom_fields = custom_fields
    return task_read


def _linkage_payload(action: str, task: TaskRead) -> dict[str, Any]:
    metadata = task.metadata_json or {}
    scr_meta: dict[str, Any] = {}
    if isinstance(metadata, dict):
        scr_meta = metadata.get("scr_link") or metadata.get("scr_linkage") or {}

    occurred_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    task_payload = {
        "id": str(task.task_id),
        "title": task.title,
        "status": task.status,
        "space_id": str(task.space_id) if task.space_id else None,
        "list_id": str(task.list_id),
        "due_at": task.due_at.isoformat() if task.due_at else None,
        "priority": task.priority,
        "metadata": metadata,
    }

    return {
        "action": action,
        "occurred_at": occurred_at,
        "task": task_payload,
        "scr": {
            "session_id": scr_meta.get("session_id"),
            "client_id": scr_meta.get("client_id"),
        },
    }


async def _emit_linkage_event(request: Request, action: str, task: TaskRead) -> None:
    publisher = getattr(request.app.state, "event_publisher", None)
    if publisher is None:
        return
    subject = settings.scr_linkage_subject
    payload = _linkage_payload(action, task)
    try:
        await publisher.publish(subject, str(task.tenant_id), payload)
    except Exception as exc:  # pragma: no cover - best effort logging
        logger.warning("Failed to enqueue scrAIv linkage event: %s", exc)

async def _upsert_custom_fields(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    task: Task,
    values: list[TaskCustomFieldValueUpsert] | None,
) -> None:
    if not values:
        return
    await session.refresh(task, attribute_names=["custom_fields"])
    existing = {item.field_id: item for item in task.custom_fields}

    for payload in values:
        definition = await session.get(CustomFieldDefinition, payload.field_id)
        if definition is None or definition.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom field not found")
        if definition.list_id and definition.list_id != task.list_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Field not applicable to this list")
        if definition.space_id and definition.space_id != task.space_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Field not applicable to this space")

        normalized = _normalize_field_value(definition, payload.value)
        existing_value = existing.get(definition.field_id)
        if existing_value:
            existing_value.value = normalized
        else:
            session.add(
                TaskCustomField(
                    tenant_id=tenant_id,
                    task_id=task.task_id,
                    field_id=definition.field_id,
                    value=normalized,
                )
            )


@router.get("", response_model=list[TaskRead])
async def list_tasks(
    status_filter: str | None = Query(default=None, alias="status"),
    list_id: uuid.UUID | None = Query(default=None),
    space_identifier: str | None = Query(default=None),
    folder_id: uuid.UUID | None = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=1000),
) -> list[TaskRead]:
    tenant = await get_tenant(session, headers.tenant_id)

    query = (
        select(Task)
        .where(Task.tenant_id == tenant.tenant_id)
        .options(selectinload(Task.custom_fields).selectinload(TaskCustomField.field))
    )

    if status_filter:
        query = query.where(Task.status == status_filter)

    if list_id is not None:
        list_obj = await get_list(session, tenant.tenant_id, list_id)
        query = query.where(Task.list_id == list_obj.list_id)
    elif folder_id is not None:
        folder = await get_folder(session, tenant.tenant_id, folder_id)
        subquery = select(List.list_id).where(List.tenant_id == tenant.tenant_id, List.folder_id == folder.folder_id)
        query = query.where(Task.list_id.in_(subquery))
    elif space_identifier is not None:
        space = await get_space(session, tenant.tenant_id, space_identifier)
        query = query.where(Task.space_id == space.space_id)

    query = query.order_by(Task.created_at).offset((page - 1) * page_size).limit(page_size)
    result = await session.execute(query)
    tasks = result.scalars().unique().all()
    return [_serialize_task(task) for task in tasks]


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    _: None = Depends(require_feature("tasks.core")),
) -> TaskRead:
    tenant = await get_tenant(session, headers.tenant_id)
    list_obj = await get_list(session, tenant.tenant_id, payload.list_id)
    space_id = payload.space_id or list_obj.space_id

    data = payload.model_dump(exclude={"custom_fields"})
    data["space_id"] = space_id
    task = Task(tenant_id=tenant.tenant_id, **data)
    session.add(task)
    await session.flush()
    await _upsert_custom_fields(session, tenant.tenant_id, task, payload.custom_fields)
    await session.refresh(task, attribute_names=["custom_fields"])

    serialized = _serialize_task(task)
    await event_bus.publish(
        {
            "type": "task.created",
            "tenant_id": headers.tenant_id,
            "task_id": str(task.task_id),
            "list_id": str(task.list_id),
            "payload": serialized.model_dump(),
        }
    )
    await _emit_linkage_event(request, "created", serialized)
    await analytics_cache.invalidate_for_space(tenant.tenant_id, space_id)
    await adjust_usage(session, tenant.tenant_id, "tasks_total", 1)
    return serialized


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> TaskRead:
    tenant = await get_tenant(session, headers.tenant_id)
    task = await session.get(Task, task_id, options=[selectinload(Task.custom_fields).selectinload(TaskCustomField.field)])
    if task is None or task.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return _serialize_task(task)


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> TaskRead:
    tenant = await get_tenant(session, headers.tenant_id)
    task = await session.get(Task, task_id, options=[selectinload(Task.custom_fields).selectinload(TaskCustomField.field)])
    if task is None or task.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    update_data = payload.model_dump(exclude_unset=True, exclude={"custom_fields"})
    if "list_id" in update_data and update_data["list_id"] is not None:
        list_obj = await get_list(session, tenant.tenant_id, update_data["list_id"])
        update_data["space_id"] = list_obj.space_id

    for field, value in update_data.items():
        setattr(task, field, value)

    await session.flush()
    await _upsert_custom_fields(session, tenant.tenant_id, task, payload.custom_fields)
    await session.refresh(task, attribute_names=["custom_fields"])

    serialized = _serialize_task(task)
    await event_bus.publish(
        {
            "type": "task.updated",
            "tenant_id": headers.tenant_id,
            "task_id": str(task.task_id),
            "list_id": str(task.list_id),
            "payload": serialized.model_dump(),
        }
    )
    await _emit_linkage_event(request, "updated", serialized)
    if task.space_id:
        await analytics_cache.invalidate_for_space(tenant.tenant_id, task.space_id)
    return serialized


@router.delete("/{task_id}", status_code=status.HTTP_200_OK)
async def delete_task(
    task_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    _: None = Depends(require_feature("tasks.core")),
) -> None:
    tenant = await get_tenant(session, headers.tenant_id)
    task = await session.get(Task, task_id)
    if task is None or task.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    await session.refresh(task, attribute_names=["custom_fields"])
    snapshot = _serialize_task(task)
    space_id = task.space_id
    await session.delete(task)
    await session.flush()
    await event_bus.publish(
        {
            "type": "task.deleted",
            "tenant_id": headers.tenant_id,
            "task_id": str(task_id),
            "list_id": str(task.list_id),
        }
    )
    await _emit_linkage_event(request, "deleted", snapshot)
    if space_id:
        await analytics_cache.invalidate_for_space(tenant.tenant_id, space_id)
    await adjust_usage(session, tenant.tenant_id, "tasks_total", -1)
