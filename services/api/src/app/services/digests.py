from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import DigestHistory, Task


@dataclass(slots=True)
class DigestStats:
    total: int
    completed: int
    in_progress: int
    backlog: int
    overdue: int

    def as_dict(self) -> dict[str, int]:
        return {
            "total": self.total,
            "completed": self.completed,
            "in_progress": self.in_progress,
            "backlog": self.backlog,
            "overdue": self.overdue,
        }


def _default_period() -> tuple[datetime, datetime]:
    period_end = datetime.now(UTC).replace(microsecond=0)
    period_start = period_end - timedelta(days=1)
    return period_start, period_end


def _as_query_timestamp(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(UTC).replace(tzinfo=None)
    return value


def _ensure_timezone(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


async def _compute_task_stats(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    period_start: datetime,
    period_end: datetime,
) -> DigestStats:
    statement = (
        select(
            func.count().label("total"),
            func.count().filter(Task.status == "completed").label("completed"),
            func.count().filter(Task.status == "in_progress").label("in_progress"),
            func.count().filter(Task.status == "backlog").label("backlog"),
            func.count()
            .filter(
                (Task.due_at.isnot(None))
                & (Task.due_at < period_end)
                & (Task.status != "completed")
            )
            .label("overdue"),
        )
        .where(
            Task.tenant_id == tenant_id,
            Task.updated_at >= period_start,
            Task.updated_at < period_end,
        )
    )
    result = await session.execute(statement)
    row = result.one()
    return DigestStats(
        total=row.total or 0,
        completed=row.completed or 0,
        in_progress=row.in_progress or 0,
        backlog=row.backlog or 0,
        overdue=row.overdue or 0,
    )


def _compose_summary(stats: DigestStats, period_start: datetime, period_end: datetime) -> str:
    window = f"{period_start.date().isoformat()} → {period_end.date().isoformat()}"
    if stats.total == 0:
        return f"No task activity recorded for the period {window}."
    lines = [
        f"Digest for {window}:",
        f"- {stats.completed} tasks completed",
        f"- {stats.in_progress} tasks in progress",
        f"- {stats.backlog} tasks still in backlog",
    ]
    if stats.overdue:
        lines.append(f"- {stats.overdue} tasks overdue")
    return "\n".join(lines)


async def generate_digest(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    team_id: uuid.UUID | None = None,
    period_start: datetime | None = None,
    period_end: datetime | None = None,
) -> DigestHistory:
    if period_start is None or period_end is None:
        default_start, default_end = _default_period()
        period_start = period_start or default_start
        period_end = period_end or default_end

    query_start = _as_query_timestamp(period_start)
    query_end = _as_query_timestamp(period_end)

    stats = await _compute_task_stats(session, tenant_id, period_start=query_start, period_end=query_end)
    summary_text = _compose_summary(stats, _ensure_timezone(period_start), _ensure_timezone(period_end))

    digest = DigestHistory(
        tenant_id=tenant_id,
        team_id=team_id,
        period_start=_ensure_timezone(period_start),
        period_end=_ensure_timezone(period_end),
        summary_text=summary_text,
        metadata_json={"stats": stats.as_dict()},
    )
    session.add(digest)
    await session.flush()
    await session.refresh(digest)
    return digest
