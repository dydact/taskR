from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.events.bus import event_bus
from app.models.core import List, ListStatus
from app.routes.analytics import analytics_cache
from app.routes.utils import get_folder, get_list, get_list_status, get_space, get_tenant
from app.schemas import (
    ListCreate,
    ListRead,
    ListStatusCreate,
    ListStatusRead,
    ListStatusUpdate,
    ListUpdate,
)
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/lists", tags=["lists"])


DEFAULT_STATUSES: list[dict[str, object]] = [
    {"name": "Backlog", "category": "backlog", "position": 0, "is_done": False, "is_default": True},
    {"name": "In Progress", "category": "active", "position": 1, "is_done": False, "is_default": False},
    {"name": "Done", "category": "done", "position": 2, "is_done": True, "is_default": False},
]


@router.get("/spaces/{space_identifier}", response_model=list[ListRead])
async def list_lists(
    space_identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    folder_id: uuid.UUID | None = Query(default=None),
    include_archived: bool = Query(default=False),
) -> list[List]:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)

    query = select(List).where(List.tenant_id == tenant.tenant_id, List.space_id == space.space_id)
    if folder_id is not None:
        folder = await get_folder(session, tenant.tenant_id, folder_id)
        if folder.space_id != space.space_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Folder not in space")
        query = query.where(List.folder_id == folder.folder_id)
    if not include_archived:
        query = query.where(List.is_archived.is_(False))
    query = query.order_by(List.position, List.name)
    result = await session.execute(query)
    return result.scalars().all()


@router.post("/spaces/{space_identifier}", response_model=ListRead, status_code=status.HTTP_201_CREATED)
async def create_list(
    space_identifier: str,
    payload: ListCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> List:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)

    folder_id = payload.folder_id
    if folder_id is not None:
        folder = await get_folder(session, tenant.tenant_id, folder_id)
        if folder.space_id != space.space_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Folder not in space")

    data = payload.model_dump()
    list_obj = List(tenant_id=tenant.tenant_id, space_id=space.space_id, **data)
    session.add(list_obj)
    await session.flush()

    for status_payload in DEFAULT_STATUSES:
        status_row = ListStatus(
            tenant_id=tenant.tenant_id,
            list_id=list_obj.list_id,
            **status_payload,
        )
        session.add(status_row)

    await session.flush()
    await session.refresh(list_obj)
    await event_bus.publish(
        {
            "type": "list.created",
            "tenant_id": headers.tenant_id,
            "list_id": str(list_obj.list_id),
            "space_id": str(list_obj.space_id),
            "payload": ListRead.model_validate(list_obj).model_dump(),
        }
    )
    await analytics_cache.invalidate_for_space(tenant.tenant_id, space.space_id)
    return list_obj


@router.get("/{list_id}", response_model=ListRead)
async def get_list_detail(
    list_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> List:
    tenant = await get_tenant(session, headers.tenant_id)
    return await get_list(session, tenant.tenant_id, list_id)


@router.patch("/{list_id}", response_model=ListRead)
async def update_list(
    list_id: uuid.UUID,
    payload: ListUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> List:
    tenant = await get_tenant(session, headers.tenant_id)
    list_obj = await get_list(session, tenant.tenant_id, list_id)

    update_data = payload.model_dump(exclude_unset=True)
    if "folder_id" in update_data and update_data["folder_id"] is not None:
        folder = await get_folder(session, tenant.tenant_id, update_data["folder_id"])
        if folder.space_id != list_obj.space_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Folder not in list space")

    for field, value in update_data.items():
        setattr(list_obj, field, value)

    await session.flush()
    await session.refresh(list_obj)
    await event_bus.publish(
        {
            "type": "list.updated",
            "tenant_id": headers.tenant_id,
            "list_id": str(list_obj.list_id),
            "space_id": str(list_obj.space_id),
            "payload": ListRead.model_validate(list_obj).model_dump(),
        }
    )
    await analytics_cache.invalidate_for_space(tenant.tenant_id, list_obj.space_id)
    return list_obj


@router.delete("/{list_id}", status_code=status.HTTP_200_OK)
async def delete_list(
    list_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> None:
    tenant = await get_tenant(session, headers.tenant_id)
    list_obj = await get_list(session, tenant.tenant_id, list_id)
    space_id = list_obj.space_id
    await session.delete(list_obj)
    await session.flush()
    await event_bus.publish(
        {
            "type": "list.deleted",
            "tenant_id": headers.tenant_id,
            "list_id": str(list_id),
        }
    )
    await analytics_cache.invalidate_for_space(tenant.tenant_id, space_id)


# ---------------------------------------------------------------------------
# List Status Management
# ---------------------------------------------------------------------------


@router.get("/{list_id}/statuses", response_model=list[ListStatusRead])
async def list_statuses(
    list_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[ListStatus]:
    tenant = await get_tenant(session, headers.tenant_id)
    list_obj = await get_list(session, tenant.tenant_id, list_id)
    result = await session.execute(
        select(ListStatus)
        .where(ListStatus.tenant_id == tenant.tenant_id, ListStatus.list_id == list_obj.list_id)
        .order_by(ListStatus.position, ListStatus.name)
    )
    return result.scalars().all()


@router.post("/{list_id}/statuses", response_model=ListStatusRead, status_code=status.HTTP_201_CREATED)
async def create_status(
    list_id: uuid.UUID,
    payload: ListStatusCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> ListStatus:
    tenant = await get_tenant(session, headers.tenant_id)
    list_obj = await get_list(session, tenant.tenant_id, list_id)
    status_row = ListStatus(tenant_id=tenant.tenant_id, list_id=list_obj.list_id, **payload.model_dump())
    session.add(status_row)
    await session.flush()
    await session.refresh(status_row)
    await event_bus.publish(
        {
            "type": "list.status.created",
            "tenant_id": headers.tenant_id,
            "list_id": str(list_obj.list_id),
            "status_id": str(status_row.status_id),
            "payload": ListStatusRead.model_validate(status_row).model_dump(),
        }
    )
    await analytics_cache.invalidate_for_space(tenant.tenant_id, list_obj.space_id)
    return status_row


@router.patch("/{list_id}/statuses/{status_id}", response_model=ListStatusRead)
async def update_status(
    list_id: uuid.UUID,
    status_id: uuid.UUID,
    payload: ListStatusUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> ListStatus:
    tenant = await get_tenant(session, headers.tenant_id)
    list_obj = await get_list(session, tenant.tenant_id, list_id)
    status_row = await get_list_status(session, tenant.tenant_id, status_id)
    if status_row.list_id != list_obj.list_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Status not part of list")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(status_row, field, value)

    await session.flush()
    await session.refresh(status_row)
    await event_bus.publish(
        {
            "type": "list.status.updated",
            "tenant_id": headers.tenant_id,
            "list_id": str(list_obj.list_id),
            "status_id": str(status_row.status_id),
            "payload": ListStatusRead.model_validate(status_row).model_dump(),
        }
    )
    await analytics_cache.invalidate_for_space(tenant.tenant_id, list_obj.space_id)
    return status_row


@router.delete("/{list_id}/statuses/{status_id}", status_code=status.HTTP_200_OK)
async def delete_status(
    list_id: uuid.UUID,
    status_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> None:
    tenant = await get_tenant(session, headers.tenant_id)
    list_obj = await get_list(session, tenant.tenant_id, list_id)
    status_row = await get_list_status(session, tenant.tenant_id, status_id)
    if status_row.list_id != list_obj.list_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Status not part of list")

    space_id = list_obj.space_id
    await session.delete(status_row)
    await session.flush()
    await event_bus.publish(
        {
            "type": "list.status.deleted",
            "tenant_id": headers.tenant_id,
            "list_id": str(list_obj.list_id),
            "status_id": str(status_id),
        }
    )
    await analytics_cache.invalidate_for_space(tenant.tenant_id, space_id)
