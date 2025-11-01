#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/api/src"))


async def fetch_report(
    base_url: str,
    tenant: str,
    token: str | None,
    days: int,
    output: Path | None,
) -> None:
    headers = {"x-tenant-id": tenant}
    if token:
        headers["authorization"] = f"Bearer {token}"

    endpoint = f"{base_url.rstrip('/')}/admin/usage/export"
    params = {"days": days, "format": "csv"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(endpoint, headers=headers, params=params)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:  # pragma: no cover - CLI feedback
            detail = exc.response.text
            raise SystemExit(f"Request failed: {exc.response.status_code} {detail}") from exc

        payload = response.content
        if output:
            output.write_bytes(payload)
            print(f"Saved report to {output}")
        else:
            sys.stdout.buffer.write(payload)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Download TaskR billing usage export (CSV)")
    parser.add_argument("--taskr-url", required=True, help="TaskR API base URL")
    parser.add_argument("--tenant", required=True, help="Tenant identifier")
    parser.add_argument("--days", type=int, default=30, help="Number of days to include (default: 30)")
    parser.add_argument("--token", help="Optional bearer token for TaskR API")
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional file path to write the CSV (stdout when omitted)",
    )
    args = parser.parse_args()

    await fetch_report(
        base_url=args.taskr_url,
        tenant=args.tenant,
        token=args.token,
        days=args.days,
        output=args.output,
    )


if __name__ == "__main__":
    asyncio.run(main())
