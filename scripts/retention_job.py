#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services/api/src"))

from sqlalchemy import select

from app.core.db import get_session
from app.models.core import RetentionPolicy, Tenant
from app.services.retention import apply_retention, fetch_retention_policies


async def run(tenant_slug: str | None, resource: str | None) -> None:
    async with get_session() as session:
        tenant_stmt = select(Tenant)
        if tenant_slug:
            tenant_stmt = tenant_stmt.where(Tenant.slug == tenant_slug)
        tenants = (await session.execute(tenant_stmt)).scalars().all()
        if not tenants:
            print("No tenants found for retention job")
            return

        for tenant in tenants:
            policies = await fetch_retention_policies(session, tenant.tenant_id)
            deletions = await apply_retention(session, tenant.tenant_id, policies)
            if resource:
                deletions = {k: v for k, v in deletions.items() if k == resource}
            print(f"Tenant {tenant.slug}: {deletions}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply retention policies")
    parser.add_argument("--tenant", help="Tenant slug", default=None)
    parser.add_argument("--resource", help="Filter by resource type", default=None)
    args = parser.parse_args()
    asyncio.run(run(args.tenant, args.resource))


if __name__ == "__main__":
    main()
