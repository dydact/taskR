from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import ApprovalQueueItem
from app.routes.utils import get_tenant
from app.schemas import ApprovalDecisionRequest, ApprovalQueueItemRead
from app.services.approvals import get_approval, resolve_approval
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/approvals", tags=["approvals"])


@router.get("/queue", response_model=list[ApprovalQueueItemRead])
async def list_queue_items(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    status_filter: str | None = None,
) -> list[ApprovalQueueItem]:
    tenant = await get_tenant(session, headers.tenant_id)
    statement = select(ApprovalQueueItem).where(ApprovalQueueItem.tenant_id == tenant.tenant_id)
    if status_filter:
        statement = statement.where(ApprovalQueueItem.status == status_filter)
    statement = statement.order_by(ApprovalQueueItem.created_at.desc())
    result = await session.execute(statement)
    return result.scalars().all()


@router.get("/queue/{approval_id}", response_model=ApprovalQueueItemRead)
async def get_queue_item(
    approval_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> ApprovalQueueItemRead:
    tenant = await get_tenant(session, headers.tenant_id)
    approval = await get_approval(session, tenant.tenant_id, approval_id)
    if approval is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval not found")
    return ApprovalQueueItemRead.model_validate(approval)


@router.post("/queue/{approval_id}/resolve", response_model=ApprovalQueueItemRead)
async def resolve_queue_item(
    approval_id: uuid.UUID,
    payload: ApprovalDecisionRequest,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> ApprovalQueueItemRead:
    tenant = await get_tenant(session, headers.tenant_id)
    approval = await get_approval(session, tenant.tenant_id, approval_id)
    if approval is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval not found")

    approval = await resolve_approval(
        session,
        approval,
        action=payload.action,
        notes=payload.notes,
        metadata=payload.metadata_json,
    )
    return ApprovalQueueItemRead.model_validate(approval)
