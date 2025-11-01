from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import CalendarEvent, CalendarSlot, CalendarSource
from app.routes.utils import get_tenant
from app.schemas import (
    CalendarEventCreate,
    CalendarEventRead,
    CalendarSourceCreate,
    CalendarSourceRead,
    CalendarSourceUpdate,
    FreeBusyRequest,
    FreeBusyWindow,
)
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/sources", response_model=list[CalendarSourceRead])
async def list_sources(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    type_filter: str | None = Query(default=None),
) -> list[CalendarSource]:
    tenant = await get_tenant(session, headers.tenant_id)
    statement = select(CalendarSource).where(CalendarSource.tenant_id == tenant.tenant_id)
    if type_filter:
        statement = statement.where(CalendarSource.type == type_filter)
    result = await session.execute(statement.order_by(CalendarSource.created_at))
    return result.scalars().all()


@router.post("/sources", response_model=CalendarSourceRead, status_code=status.HTTP_201_CREATED)
async def create_source(
    payload: CalendarSourceCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> CalendarSourceRead:
    tenant = await get_tenant(session, headers.tenant_id)
    existing = await session.execute(
        select(CalendarSource).where(
            CalendarSource.tenant_id == tenant.tenant_id,
            CalendarSource.slug == payload.slug,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Calendar source slug already exists")
    source = CalendarSource(tenant_id=tenant.tenant_id, **payload.model_dump())
    session.add(source)
    await session.flush()
    await session.refresh(source)
    return CalendarSourceRead.model_validate(source)


async def _get_source(session: AsyncSession, tenant_id: uuid.UUID, identifier: str) -> CalendarSource:
    statement = select(CalendarSource).where(CalendarSource.tenant_id == tenant_id)
    try:
        source_uuid = uuid.UUID(identifier)
        statement = statement.where(CalendarSource.source_id == source_uuid)
    except ValueError:
        statement = statement.where(CalendarSource.slug == identifier)
    result = await session.execute(statement)
    source = result.scalar_one_or_none()
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar source not found")
    return source


@router.patch("/sources/{identifier}", response_model=CalendarSourceRead)
async def update_source(
    identifier: str,
    payload: CalendarSourceUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> CalendarSourceRead:
    tenant = await get_tenant(session, headers.tenant_id)
    source = await _get_source(session, tenant.tenant_id, identifier)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(source, field, value)
    await session.flush()
    await session.refresh(source)
    return CalendarSourceRead.model_validate(source)


@router.post("/events", response_model=CalendarEventRead, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: CalendarEventCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> CalendarEventRead:
    tenant = await get_tenant(session, headers.tenant_id)
    source = await session.get(CalendarSource, payload.source_id)
    if source is None or source.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar source not found")
    event = CalendarEvent(tenant_id=tenant.tenant_id, **payload.model_dump())
    session.add(event)
    await session.flush()
    await session.refresh(event)
    return CalendarEventRead.model_validate(event)


@router.get("/events", response_model=list[CalendarEventRead])
async def list_events(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    source_id: uuid.UUID | None = Query(default=None),
) -> list[CalendarEvent]:
    tenant = await get_tenant(session, headers.tenant_id)
    statement = select(CalendarEvent).where(CalendarEvent.tenant_id == tenant.tenant_id)
    if source_id is not None:
        statement = statement.where(CalendarEvent.source_id == source_id)
    statement = statement.order_by(CalendarEvent.start_at)
    result = await session.execute(statement)
    return result.scalars().all()


@router.post("/freebusy", response_model=list[FreeBusyWindow])
async def calculate_freebusy(
    payload: FreeBusyRequest,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[FreeBusyWindow]:
    tenant = await get_tenant(session, headers.tenant_id)
    statement = select(CalendarEvent).where(
        CalendarEvent.tenant_id == tenant.tenant_id,
        CalendarEvent.start_at < payload.end_at,
        CalendarEvent.end_at > payload.start_at,
    )
    result = await session.execute(statement)
    events = result.scalars().all()

    windows: list[FreeBusyWindow] = []
    for event in events:
        windows.append(
            FreeBusyWindow(
                owner_id=None,
                start_at=event.start_at,
                end_at=event.end_at,
                status="busy",
            )
        )
    if payload.owner_ids:
        slot_result = await session.execute(
            select(CalendarSlot)
            .where(
                CalendarSlot.tenant_id == tenant.tenant_id,
                CalendarSlot.owner_id.in_(payload.owner_ids),
                CalendarSlot.start_at < payload.end_at,
                CalendarSlot.end_at > payload.start_at,
            )
            .order_by(CalendarSlot.start_at)
        )
        for slot in slot_result.scalars().all():
            windows.append(
                FreeBusyWindow(
                    owner_id=slot.owner_id,
                    start_at=slot.start_at,
                    end_at=slot.end_at,
                    status=slot.status,
                )
            )
    return sorted(windows, key=lambda item: (item.owner_id or uuid.UUID(int=0), item.start_at))
