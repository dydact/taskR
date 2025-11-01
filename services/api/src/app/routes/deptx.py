from __future__ import annotations

import uuid
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.events.bus import event_bus
from app.models.core import DeptxAgent, DeptxDepartment, DeptxExecution, DeptxWorkflow
from app.routes.utils import (
    get_deptx_agent,
    get_deptx_department,
    get_deptx_execution,
    get_deptx_workflow,
    get_tenant,
)
from app.schemas import (
    DeptxAgentCreate,
    DeptxAgentRead,
    DeptxAgentUpdate,
    DeptxDepartmentCreate,
    DeptxDepartmentRead,
    DeptxDepartmentUpdate,
    DeptxExecutionCreate,
    DeptxExecutionRead,
    DeptxExecutionUpdate,
    DeptxWorkflowCreate,
    DeptxWorkflowRead,
    DeptxWorkflowUpdate,
)
from common_auth import TenantHeaders, get_tenant_headers

try:
    from deptx_core import TEMPLATE_DIRECTORY, SandboxManager, TemplateImporter, ToolRegistry
except Exception:  # pragma: no cover - fallback in thin environments
    TEMPLATE_DIRECTORY = None
    SandboxManager = None  # type: ignore[assignment]
    TemplateImporter = None  # type: ignore[assignment]
    ToolRegistry = None  # type: ignore[assignment]

router = APIRouter(prefix="/deptx", tags=["deptx"])


@lru_cache(maxsize=1)
def _get_template_importer() -> TemplateImporter | None:  # type: ignore[name-defined]
    if TemplateImporter is None or TEMPLATE_DIRECTORY is None:
        return None
    if not TEMPLATE_DIRECTORY.exists():
        return None
    return TemplateImporter(TEMPLATE_DIRECTORY)


@lru_cache(maxsize=1)
def _get_tool_registry() -> ToolRegistry | None:  # type: ignore[name-defined]
    if ToolRegistry is None:
        return None
    registry = ToolRegistry()
    registry.ensure_defaults()
    return registry


@lru_cache(maxsize=1)
def _get_sandbox_manager() -> SandboxManager | None:  # type: ignore[name-defined]
    if SandboxManager is None:
        return None
    manager = SandboxManager()
    manager.ensure_defaults()
    return manager


async def _seed_default_workflows(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    department: DeptxDepartment,
) -> None:
    importer = _get_template_importer()
    if importer is None:
        return
    summaries = importer.list_templates()
    if not summaries:
        return

    existing = await session.execute(
        select(DeptxWorkflow.slug).where(
            DeptxWorkflow.tenant_id == tenant_id,
            DeptxWorkflow.department_id == department.department_id,
        )
    )
    existing_slugs = {row[0] for row in existing}

    for summary in summaries:
        if summary.slug in existing_slugs:
            continue
        template_payload = importer.load_template(summary.slug)
        workflow = DeptxWorkflow(
            tenant_id=tenant_id,
            department_id=department.department_id,
            slug=summary.slug,
            name=summary.name,
            description=summary.description,
            trigger_type=template_payload.get("trigger_type"),
            n8n_workflow_id=uuid.uuid4(),
            metadata_json={
                "template_slug": summary.slug,
                "template_version": summary.version,
                "tags": summary.tags,
                "payload": template_payload.get("n8n", {}),
            },
        )
        session.add(workflow)
    await session.flush()


@router.get("/catalog/templates")
async def list_templates() -> list[dict[str, object]]:
    importer = _get_template_importer()
    if importer is None:
        return []
    return [
        {
            "slug": summary.slug,
            "name": summary.name,
            "description": summary.description,
            "version": summary.version,
            "tags": summary.tags,
        }
        for summary in importer.list_templates()
    ]


@router.get("/catalog/tools")
async def list_tools() -> list[dict[str, object]]:
    registry = _get_tool_registry()
    if registry is None:
        return []
    return [
        {
            "key": tool.key,
            "name": tool.name,
            "description": tool.description,
            "capability_tags": tool.capability_tags,
            "entrypoint": tool.entrypoint,
        }
        for tool in registry.catalog()
    ]


@router.get("/catalog/sandboxes")
async def list_sandboxes() -> list[dict[str, object]]:
    manager = _get_sandbox_manager()
    if manager is None:
        return []
    return [
        {
            "name": profile.name,
            "image": profile.image,
            "description": profile.description,
            "capabilities": profile.capabilities,
            "memory_limit_mb": profile.memory_limit_mb,
            "timeout_seconds": profile.timeout_seconds,
        }
        for profile in manager.catalog()
    ]


@router.get("/departments", response_model=list[DeptxDepartmentRead])
async def list_departments(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[DeptxDepartment]:
    tenant = await get_tenant(session, headers.tenant_id)
    result = await session.execute(
        select(DeptxDepartment)
        .where(DeptxDepartment.tenant_id == tenant.tenant_id)
        .order_by(DeptxDepartment.name)
    )
    return result.scalars().all()


@router.post("/departments", response_model=DeptxDepartmentRead, status_code=status.HTTP_201_CREATED)
async def create_department(
    payload: DeptxDepartmentCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DeptxDepartmentRead:
    tenant = await get_tenant(session, headers.tenant_id)

    department = DeptxDepartment(tenant_id=tenant.tenant_id, **payload.model_dump())
    session.add(department)
    await session.flush()
    await session.refresh(department)

    await _seed_default_workflows(session, tenant.tenant_id, department)

    return DeptxDepartmentRead.model_validate(department)


@router.get("/departments/{identifier}", response_model=DeptxDepartmentRead)
async def get_department(
    identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DeptxDepartment:
    tenant = await get_tenant(session, headers.tenant_id)
    department = await get_deptx_department(session, tenant.tenant_id, identifier)
    return department


@router.patch("/departments/{department_id}", response_model=DeptxDepartmentRead)
async def update_department(
    department_id: uuid.UUID,
    payload: DeptxDepartmentUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DeptxDepartment:
    tenant = await get_tenant(session, headers.tenant_id)
    department = await get_deptx_department(session, tenant.tenant_id, department_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(department, field, value)

    await session.flush()
    await session.refresh(department)
    return department


@router.get("/departments/{identifier}/workflows", response_model=list[DeptxWorkflowRead])
async def list_department_workflows(
    identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[DeptxWorkflow]:
    tenant = await get_tenant(session, headers.tenant_id)
    department = await get_deptx_department(session, tenant.tenant_id, identifier)

    result = await session.execute(
        select(DeptxWorkflow)
        .where(
            DeptxWorkflow.tenant_id == tenant.tenant_id,
            DeptxWorkflow.department_id == department.department_id,
        )
        .order_by(DeptxWorkflow.created_at)
    )
    return result.scalars().all()


@router.post("/workflows", response_model=DeptxWorkflowRead, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    payload: DeptxWorkflowCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DeptxWorkflowRead:
    tenant = await get_tenant(session, headers.tenant_id)
    department = await get_deptx_department(session, tenant.tenant_id, payload.department_id)
    data = payload.model_dump(exclude={"department_id"})
    workflow = DeptxWorkflow(
        tenant_id=tenant.tenant_id,
        department_id=department.department_id,
        **data,
    )
    session.add(workflow)
    await session.flush()
    await session.refresh(workflow)
    return DeptxWorkflowRead.model_validate(workflow)


@router.patch("/workflows/{workflow_id}", response_model=DeptxWorkflowRead)
async def update_workflow(
    workflow_id: uuid.UUID,
    payload: DeptxWorkflowUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DeptxWorkflow:
    tenant = await get_tenant(session, headers.tenant_id)
    workflow = await get_deptx_workflow(session, tenant.tenant_id, workflow_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(workflow, field, value)

    await session.flush()
    await session.refresh(workflow)
    return workflow


@router.get("/agents", response_model=list[DeptxAgentRead])
async def list_agents(
    department_id: uuid.UUID | None = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[DeptxAgent]:
    tenant = await get_tenant(session, headers.tenant_id)
    statement = select(DeptxAgent).where(DeptxAgent.tenant_id == tenant.tenant_id)
    if department_id is not None:
        statement = statement.where(DeptxAgent.department_id == department_id)
    statement = statement.order_by(DeptxAgent.created_at)
    result = await session.execute(statement)
    return result.scalars().all()


@router.post("/agents", response_model=DeptxAgentRead, status_code=status.HTTP_201_CREATED)
async def create_agent(
    payload: DeptxAgentCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DeptxAgentRead:
    tenant = await get_tenant(session, headers.tenant_id)
    department = await get_deptx_department(session, tenant.tenant_id, payload.department_id)
    agent = DeptxAgent(
        tenant_id=tenant.tenant_id,
        department_id=department.department_id,
        **payload.model_dump(exclude={"department_id"}),
    )
    session.add(agent)
    await session.flush()
    await session.refresh(agent)
    await event_bus.publish(
        {
            "type": "deptx.agent.created",
            "tenant_id": headers.tenant_id,
            "agent_id": str(agent.agent_id),
            "department_id": str(agent.department_id),
            "payload": DeptxAgentRead.model_validate(agent).model_dump(),
        }
    )
    return DeptxAgentRead.model_validate(agent)


@router.patch("/agents/{agent_id}", response_model=DeptxAgentRead)
async def update_agent(
    agent_id: uuid.UUID,
    payload: DeptxAgentUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DeptxAgent:
    tenant = await get_tenant(session, headers.tenant_id)
    agent = await get_deptx_agent(session, tenant.tenant_id, agent_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(agent, field, value)

    await session.flush()
    await session.refresh(agent)
    await event_bus.publish(
        {
            "type": "deptx.agent.updated",
            "tenant_id": headers.tenant_id,
            "agent_id": str(agent.agent_id),
            "department_id": str(agent.department_id),
            "payload": DeptxAgentRead.model_validate(agent).model_dump(),
        }
    )
    return agent


@router.get("/executions", response_model=list[DeptxExecutionRead])
async def list_executions(
    status_filter: str | None = Query(default=None, alias="status"),
    department_id: uuid.UUID | None = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[DeptxExecution]:
    tenant = await get_tenant(session, headers.tenant_id)
    statement = select(DeptxExecution).where(DeptxExecution.tenant_id == tenant.tenant_id)
    if status_filter:
        statement = statement.where(DeptxExecution.status == status_filter)
    if department_id is not None:
        statement = statement.where(DeptxExecution.department_id == department_id)
    statement = statement.order_by(DeptxExecution.created_at.desc())
    result = await session.execute(statement)
    return result.scalars().all()


@router.post("/executions", response_model=DeptxExecutionRead, status_code=status.HTTP_201_CREATED)
async def create_execution(
    payload: DeptxExecutionCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DeptxExecutionRead:
    tenant = await get_tenant(session, headers.tenant_id)
    workflow = await get_deptx_workflow(session, tenant.tenant_id, payload.workflow_id)

    department_id = payload.department_id or workflow.department_id
    if department_id != workflow.department_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workflow does not belong to department")

    agent_id = payload.agent_id
    if agent_id is not None:
        agent = await get_deptx_agent(session, tenant.tenant_id, agent_id)
        if agent.department_id != department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Agent not in department")

    execution = DeptxExecution(
        tenant_id=tenant.tenant_id,
        department_id=department_id,
        workflow_id=workflow.workflow_id,
        agent_id=agent_id,
        status="queued",
        trigger_type=payload.trigger_type,
        input_payload=payload.input_payload,
    )
    session.add(execution)
    await session.flush()
    await session.refresh(execution)
    serialized = DeptxExecutionRead.model_validate(execution)
    await event_bus.publish(
        {
            "type": "deptx.execution.created",
            "tenant_id": headers.tenant_id,
            "execution_id": str(execution.execution_id),
            "workflow_id": str(execution.workflow_id),
            "payload": serialized.model_dump(),
        }
    )
    return serialized


@router.patch("/executions/{execution_id}", response_model=DeptxExecutionRead)
async def update_execution(
    execution_id: uuid.UUID,
    payload: DeptxExecutionUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DeptxExecutionRead:
    tenant = await get_tenant(session, headers.tenant_id)
    execution = await get_deptx_execution(session, tenant.tenant_id, execution_id)

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        if field == "status" and value is None:
            continue
        setattr(execution, field, value)
    await session.flush()
    await session.refresh(execution)

    serialized = DeptxExecutionRead.model_validate(execution)
    await event_bus.publish(
        {
            "type": "deptx.execution.updated",
            "tenant_id": headers.tenant_id,
            "execution_id": str(execution.execution_id),
            "workflow_id": str(execution.workflow_id),
            "payload": serialized.model_dump(),
        }
    )
    return serialized
