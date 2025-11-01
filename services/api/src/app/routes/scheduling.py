from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import SchedulingNegotiation
from app.routes.utils import get_tenant
from app.schemas import (
    NegotiationMessageCreate,
    SchedulingNegotiationCreate,
    SchedulingNegotiationRead,
)
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/scheduling", tags=["scheduling"])


def _serialize_message(payload: NegotiationMessageCreate) -> tuple[dict, datetime]:
    recorded_at = datetime.now(UTC)
    message = {
        "recorded_at": recorded_at.isoformat(),
        "author": payload.author,
        "channel": payload.channel,
        "body": payload.body,
        "metadata": payload.metadata or {},
    }
    if payload.status:
        message["status"] = payload.status
    return message, recorded_at


@router.get("/negotiations", response_model=list[SchedulingNegotiationRead])
async def list_negotiations(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    status_filter: str | None = None,
) -> list[SchedulingNegotiation]:
    tenant = await get_tenant(session, headers.tenant_id)
    statement = select(SchedulingNegotiation).where(SchedulingNegotiation.tenant_id == tenant.tenant_id)
    if status_filter:
        statement = statement.where(SchedulingNegotiation.status == status_filter)
    statement = statement.order_by(SchedulingNegotiation.created_at.desc())
    result = await session.execute(statement)
    return result.scalars().all()


@router.post("/negotiations", response_model=SchedulingNegotiationRead, status_code=status.HTTP_201_CREATED)
async def create_negotiation(
    payload: SchedulingNegotiationCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> SchedulingNegotiationRead:
    tenant = await get_tenant(session, headers.tenant_id)
    negotiation = SchedulingNegotiation(
        tenant_id=tenant.tenant_id,
        subject=payload.subject,
        channel_type=payload.channel_type,
        participants=payload.participants,
        metadata_json=payload.metadata_json,
        external_thread_id=payload.external_thread_id,
        messages=[],
    )

    if payload.initial_message:
        message, recorded_at = _serialize_message(payload.initial_message)
        negotiation.messages = [message]
        negotiation.last_message_at = recorded_at
        if payload.initial_message.status:
            negotiation.status = payload.initial_message.status

    session.add(negotiation)
    await session.flush()
    await session.refresh(negotiation)
    return SchedulingNegotiationRead.model_validate(negotiation)


@router.get("/negotiations/{negotiation_id}", response_model=SchedulingNegotiationRead)
async def get_negotiation(
    negotiation_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> SchedulingNegotiationRead:
    tenant = await get_tenant(session, headers.tenant_id)
    negotiation = await session.get(SchedulingNegotiation, negotiation_id)
    if negotiation is None or negotiation.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Negotiation not found")
    return SchedulingNegotiationRead.model_validate(negotiation)


@router.post("/negotiations/{negotiation_id}/messages", response_model=SchedulingNegotiationRead)
async def append_message(
    negotiation_id: uuid.UUID,
    payload: NegotiationMessageCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> SchedulingNegotiationRead:
    tenant = await get_tenant(session, headers.tenant_id)
    negotiation = await session.get(SchedulingNegotiation, negotiation_id)
    if negotiation is None or negotiation.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Negotiation not found")

    message, recorded_at = _serialize_message(payload)
    existing_messages = list(negotiation.messages or [])
    existing_messages.append(message)
    negotiation.messages = existing_messages
    negotiation.last_message_at = recorded_at
    if payload.status:
        negotiation.status = payload.status

    await session.flush()
    await session.refresh(negotiation)
    return SchedulingNegotiationRead.model_validate(negotiation)
