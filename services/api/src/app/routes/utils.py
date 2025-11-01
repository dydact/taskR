from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import String, cast, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import (
    DeptxAgent,
    DeptxDepartment,
    DeptxExecution,
    DeptxWorkflow,
    Folder,
    List,
    ListStatus,
    PreferenceModel,
    PreferenceRollout,
    PreferenceVariant,
    Space,
    Tenant,
)


async def get_tenant(session: AsyncSession, identifier: str) -> Tenant:
    statement = select(Tenant).where((Tenant.slug == identifier) | (cast(Tenant.tenant_id, String) == identifier))
    result = await session.execute(statement)
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return tenant


async def get_space(session: AsyncSession, tenant_id: uuid.UUID, identifier: str) -> Space:
    statement = select(Space).where(
        (Space.tenant_id == tenant_id)
        & ((cast(Space.space_id, String) == identifier) | (Space.slug == identifier))
    )
    result = await session.execute(statement)
    space = result.scalar_one_or_none()
    if space is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Space not found")
    return space


async def get_folder(session: AsyncSession, tenant_id: uuid.UUID, folder_id: uuid.UUID) -> Folder:
    folder = await session.get(Folder, folder_id)
    if folder is None or folder.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    return folder


async def get_list(session: AsyncSession, tenant_id: uuid.UUID, list_id: uuid.UUID) -> List:
    list_obj = await session.get(List, list_id)
    if list_obj is None or list_obj.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    return list_obj


async def get_list_status(session: AsyncSession, tenant_id: uuid.UUID, status_id: uuid.UUID) -> ListStatus:
    status_row = await session.get(ListStatus, status_id)
    if status_row is None or status_row.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Status not found")
    return status_row


async def get_deptx_department(session: AsyncSession, tenant_id: uuid.UUID, identifier: str | uuid.UUID) -> DeptxDepartment:
    if isinstance(identifier, uuid.UUID):
        department = await session.get(DeptxDepartment, identifier)
        if department is None or department.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
        return department

    statement = select(DeptxDepartment).where(
        (DeptxDepartment.tenant_id == tenant_id)
        & ((cast(DeptxDepartment.department_id, String) == identifier) | (DeptxDepartment.slug == identifier))
    )
    result = await session.execute(statement)
    department = result.scalar_one_or_none()
    if department is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    return department


async def get_deptx_workflow(session: AsyncSession, tenant_id: uuid.UUID, workflow_id: uuid.UUID) -> DeptxWorkflow:
    workflow = await session.get(DeptxWorkflow, workflow_id)
    if workflow is None or workflow.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return workflow


async def get_deptx_agent(session: AsyncSession, tenant_id: uuid.UUID, agent_id: uuid.UUID) -> DeptxAgent:
    agent = await session.get(DeptxAgent, agent_id)
    if agent is None or agent.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent


async def get_deptx_execution(session: AsyncSession, tenant_id: uuid.UUID, execution_id: uuid.UUID) -> DeptxExecution:
    execution = await session.get(DeptxExecution, execution_id)
    if execution is None or execution.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Execution not found")
    return execution


async def get_preference_model(session: AsyncSession, tenant_id: uuid.UUID, identifier: str | uuid.UUID) -> PreferenceModel:
    if isinstance(identifier, uuid.UUID):
        model = await session.get(PreferenceModel, identifier)
        if model is None or model.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preference model not found")
        return model

    statement = select(PreferenceModel).where(
        (PreferenceModel.tenant_id == tenant_id)
        & ((cast(PreferenceModel.model_id, String) == identifier) | (PreferenceModel.slug == identifier))
    )
    result = await session.execute(statement)
    model = result.scalar_one_or_none()
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preference model not found")
    return model


async def get_preference_variant(session: AsyncSession, tenant_id: uuid.UUID, variant_id: uuid.UUID) -> PreferenceVariant:
    variant = await session.get(PreferenceVariant, variant_id)
    if variant is None or variant.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preference variant not found")
    return variant


async def get_preference_rollout(session: AsyncSession, tenant_id: uuid.UUID, rollout_id: uuid.UUID) -> PreferenceRollout:
    rollout = await session.get(PreferenceRollout, rollout_id)
    if rollout is None or rollout.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preference rollout not found")
    return rollout
