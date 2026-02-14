#!/usr/bin/env python3
"""TaskR xOxO staging validation helper.

This script enables the `dedicated.agents` feature flag for a tenant, optionally
seeds a demo assignment (when the environment allows it), tails the SSE stream,
and can hit the DeptX/bridge proxy to make sure the cross-service path is live.

Examples
--------
python scripts/staging/validate_xoxo.py \
    --tenant 3c76e8a4-3c5d-4f2e-9a8c-64d5b8e07c9c \
    --token 'eyJhbGciOiJIUzI1NiIsInR...' \
    --base-url https://taskr.staging.dydact.dev \
    --watch 45 \
    --seed \
    --check-deptx
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from typing import Iterable

import requests

DEFAULT_BASE_URL = "https://taskr.staging.dydact.dev"
FEATURE_CODE = "dedicated.agents"
APPLICATION = "taskr"


@dataclass
class Settings:
    base_url: str
    tenant: str
    token: str
    watch_seconds: int
    seed: bool
    check_deptx: bool
    node_id: str | None
    agent_id: str | None


class ValidationError(RuntimeError):
    pass


def build_headers(settings: Settings) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.token}",
        "x-tenant-id": settings.tenant,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def api_request(settings: Settings, method: str, path: str, **kwargs) -> requests.Response:
    url = settings.base_url.rstrip("/") + path
    headers = kwargs.pop("headers", {})
    full_headers = {**build_headers(settings), **headers}
    response = requests.request(method, url, headers=full_headers, timeout=30, **kwargs)
    return response


def ensure_feature_flag(settings: Settings) -> None:
    payload = {
        "feature_code": FEATURE_CODE,
        "application": APPLICATION,
        "enabled": True,
    }
    response = api_request(settings, "PUT", "/admin/subscription/features", json=payload)
    if response.status_code not in {200, 201}:
        raise ValidationError(
            f"Failed to enable feature flag ({response.status_code}): {response.text}"
        )
    print("✔️  dedicated.agents feature flag enabled")


def maybe_seed_assignment(settings: Settings) -> None:
    if not settings.seed:
        return
    response = api_request(settings, "POST", "/dedicated/stubs/assignment")
    if response.status_code == 201:
        print("✔️  Seeded demo assignment via /dedicated/stubs/assignment")
    elif response.status_code in {404, 403}:
        print("ℹ️  Stub endpoint unavailable in this environment (skipping seeding)")
    else:
        raise ValidationError(
            f"Failed to seed assignment ({response.status_code}): {response.text}"
        )


def list_assignments(settings: Settings) -> list[dict[str, object]]:
    response = api_request(settings, "GET", "/dedicated/assignments")
    if response.status_code != 200:
        raise ValidationError(
            f"Failed to list assignments ({response.status_code}): {response.text}"
        )
    assignments = response.json()
    print(f"✔️  Retrieved {len(assignments)} assignments from TaskR")
    return assignments


def stream_sse(settings: Settings) -> None:
    if settings.watch_seconds <= 0:
        print("ℹ️  SSE watch disabled (--watch 0)")
        return

    params = {"tenant": settings.tenant}
    if settings.node_id:
        params["node"] = settings.node_id
    if settings.agent_id:
        params["agent"] = settings.agent_id

    url = settings.base_url.rstrip("/") + "/dedicated/assignments/stream"
    headers = build_headers(settings)
    headers.pop("Content-Type", None)  # not needed for SSE

    print(f"🔭  Watching SSE stream for {settings.watch_seconds} seconds…")
    with requests.get(url, headers=headers, params=params, stream=True, timeout=settings.watch_seconds + 5) as resp:
        if resp.status_code != 200:
            raise ValidationError(
                f"Failed to open SSE stream ({resp.status_code}): {resp.text}"
            )
        start = time.monotonic()
        for line in resp.iter_lines():
            if not line:
                continue
            decoded = line.decode("utf-8", errors="ignore")
            if decoded.startswith("data: "):
                payload = decoded[6:]
                try:
                    parsed = json.loads(payload)
                except json.JSONDecodeError:
                    print(f"📡  SSE: {payload}")
                else:
                    action = parsed.get("action")
                    details = parsed.get("payload", {})
                    assignment_id = details.get("assignment_id") or details.get("assignment")
                    print(f"📡  SSE action={action} assignment={assignment_id}")
            if time.monotonic() - start > settings.watch_seconds:
                break
    print("✔️  SSE watch complete")


def ping_deptx(settings: Settings) -> None:
    if not settings.check_deptx:
        return
    response = api_request(settings, "GET", "/bridge/schedule")
    if response.status_code == 200:
        rows = response.json()
        print(f"✔️  DeptX proxy responded with {len(rows)} schedule rows")
    elif response.status_code == 503:
        print("ℹ️  DeptX bridge disabled in this environment")
    else:
        raise ValidationError(
            f"DeptX proxy check failed ({response.status_code}): {response.text}"
        )


def dump_assignments(assignments: Iterable[dict[str, object]]) -> None:
    if not assignments:
        print("ℹ️  No assignments returned")
        return
    print("--- Assignments snapshot ---")
    for item in assignments:
        assignment_id = item.get("assignment_id")
        status = item.get("status")
        agent_slug = item.get("agent_slug")
        updated_at = item.get("updated_at")
        print(f"• {assignment_id} | status={status} | slug={agent_slug} | updated={updated_at}")
    print("-----------------------------")


def parse_args(argv: list[str]) -> Settings:
    parser = argparse.ArgumentParser(description="Validate TaskR xOxO staging flow")
    parser.add_argument("--tenant", required=True, help="Tenant UUID or slug")
    parser.add_argument("--token", required=True, help="Bearer token for TaskR API")
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"TaskR API base URL (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--watch",
        type=int,
        default=30,
        help="Seconds to watch the SSE stream (0 to skip)",
    )
    parser.add_argument(
        "--seed",
        action="store_true",
        help="Attempt to seed a demo assignment via /dedicated/stubs/assignment",
    )
    parser.add_argument(
        "--check-deptx",
        action="store_true",
        help="Call the DeptX bridge schedule endpoint to confirm connectivity",
    )
    parser.add_argument(
        "--node-id",
        default=None,
        help="Optional node identifier to annotate SSE logging",
    )
    parser.add_argument(
        "--agent-id",
        default=None,
        help="Optional agent identifier to annotate SSE logging",
    )

    args = parser.parse_args(argv)
    return Settings(
        base_url=args.base_url,
        tenant=args.tenant,
        token=args.token,
        watch_seconds=args.watch,
        seed=args.seed,
        check_deptx=args.check_deptx,
        node_id=args.node_id,
        agent_id=args.agent_id,
    )


def main(argv: list[str]) -> int:
    settings = parse_args(argv)

    try:
        ensure_feature_flag(settings)
        maybe_seed_assignment(settings)
        assignments = list_assignments(settings)
        dump_assignments(assignments)
        stream_sse(settings)
        ping_deptx(settings)
    except ValidationError as exc:
        print(f"❌  Validation failed: {exc}", file=sys.stderr)
        return 2
    except requests.RequestException as exc:
        print(f"❌  HTTP error: {exc}", file=sys.stderr)
        return 3
    except KeyboardInterrupt:
        print("Interrupted")
        return 130

    print("✅  Staging validation completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
