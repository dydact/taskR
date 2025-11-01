from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import TenantConfig

CONFIG_KEY_CLEARINGHOUSE = "clearinghouse"


async def get_config_record(session: AsyncSession, tenant_id: Any, key: str) -> TenantConfig | None:
    stmt = select(TenantConfig).where(
        TenantConfig.tenant_id == tenant_id,
        TenantConfig.cfg_key == key,
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_config_value(session: AsyncSession, tenant_id: Any, key: str) -> dict | None:
    record = await get_config_record(session, tenant_id, key)
    return record.cfg_value if record else None


async def upsert_config(session: AsyncSession, tenant_id: Any, key: str, value: dict) -> None:
    stmt = (
        insert(TenantConfig)
        .values(tenant_id=tenant_id, cfg_key=key, cfg_value=value)
        .on_conflict_do_update(
            index_elements=[TenantConfig.tenant_id, TenantConfig.cfg_key],
            set_={"cfg_value": value},
        )
    )
    await session.execute(stmt)
