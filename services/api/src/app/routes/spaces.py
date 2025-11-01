from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import Folder, List, ListStatus, Space
from app.routes.utils import get_space, get_tenant
from app.schemas import (
    FolderRead,
    HierarchyFolder,
    HierarchyList,
    HierarchySpace,
    ListRead,
    ListStatusRead,
    NavigationFolder,
    NavigationList,
    NavigationSpace,
    SpaceCreate,
    SpaceRead,
    SpaceUpdate,
)
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/spaces", tags=["spaces"])


@router.get("", response_model=list[SpaceRead])
async def list_spaces(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> list[Space]:
    tenant = await get_tenant(session, headers.tenant_id)
    query = (
        select(Space)
        .where(Space.tenant_id == tenant.tenant_id)
        .order_by(Space.position, Space.name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await session.execute(query)
    return result.scalars().all()


@router.post("", response_model=SpaceRead, status_code=status.HTTP_201_CREATED)
async def create_space(
    payload: SpaceCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> Space:
    tenant = await get_tenant(session, headers.tenant_id)
    space = Space(tenant_id=tenant.tenant_id, **payload.model_dump())
    session.add(space)
    await session.flush()
    await session.refresh(space)
    return space


@router.get("/{space_identifier}", response_model=SpaceRead)
async def get_space_detail(
    space_identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> Space:
    tenant = await get_tenant(session, headers.tenant_id)
    return await get_space(session, tenant.tenant_id, space_identifier)


@router.patch("/{space_identifier}", response_model=SpaceRead)
async def update_space_detail(
    space_identifier: str,
    payload: SpaceUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> Space:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(space, field, value)

    await session.flush()
    await session.refresh(space)
    return space


@router.delete("/{space_identifier}", status_code=status.HTTP_200_OK)
async def delete_space(
    space_identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> None:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)
    await session.delete(space)
    await session.flush()


@router.get("/{space_identifier}/hierarchy", response_model=HierarchySpace)
async def get_space_hierarchy(
    space_identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> HierarchySpace:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)

    folders_result = await session.execute(
        select(Folder)
        .where(Folder.tenant_id == tenant.tenant_id, Folder.space_id == space.space_id)
        .order_by(Folder.position, Folder.name)
    )
    folders = folders_result.scalars().all()

    lists_result = await session.execute(
        select(List)
        .where(List.tenant_id == tenant.tenant_id, List.space_id == space.space_id)
        .order_by(List.position, List.name)
    )
    lists = lists_result.scalars().all()

    list_ids = [lst.list_id for lst in lists]
    statuses: dict[uuid.UUID, list[ListStatus]] = {lid: [] for lid in list_ids}
    if list_ids:
        status_result = await session.execute(
            select(ListStatus)
            .where(ListStatus.tenant_id == tenant.tenant_id, ListStatus.list_id.in_(list_ids))
            .order_by(ListStatus.list_id, ListStatus.position)
        )
        for row in status_result.scalars().all():
            statuses[row.list_id].append(row)

    folder_map: dict[uuid.UUID | None, list[List]] = {}
    for lst in lists:
        folder_map.setdefault(lst.folder_id, []).append(lst)

    folder_nodes: list[HierarchyFolder] = []
    for folder in folders:
        lst_nodes = [
            HierarchyList(
                list=ListRead.model_validate(lst),
                statuses=[ListStatusRead.model_validate(st) for st in statuses.get(lst.list_id, [])],
            )
            for lst in folder_map.get(folder.folder_id, [])
        ]
        folder_nodes.append(
            HierarchyFolder(
                folder=FolderRead.model_validate(folder),
                lists=lst_nodes,
            )
        )

    root_lists_nodes = [
        HierarchyList(
            list=ListRead.model_validate(lst),
            statuses=[ListStatusRead.model_validate(st) for st in statuses.get(lst.list_id, [])],
        )
        for lst in folder_map.get(None, [])
    ]

    return HierarchySpace(
        space=SpaceRead.model_validate(space),
        folders=folder_nodes,
        root_lists=root_lists_nodes,
    )


@router.get("/navigation", response_model=list[NavigationSpace])
async def list_space_navigation(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[NavigationSpace]:
    tenant = await get_tenant(session, headers.tenant_id)

    spaces_result = await session.execute(
        select(Space)
        .where(Space.tenant_id == tenant.tenant_id)
        .order_by(Space.position, Space.name)
    )
    spaces = spaces_result.scalars().all()
    if not spaces:
        return []

    space_ids = [space.space_id for space in spaces]

    folders_result = await session.execute(
        select(Folder)
        .where(Folder.tenant_id == tenant.tenant_id, Folder.space_id.in_(space_ids))
        .order_by(Folder.space_id, Folder.position, Folder.name)
    )
    folders = folders_result.scalars().all()

    lists_result = await session.execute(
        select(List)
        .where(List.tenant_id == tenant.tenant_id, List.space_id.in_(space_ids))
        .order_by(List.space_id, List.folder_id, List.position, List.name)
    )
    lists = lists_result.scalars().all()

    lists_by_folder: dict[tuple[uuid.UUID, uuid.UUID | None], list[NavigationList]] = {}
    for lst in lists:
        nav_list = NavigationList(
            list_id=lst.list_id,
            name=lst.name,
            folder_id=lst.folder_id,
            color=lst.color,
            space_id=lst.space_id,
        )
        lists_by_folder.setdefault((lst.space_id, lst.folder_id), []).append(nav_list)

    folders_by_space: dict[uuid.UUID, list[NavigationFolder]] = {}
    for folder in folders:
        folder_lists = lists_by_folder.get((folder.space_id, folder.folder_id), [])
        folders_by_space.setdefault(folder.space_id, []).append(
            NavigationFolder(
                folder_id=folder.folder_id,
                name=folder.name,
                space_id=folder.space_id,
                lists=folder_lists,
            )
        )

    navigation: list[NavigationSpace] = []
    for space in spaces:
        nav_folders = folders_by_space.get(space.space_id, [])
        root_lists = lists_by_folder.get((space.space_id, None), [])
        navigation.append(
            NavigationSpace(
                space_id=space.space_id,
                slug=space.slug,
                name=space.name,
                color=space.color,
                folders=nav_folders,
                root_lists=root_lists,
            )
        )

    return navigation
