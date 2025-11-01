from __future__ import annotations

from typing import Iterable, Tuple

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram


registry = CollectorRegistry()

GUARDRAIL_STATUS_VALUES: dict[str, int] = {
    "pending": -1,
    "healthy": 0,
    "warning": 1,
    "halted": 2,
}

guardrail_status_gauge = Gauge(
    "taskr_preference_guardrail_status",
    "Guardrail status for preference rollouts (-1=pending,0=healthy,1=warning,2=halted)",
    ("tenant_id", "model_slug", "rollout_id", "variant_key"),
    registry=registry,
)

guardrail_negative_ratio_gauge = Gauge(
    "taskr_preference_guardrail_negative_ratio",
    "Negative feedback ratio recorded during the most recent guardrail evaluation",
    ("tenant_id", "model_slug", "rollout_id", "variant_key"),
    registry=registry,
)

guardrail_last_evaluated_gauge = Gauge(
    "taskr_preference_guardrail_last_evaluated_timestamp_seconds",
    "Unix timestamp (seconds) of the most recent guardrail evaluation",
    ("tenant_id", "model_slug", "rollout_id", "variant_key"),
    registry=registry,
)

guardrail_evaluation_counter = Counter(
    "taskr_preference_guardrail_evaluations_total",
    "Total guardrail evaluations grouped by change detection outcome",
    ("result",),
    registry=registry,
)

flow_run_status_counter = Counter(
    "taskr_flow_run_transitions_total",
    "Flow run status transitions grouped by tenant and status",
    ("tenant_id", "status"),
    registry=registry,
)

flow_run_duration_histogram = Histogram(
    "taskr_flow_run_duration_seconds",
    "Observed duration of completed flow runs",
    ("tenant_id",),
    registry=registry,
    buckets=(30, 60, 120, 300, 600, 900, 1800, 3600, 7200, float("inf")),
)

retention_deletion_counter = Counter(
    "taskr_retention_deletions_total",
    "Records removed by retention policies grouped by resource",
    ("tenant_id", "resource_type"),
    registry=registry,
)

scr_alert_ingest_counter = Counter(
    "taskr_scr_alert_ingest_total",
    "Number of scrAIv alerts ingested",
    ("tenant_id", "severity", "kind"),
    registry=registry,
)

scr_alert_ack_counter = Counter(
    "taskr_scr_alert_ack_total",
    "Number of scrAIv alerts acknowledged",
    ("tenant_id", "kind"),
    registry=registry,
)


def status_to_value(status: str) -> int:
    """Convert human-readable safety status to numeric gauge value."""

    return GUARDRAIL_STATUS_VALUES.get(status, GUARDRAIL_STATUS_VALUES["pending"])


def remove_stale_guardrail_metrics(
    tenant_id: str,
    model_slug: str,
    active_labels: Iterable[Tuple[str, str, str, str]],
) -> None:
    """Drop guardrail samples for rollouts that no longer exist."""

    active = set(active_labels)
    stale: set[tuple[str, str, str, str]] = set()
    for metric in guardrail_status_gauge.collect():
        if metric.name != guardrail_status_gauge._name:  # pragma: no cover - prometheus internals
            continue
        for sample in metric.samples:
            if sample.name != guardrail_status_gauge._name:
                continue
            label_tuple = (
                sample.labels.get("tenant_id", ""),
                sample.labels.get("model_slug", ""),
                sample.labels.get("rollout_id", ""),
                sample.labels.get("variant_key", ""),
            )
            if (
                label_tuple[0] == tenant_id
                and label_tuple[1] == model_slug
                and label_tuple not in active
            ):
                stale.add(label_tuple)

    for label_values in stale:
        guardrail_status_gauge.remove(*label_values)
        guardrail_negative_ratio_gauge.remove(*label_values)
        guardrail_last_evaluated_gauge.remove(*label_values)


def record_flow_run_transition(tenant_id: str, status: str) -> None:
    """Increment flow run status transition counter."""

    flow_run_status_counter.labels(str(tenant_id), status).inc()


def observe_flow_run_duration(tenant_id: str, duration_seconds: float) -> None:
    """Record completed flow run duration."""

    if duration_seconds < 0:
        duration_seconds = 0.0
    flow_run_duration_histogram.labels(str(tenant_id)).observe(duration_seconds)


def record_retention_deletions(tenant_id: str, resource: str, count: int) -> None:
    """Increment retention deletion counter when records are purged."""

    if count <= 0:
        return
    retention_deletion_counter.labels(str(tenant_id), resource).inc(count)


def record_scr_alert_ingested(tenant_id: str, severity: str, kind: str) -> None:
    scr_alert_ingest_counter.labels(str(tenant_id), severity, kind).inc()


def record_scr_alert_acknowledged(tenant_id: str, kind: str) -> None:
    scr_alert_ack_counter.labels(str(tenant_id), kind).inc()
