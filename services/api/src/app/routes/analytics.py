from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timedelta
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.deps import get_db_session
from app.models.core import ListStatus, SpacePlanPoint, Task, User, Worklog
from app.routes.utils import get_list, get_space, get_tenant
from app.schemas import (
    AnalyticsSummary,
    BurnDownPoint,
    BurnDownSeries,
    CycleEfficiencyMetrics,
    MetricCard,
    OverdueSummary,
    StatusSummary,
    StatusSummaryEntry,
    ThroughputBucket,
    ThroughputHistogram,
    VelocityPoint,
    VelocitySeries,
    WorkloadEntry,
    WorkloadSummary,
)
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/analytics", tags=["analytics"])


class AnalyticsCache:
    def __init__(self, ttl_seconds: int = 30) -> None:
        self._ttl = timedelta(seconds=ttl_seconds)
        self._store: dict[tuple, tuple[datetime, dict]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: tuple) -> dict | None:
        async with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires_at, payload = entry
            if expires_at <= datetime.utcnow():
                del self._store[key]
                return None
            return payload

    async def set(self, key: tuple, value: dict) -> None:
        async with self._lock:
            self._store[key] = (datetime.utcnow() + self._ttl, value)

    async def get_or_build(self, key: tuple, builder) -> dict:
        cached = await self.get(key)
        if cached is not None:
            return cached
        value = await builder()
        await self.set(key, value)
        return value

    async def invalidate_for_space(self, tenant_id: uuid.UUID, space_id: uuid.UUID) -> None:
        async with self._lock:
            keys = [key for key in self._store if len(key) >= 3 and key[1] == tenant_id and key[2] == space_id]
            for key in keys:
                del self._store[key]


analytics_cache = AnalyticsCache(ttl_seconds=45)


async def _resolve_list_identifier(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    space_id: uuid.UUID,
    list_id: str | None,
) -> uuid.UUID | None:
    if not list_id:
        return None
    try:
        list_uuid = uuid.UUID(list_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid list identifier") from exc
    list_obj = await get_list(session, tenant_id, list_uuid)
    if list_obj.space_id != space_id:
        raise HTTPException(status_code=400, detail="List not in space")
    return list_uuid


@router.get("/spaces/{space_identifier}/status-summary", response_model=StatusSummary)
async def status_summary(
    space_identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    list_id: str | None = Query(default=None),
) -> StatusSummary:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)

    list_uuid = await _resolve_list_identifier(session, tenant.tenant_id, space.space_id, list_id)

    cache_key = ("status", tenant.tenant_id, space.space_id, list_uuid)

    async def build() -> dict:
        query = select(Task.status, func.count(Task.task_id)).where(
            Task.tenant_id == tenant.tenant_id,
            Task.space_id == space.space_id,
        )
        if list_uuid is not None:
            query = query.where(Task.list_id == list_uuid)
        query = query.group_by(Task.status)
        result = await session.execute(query)
        entries = [StatusSummaryEntry(status=row[0], count=row[1]).model_dump() for row in result]
        return {
            "space_id": space.space_id,
            "list_id": list_uuid,
            "entries": entries,
        }

    data = await analytics_cache.get_or_build(cache_key, build)
    return StatusSummary.model_validate(data)


@router.get("/spaces/{space_identifier}/workload", response_model=WorkloadSummary)
async def workload_summary(
    space_identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> WorkloadSummary:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)

    cache_key = ("workload", tenant.tenant_id, space.space_id)

    async def build() -> dict:
        task_counts = await session.execute(
            select(Task.assignee_id, func.count(Task.task_id)).where(
                Task.tenant_id == tenant.tenant_id,
                Task.space_id == space.space_id,
            ).group_by(Task.assignee_id)
        )
        count_map = {row[0]: row[1] for row in task_counts}

        worklog_sums = await session.execute(
            select(Worklog.user_id, func.coalesce(func.sum(Worklog.minutes_spent), 0)).where(
                Worklog.tenant_id == tenant.tenant_id,
            ).group_by(Worklog.user_id)
        )
        minutes_map = {row[0]: row[1] for row in worklog_sums}

        user_ids = [uid for uid in count_map.keys() if uid is not None]
        emails: dict[uuid.UUID, str | None] = {}
        if user_ids:
            user_rows = await session.execute(
                select(User.user_id, User.email).where(User.user_id.in_(user_ids))
            )
            emails = {row[0]: row[1] for row in user_rows}

        entries: list[dict] = []
        for assignee_id, task_count in count_map.items():
            total_minutes = minutes_map.get(assignee_id, 0)
            email = emails.get(assignee_id) if assignee_id else None
            entry = WorkloadEntry(
                assignee_id=assignee_id,
                assignee_email=email,
                task_count=task_count,
                total_minutes=total_minutes,
            )
            entries.append(entry.model_dump())
        return {
            "space_id": space.space_id,
            "entries": entries,
        }

    data = await analytics_cache.get_or_build(cache_key, build)
    return WorkloadSummary.model_validate(data)


@router.get("/spaces/{space_identifier}/velocity", response_model=VelocitySeries)
async def velocity_series(
    space_identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    days: int = Query(default=30, ge=1, le=180),
) -> VelocitySeries:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)

    cutoff = datetime.utcnow() - timedelta(days=days)
    cache_key = ("velocity", tenant.tenant_id, space.space_id, days)

    async def build() -> dict:
        truncated = func.date_trunc("day", Task.updated_at).label("day_bucket")
        query = (
            select(truncated, func.count(Task.task_id))
            .select_from(Task)
            .join(
                ListStatus,
                (ListStatus.tenant_id == Task.tenant_id)
                & (ListStatus.list_id == Task.list_id)
                & (func.lower(ListStatus.name) == func.lower(Task.status)),
            )
            .where(
                Task.tenant_id == tenant.tenant_id,
                Task.space_id == space.space_id,
                ListStatus.is_done.is_(True),
                Task.updated_at >= cutoff,
            )
            .group_by(truncated)
            .order_by(truncated)
        )
        result = await session.execute(query)
        points = [VelocityPoint(date=row[0], completed=row[1]).model_dump() for row in result]
        return {
            "space_id": space.space_id,
            "window_days": days,
            "points": points,
        }

    data = await analytics_cache.get_or_build(cache_key, build)
    return VelocitySeries.model_validate(data)


@router.get("/spaces/{space_identifier}/burn-down", response_model=BurnDownSeries)
async def burn_down_series(
    space_identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    days: int = Query(default=14, ge=1, le=90),
    list_id: str | None = Query(default=None),
) -> BurnDownSeries:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)
    list_uuid = await _resolve_list_identifier(session, tenant.tenant_id, space.space_id, list_id)

    start_dt = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
    end_dt = datetime.utcnow()
    status_alias = aliased(ListStatus)

    cache_key = ("burn_down", tenant.tenant_id, space.space_id, days, list_uuid)

    async def build() -> dict:
        stmt = (
            select(
                Task.task_id,
                Task.created_at,
                Task.updated_at,
                status_alias.is_done.label("is_done"),
            )
            .join(
                status_alias,
                (status_alias.tenant_id == Task.tenant_id)
                & (status_alias.list_id == Task.list_id)
                & (func.lower(status_alias.name) == func.lower(Task.status)),
                isouter=True,
            )
            .where(
                Task.tenant_id == tenant.tenant_id,
                Task.space_id == space.space_id,
                Task.created_at >= start_dt,
            )
        )
        if list_uuid is not None:
            stmt = stmt.where(Task.list_id == list_uuid)

        result = await session.execute(stmt)
        rows = result.all()
        total_scope = len(rows)

        if total_scope == 0:
            dates = [start_dt.date() + timedelta(days=offset) for offset in range(days)]
        else:
            dates = [start_dt.date() + timedelta(days=offset) for offset in range(days)]

        completions = defaultdict(int)
        for row in rows:
            updated_at = row.updated_at
            is_done = bool(row.is_done)
            if is_done and updated_at is not None and updated_at >= start_dt and updated_at <= end_dt:
                completions[updated_at.date()] += 1

        plan_stmt = (
            select(SpacePlanPoint.target_date, SpacePlanPoint.planned_count)
            .where(
                SpacePlanPoint.tenant_id == tenant.tenant_id,
                SpacePlanPoint.space_id == space.space_id,
                SpacePlanPoint.target_date >= dates[0],
                SpacePlanPoint.target_date <= dates[-1],
            )
        )
        if list_uuid is not None:
            # plan points are scoped per space; list-aware plans can be layered later
            pass
        plan_rows = await session.execute(plan_stmt)
        plan_map = {row.target_date: row.planned_count for row in plan_rows}

        slope = total_scope / (days - 1) if days > 1 else 0
        cumulative = 0
        points: list[dict] = []
        for index, current_date in enumerate(dates):
            planned_default = max(int(round(total_scope - slope * index)), 0) if total_scope > 0 else 0
            planned_value = plan_map.get(current_date, planned_default)
            cumulative += completions.get(current_date, 0)
            remaining = max(planned_value - cumulative, 0)
            points.append(
                BurnDownPoint(
                    date=current_date,
                    planned=planned_value,
                    completed=cumulative,
                    remaining=remaining,
                ).model_dump()
            )

        return {
            "space_id": space.space_id,
            "window_days": days,
            "total_scope": total_scope,
            "points": points,
        }

    data = await analytics_cache.get_or_build(cache_key, build)
    return BurnDownSeries.model_validate(data)


@router.get("/spaces/{space_identifier}/cycle-efficiency", response_model=CycleEfficiencyMetrics)
async def cycle_efficiency(
    space_identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    days: int = Query(default=30, ge=1, le=180),
    list_id: str | None = Query(default=None),
) -> CycleEfficiencyMetrics:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)
    list_uuid = await _resolve_list_identifier(session, tenant.tenant_id, space.space_id, list_id)
    cutoff = datetime.utcnow() - timedelta(days=days)
    status_alias = aliased(ListStatus)

    cache_key = ("cycle_efficiency", tenant.tenant_id, space.space_id, days, list_uuid)

    async def build() -> dict:
        stmt = (
            select(
                Task.task_id,
                Task.created_at,
                Task.updated_at,
                func.coalesce(func.sum(Worklog.minutes_spent), 0).label("active_minutes"),
            )
            .join(
                status_alias,
                (status_alias.tenant_id == Task.tenant_id)
                & (status_alias.list_id == Task.list_id)
                & (func.lower(status_alias.name) == func.lower(Task.status)),
            )
            .outerjoin(
                Worklog,
                (Worklog.tenant_id == Task.tenant_id) & (Worklog.task_id == Task.task_id),
            )
            .where(
                Task.tenant_id == tenant.tenant_id,
                Task.space_id == space.space_id,
                status_alias.is_done.is_(True),
                Task.updated_at.is_not(None),
                Task.updated_at >= cutoff,
            )
            .group_by(Task.task_id, Task.created_at, Task.updated_at)
        )
        if list_uuid is not None:
            stmt = stmt.where(Task.list_id == list_uuid)

        result = await session.execute(stmt)
        rows = result.all()
        sample_size = len(rows)

        if sample_size == 0:
            return {
                "space_id": space.space_id,
                "window_days": days,
                "sample_size": 0,
                "avg_cycle_hours": 0.0,
                "avg_active_hours": 0.0,
                "avg_wait_hours": 0.0,
                "efficiency_percent": 0.0,
            }

        total_cycle_hours = 0.0
        total_active_hours = 0.0
        for row in rows:
            created_at = row.created_at or cutoff
            updated_at = row.updated_at or created_at
            cycle_seconds = (updated_at - created_at).total_seconds()
            if cycle_seconds < 0:
                continue
            total_cycle_hours += cycle_seconds / 3600.0
            total_active_hours += (row.active_minutes or 0) / 60.0

        if sample_size == 0 or total_cycle_hours <= 0:
            avg_cycle = 0.0
            avg_active = 0.0
        else:
            avg_cycle = total_cycle_hours / sample_size
            avg_active = total_active_hours / sample_size

        avg_wait = max(avg_cycle - avg_active, 0.0)
        efficiency = (avg_active / avg_cycle * 100.0) if avg_cycle > 0 else 0.0

        return {
            "space_id": space.space_id,
            "window_days": days,
            "sample_size": sample_size,
            "avg_cycle_hours": round(avg_cycle, 2),
            "avg_active_hours": round(avg_active, 2),
            "avg_wait_hours": round(avg_wait, 2),
            "efficiency_percent": round(efficiency, 2),
        }

    data = await analytics_cache.get_or_build(cache_key, build)
    return CycleEfficiencyMetrics.model_validate(data)


@router.get("/spaces/{space_identifier}/throughput", response_model=ThroughputHistogram)
async def throughput_histogram(
    space_identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    weeks: int = Query(default=12, ge=1, le=52),
    list_id: str | None = Query(default=None),
) -> ThroughputHistogram:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)
    list_uuid = await _resolve_list_identifier(session, tenant.tenant_id, space.space_id, list_id)
    cutoff = datetime.utcnow() - timedelta(weeks=weeks - 1)
    status_alias = aliased(ListStatus)

    cache_key = ("throughput", tenant.tenant_id, space.space_id, weeks, list_uuid)

    async def build() -> dict:
        stmt = (
            select(Task.updated_at)
            .join(
                status_alias,
                (status_alias.tenant_id == Task.tenant_id)
                & (status_alias.list_id == Task.list_id)
                & (func.lower(status_alias.name) == func.lower(Task.status)),
            )
            .where(
                Task.tenant_id == tenant.tenant_id,
                Task.space_id == space.space_id,
                status_alias.is_done.is_(True),
                Task.updated_at.is_not(None),
                Task.updated_at >= cutoff,
            )
        )
        if list_uuid is not None:
            stmt = stmt.where(Task.list_id == list_uuid)

        result = await session.execute(stmt)
        timestamps = [row.updated_at for row in result.fetchall() if row.updated_at is not None]

        if not timestamps:
            buckets = []
        else:
            start_week = cutoff.date() - timedelta(days=cutoff.date().weekday())
            current_week = datetime.utcnow().date() - timedelta(days=datetime.utcnow().date().weekday())
            week_cursor = start_week
            bucket_map: dict[tuple[int, int], int] = defaultdict(int)
            for ts in timestamps:
                day = ts.date()
                week_start = day - timedelta(days=day.weekday())
                key = (week_start.year, week_start.isocalendar().week)
                bucket_map[key] += 1

            buckets: list[dict] = []
            while week_cursor <= current_week:
                key = (week_cursor.year, week_cursor.isocalendar().week)
                count = bucket_map.get(key, 0)
                buckets.append(
                    ThroughputBucket(week_start=week_cursor, completed=count).model_dump()
                )
                week_cursor += timedelta(weeks=1)

        return {
            "space_id": space.space_id,
            "window_weeks": weeks,
            "buckets": buckets,
        }

    data = await analytics_cache.get_or_build(cache_key, build)
    return ThroughputHistogram.model_validate(data)


@router.get("/spaces/{space_identifier}/overdue", response_model=OverdueSummary)
async def overdue_summary(
    space_identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    list_id: str | None = Query(default=None),
) -> OverdueSummary:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)
    list_uuid = await _resolve_list_identifier(session, tenant.tenant_id, space.space_id, list_id)
    status_alias = aliased(ListStatus)
    now = datetime.utcnow()

    cache_key = ("overdue", tenant.tenant_id, space.space_id, list_uuid)

    async def build() -> dict:
        stmt = (
            select(Task.due_at, status_alias.is_done)
            .join(
                status_alias,
                (status_alias.tenant_id == Task.tenant_id)
                & (status_alias.list_id == Task.list_id)
                & (func.lower(status_alias.name) == func.lower(Task.status)),
                isouter=True,
            )
            .where(
                Task.tenant_id == tenant.tenant_id,
                Task.space_id == space.space_id,
                Task.due_at.is_not(None),
            )
        )
        if list_uuid is not None:
            stmt = stmt.where(Task.list_id == list_uuid)

        result = await session.execute(stmt)
        overdue = 0
        severe = 0
        due_soon = 0
        total_days_overdue = 0.0

        for row in result:
            due_at = row.due_at
            is_done = bool(row.is_done)
            if due_at is None or is_done:
                continue
            if due_at < now:
                overdue += 1
                days = (now - due_at).total_seconds() / 86400.0
                total_days_overdue += days
                if days >= 7:
                    severe += 1
            elif due_at <= now + timedelta(days=7):
                due_soon += 1

        avg_days = (total_days_overdue / overdue) if overdue > 0 else None

        return {
            "space_id": space.space_id,
            "total_overdue": overdue,
            "severe_overdue": severe,
            "avg_days_overdue": round(avg_days, 1) if avg_days is not None else None,
            "due_soon": due_soon,
        }

    data = await analytics_cache.get_or_build(cache_key, build)
    return OverdueSummary.model_validate(data)


@router.get("/spaces/{space_identifier}/summary", response_model=AnalyticsSummary)
async def analytics_summary(
    space_identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    list_id: str | None = Query(default=None),
) -> AnalyticsSummary:
    tenant = await get_tenant(session, headers.tenant_id)
    space = await get_space(session, tenant.tenant_id, space_identifier)
    list_uuid = await _resolve_list_identifier(session, tenant.tenant_id, space.space_id, list_id)
    status_alias = aliased(ListStatus)
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)

    cache_key = ("summary", tenant.tenant_id, space.space_id, list_uuid)

    async def build() -> dict:
        stmt = (
            select(
                Task.task_id,
                Task.created_at,
                Task.updated_at,
                Task.assignee_id,
                Task.due_at,
                func.lower(Task.status).label("status_name"),
                status_alias.is_done.label("is_done"),
            )
            .join(
                status_alias,
                (status_alias.tenant_id == Task.tenant_id)
                & (status_alias.list_id == Task.list_id)
                & (func.lower(status_alias.name) == func.lower(Task.status)),
                isouter=True,
            )
            .where(
                Task.tenant_id == tenant.tenant_id,
                Task.space_id == space.space_id,
            )
        )
        if list_uuid is not None:
            stmt = stmt.where(Task.list_id == list_uuid)

        result = await session.execute(stmt)
        rows = result.fetchall()

        active_count = 0
        overdue_count = 0
        blocked_count = 0
        completed_last_week = 0
        unassigned_count = 0
        total_cycle = 0.0
        done_sample = 0

        for row in rows:
            status_name = row.status_name or ""
            is_done = bool(row.is_done)
            created_at = row.created_at or now
            updated_at = row.updated_at or created_at

            if not is_done:
                active_count += 1
                if row.assignee_id is None:
                    unassigned_count += 1
                if row.due_at and row.due_at < now:
                    overdue_count += 1
                if status_name in {"blocked", "blocked_on", "blocked-on"}:
                    blocked_count += 1
            else:
                if updated_at >= week_ago:
                    completed_last_week += 1
                if updated_at >= created_at:
                    total_cycle += (updated_at - created_at).total_seconds() / 3600.0
                    done_sample += 1

        avg_cycle = (total_cycle / done_sample) if done_sample > 0 else 0.0

        cards = [
            MetricCard(key="active", label="Active Tasks", value=active_count).model_dump(),
            MetricCard(key="blocked", label="Blocked Tasks", value=blocked_count).model_dump(),
            MetricCard(key="completed_7d", label="Completed (7d)", value=completed_last_week).model_dump(),
            MetricCard(key="overdue", label="Overdue Tasks", value=overdue_count).model_dump(),
            MetricCard(key="unassigned", label="Unassigned", value=unassigned_count).model_dump(),
            MetricCard(key="avg_cycle_hours", label="Avg Cycle (hrs)", value=round(avg_cycle, 1)).model_dump(),
        ]

        return {
            "space_id": space.space_id,
            "cards": cards,
        }

    data = await analytics_cache.get_or_build(cache_key, build)
    return AnalyticsSummary.model_validate(data)
