from __future__ import annotations

import sys
import types
from datetime import datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

pytest.importorskip("aiosqlite")

if "asyncpg" not in sys.modules:
    sys.modules["asyncpg"] = types.ModuleType("asyncpg")

from app.models.base import Base
from app.models.core import (
    List,
    ListStatus,
    Space,
    SpacePlanPoint,
    Task,
    Tenant,
    User,
    Worklog,
)
from app.routes.analytics import (
    analytics_cache,
    analytics_summary,
    burn_down_series,
    cycle_efficiency,
    overdue_summary,
    throughput_histogram,
)
from common_auth import TenantHeaders


@pytest.mark.asyncio
async def test_analytics_endpoints_compute_expected_metrics():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    now = datetime.utcnow()

    async with SessionLocal() as session:
        tenant = Tenant(slug="acme", name="Acme Corp", status="active")
        session.add(tenant)
        await session.flush()

        space = Space(tenant_id=tenant.tenant_id, slug="alpha", name="Alpha Space")
        session.add(space)
        await session.flush()

        task_list = List(
            tenant_id=tenant.tenant_id,
            space_id=space.space_id,
            name="Sprint Board",
            position=0,
        )
        session.add(task_list)
        await session.flush()

        status_todo = ListStatus(
            tenant_id=tenant.tenant_id,
            list_id=task_list.list_id,
            name="Todo",
            position=0,
            is_done=False,
        )
        status_blocked = ListStatus(
            tenant_id=tenant.tenant_id,
            list_id=task_list.list_id,
            name="Blocked",
            position=1,
            is_done=False,
        )
        status_done = ListStatus(
            tenant_id=tenant.tenant_id,
            list_id=task_list.list_id,
            name="Done",
            position=2,
            is_done=True,
        )
        session.add_all([status_todo, status_blocked, status_done])

        engineer = User(
            tenant_id=tenant.tenant_id,
            email="engineer@example.com",
            given_name="Alex",
            family_name="Doe",
        )
        session.add(engineer)
        await session.flush()

        task_active = Task(
            tenant_id=tenant.tenant_id,
            space_id=space.space_id,
            list_id=task_list.list_id,
            title="Implement feature",
            status="Todo",
            created_at=now - timedelta(days=2),
            updated_at=now - timedelta(days=1),
            due_at=now + timedelta(days=3),
        )
        task_blocked = Task(
            tenant_id=tenant.tenant_id,
            space_id=space.space_id,
            list_id=task_list.list_id,
            title="Blocked task",
            status="Blocked",
            created_at=now - timedelta(days=4),
            updated_at=now - timedelta(days=2),
            due_at=now - timedelta(days=3),
        )
        task_done = Task(
            tenant_id=tenant.tenant_id,
            space_id=space.space_id,
            list_id=task_list.list_id,
            title="Completed task",
            status="Done",
            created_at=now - timedelta(days=5),
            updated_at=now - timedelta(days=1),
            due_at=now - timedelta(days=1),
            assignee_id=engineer.user_id,
        )
        session.add_all([task_active, task_blocked, task_done])
        await session.flush()

        worklog = Worklog(
            tenant_id=tenant.tenant_id,
            task_id=task_done.task_id,
            user_id=engineer.user_id,
            minutes_spent=180,
            logged_at=now - timedelta(days=1),
        )
        session.add(worklog)

        plan_point = SpacePlanPoint(
            tenant_id=tenant.tenant_id,
            space_id=space.space_id,
            target_date=(now - timedelta(days=3)).date(),
            planned_count=5,
        )
        session.add(plan_point)

        await session.commit()

        headers = TenantHeaders(tenant_id=str(tenant.tenant_id))
        await analytics_cache.invalidate_for_space(tenant.tenant_id, space.space_id)

        burn = await burn_down_series(space.slug, session=session, headers=headers, days=7)
        assert burn.total_scope == 3
        assert len(burn.points) == 7
        assert burn.points[-1].completed == 1

        cycle = await cycle_efficiency(space.slug, session=session, headers=headers, days=30)
        assert cycle.sample_size == 1
        assert cycle.avg_active_hours == pytest.approx(3.0, rel=1e-2)
        assert cycle.avg_cycle_hours > cycle.avg_active_hours
        assert cycle.efficiency_percent < 10.0

        throughput = await throughput_histogram(space.slug, session=session, headers=headers, weeks=4)
        assert throughput.window_weeks == 4
        assert len(throughput.buckets) >= 1
        assert any(bucket.completed > 0 for bucket in throughput.buckets)

        overdue = await overdue_summary(space.slug, session=session, headers=headers)
        assert overdue.total_overdue == 1
        assert overdue.due_soon == 0

        summary = await analytics_summary(space.slug, session=session, headers=headers)
        metrics = {card.key: card for card in summary.cards}
        assert metrics["active"].value == 2
        assert metrics["blocked"].value == 1
        assert metrics["completed_7d"].value == 1
        assert metrics["overdue"].value == 1
        assert metrics["avg_cycle_hours"].value > 0

    await engine.dispose()
