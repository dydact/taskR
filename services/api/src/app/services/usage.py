from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select

from app.models.core import UsageStat


async def adjust_usage(
    session: AsyncSession,
    tenant_id,
    metric: str,
    delta: int,
) -> None:
    if delta == 0:
        return
    today = datetime.now(timezone.utc).date()
    now_ts = datetime.now(timezone.utc).replace(tzinfo=None)

    stmt = pg_insert(UsageStat).values(
        tenant_id=tenant_id,
        metric=metric,
        period_date=today,
        count=max(delta, 0),
        created_at=now_ts,
        updated_at=now_ts,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[UsageStat.tenant_id, UsageStat.metric, UsageStat.period_date],
        set_={
            "count": func.greatest(UsageStat.count + delta, 0),
            "updated_at": now_ts,
        },
    )
    await session.execute(stmt)
    await session.flush()


async def get_usage(
    session: AsyncSession,
    tenant_id,
    metric: str | None = None,
    limit: int = 30,
) -> list[UsageStat]:
    query = select(UsageStat).where(UsageStat.tenant_id == tenant_id)
    if metric:
        query = query.where(UsageStat.metric == metric)
    query = query.order_by(UsageStat.period_date.desc()).limit(limit)
    result = await session.execute(query)
    return result.scalars().all()
