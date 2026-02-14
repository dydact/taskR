#!/usr/bin/env python3
"""
Populate TaskR with demo data for a given tenant.

This script is intended for local/testing environments where you want to load
representative data without importing database dumps. It reuses the internal
`populate_demo` service, so the same logic powers the API endpoint and the UI
toggle.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

# Ensure the TaskR API source is importable
REPO_ROOT = Path(__file__).resolve().parents[2]
API_SRC = REPO_ROOT / "services" / "api" / "src"
if str(API_SRC) not in sys.path:
    sys.path.append(str(API_SRC))

from app.core.config import settings  # type: ignore  # noqa: E402
from app.core.db import SessionLocal  # type: ignore  # noqa: E402
from app.services.demo_seed import DemoSeedOptions, populate_demo  # type: ignore  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Populate TaskR demo data")
    parser.add_argument("--tenant", required=True, help="Tenant slug or UUID to populate")
    parser.add_argument(
        "--spaces", type=int, default=3, help="Number of spaces to generate (default: 3)"
    )
    parser.add_argument(
        "--lists", type=int, default=3, help="Number of lists per space (default: 3)"
    )
    parser.add_argument(
        "--tasks", type=int, default=10, help="Number of tasks per list (default: 10)"
    )
    parser.add_argument(
        "--comments", type=int, default=3, help="Number of comments per task (default: 3)"
    )
    parser.add_argument(
        "--docs", type=int, default=2, help="Number of docs per space (default: 2)"
    )
    parser.add_argument(
        "--schedule", type=int, default=6, help="Number of schedule entries (default: 6)"
    )
    return parser.parse_args()


async def run_demo(args: argparse.Namespace) -> None:
    options = DemoSeedOptions(
        spaces=args.spaces,
        lists_per_space=args.lists,
        tasks_per_list=args.tasks,
        comments_per_task=args.comments,
        docs_per_space=args.docs,
        schedule_entries=args.schedule,
    )
    async with SessionLocal() as session:
        result = await populate_demo(session, args.tenant, options)
        await session.commit()

    print("---- Demo Data Summary ----")
    print(f"Tenant:        {args.tenant} ({result.tenant_id})")
    print(f"Spaces:        {result.spaces}")
    print(f"Lists:         {result.lists}")
    print(f"Tasks:         {result.tasks}")
    print(f"Comments:      {result.comments}")
    print(f"Docs:          {result.docs}")
    print(f"Employees:     {result.employees}")
    print(f"Operators:     {result.operators}")
    print(f"Clients:       {result.clients}")
    print(f"Schedule rows: {result.schedule_entries}")


def main() -> int:
    if not os.getenv("TR_DATABASE_URL") and settings.database_url is None:
        print("TR_DATABASE_URL must be set before running this script", file=sys.stderr)
        return 1
    args = parse_args()
    asyncio.run(run_demo(args))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
