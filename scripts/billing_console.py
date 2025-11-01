#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/api/src"))


def _build_headers(tenant: str, token: str | None) -> dict[str, str]:
    headers = {"x-tenant-id": tenant}
    if token:
        headers["authorization"] = f"Bearer {token}"
    return headers


async def _request(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
) -> httpx.Response:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.request(
            method,
            url,
            headers=headers,
            params=params,
            json=json_body,
        )
        return response


async def cmd_get_plan(args: argparse.Namespace) -> None:
    headers = _build_headers(args.tenant, args.token)
    response = await _request(
        "GET",
        f"{args.base_url.rstrip('/')}/admin/subscription",
        headers=headers,
    )
    response.raise_for_status()
    print(json.dumps(response.json(), indent=2))


async def cmd_set_plan(args: argparse.Namespace) -> None:
    headers = _build_headers(args.tenant, args.token)
    payload: dict[str, Any] = {"plan_slug": args.plan}
    if args.status:
        payload["status"] = args.status
    if args.active_until:
        payload["active_until"] = args.active_until
    response = await _request(
        "PUT",
        f"{args.base_url.rstrip('/')}/admin/subscription",
        headers=headers,
        json_body=payload,
    )
    response.raise_for_status()
    print("Updated subscription:")
    print(json.dumps(response.json(), indent=2))


async def cmd_list_overrides(args: argparse.Namespace) -> None:
    headers = _build_headers(args.tenant, args.token)
    response = await _request(
        "GET",
        f"{args.base_url.rstrip('/')}/admin/subscription/features",
        headers=headers,
    )
    response.raise_for_status()
    print(json.dumps(response.json(), indent=2))


async def cmd_set_override(args: argparse.Namespace) -> None:
    headers = _build_headers(args.tenant, args.token)
    payload = {
        "feature_code": args.feature,
        "enabled": not args.disable,
        "application": args.application,
    }
    if args.expires_at:
        payload["expires_at"] = args.expires_at
    response = await _request(
        "PUT",
        f"{args.base_url.rstrip('/')}/admin/subscription/features",
        headers=headers,
        json_body=payload,
    )
    response.raise_for_status()
    print(json.dumps(response.json(), indent=2))


async def cmd_delete_override(args: argparse.Namespace) -> None:
    headers = _build_headers(args.tenant, args.token)
    response = await _request(
        "DELETE",
        f"{args.base_url.rstrip('/')}/admin/subscription/features/{args.application}/{args.feature}",
        headers=headers,
    )
    if response.status_code not in {200, 204}:
        detail = response.text
        raise SystemExit(f"Failed: {response.status_code} {detail}")
    print("Override removed")


async def cmd_export(args: argparse.Namespace) -> None:
    headers = _build_headers(args.tenant, args.token)
    params = {"days": args.days, "format": "csv"}
    response = await _request(
        "GET",
        f"{args.base_url.rstrip('/')}/admin/usage/export",
        headers=headers,
        params=params,
    )
    response.raise_for_status()
    if args.output:
        Path(args.output).write_bytes(response.content)
        print(f"Saved CSV to {args.output}")
    else:
        sys.stdout.buffer.write(response.content)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Interact with TaskR billing tiers and usage exports",
    )
    parser.add_argument("--base-url", required=True, help="TaskR API base URL")
    parser.add_argument("--tenant", required=True, help="Tenant identifier")
    parser.add_argument("--token", help="Optional bearer token")

    subparsers = parser.add_subparsers(dest="command", required=True)

    get_plan = subparsers.add_parser("plan", help="Fetch current subscription state")
    get_plan.set_defaults(func=cmd_get_plan)

    set_plan = subparsers.add_parser("set-plan", help="Update tenant plan")
    set_plan.add_argument("--plan", required=True, help="Plan slug")
    set_plan.add_argument("--status", help="Optional subscription status")
    set_plan.add_argument("--active-until", help="ISO timestamp for plan expiration")
    set_plan.set_defaults(func=cmd_set_plan)

    list_overrides = subparsers.add_parser("overrides", help="List active feature overrides")
    list_overrides.set_defaults(func=cmd_list_overrides)

    set_override = subparsers.add_parser("set-override", help="Enable or disable a feature override")
    set_override.add_argument("--feature", required=True, help="Feature code")
    set_override.add_argument("--application", default="taskr", help="Application code (default: taskr)")
    set_override.add_argument("--disable", action="store_true", help="Disable the feature instead of enabling")
    set_override.add_argument("--expires-at", help="Optional ISO timestamp when the override expires")
    set_override.set_defaults(func=cmd_set_override)

    delete_override = subparsers.add_parser("delete-override", help="Remove a feature override")
    delete_override.add_argument("--feature", required=True, help="Feature code")
    delete_override.add_argument("--application", default="taskr", help="Application code")
    delete_override.set_defaults(func=cmd_delete_override)

    export_usage = subparsers.add_parser("export", help="Download CSV usage export")
    export_usage.add_argument("--days", type=int, default=30, help="Number of days to include (default: 30)")
    export_usage.add_argument("--output", help="File path to write CSV (stdout when omitted)")
    export_usage.set_defaults(func=cmd_export)

    return parser


async def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    await args.func(args)


if __name__ == "__main__":
    asyncio.run(main())
