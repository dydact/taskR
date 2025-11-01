from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any, Coroutine
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.events.bus import event_bus
from app.metrics import (
    guardrail_evaluation_counter,
    guardrail_last_evaluated_gauge,
    guardrail_negative_ratio_gauge,
    guardrail_status_gauge,
    remove_stale_guardrail_metrics,
    status_to_value,
)
from app.models.core import PreferenceFeedback, PreferenceModel, PreferenceRollout, PreferenceVariant
from app.services.insight import summarize_guardrail


logger = logging.getLogger(__name__)

AUTOPILOT_STAGE_ORDER = ["draft", "ramp", "monitor", "completed"]


def _autopilot_next_stage(stage: str) -> str | None:
    current = stage.lower()
    try:
        index = AUTOPILOT_STAGE_ORDER.index(current)
    except ValueError:
        return None
    if index + 1 >= len(AUTOPILOT_STAGE_ORDER):
        return None
    return AUTOPILOT_STAGE_ORDER[index + 1]


async def _send_slack_alert(message: str) -> None:
    webhook = settings.guardrail_slack_webhook
    if not webhook:
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(webhook, json={"text": message})
            response.raise_for_status()
    except Exception as exc:  # pragma: no cover - best-effort alerting
        logger.warning("Failed to deliver guardrail Slack alert: %s", exc)


async def _send_pagerduty_event(
    dedup_key: str,
    summary: str,
    severity: str,
    custom_details: dict[str, Any],
    resolved: bool = False,
) -> None:
    routing_key = settings.guardrail_pagerduty_routing_key
    if not routing_key:
        return

    payload: dict[str, Any] = {
        "routing_key": routing_key,
        "dedup_key": dedup_key,
        "event_action": "resolve" if resolved else "trigger",
    }

    if not resolved:
        payload["payload"] = {
            "summary": summary,
            "source": f"taskr.{settings.environment}",
            "severity": severity,
            "component": settings.guardrail_pagerduty_component,
            "custom_details": custom_details,
        }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post("https://events.pagerduty.com/v2/enqueue", json=payload)
            response.raise_for_status()
    except Exception as exc:  # pragma: no cover - best-effort alerting
        logger.warning("Failed to deliver guardrail PagerDuty alert: %s", exc)


async def _dispatch_guardrail_alert(
    tenant_id: UUID,
    model: PreferenceModel,
    rollout: PreferenceRollout,
    variant: PreferenceVariant | None,
    safety_status: str,
    negative_ratio: float,
    total_feedback: int,
    evaluation_time: datetime,
) -> None:
    if not settings.guardrail_slack_webhook and not settings.guardrail_pagerduty_routing_key:
        return

    variant_key = variant.key if variant else "global"
    narrative = summarize_guardrail(
        safety_status,
        total_feedback,
        negative_ratio,
        stage=rollout.stage,
        variant=variant_key,
    )
    pd_summary = f"{model.slug}: {narrative}"
    variant_fragment = f"variant={variant_key}, " if variant_key != "global" else ""
    message = (
        f"[{settings.environment}] {model.slug} guardrail update: {narrative} "
        f"({variant_fragment}current={float(rollout.current_rate or 0):.0%}, "
        f"target={float(rollout.target_rate or 0):.0%})"
    )

    details = {
        "tenant_id": str(tenant_id),
        "model_id": str(model.model_id),
        "model_slug": model.slug,
        "variant_id": str(variant.variant_id) if variant else None,
        "variant_key": variant_key,
        "stage": rollout.stage,
        "current_rate": float(rollout.current_rate or 0),
        "target_rate": float(rollout.target_rate or 0),
        "safety_status": safety_status,
        "negative_ratio": negative_ratio,
        "total_feedback": total_feedback,
        "evaluated_at": evaluation_time.isoformat(),
        "narrative": narrative,
    }

    tasks = []
    if safety_status in {"warning", "halted"}:
        severity = "critical" if safety_status == "halted" else "warning"
        tasks.append(_send_pagerduty_event(
            dedup_key=f"taskr.guardrail.{rollout.rollout_id}",
            summary=pd_summary,
            severity=severity,
            custom_details=details,
            resolved=False,
        ))
        tasks.append(_send_slack_alert(message))
    elif safety_status == "healthy":
        tasks.append(_send_pagerduty_event(
            dedup_key=f"taskr.guardrail.{rollout.rollout_id}",
            summary=pd_summary,
            severity="info",
            custom_details=details,
            resolved=True,
        ))

    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


async def refresh_model_metrics(session: AsyncSession, tenant_id, model_id) -> None:
    """Recompute feedback-driven metrics for a preference model and related entities."""

    feedback_rows = await session.execute(
        select(PreferenceFeedback).where(
            PreferenceFeedback.tenant_id == tenant_id,
            PreferenceFeedback.model_id == model_id,
        )
    )
    feedback_items = feedback_rows.scalars().all()

    variant_metrics: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "total_feedback": 0,
            "rated_count": 0,
            "avg_rating": None,
            "positive": 0,
            "negative": 0,
            "last_feedback_at": None,
        }
    )

    overall = {
        "total_feedback": 0,
        "rated_count": 0,
        "avg_rating": None,
        "positive": 0,
        "negative": 0,
        "last_feedback_at": None,
    }

    for item in feedback_items:
        key = "global" if item.variant_id is None else str(item.variant_id)
        metrics = overall if key == "global" else variant_metrics[key]
        metrics["total_feedback"] += 1
        overall["total_feedback"] += 1
        timestamp = item.recorded_at or item.created_at
        if timestamp:
            ts_iso = timestamp.isoformat()
            if metrics["last_feedback_at"] is None or ts_iso > metrics["last_feedback_at"]:
                metrics["last_feedback_at"] = ts_iso
            if overall["last_feedback_at"] is None or ts_iso > overall["last_feedback_at"]:
                overall["last_feedback_at"] = ts_iso
        if item.rating is not None:
            metrics.setdefault("ratings", []).append(item.rating)
            overall.setdefault("ratings", []).append(item.rating)
            metrics["rated_count"] += 1
            overall["rated_count"] += 1
            if item.rating > 0:
                metrics["positive"] += 1
                overall["positive"] += 1
            elif item.rating < 0:
                metrics["negative"] += 1
                overall["negative"] += 1

    def finalize(values: dict[str, Any]) -> None:
        ratings = values.pop("ratings", [])
        values["avg_rating"] = sum(ratings) / len(ratings) if ratings else None

    finalize(overall)
    for metrics in variant_metrics.values():
        finalize(metrics)

    model = await session.get(PreferenceModel, model_id)
    if model is None or model.tenant_id != tenant_id:
        return

    model.metadata_json = {
        **(model.metadata_json or {}),
        "feedback_summary": overall,
        "updated_at": datetime.now(UTC).isoformat(),
    }

    variants = await session.execute(
        select(PreferenceVariant).where(
            PreferenceVariant.tenant_id == tenant_id,
            PreferenceVariant.model_id == model_id,
        )
    )
    for variant in variants.scalars().all():
        metrics = variant_metrics.get(
            str(variant.variant_id),
            {
                "total_feedback": 0,
                "rated_count": 0,
                "avg_rating": None,
                "positive": 0,
                "negative": 0,
                "last_feedback_at": None,
            },
        )
        variant.metrics_json = {
            **(variant.metrics_json or {}),
            **metrics,
            "updated_at": datetime.now(UTC).isoformat(),
        }

    rollouts = await session.execute(
        select(PreferenceRollout).where(
            PreferenceRollout.tenant_id == tenant_id,
            PreferenceRollout.model_id == model_id,
        )
    )
    for rollout in rollouts.scalars().all():
        guardrail = overall
        if rollout.variant_id is not None:
            guardrail = variant_metrics.get(str(rollout.variant_id), guardrail)
        rollout.guardrail_metrics = {
            **guardrail,
            "evaluated_at": datetime.now(UTC).isoformat(),
        }

    await session.flush()


async def evaluate_model_rollouts(
    session: AsyncSession,
    tenant_id,
    model_id,
    *,
    min_signals: int = 5,
    warning_threshold: float = 0.3,
    halt_threshold: float = 0.6,
) -> list[PreferenceRollout]:
    """Evaluate rollout guardrails and update safety status where needed.

    Args:
        session: active database session.
        tenant_id: tenant scope.
        model_id: preference model identifier.
        min_signals: minimum feedback count required before emitting health states.
        warning_threshold: negative feedback ratio that triggers a warning.
        halt_threshold: negative feedback ratio that halts the rollout.

    Returns:
        List of rollouts whose safety status changed during evaluation.
    """

    model = await session.get(PreferenceModel, model_id)
    if model is None or model.tenant_id != tenant_id:
        return []

    changed: list[PreferenceRollout] = []
    rollouts_result = await session.execute(
        select(PreferenceRollout).where(
            PreferenceRollout.tenant_id == tenant_id,
            PreferenceRollout.model_id == model_id,
        )
    )
    rollouts = rollouts_result.scalars().all()

    variant_ids: set[UUID] = {rollout.variant_id for rollout in rollouts if rollout.variant_id is not None}
    variant_map: dict[UUID, PreferenceVariant] = {}
    if variant_ids:
        variant_rows = await session.execute(
            select(PreferenceVariant)
                .where(
                    PreferenceVariant.tenant_id == tenant_id,
                    PreferenceVariant.variant_id.in_(variant_ids),
                )
        )
        variant_map = {variant.variant_id: variant for variant in variant_rows.scalars().all()}

    evaluation_time = datetime.now(UTC)
    evaluation_time_iso = evaluation_time.isoformat()
    evaluation_time_epoch = evaluation_time.timestamp()
    active_metric_labels: set[tuple[str, str, str, str]] = set()

    alert_tasks: list[Coroutine[Any, Any, None]] = []
    autopilot_transitions: list[tuple[PreferenceRollout, str, str, dict[str, Any]]] = []

    for rollout in rollouts:
        metrics = rollout.guardrail_metrics or {}
        total = max(int(metrics.get("total_feedback", 0)), 0)
        negative = max(int(metrics.get("negative", 0)), 0)
        positive = max(int(metrics.get("positive", 0)), 0)
        negative_ratio = (negative / total) if total else 0.0

        if total < min_signals:
            new_status = "pending"
            decision_reason = "insufficient_signals"
        elif negative_ratio >= max(halt_threshold, warning_threshold):
            new_status = "halted"
            decision_reason = "negative_ratio_exceeds_halt_threshold"
        elif negative_ratio >= warning_threshold:
            new_status = "warning"
            decision_reason = "negative_ratio_exceeds_warning_threshold"
        else:
            new_status = "healthy"
            decision_reason = "guardrails_within_thresholds"

        rollout.metadata_json = {
            **(rollout.metadata_json or {}),
            "guardrail_evaluation": {
                "evaluated_at": evaluation_time_iso,
                "total_feedback": total,
                "positive": positive,
                "negative": negative,
                "negative_ratio": negative_ratio,
                "decision": new_status,
                "reason": decision_reason,
            },
        }

        metadata = rollout.metadata_json or {}
        if settings.rollout_autopilot_enabled:
            autop_meta = dict(metadata.get("autopilot", {}))
            if not autop_meta.get("disabled"):
                next_stage = _autopilot_next_stage(rollout.stage)
                if next_stage and new_status == "healthy":
                    from_stage = rollout.stage
                    rollout.stage = next_stage
                    history = list(autop_meta.get("history", []))
                    history.append(
                        {
                            "from": from_stage,
                            "to": next_stage,
                            "evaluated_at": evaluation_time_iso,
                            "negative_ratio": negative_ratio,
                            "total_feedback": total,
                        }
                    )
                    autop_meta.update(
                        history=history,
                        last_transition_at=evaluation_time_iso,
                        last_from_stage=from_stage,
                        last_to_stage=next_stage,
                    )
                    metadata = {
                        **metadata,
                        "autopilot": autop_meta,
                    }
                    rollout.metadata_json = metadata
                    autopilot_transitions.append(
                        (
                            rollout,
                            from_stage,
                            next_stage,
                            {
                                "negative_ratio": negative_ratio,
                                "total_feedback": total,
                                "evaluated_at": evaluation_time_iso,
                            },
                        )
                    )
                else:
                    metadata = {
                        **metadata,
                        "autopilot": autop_meta,
                    }
                    rollout.metadata_json = metadata

        previous_status = rollout.safety_status
        if previous_status != new_status:
            rollout.safety_status = new_status
            changed.append(rollout)

            variant = variant_map.get(rollout.variant_id)
            alert_tasks.append(
                _dispatch_guardrail_alert(
                    tenant_id=tenant_id,
                    model=model,
                    rollout=rollout,
                    variant=variant,
                    safety_status=new_status,
                    negative_ratio=negative_ratio,
                    total_feedback=total,
                    evaluation_time=evaluation_time,
                )
            )

        variant = variant_map.get(rollout.variant_id)
        variant_key = variant.key if variant else "global"
        label_values = (
            str(tenant_id),
            model.slug,
            str(rollout.rollout_id),
            variant_key,
        )
        active_metric_labels.add(label_values)
        guardrail_status_gauge.labels(*label_values).set(status_to_value(rollout.safety_status))
        guardrail_negative_ratio_gauge.labels(*label_values).set(negative_ratio)
        guardrail_last_evaluated_gauge.labels(*label_values).set(evaluation_time_epoch)

    if changed:
        await session.flush()

    if changed:
        for rollout in changed:
            metrics = rollout.guardrail_metrics or {}
            evaluation_meta = (rollout.metadata_json or {}).get("guardrail_evaluation", {})
            total_feedback = int(
                evaluation_meta.get("total_feedback")
                or metrics.get("total_feedback")
                or 0
            )
            negative_ratio = float(
                evaluation_meta.get("negative_ratio")
                or metrics.get("negative_ratio")
                or 0
            )
            positive_count = int(
                evaluation_meta.get("positive")
                or metrics.get("positive")
                or 0
            )
            negative_count = int(
                evaluation_meta.get("negative")
                or metrics.get("negative")
                or 0
            )
            variant = variant_map.get(rollout.variant_id)
            variant_label = variant.key if variant else "global"
            summary = summarize_guardrail(
                rollout.safety_status,
                total_feedback,
                negative_ratio,
                stage=rollout.stage,
                variant=variant_label,
            )
            await event_bus.publish(
                {
                    "type": "preference.guardrail.updated",
                    "tenant_id": str(tenant_id),
                    "model_id": str(model_id),
                    "rollout_id": str(rollout.rollout_id),
                    "payload": {
                        "safety_status": rollout.safety_status,
                        "metadata": rollout.metadata_json,
                        "metrics": {
                            "total_feedback": total_feedback,
                            "positive": positive_count,
                            "negative": negative_count,
                            "negative_ratio": negative_ratio,
                            "variant": variant_label,
                            "stage": rollout.stage,
                        },
                        "narrative": summary,
                        "summary": summary,
                    },
                }
            )

    if autopilot_transitions:
        await session.flush()
        for rollout, from_stage, to_stage, context in autopilot_transitions:
            await event_bus.publish(
                {
                    "type": "preference.rollout.autopilot",
                    "tenant_id": str(rollout.tenant_id),
                    "model_id": str(rollout.model_id),
                    "rollout_id": str(rollout.rollout_id),
                    "payload": {
                        "from_stage": from_stage,
                        "to_stage": to_stage,
                        "evaluated_at": context["evaluated_at"],
                        "negative_ratio": context["negative_ratio"],
                        "total_feedback": context["total_feedback"],
                    },
                }
            )

    if alert_tasks:
        await asyncio.gather(*alert_tasks, return_exceptions=True)

    remove_stale_guardrail_metrics(str(tenant_id), model.slug, active_metric_labels)
    guardrail_evaluation_counter.labels(result="changed" if changed else "unchanged").inc()

    return changed
