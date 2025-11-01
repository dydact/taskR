#!/usr/bin/env python3
"""Utility script to trigger observability chaos drills via the admin API."""

from __future__ import annotations

import argparse
import asyncio
import os
from typing import Any

import httpx


async def main() -> None:
    parser = argparse.ArgumentParser(description="TaskR chaos drill helper")
    parser.add_argument("rollout_id", help="Rollout ID to target")
    parser.add_argument(
        "--status",
        default="warning",
        choices=["pending", "healthy", "warning", "halted"],
        help="Target guardrail status",
    )
    parser.add_argument("--negative-ratio", type=float, default=0.4, help="Negative feedback ratio (0-1)")
    parser.add_argument("--total-feedback", type=int, default=20, help="Total feedback count to log")
    parser.add_argument("--notes", help="Optional drill note")
    parser.add_argument(
        "--api-url",
        default=os.getenv("TASKR_API_URL", "http://localhost:8000"),
        help="TaskR API base URL",
    )
    parser.add_argument(
        "--tenant",
        default=os.getenv("TASKR_TENANT"),
        required=os.getenv("TASKR_TENANT") is None,
        help="Tenant identifier for the request",
    )
    parser.add_argument(
        "--token",
        default=os.getenv("TASKR_BEARER_TOKEN"),
        help="Optional bearer token for authenticated environments",
    )

    args = parser.parse_args()

    headers: dict[str, Any] = {"x-tenant-id": args.tenant}
    if args.token:
        headers["authorization"] = f"Bearer {args.token}"

    payload = {
        "rollout_id": args.rollout_id,
        "target_status": args.status,
        "negative_ratio": args.negative_ratio,
        "total_feedback": args.total_feedback,
        "notes": args.notes,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{args.api_url.rstrip('/')}/admin/chaos/guardrail",
            json=payload,
            headers=headers,
        )
    response.raise_for_status()
    data = response.json()
    print("Drill applied:")
    print(data)


if __name__ == "__main__":
    asyncio.run(main())
