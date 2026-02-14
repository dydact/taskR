#!/usr/bin/env python3
"""
Quick helper to seed dedicated assignments/events against a running TaskR API.

Usage:
    python scripts/seed_dedicated.py \
        --base-url http://127.0.0.1:8000 \
        --tenant demo \
        --token dev-token

By default the script seeds the sample payloads defined in
`docs/fixtures/dedicated/assignment.sample.json` and
`docs/fixtures/dedicated/assignment-event.sample.json`.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = ROOT / "docs" / "fixtures" / "dedicated"
ASSIGNMENT_FIXTURE = FIXTURE_DIR / "assignment.sample.json"
EVENT_FIXTURE = FIXTURE_DIR / "assignment-event.sample.json"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Fixture not found: {path}")
    return json.loads(path.read_text())


def post_json(client: httpx.Client, url: str, payload: dict[str, Any]) -> httpx.Response:
    response = client.post(url, json=payload)
    response.raise_for_status()
    return response


def seed(base_url: str, tenant: str, token: str | None, assignment_path: Path, event_path: Path) -> None:
    headers = {"X-Tenant-Id": tenant}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    assignment_payload = load_json(assignment_path)
    assignment_payload["tenant_id"] = tenant

    event_payload = load_json(event_path)
    event_payload["tenant_id"] = tenant
    event_payload["assignment_id"] = assignment_payload["assignment_id"]

    with httpx.Client(base_url=base_url.rstrip("/"), headers=headers, timeout=10.0) as client:
        assignment_resp = post_json(client, "/dedicated/assignments", assignment_payload)
        print(f"[ok] Assignment upserted: {assignment_resp.json().get('assignment_id')}")

        event_resp = post_json(client, "/dedicated/events", event_payload)
        print(f"[ok] Event ingested: {event_resp.json().get('event_id')}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed dedicated assignment/event fixtures.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="TaskR API base URL")
    parser.add_argument("--tenant", required=True, help="Tenant slug or UUID")
    parser.add_argument("--token", default=None, help="Bearer token (omit for local dev)")
    parser.add_argument(
        "--assignment",
        default=str(ASSIGNMENT_FIXTURE),
        help="Path to assignment payload JSON",
    )
    parser.add_argument(
        "--event",
        default=str(EVENT_FIXTURE),
        help="Path to assignment event payload JSON",
    )
    args = parser.parse_args()
    seed(
        base_url=args.base_url,
        tenant=args.tenant,
        token=args.token,
        assignment_path=Path(args.assignment),
        event_path=Path(args.event),
    )


if __name__ == "__main__":
    main()
