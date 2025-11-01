#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services/api/src"))

from sqlalchemy import select

from app.core.db import get_session
from app.core.circuit import CircuitBreaker
from app.models.core import FlowTemplate
from app.services.autopm import generate_suggestions
from app.services.flows import start_flow_run


async def run(category: str | None, limit: int) -> None:
    async with get_session() as session:
        statement = select(FlowTemplate).where(FlowTemplate.is_active.is_(True))
        if category:
            statement = statement.where(FlowTemplate.category == category)
        templates = (await session.execute(statement)).scalars().all()
        if not templates:
            print("No flow templates found for autopm agent")
            return

        breaker = CircuitBreaker("autopm-agent")
        for template in templates:
            if breaker.is_open:
                print("Circuit open; skipping remaining templates")
                break
            try:
                run = await start_flow_run(session, template)
                await generate_suggestions(session, run, limit=limit)
                run.status = "completed"
                await session.flush()
                await session.refresh(run)
                breaker.record_success()
                print(f"Generated suggestions for template {template.slug} run {run.run_id}")
            except Exception as exc:  # pragma: no cover - best effort guard
                breaker.record_failure()
                print(f"AutoPM run failed for template {template.slug}: {exc}")


def main() -> None:
    parser = argparse.ArgumentParser(description="AutoPM agent")
    parser.add_argument("--category", default="auto_pm", help="Flow template category to evaluate")
    parser.add_argument("--limit", type=int, default=20, help="Maximum suggestions per run")
    args = parser.parse_args()
    asyncio.run(run(args.category, args.limit))


if __name__ == "__main__":
    main()
