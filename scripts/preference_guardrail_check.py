#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services/api/src"))

from sqlalchemy import select

from app.core.db import get_session
from app.models.core import PreferenceModel
from app.services.preferences import evaluate_model_rollouts, refresh_model_metrics
from app.metrics import registry
from prometheus_client import push_to_gateway


async def push_metrics(pushgateway: str, job: str) -> None:
    try:
        await asyncio.to_thread(push_to_gateway, pushgateway, job=job, registry=registry)
    except Exception as exc:  # pragma: no cover - best-effort telemetry
        print(f"Failed to push metrics to {pushgateway}: {exc}", file=sys.stderr)


async def evaluate_once(
    tenant: str | None,
    model_slug: str | None,
    min_signals: int,
    warning: float,
    halt: float,
) -> tuple[int, list[str]]:
    messages: list[str] = []
    changed_total = 0
    async with get_session() as session:
        statement = select(PreferenceModel)
        if tenant:
            statement = statement.where(PreferenceModel.tenant_id == tenant)
        models = (await session.execute(statement)).scalars().all()
        if model_slug:
            models = [model for model in models if model.slug == model_slug]
        if not models:
            messages.append("No preference models matched criteria.")
            return 0, messages

        for model in models:
            await refresh_model_metrics(session, model.tenant_id, model.model_id)
            changed_rollouts = await evaluate_model_rollouts(
                session,
                model.tenant_id,
                model.model_id,
                min_signals=min_signals,
                warning_threshold=warning,
                halt_threshold=halt,
            )
            if changed_rollouts:
                names = ", ".join(
                    f"{rollout.rollout_id}:{rollout.safety_status}" for rollout in changed_rollouts
                )
                messages.append(
                    f"Updated guardrail status for tenant {model.tenant_id} model {model.slug}: {names}"
                )
            else:
                messages.append(
                    f"No guardrail changes for tenant {model.tenant_id} model {model.slug}."
                )
            changed_total += len(changed_rollouts)

    return changed_total, messages


async def run_monitor(args: argparse.Namespace) -> int:
    interval = args.interval
    while True:
        changed, messages = await evaluate_once(
            args.tenant,
            args.model_slug,
            args.min_signals,
            args.warning,
            args.halt,
        )
        for message in messages:
            print(message)

        if args.pushgateway:
            await push_metrics(args.pushgateway, args.push_job)

        if not args.loop:
            if args.exit_on_change and changed:
                return 2
            return 0

        if args.exit_on_change and changed:
            return 2

        await asyncio.sleep(interval)


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate preference rollout guardrails.")
    parser.add_argument("--tenant", help="Optional tenant UUID", default=os.getenv("PREFERENCE_GUARDRAIL_TENANT"))
    parser.add_argument("--model-slug", help="Filter to a specific model slug", default=os.getenv("PREFERENCE_GUARDRAIL_MODEL"))
    parser.add_argument(
        "--min-signals",
        type=int,
        default=int(os.getenv("PREFERENCE_GUARDRAIL_MIN_SIGNALS", "5")),
        help="Minimum feedback signals before evaluation",
    )
    parser.add_argument(
        "--warning",
        type=float,
        default=float(os.getenv("PREFERENCE_GUARDRAIL_WARNING", "0.3")),
        help="Negative ratio triggering warning status",
    )
    parser.add_argument(
        "--halt",
        type=float,
        default=float(os.getenv("PREFERENCE_GUARDRAIL_HALT", "0.6")),
        help="Negative ratio triggering halted status",
    )
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Continuously evaluate guardrails using --interval cadence.",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=int(os.getenv("PREFERENCE_GUARDRAIL_INTERVAL", "60")),
        help="Seconds between guardrail evaluations when --loop is enabled.",
    )
    parser.add_argument(
        "--exit-on-change",
        action="store_true",
        help="Exit with status 2 when any guardrail status changes are detected.",
    )
    parser.add_argument(
        "--pushgateway",
        help="Optional Prometheus Pushgateway URL for publishing guardrail metrics.",
        default=os.getenv("PREFERENCE_GUARDRAIL_PUSHGATEWAY"),
    )
    parser.add_argument(
        "--push-job",
        help="Prometheus job name used when pushing metrics.",
        default=os.getenv("PREFERENCE_GUARDRAIL_PUSHJOB", "taskr_guardrail_monitor"),
    )
    args = parser.parse_args()

    exit_code = asyncio.run(run_monitor(args))
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
