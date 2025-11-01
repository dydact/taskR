from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import SicaNote, SicaSession
from app.routes.utils import get_tenant
from app.schemas import SicaNoteCreate, SicaNoteRead, SicaSessionCreate, SicaSessionRead, SicaSessionUpdate
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/sica", tags=["sica"])


@router.get("/sessions", response_model=list[SicaSessionRead])
async def list_sessions(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    subject_type: str | None = Query(default=None),
    status_filter: str | None = Query(default=None),
) -> list[SicaSession]:
    tenant = await get_tenant(session, headers.tenant_id)
    statement = select(SicaSession).where(SicaSession.tenant_id == tenant.tenant_id)
    if subject_type:
        statement = statement.where(SicaSession.subject_type == subject_type)
    if status_filter:
        statement = statement.where(SicaSession.status == status_filter)
    statement = statement.order_by(SicaSession.updated_at.desc())
    result = await session.execute(statement)
    return result.scalars().all()


@router.post("/sessions", response_model=SicaSessionRead, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: SicaSessionCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> SicaSessionRead:
    tenant = await get_tenant(session, headers.tenant_id)
    sica_session = SicaSession(tenant_id=tenant.tenant_id, **payload.model_dump())
    session.add(sica_session)
    await session.flush()
    await session.refresh(sica_session)
    return SicaSessionRead.model_validate(sica_session)


@router.patch("/sessions/{session_id}", response_model=SicaSessionRead)
async def update_session(
    session_id: uuid.UUID,
    payload: SicaSessionUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> SicaSessionRead:
    tenant = await get_tenant(session, headers.tenant_id)
    sica_session = await session.get(SicaSession, session_id)
    if sica_session is None or sica_session.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SICA session not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(sica_session, field, value)
    await session.flush()
    await session.refresh(sica_session)
    return SicaSessionRead.model_validate(sica_session)


@router.post("/notes", response_model=SicaNoteRead, status_code=status.HTTP_201_CREATED)
async def create_note(
    payload: SicaNoteCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> SicaNoteRead:
    tenant = await get_tenant(session, headers.tenant_id)
    sica_session = await session.get(SicaSession, payload.session_id)
    if sica_session is None or sica_session.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SICA session not found")
    note = SicaNote(
        tenant_id=tenant.tenant_id,
        session_id=payload.session_id,
        author_id=headers.user_id,
        content=payload.content,
        metadata_json=payload.metadata_json,
    )
    session.add(note)
    await session.flush()
    await session.refresh(note)
    return SicaNoteRead.model_validate(note)
