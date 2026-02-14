#!/usr/bin/env python3
"""TaskR schedule/billing bridge validation helper.

This script enables the `schedule.bridge` feature for a tenant, optionally seeds
demo timeline data via the local-only stub, and exercises the `/bridge/*`
endpoints that scrAIv relies on.

Example usage:

python scripts/staging/validate_bridge.py \
  --tenant 3c76e8a4-3c5d-4f2e-9a8c-64d5b8e07c9c \
  --token 'eyJhbGciOiJIUzI1NiIsInR...' \
  --base-url http://localhost:9076 \
  --seed \
  --preview \
  --export
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

import requests

DEFAULT_BASE_URL = "http://localhost:9076"
FEATURE_CODE = "schedule.bridge"
APPLICATION = "taskr"


class ValidationError(RuntimeError):
    pass


def build_headers(token: str, tenant: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "x-tenant-id": tenant,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def api_request(method: str, url: str, **kwargs: Any) -> requests.Response:
    return requests.request(method, url, timeout=30, **kwargs)


def ensure_feature(settings: argparse.Namespace) -> None:
    payload = {
        "feature_code": FEATURE_CODE,
        "application": APPLICATION,
        "enabled": True,
    }
    response = api_request(
        "PUT",
        f"{settings.base_url}/admin/subscription/features",
        headers=build_headers(settings.token, settings.tenant),
        json=payload,
    )
    if response.status_code not in {200, 201}:
        raise ValidationError(
            f"Failed to enable schedule bridge feature ({response.status_code}): {response.text}"
        )
    print("✔️  schedule.bridge feature enabled")


def maybe_seed_stub(settings: argparse.Namespace) -> str | None:
    if not settings.seed:
        return None
    response = api_request(
        "POST",
        f"{settings.base_url}/bridge/stubs/timeline",
        headers=build_headers(settings.token, settings.tenant),
    )
    if response.status_code == 201:
        body = response.json()
        timeline_id = body["timeline_id"]
        print(f"✔️  Seeded timeline {timeline_id} via stub endpoint")
        return timeline_id
    if response.status_code == 404:
        print("ℹ️  Stub endpoint unavailable (non-local environment); skipping seeding")
        return None
    raise ValidationError(
        f"Failed to seed stub timeline ({response.status_code}): {response.text}"
    )


def list_schedule(settings: argparse.Namespace) -> list[dict[str, Any]]:
    response = api_request(
        "GET",
        f"{settings.base_url}/bridge/schedule",
        headers=build_headers(settings.token, settings.tenant),
    )
    if response.status_code != 200:
        raise ValidationError(
            f"Failed to list schedule entries ({response.status_code}): {response.text}"
        )
    rows = response.json()
    print(f"✔️  Retrieved {len(rows)} schedule entries")
    for row in rows:
        print(
            f"• session={row['session_id']} status={row['status']} "
            f"cpt={row.get('cpt_code')} duration={row.get('duration_minutes')}"
        )
    return rows


def maybe_preview(settings: argparse.Namespace, timeline_id: str) -> None:
    if not settings.preview or not timeline_id:
        return
    response = api_request(
        "GET",
        f"{settings.base_url}/bridge/billing/preview",
        headers=build_headers(settings.token, settings.tenant),
        params={"timeline_id": timeline_id},
    )
    if response.status_code != 200:
        raise ValidationError(
            f"Billing preview failed ({response.status_code}): {response.text}"
        )
    payload = response.json()
    print(
        "✔️  Billing preview:",
        f"CPT={payload.get('cpt_code')} units={payload.get('units')} rate={payload.get('rate')}",
    )


def maybe_export(settings: argparse.Namespace, timeline_id: str) -> None:
    if not settings.export or not timeline_id:
        return
    export_payload = {
        "timeline_id": timeline_id,
        "transport_job_id": settings.transport_job or timeline_id,
        "metadata": {"source": "validate_bridge"},
    }
    response = api_request(
        "POST",
        f"{settings.base_url}/bridge/billing/export",
        headers=build_headers(settings.token, settings.tenant),
        json=export_payload,
    )
    if response.status_code != 200:
        raise ValidationError(
            f"Billing export failed ({response.status_code}): {response.text}"
        )
    print("✔️  Billing export marked via bridge API")


def maybe_sync_orchestration(settings: argparse.Namespace) -> None:
    if not settings.sync:
        return
    response = api_request(
        "POST",
        f"{settings.base_url}/bridge/schedule/sync",
        headers=build_headers(settings.token, settings.tenant),
        params={"since": settings.sync_since} if settings.sync_since else None,
    )
    if response.status_code != 200:
        raise ValidationError(
            f"Schedule sync failed ({response.status_code}): {response.text}"
        )
    payload = response.json()
    sources = payload.get("sources", {})
    conflicts = payload.get("conflicts", [])
    print(
        "✔️  Synchronised schedule bridge "
        f"(created={payload.get('created', 0)} updated={payload.get('updated', 0)} "
        f"unchanged={payload.get('unchanged', 0)} sources={sources})"
    )
    if conflicts:
        print(f"⚠️  {len(conflicts)} guardrail conflicts detected:")
        for conflict in conflicts:
            print(f"   - {conflict.get('reason')} → {conflict.get('details')}")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate TaskR schedule/billing bridge")
    parser.add_argument("--tenant", required=True, help="Tenant UUID or slug")
    parser.add_argument("--token", required=True, help="Bearer token for TaskR API")
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"TaskR API base URL (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--seed",
        action="store_true",
        help="Attempt to seed a demo timeline via /bridge/stubs/timeline",
    )
    parser.add_argument(
        "--preview",
        action="store_true",
        help="Call /bridge/billing/preview for the selected timeline",
    )
    parser.add_argument(
        "--export",
        action="store_true",
        help="Invoke /bridge/billing/export for the selected timeline",
    )
    parser.add_argument(
        "--transport-job",
        default=None,
        help="Optional transport job UUID to use for export (defaults to timeline)",
    )
    parser.add_argument(
        "--sync",
        action="store_true",
        help="Invoke /bridge/schedule/sync to reconcile with scrAIv/openemr",
    )
    parser.add_argument(
        "--sync-since",
        default=None,
        help="Optional ISO timestamp for incremental sync when using --sync",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    settings = parse_args(argv)
    try:
        ensure_feature(settings)
        seeded_timeline = maybe_seed_stub(settings)
        rows = list_schedule(settings)
        first_timeline = seeded_timeline or (rows[0]["timeline_id"] if rows else None)
        if first_timeline:
            maybe_preview(settings, first_timeline)
            maybe_export(settings, first_timeline)
        else:
            print("ℹ️  No timelines available for preview/export checks")
        maybe_sync_orchestration(settings)
    except ValidationError as exc:
        print(f"❌  {exc}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
