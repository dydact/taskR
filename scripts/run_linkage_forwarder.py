#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path
from typing import Sequence

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/api/src"))
sys.path.insert(0, str(ROOT / "packages/common_events/src"))

from app.core.config import settings
from app.core.db import SessionLocal
from app.events.sql_outbox import SqlOutboxRepository

logger = logging.getLogger("linkage_forwarder")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


async def _deliver_events(
    repository: SqlOutboxRepository,
    client: httpx.AsyncClient,
    *,
    subject: str,
    base_url: str,
    token: str | None,
) -> int:
    events = await repository.dequeue_batch(limit=50)
    if not events:
        return 0

    delivered = 0
    endpoint = base_url.rstrip("/") + "/api/integrations/task-link"

    for event in events:
        headers = {"x-tr-tenant": event.tenant_id}
        if token:
            headers["authorization"] = f"Bearer {token}"

        if event.topic != subject:
            logger.debug("Skipping event %s for topic %s", event.event_id, event.topic)
            await repository.mark_published([event.event_id])
            continue

        try:
            response = await client.post(endpoint, json=event.payload, headers=headers)
            response.raise_for_status()
        except Exception as exc:  # pragma: no cover - network failure
            logger.warning("Failed to forward event %s: %s", event.event_id, exc)
            await repository.mark_failed([event.event_id], str(exc))
        else:
            await repository.mark_published([event.event_id])
            delivered += 1
    return delivered


async def run_forwarder(args: argparse.Namespace) -> None:
    subject = settings.scr_linkage_subject
    base_url = args.base_url or settings.scr_linkage_http_url
    token = args.token or settings.scr_linkage_http_token

    if not base_url:
        raise SystemExit("No scrAIv linkage URL configured. Set --base-url or TR_SCR_LINKAGE_HTTP_URL.")

    repository = SqlOutboxRepository(SessionLocal)
    interval = args.interval

    async with httpx.AsyncClient(timeout=args.timeout) as client:
        if args.loop:
            while True:
                delivered = await _deliver_events(repository, client, subject=subject, base_url=base_url, token=token)
                if delivered:
                    logger.info("Delivered %s linkage events", delivered)
                await asyncio.sleep(interval)
        else:
            delivered = await _deliver_events(repository, client, subject=subject, base_url=base_url, token=token)
            logger.info("Delivered %s linkage events", delivered)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Forward TaskR linkage events to scrAIv HTTP endpoint")
    parser.add_argument("--base-url", help="scrAIv base URL (overrides TR_SCR_LINKAGE_HTTP_URL)")
    parser.add_argument("--token", help="Bearer token for scrAIv webhook (overrides TR_SCR_LINKAGE_HTTP_TOKEN)")
    parser.add_argument("--interval", type=int, default=30, help="Polling interval in seconds when running in loop mode")
    parser.add_argument("--timeout", type=float, default=10.0, help="HTTP timeout in seconds")
    parser.add_argument("--loop", action="store_true", help="Run continuously instead of a single pass")
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(run_forwarder(parse_args()))
