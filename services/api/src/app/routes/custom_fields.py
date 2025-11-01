from __future__ import annotations

import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.events.bus import event_bus
from app.models.core import CustomFieldDefinition, List, Task, TaskCustomField
from app.routes.utils import get_list, get_space, get_tenant
from app.schemas import (
    CustomFieldDefinitionCreate,
    CustomFieldDefinitionRead,
    CustomFieldDefinitionUpdate,
    TaskCustomFieldValueRead,
    TaskCustomFieldValueUpsert,
)
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/custom-fields", tags=["custom_fields"])

_ALLOWED_FIELD_TYPES = {
    "text",
    "number",
    "date",
    "boolean",
    "select",
    "multi_select",
}


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "field"


async def _serialize_custom_field(definition: CustomFieldDefinition) -> CustomFieldDefinitionRead:
    return CustomFieldDefinitionRead.model_validate(definition)


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
        if value is None:
            normalized = None
        elif isinstance(value, str):
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported field type")

    return {"value": normalized}


def _deserialize_field_value(field: CustomFieldDefinition, value: dict | None) -> Any:
    if not value:
        return None
    return value.get("value")


@router.get("/spaces/{space_identifier}", response_model=list[CustomFieldDefinitionRead])
async def list_custom_fields_for_space(
    space_identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    include_inactive: bool = Query(default=False),
) -> list[CustomFieldDefinitionRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)
    query = select(CustomFieldDefinition).where(
        CustomFieldDefinition.tenant_id == tenant.tenant_id,
        CustomFieldDefinition.space_id == space.space_id,
    )
    if not include_inactive:
        query = query.where(CustomFieldDefinition.is_active.is_(True))
    query = query.order_by(CustomFieldDefinition.position, CustomFieldDefinition.name)
    result = await session.execute(query)
    definitions = result.scalars().all()
    return [CustomFieldDefinitionRead.model_validate(defn) for defn in definitions]


@router.post("/spaces/{space_identifier}", response_model=CustomFieldDefinitionRead, status_code=status.HTTP_201_CREATED)
async def create_custom_field(
    space_identifier: str,
    payload: CustomFieldDefinitionCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> CustomFieldDefinitionRead:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)

    list_id = payload.list_id
    if list_id is not None:
        list_obj = await get_list(session, tenant.tenant_id, list_id)
        if list_obj.space_id != space.space_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="List does not belong to space")
    else:
        list_obj = None

    slug = payload.slug or _slugify(payload.name)

    existing = await session.execute(
        select(CustomFieldDefinition)
        .where(
            CustomFieldDefinition.tenant_id == tenant.tenant_id,
            CustomFieldDefinition.space_id == space.space_id,
            CustomFieldDefinition.slug == slug,
            CustomFieldDefinition.list_id == (list_obj.list_id if list_obj else None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Slug already used in this scope")

    defn = CustomFieldDefinition(
        tenant_id=tenant.tenant_id,
        space_id=space.space_id,
        list_id=list_obj.list_id if list_obj else None,
        name=payload.name,
        slug=slug,
        field_type=payload.field_type,
        description=payload.description,
        config=payload.config,
        is_required=payload.is_required,
        is_active=payload.is_active,
        position=payload.position,
    )
    session.add(defn)
    await session.flush()
    await session.refresh(defn)

    result = CustomFieldDefinitionRead.model_validate(defn)
    await event_bus.publish(
        {
            "type": "custom_field.created",
            "tenant_id": headers.tenant_id,
            "field_id": str(defn.field_id),
            "payload": result.model_dump(),
        }
    )
    return result


@router.patch("/{field_id}", response_model=CustomFieldDefinitionRead)
async def update_custom_field(
    field_id: uuid.UUID,
    payload: CustomFieldDefinitionUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> CustomFieldDefinitionRead:
    tenant = await get_tenant(session, headers.tenant_id)
    definition = await session.get(CustomFieldDefinition, field_id)
    if definition is None or definition.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "slug" in update_data and update_data["slug"]:
        slug = update_data["slug"]
        duplicate = await session.execute(
            select(CustomFieldDefinition)
            .where(
                CustomFieldDefinition.tenant_id == tenant.tenant_id,
                CustomFieldDefinition.space_id == definition.space_id,
                CustomFieldDefinition.list_id == definition.list_id,
                CustomFieldDefinition.slug == slug,
                CustomFieldDefinition.field_id != definition.field_id,
            )
        )
        if duplicate.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Slug already used in this scope")

    for field, value in update_data.items():
        setattr(definition, field, value)

    await session.flush()
    await session.refresh(definition)
    result = CustomFieldDefinitionRead.model_validate(definition)
    await event_bus.publish(
        {
            "type": "custom_field.updated",
            "tenant_id": headers.tenant_id,
            "field_id": str(definition.field_id),
            "payload": result.model_dump(),
        }
    )
    return result


@router.delete("/{field_id}", status_code=status.HTTP_200_OK, response_class=Response)
async def delete_custom_field(
    field_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> None:
    tenant = await get_tenant(session, headers.tenant_id)
    definition = await session.get(CustomFieldDefinition, field_id)
    if definition is None or definition.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")

    await session.delete(definition)
    await session.flush()
    await event_bus.publish(
        {
            "type": "custom_field.deleted",
            "tenant_id": headers.tenant_id,
            "field_id": str(field_id),
        }
    )


@router.get("/tasks/{task_id}", response_model=list[TaskCustomFieldValueRead])
async def get_task_custom_fields(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[TaskCustomFieldValueRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    task = await session.get(Task, task_id)
    if task is None or task.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    await session.refresh(task, attribute_names=["custom_fields"])
    values = []
    for item in task.custom_fields:
        if not item.field:
            continue
        values.append(
            TaskCustomFieldValueRead(
                field_id=item.field.field_id,
                field_slug=item.field.slug,
                field_name=item.field.name,
                field_type=item.field.field_type,
                value=_deserialize_field_value(item.field, item.value),
            )
        )
    return values


@router.put("/tasks/{task_id}", response_model=list[TaskCustomFieldValueRead])
async def upsert_task_custom_fields(
    task_id: uuid.UUID,
    payload: list[TaskCustomFieldValueUpsert],
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[TaskCustomFieldValueRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    task = await session.get(Task, task_id)
    if task is None or task.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    await session.refresh(task, attribute_names=["custom_fields"])

    existing_map = {item.field_id: item for item in task.custom_fields}
    results: list[TaskCustomFieldValueRead] = []

    for item in payload:
        definition = await session.get(CustomFieldDefinition, item.field_id)
        if definition is None or definition.tenant_id != tenant.tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")
        if definition.list_id and definition.list_id != task.list_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Field not applicable to this list")
        if definition.space_id and definition.space_id != task.space_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Field not applicable to this space")

        normalized = _normalize_field_value(definition, item.value)
        existing = existing_map.get(definition.field_id)
        if existing:
            existing.value = normalized
        else:
            new_value = TaskCustomField(
                tenant_id=tenant.tenant_id,
                task_id=task.task_id,
                field_id=definition.field_id,
                value=normalized,
            )
            session.add(new_value)
            existing_map[definition.field_id] = new_value

        results.append(
            TaskCustomFieldValueRead(
                field_id=definition.field_id,
                field_slug=definition.slug,
                field_name=definition.name,
                field_type=definition.field_type,
                value=_deserialize_field_value(definition, normalized),
            )
        )

    await session.flush()
    await event_bus.publish(
        {
            "type": "task.custom_field.updated",
            "tenant_id": headers.tenant_id,
            "task_id": str(task.task_id),
            "payload": [result.model_dump() for result in results],
        }
    )

    return results
