from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import Subtask, Task
from app.routes.utils import get_tenant
from app.schemas import SubtaskCreate, SubtaskRead, SubtaskUpdate
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/subtasks", tags=["subtasks"])


async def _get_task(session: AsyncSession, tenant_id: uuid.UUID, task_id: uuid.UUID) -> Task:
    task = await session.get(Task, task_id)
    if task is None or task.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


async def _get_subtask(session: AsyncSession, tenant_id: uuid.UUID, task_id: uuid.UUID, subtask_id: uuid.UUID) -> Subtask:
    subtask = await session.get(Subtask, subtask_id)
    if subtask is None or subtask.tenant_id != tenant_id or subtask.task_id != task_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtask not found")
    return subtask


@router.get("/tasks/{task_id}", response_model=list[SubtaskRead])
async def list_subtasks(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[SubtaskRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    await _get_task(session, tenant.tenant_id, task_id)

    query = (
        select(Subtask)
        .where(Subtask.tenant_id == tenant.tenant_id, Subtask.task_id == task_id)
        .order_by(Subtask.created_at.asc())
    )
    result = await session.execute(query)
    subtasks = result.scalars().all()
    return [SubtaskRead.model_validate(item) for item in subtasks]


@router.post("/tasks/{task_id}", response_model=SubtaskRead, status_code=status.HTTP_201_CREATED)
async def create_subtask(
    task_id: uuid.UUID,
    payload: SubtaskCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> SubtaskRead:
    tenant = await get_tenant(session, headers.tenant_id)
    task = await _get_task(session, tenant.tenant_id, task_id)

    subtask = Subtask(
        tenant_id=tenant.tenant_id,
        task_id=task.task_id,
        title=payload.title,
        status=payload.status,
    )
    session.add(subtask)
    await session.flush()
    await session.refresh(subtask)
    return SubtaskRead.model_validate(subtask)


@router.patch("/tasks/{task_id}/{subtask_id}", response_model=SubtaskRead)
async def update_subtask(
    task_id: uuid.UUID,
    subtask_id: uuid.UUID,
    payload: SubtaskUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> SubtaskRead:
    tenant = await get_tenant(session, headers.tenant_id)
    subtask = await _get_subtask(session, tenant.tenant_id, task_id, subtask_id)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(subtask, field, value)

    await session.flush()
    await session.refresh(subtask)
    return SubtaskRead.model_validate(subtask)


@router.delete("/tasks/{task_id}/{subtask_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subtask(
    task_id: uuid.UUID,
    subtask_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> Response:
    tenant = await get_tenant(session, headers.tenant_id)
    subtask = await _get_subtask(session, tenant.tenant_id, task_id, subtask_id)
    await session.delete(subtask)
    await session.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
