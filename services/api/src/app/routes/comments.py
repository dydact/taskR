from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import Comment, Task
from app.routes.utils import get_tenant
from app.schemas import CommentCreate, CommentRead
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/comments", tags=["comments"])


async def _get_task_for_tenant(session: AsyncSession, tenant_id: uuid.UUID, task_id: uuid.UUID) -> Task:
    task = await session.get(Task, task_id)
    if task is None or task.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


@router.get("/tasks/{task_id}", response_model=list[CommentRead])
async def list_task_comments(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[CommentRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    await _get_task_for_tenant(session, tenant.tenant_id, task_id)

    query = (
        select(Comment)
        .where(Comment.tenant_id == tenant.tenant_id, Comment.task_id == task_id)
        .order_by(Comment.created_at.asc())
    )
    result = await session.execute(query)
    comments = result.scalars().all()
    return [CommentRead.model_validate(comment) for comment in comments]


@router.post("", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
async def create_comment(
    payload: CommentCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> CommentRead:
    tenant = await get_tenant(session, headers.tenant_id)
    task = await _get_task_for_tenant(session, tenant.tenant_id, payload.task_id)

    comment = Comment(
        tenant_id=tenant.tenant_id,
        task_id=task.task_id,
        author_id=payload.author_id,
        body=payload.body,
        mentions=payload.mentions,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    session.add(comment)
    await session.flush()
    await session.refresh(comment)
    return CommentRead.model_validate(comment)
