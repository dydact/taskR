from __future__ import annotations

import uuid

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import AutoPMSuggestion, FlowRun, FlowTemplate
from app.metrics import observe_flow_run_duration, record_flow_run_transition
from app.routes.utils import get_tenant
from app.schemas import (
    AutoPMSuggestionRead,
    FlowRunCreate,
    FlowRunRead,
    FlowRunUpdate,
    FlowTemplateCreate,
    FlowTemplateRead,
    FlowTemplateUpdate,
)
from app.services.autopm import generate_suggestions
from app.services.billing import require_feature
from app.services.flows import start_flow_run, validate_flow_definition
from app.services.usage import adjust_usage
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/flows", tags=["flows"])


@router.get("/templates", response_model=list[FlowTemplateRead])
async def list_templates(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    category: str | None = Query(default=None),
) -> list[FlowTemplate]:
    tenant = await get_tenant(session, headers.tenant_id)
    statement = select(FlowTemplate).where(FlowTemplate.tenant_id == tenant.tenant_id)
    if category:
        statement = statement.where(FlowTemplate.category == category)
    statement = statement.order_by(FlowTemplate.updated_at.desc())
    result = await session.execute(statement)
    return result.scalars().all()


@router.post("/templates", response_model=FlowTemplateRead, status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: FlowTemplateCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> FlowTemplateRead:
    tenant = await get_tenant(session, headers.tenant_id)
    validate_flow_definition(payload.definition_json)

    existing = await session.execute(
        select(FlowTemplate).where(
            FlowTemplate.tenant_id == tenant.tenant_id,
            FlowTemplate.slug == payload.slug,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Flow template slug already exists")

    template = FlowTemplate(
        tenant_id=tenant.tenant_id,
        created_by_id=headers.user_id,
        **payload.model_dump(),
    )
    session.add(template)
    await session.flush()
    await session.refresh(template)
    return FlowTemplateRead.model_validate(template)


async def _get_template(session: AsyncSession, tenant_id: uuid.UUID, slug_or_id: str) -> FlowTemplate:
    statement = select(FlowTemplate).where(FlowTemplate.tenant_id == tenant_id)
    if uuid.UUID in (type(slug_or_id),):  # pragma: no cover - handled below
        statement = statement.where(FlowTemplate.template_id == slug_or_id)
    else:
        statement = statement.where(FlowTemplate.slug == slug_or_id)
    result = await session.execute(statement)
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flow template not found")
    return template


@router.get("/templates/{identifier}", response_model=FlowTemplateRead)
async def get_template(
    identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> FlowTemplateRead:
    tenant = await get_tenant(session, headers.tenant_id)
    template = await _get_template(session, tenant.tenant_id, identifier)
    return FlowTemplateRead.model_validate(template)


@router.patch("/templates/{identifier}", response_model=FlowTemplateRead)
async def update_template(
    identifier: str,
    payload: FlowTemplateUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> FlowTemplateRead:
    tenant = await get_tenant(session, headers.tenant_id)
    template = await _get_template(session, tenant.tenant_id, identifier)
    data = payload.model_dump(exclude_unset=True)
    if "definition_json" in data and data["definition_json"] is not None:
        validate_flow_definition(data["definition_json"])
    for field, value in data.items():
        setattr(template, field, value)
    await session.flush()
    await session.refresh(template)
    return FlowTemplateRead.model_validate(template)


@router.post("/templates/{identifier}/run", response_model=FlowRunRead, status_code=status.HTTP_201_CREATED)
async def start_template_run(
    identifier: str,
    payload: FlowRunCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    _: None = Depends(require_feature("flows.core")),
) -> FlowRunRead:
    tenant = await get_tenant(session, headers.tenant_id)
    template = await _get_template(session, tenant.tenant_id, identifier)
    run = await start_flow_run(session, template, payload.context_json)
    await adjust_usage(session, tenant.tenant_id, "flows_started", 1)
    return FlowRunRead.model_validate(run)


@router.get("/runs", response_model=list[FlowRunRead])
async def list_runs(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    status_filter: str | None = Query(default=None),
) -> list[FlowRun]:
    tenant = await get_tenant(session, headers.tenant_id)
    statement = select(FlowRun).where(FlowRun.tenant_id == tenant.tenant_id)
    if status_filter:
        statement = statement.where(FlowRun.status == status_filter)
    statement = statement.order_by(FlowRun.created_at.desc())
    result = await session.execute(statement)
    return result.scalars().all()


@router.patch("/runs/{run_id}", response_model=FlowRunRead)
async def update_run(
    run_id: uuid.UUID,
    payload: FlowRunUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> FlowRunRead:
    tenant = await get_tenant(session, headers.tenant_id)
    run = await session.get(FlowRun, run_id)
    if run is None or run.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flow run not found")
    data = payload.model_dump(exclude_unset=True)
    previous_status = run.status
    for field, value in data.items():
        setattr(run, field, value)

    new_status = data.get("status", previous_status)
    if new_status != previous_status:
        record_flow_run_transition(tenant.tenant_id, new_status)
        if new_status in {"completed", "failed", "cancelled"} and run.completed_at is None:
            run.completed_at = datetime.now(UTC)
        if new_status == "completed" and run.started_at and run.completed_at:
            duration = (run.completed_at - run.started_at).total_seconds()
            observe_flow_run_duration(tenant.tenant_id, duration)
            await adjust_usage(session, tenant.tenant_id, "flows_completed", 1)

    await session.flush()
    await session.refresh(run)
    return FlowRunRead.model_validate(run)


@router.post("/runs/{run_id}/autopm", response_model=list[AutoPMSuggestionRead])
async def create_autopm_suggestions(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[AutoPMSuggestionRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    run = await session.get(FlowRun, run_id)
    if run is None or run.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flow run not found")
    suggestions = await generate_suggestions(session, run)
    return [AutoPMSuggestionRead.model_validate(item) for item in suggestions]
