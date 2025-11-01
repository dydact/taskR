from __future__ import annotations

import uuid
from typing import Iterable

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import Dashboard
from app.routes.utils import get_space, get_tenant
from app.schemas import DashboardRead, DashboardUpdate, DashboardWidget
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/dashboards", tags=["dashboards"])


def _default_layout() -> list[dict]:
    return [
        {
            "widget_id": str(uuid.uuid4()),
            "widget_type": "status_summary",
            "title": "Status Breakdown",
            "position": {"x": 0, "y": 0, "w": 3, "h": 3},
            "config": {},
        },
        {
            "widget_id": str(uuid.uuid4()),
            "widget_type": "workload",
            "title": "Workload",
            "position": {"x": 3, "y": 0, "w": 3, "h": 3},
            "config": {},
        },
        {
            "widget_id": str(uuid.uuid4()),
            "widget_type": "velocity",
            "title": "Velocity (30d)",
            "position": {"x": 6, "y": 0, "w": 6, "h": 3},
            "config": {"window_days": 30},
        },
        {
            "widget_id": str(uuid.uuid4()),
            "widget_type": "burn_down",
            "title": "Burn-down (14d)",
            "position": {"x": 0, "y": 3, "w": 6, "h": 3},
            "config": {"days": 14},
        },
        {
            "widget_id": str(uuid.uuid4()),
            "widget_type": "throughput",
            "title": "Throughput (12w)",
            "position": {"x": 6, "y": 3, "w": 6, "h": 3},
            "config": {"weeks": 12},
        },
        {
            "widget_id": str(uuid.uuid4()),
            "widget_type": "cycle_efficiency",
            "title": "Cycle Efficiency",
            "position": {"x": 0, "y": 6, "w": 4, "h": 3},
            "config": {"days": 30},
        },
        {
            "widget_id": str(uuid.uuid4()),
            "widget_type": "overdue",
            "title": "Overdue Tasks",
            "position": {"x": 4, "y": 6, "w": 4, "h": 2},
            "config": {},
        },
        {
            "widget_id": str(uuid.uuid4()),
            "widget_type": "metric_cards",
            "title": "Summary Metrics",
            "position": {"x": 8, "y": 6, "w": 4, "h": 2},
            "config": {},
        },
        {
            "widget_id": str(uuid.uuid4()),
            "widget_type": "preference_guardrail",
            "title": "Automation Guardrails",
            "position": {"x": 8, "y": 8, "w": 4, "h": 3},
            "config": {},
        },
    ]


async def _get_dashboard(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    space_id: uuid.UUID,
    slug: str = "default",
) -> Dashboard | None:
    result = await session.execute(
        select(Dashboard).where(
            Dashboard.tenant_id == tenant_id,
            Dashboard.space_id == space_id,
            Dashboard.slug == slug,
        )
    )
    return result.scalar_one_or_none()


def _serialize_widgets(payload: Iterable[dict]) -> list[DashboardWidget]:
    widgets: list[DashboardWidget] = []
    for raw in payload:
        try:
            widgets.append(DashboardWidget.model_validate(raw))
        except ValidationError:
            continue
    return widgets


def _dashboard_to_schema(dashboard: Dashboard) -> DashboardRead:
    widgets = _serialize_widgets(dashboard.layout_json or [])
    return DashboardRead(
        dashboard_id=dashboard.dashboard_id,
        tenant_id=dashboard.tenant_id,
        space_id=dashboard.space_id,
        slug=dashboard.slug,
        name=dashboard.name,
        layout=widgets,
        metadata_json=dashboard.metadata_json or {},
    )


@router.get("/spaces/{space_identifier}", response_model=DashboardRead)
async def get_dashboard(
    space_identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DashboardRead:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)

    dashboard = await _get_dashboard(session, tenant.tenant_id, space.space_id)
    if dashboard is None:
        dashboard = Dashboard(
            tenant_id=tenant.tenant_id,
            space_id=space.space_id,
            name=f"{space.name} Dashboard",
            slug="default",
            layout_json=_default_layout(),
            metadata_json={},
        )
        session.add(dashboard)
        await session.flush()
        await session.refresh(dashboard)

    return _dashboard_to_schema(dashboard)


@router.put("/spaces/{space_identifier}", response_model=DashboardRead)
async def put_dashboard(
    space_identifier: str,
    payload: DashboardUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DashboardRead:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)

    dashboard = await _get_dashboard(session, tenant.tenant_id, space.space_id)
    if dashboard is None:
        dashboard = Dashboard(
            tenant_id=tenant.tenant_id,
            space_id=space.space_id,
            name=f"{space.name} Dashboard",
            slug="default",
            layout_json=_default_layout(),
            metadata_json={},
        )
        session.add(dashboard)
        await session.flush()
        await session.refresh(dashboard)

    if payload.name is not None:
        dashboard.name = payload.name
    if payload.metadata_json is not None:
        dashboard.metadata_json = payload.metadata_json
    if payload.layout is not None:
        if not payload.layout:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dashboard must contain at least one widget")
        dashboard.layout_json = [widget.model_dump() for widget in payload.layout]

    await session.flush()
    await session.refresh(dashboard)
    return _dashboard_to_schema(dashboard)
