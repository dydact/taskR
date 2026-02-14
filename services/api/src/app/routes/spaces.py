from __future__ import annotations

import uuid

from typing import Sequence

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


async def _build_navigation_payload(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    spaces: Sequence[Space],
) -> list[NavigationSpace]:
    if not spaces:
        return []

    space_ids = [space.space_id for space in spaces]

    folders_result = await session.execute(
        select(Folder)
        .where(Folder.tenant_id == tenant_id, Folder.space_id.in_(space_ids))
        .order_by(Folder.space_id, Folder.position, Folder.name)
    )
    folders = folders_result.scalars().all()

    lists_result = await session.execute(
        select(List)
        .where(List.tenant_id == tenant_id, List.space_id.in_(space_ids))
        .order_by(List.space_id, List.folder_id, List.position, List.name)
    )
    lists = lists_result.scalars().all()

    navigation_spaces: dict[uuid.UUID, NavigationSpace] = {}

    for space in spaces:
        metadata = space.metadata_json if isinstance(space.metadata_json, dict) else {}
        category = metadata.get("category")
        category_value = category if isinstance(category, str) and category.strip() else None
        navigation_spaces[space.space_id] = NavigationSpace(
            space_id=space.space_id,
            slug=space.slug,
            name=space.name,
            color=space.color,
            metadata_json=metadata,
            category=category_value,
            folders=[],
            root_lists=[],
        )

    folder_map: dict[uuid.UUID, NavigationFolder] = {}

    for folder in folders:
        nav_space = navigation_spaces.get(folder.space_id)
        if nav_space is None:
            continue
        nav_folder = NavigationFolder(
            folder_id=folder.folder_id,
            name=folder.name,
            space_id=folder.space_id,
            lists=[],
        )
        nav_space.folders.append(nav_folder)
        folder_map[folder.folder_id] = nav_folder

    for lst in lists:
        nav_space = navigation_spaces.get(lst.space_id)
        if nav_space is None:
            continue
        nav_list = NavigationList(
            list_id=lst.list_id,
            name=lst.name,
            folder_id=lst.folder_id,
            color=lst.color,
            space_id=lst.space_id,
        )
        if lst.folder_id and lst.folder_id in folder_map:
            folder_map[lst.folder_id].lists.append(nav_list)
        else:
            nav_space.root_lists.append(nav_list)

    return [navigation_spaces[space.space_id] for space in spaces]


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
    rows = result.scalars().all()

    deduped: list[Space] = []
    seen: set[tuple[uuid.UUID, str]] = set()
    for space in rows:
        normalized = (space.slug or "").strip().lower() or (space.name or "").strip().lower() or str(space.space_id)
        key = (space.tenant_id, normalized)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(space)

    return deduped


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
    rows = spaces_result.scalars().all()

    deduped: list[Space] = []
    seen: set[tuple[uuid.UUID, str]] = set()
    for space in rows:
        normalized = (space.slug or "").strip().lower() or (space.name or "").strip().lower() or str(space.space_id)
        key = (space.tenant_id, normalized)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(space)

    return await _build_navigation_payload(session, tenant.tenant_id, deduped)


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


@router.get("/{space_identifier}/navigation", response_model=NavigationSpace)
async def get_space_navigation(
    space_identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> NavigationSpace:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)
    navigation = await _build_navigation_payload(session, tenant.tenant_id, [space])
    if not navigation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Navigation not found")
    return navigation[0]
