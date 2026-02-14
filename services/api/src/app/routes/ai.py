from __future__ import annotations

from datetime import datetime, timezone
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import AiJob
from app.routes.utils import get_tenant
from app.schemas import AiJobCreate, AiJobRead
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/jobs", response_model=list[AiJobRead])
async def list_ai_jobs(
    prompt_id: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[AiJobRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    query = (
        select(AiJob)
        .where(AiJob.tenant_id == tenant.tenant_id)
        .order_by(AiJob.created_at.desc())
        .limit(limit)
    )
    if prompt_id:
        query = query.where(AiJob.prompt_id == prompt_id)
    if status_filter:
        query = query.where(AiJob.status == status_filter)
    result = await session.execute(query)
    rows = result.scalars().all()
    return [AiJobRead.model_validate(row) for row in rows]


@router.post("/jobs", response_model=AiJobRead, status_code=status.HTTP_201_CREATED)
async def create_ai_job(
    payload: AiJobCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> AiJobRead:
    tenant = await get_tenant(session, headers.tenant_id)
    row = AiJob(
        tenant_id=tenant.tenant_id,
        prompt_id=payload.prompt_id,
        status=payload.status,
        metadata_json=payload.metadata_json,
        result_json=payload.result_json,
    )
    session.add(row)
    await session.flush()
    await session.refresh(row)
    return AiJobRead.model_validate(row)


@router.patch("/jobs/{job_id}", response_model=AiJobRead)
async def update_ai_job(
    job_id: uuid.UUID,
    payload: AiJobCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> AiJobRead:
    tenant = await get_tenant(session, headers.tenant_id)
    query = (
        update(AiJob)
        .where(AiJob.job_id == job_id, AiJob.tenant_id == tenant.tenant_id)
        .values(
            prompt_id=payload.prompt_id,
            status=payload.status,
            metadata_json=payload.metadata_json,
            result_json=payload.result_json,
            updated_at=datetime.now(timezone.utc),
        )
        .returning(AiJob)
    )
    result = await session.execute(query)
    row = result.fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ai_job_not_found")
    job: AiJob = row[0]
    return AiJobRead.model_validate(job)
