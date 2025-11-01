from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import Folder
from app.routes.utils import get_folder, get_space, get_tenant
from app.schemas import FolderCreate, FolderRead, FolderUpdate
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/folders", tags=["folders"])


@router.get("/spaces/{space_identifier}", response_model=list[FolderRead])
async def list_folders_for_space(
    space_identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    include_archived: bool = Query(default=False),
) -> list[Folder]:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)
    query = select(Folder).where(Folder.tenant_id == tenant.tenant_id, Folder.space_id == space.space_id)
    if not include_archived:
        query = query.where(Folder.is_archived.is_(False))
    query = query.order_by(Folder.position, Folder.name)
    result = await session.execute(query)
    return result.scalars().all()


@router.post("/spaces/{space_identifier}", response_model=FolderRead, status_code=status.HTTP_201_CREATED)
async def create_folder(
    space_identifier: str,
    payload: FolderCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> Folder:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)
    folder = Folder(tenant_id=tenant.tenant_id, space_id=space.space_id, **payload.model_dump())
    session.add(folder)
    await session.flush()
    await session.refresh(folder)
    return folder


@router.get("/{folder_id}", response_model=FolderRead)
async def get_folder_detail(
    folder_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> Folder:
    tenant = await get_tenant(session, headers.tenant_id)
    return await get_folder(session, tenant.tenant_id, folder_id)


@router.patch("/{folder_id}", response_model=FolderRead)
async def update_folder(
    folder_id: uuid.UUID,
    payload: FolderUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> Folder:
    tenant = await get_tenant(session, headers.tenant_id)
    folder = await get_folder(session, tenant.tenant_id, folder_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(folder, field, value)

    await session.flush()
    await session.refresh(folder)
    return folder


@router.delete("/{folder_id}", status_code=status.HTTP_200_OK)
async def delete_folder(
    folder_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> None:
    tenant = await get_tenant(session, headers.tenant_id)
    folder = await get_folder(session, tenant.tenant_id, folder_id)
    await session.delete(folder)
    await session.flush()
