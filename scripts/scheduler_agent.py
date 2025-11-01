#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services/api/src"))

from sqlalchemy import select

from app.core.db import get_session
from app.models.core import CalendarSlot


async def run(owner: str | None, horizon_hours: int) -> None:
    async with get_session() as session:
        statement = select(CalendarSlot).where(CalendarSlot.status == "free")
        if owner:
            statement = statement.where(CalendarSlot.owner_id == uuid.UUID(owner))
        now = datetime.now(UTC)
        cutoff = now + timedelta(hours=horizon_hours)
        statement = statement.where(CalendarSlot.start_at >= now, CalendarSlot.start_at <= cutoff)
        statement = statement.order_by(CalendarSlot.start_at)
        result = await session.execute(statement)
        slots = result.scalars().all()
        for slot in slots:
            window = f"{slot.start_at.isoformat()} → {slot.end_at.isoformat()}"
            print(f"OWNER {slot.owner_id or 'unknown'} FREE {window}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Smart scheduler probe")
    parser.add_argument("--owner")
    parser.add_argument("--horizon", type=int, default=24)
    args = parser.parse_args()
    asyncio.run(run(args.owner, args.horizon))


if __name__ == "__main__":
    main()
