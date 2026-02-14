
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import DeptxAgent, DeptxDepartment
from app.routes.utils import get_tenant
from app.schemas import DeptxAgentCreate, DeptxAgentRead, DeptxDepartmentCreate, DeptxDepartmentRead
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/deptx", tags=["deptx"])


@router.post("/departments", response_model=DeptxDepartmentRead, status_code=status.HTTP_201_CREATED)
async def create_department(
    payload: DeptxDepartmentCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DeptxDepartmentRead:
    tenant = await get_tenant(session, headers.tenant_id)
    
    # Check for duplicate slug
    existing = await session.execute(
        select(DeptxDepartment).where(
            DeptxDepartment.tenant_id == tenant.tenant_id,
            DeptxDepartment.slug == payload.slug
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="department_exists")

    department = DeptxDepartment(
        tenant_id=tenant.tenant_id,
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        focus_area=payload.focus_area,
        metadata_json=payload.metadata_json or {},
    )
    session.add(department)
    await session.commit()
    await session.refresh(department)
    return DeptxDepartmentRead.model_validate(department)


@router.post("/agents", response_model=DeptxAgentRead, status_code=status.HTTP_201_CREATED)
async def create_agent(
    payload: DeptxAgentCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DeptxAgentRead:
    tenant = await get_tenant(session, headers.tenant_id)

    # Validate department exists
    dept = await session.get(DeptxDepartment, payload.department_id)
    if not dept or dept.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="department_not_found")

    agent = DeptxAgent(
        tenant_id=tenant.tenant_id,
        department_id=payload.department_id,
        name=payload.name,
        role=payload.role,
        description=payload.description,
        skill_tags=payload.skill_tags or [],
        sandbox_profile=payload.sandbox_profile,
        config_json=payload.config_json or {},
    )
    session.add(agent)
    await session.commit()
    await session.refresh(agent)
    return DeptxAgentRead.model_validate(agent)


@router.get("/departments", response_model=list[DeptxDepartmentRead])
async def list_departments(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[DeptxDepartmentRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    result = await session.execute(
        select(DeptxDepartment).where(DeptxDepartment.tenant_id == tenant.tenant_id)
    )
    departments = result.scalars().all()
    return [DeptxDepartmentRead.model_validate(d) for d in departments]


@router.get("/agents", response_model=list[DeptxAgentRead])
async def list_agents(
    department_id: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[DeptxAgentRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    stmt = select(DeptxAgent).where(DeptxAgent.tenant_id == tenant.tenant_id)
    if department_id is not None:
        stmt = stmt.where(DeptxAgent.department_id == department_id)
    result = await session.execute(stmt)
    agents = result.scalars().all()
    return [DeptxAgentRead.model_validate(a) for a in agents]
