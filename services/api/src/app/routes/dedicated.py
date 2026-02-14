from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db_session
from app.events.bus import event_bus
from app.routes.utils import get_tenant
from app.schemas import AssignmentEventRead, AssignmentRead
from app.services.billing import get_billing_service, require_feature
from app.services.dedicated import (
    AssignmentFilters,
    build_stub_assignment_payload,
    ensure_stub_assignment,
    get_assignment,
    list_assignment_events,
    list_assignments,
    record_assignment_event,
    upsert_assignment,
)
from app.services.dedicated_events import DEDICATED_TOPIC, emit_assignment_event
from common_agents import AssignmentEventPayload, AssignmentPayload
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/dedicated", tags=["dedicated"])


FeatureGuard = Depends(require_feature("dedicated.agents"))


async def _tenant_context(session: AsyncSession, headers: TenantHeaders) -> uuid.UUID:
    tenant = await get_tenant(session, headers.tenant_id)
    return tenant.tenant_id


async def _stream_tenant_headers(
    request: Request,
    x_tenant_id: str | None = Header(default=None, alias="x-tenant-id"),
    x_scr_tenant: str | None = Header(default=None, alias="X-SCR-Tenant"),
    x_user_id: str | None = Header(default=None, alias="x-user-id"),
) -> TenantHeaders:
    candidate = x_tenant_id or x_scr_tenant or request.query_params.get("tenant") or request.query_params.get("tenant_id")
    if candidate is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="missing_tenant")
    user = x_user_id or request.query_params.get("user") or request.query_params.get("user_id")
    return TenantHeaders(tenant_id=candidate, user_id=user)


@router.get(
    "/assignments",
    response_model=list[AssignmentRead],
    dependencies=[FeatureGuard],
)
async def list_dedicated_assignments(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    status_filter: list[str] | None = Query(default=None, alias="status"),
    agent_filter: list[str] | None = Query(default=None, alias="agent_slug"),
    node_id: str | None = Query(default=None),
    tag: list[str] | None = Query(default=None),
) -> list[AssignmentRead]:
    tenant_id = await _tenant_context(session, headers)
    filters = AssignmentFilters(
        statuses=status_filter,
        agent_slugs=agent_filter,
        node_id=node_id,
        tags=tag,
    )
    rows = await list_assignments(session, tenant_id, filters)
    if settings.environment in {"local", "dev", "development"} and not rows:
        seeded = await ensure_stub_assignment(session, tenant_id)
        if seeded:
            rows = [seeded]
    return [AssignmentRead.model_validate(row) for row in rows]


@router.post(
    "/assignments",
    response_model=AssignmentRead,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[FeatureGuard],
)
async def ingest_assignment(
    payload: AssignmentPayload,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> AssignmentRead:
    tenant_id = await _tenant_context(session, headers)
    if str(payload.tenant_id) != str(tenant_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_tenant_context")
    assignment = await upsert_assignment(session, tenant_id, payload)
    body = AssignmentRead.model_validate(assignment).model_dump(mode="json")
    await emit_assignment_event(tenant_id, "assignment_upserted", body)
    return AssignmentRead.model_validate(assignment)


@router.get(
    "/assignments/{assignment_id}",
    response_model=AssignmentRead,
    dependencies=[FeatureGuard],
)
async def get_dedicated_assignment(
    assignment_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> AssignmentRead:
    tenant_id = await _tenant_context(session, headers)
    row = await get_assignment(session, tenant_id, assignment_id)
    return AssignmentRead.model_validate(row)


@router.get(
    "/assignments/{assignment_id}/events",
    response_model=list[AssignmentEventRead],
    dependencies=[FeatureGuard],
)
async def list_dedicated_assignment_events(
    assignment_id: uuid.UUID,
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[AssignmentEventRead]:
    tenant_id = await _tenant_context(session, headers)
    rows = await list_assignment_events(session, tenant_id, assignment_id, limit=limit)
    return [AssignmentEventRead.model_validate(row) for row in rows]


@router.post(
    "/events",
    response_model=AssignmentEventRead,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[FeatureGuard],
)
async def ingest_assignment_event(
    payload: AssignmentEventPayload,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> AssignmentEventRead:
    tenant_id = await _tenant_context(session, headers)
    if str(payload.tenant_id) != str(tenant_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_tenant_context")
    event = await record_assignment_event(session, tenant_id, payload)
    body = AssignmentEventRead.model_validate(event).model_dump(mode="json")
    await emit_assignment_event(tenant_id, "assignment_event", body)
    assignment = await get_assignment(session, tenant_id, event.assignment_id)
    assignment_body = AssignmentRead.model_validate(assignment).model_dump(mode="json")
    await emit_assignment_event(tenant_id, "assignment_upserted", assignment_body)
    return AssignmentEventRead.model_validate(event)


@router.get("/assignments/stream")
async def dedicated_assignment_stream(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(_stream_tenant_headers),
) -> StreamingResponse:
    tenant_id = await _tenant_context(session, headers)
    service = get_billing_service()
    allowed = await service.is_feature_enabled(
        session,
        tenant_id,
        "dedicated.agents",
        application="taskr",
    )
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="feature_disabled")
    tenant_key = str(tenant_id)

    if settings.environment in {"local", "dev", "development"}:
        await ensure_stub_assignment(session, tenant_id)

    async def generator():
        try:
            async with event_bus.subscribe() as queue:
                while True:
                    if await request.is_disconnected():
                        break
                    event = await queue.get()
                    if event.get("tenant_id") != tenant_key:
                        continue
                    if event.get("topic") != DEDICATED_TOPIC:
                        continue
                    chunk = json.dumps(event)
                    yield f"data: {chunk}\n\n".encode("utf-8")
        except asyncio.CancelledError:
            return

    return StreamingResponse(generator(), media_type="text/event-stream")


@router.post(
    "/stubs/assignment",
    response_model=AssignmentRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[FeatureGuard],
)
async def create_stub_assignment(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> AssignmentRead:
    """Local-development helper that seeds a demo assignment."""
    if settings.environment not in {"local", "dev", "development"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_available")
    tenant_id = await _tenant_context(session, headers)
    demo_payload = build_stub_assignment_payload(tenant_id)
    assignment = await upsert_assignment(session, tenant_id, demo_payload)
    return AssignmentRead.model_validate(assignment)
