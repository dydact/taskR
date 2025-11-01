from __future__ import annotations

import csv
import io
from datetime import UTC, datetime, date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.events.bus import event_bus
from common_billing import BillingService
from app.metrics import (
    guardrail_last_evaluated_gauge,
    guardrail_negative_ratio_gauge,
    guardrail_status_gauge,
    status_to_value,
)
from app.models.core import (
    PreferenceModel,
    PreferenceRollout,
    PreferenceVariant,
    RetentionPolicy,
    UsageStat,
)
from app.routes.utils import get_tenant
from app.schemas import (
    FeatureOverrideRead,
    FeatureOverrideUpdate,
    GuardrailDrillRequest,
    PreferenceRolloutRead,
    RetentionPolicyCreate,
    RetentionPolicyRead,
    SubscriptionRead,
    SubscriptionUpdate,
)
from app.services.billing import get_billing_service, require_feature
from app.services.insight import summarize_guardrail
from app.services.usage import get_usage
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/retention", response_model=list[RetentionPolicyRead])
async def get_policies(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[RetentionPolicy]:
    tenant = await get_tenant(session, headers.tenant_id)
    result = await session.execute(
        select(RetentionPolicy).where(RetentionPolicy.tenant_id == tenant.tenant_id)
    )
    return result.scalars().all()


@router.put("/retention", response_model=RetentionPolicyRead, status_code=status.HTTP_201_CREATED)
async def upsert_policy(
    payload: RetentionPolicyCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> RetentionPolicyRead:
    tenant = await get_tenant(session, headers.tenant_id)
    existing = await session.execute(
        select(RetentionPolicy).where(
            RetentionPolicy.tenant_id == tenant.tenant_id,
            RetentionPolicy.resource_type == payload.resource_type,
        )
    )
    policy = existing.scalar_one_or_none()
    if policy is None:
        policy = RetentionPolicy(tenant_id=tenant.tenant_id, **payload.model_dump())
        session.add(policy)
    else:
        policy.retention_days = payload.retention_days
        policy.metadata_json = payload.metadata_json
    await session.flush()
    await session.refresh(policy)
    return RetentionPolicyRead.model_validate(policy)


@router.get("/usage")
async def get_usage_stats(
    metric: str | None = None,
    days: int = 30,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    billing: BillingService = Depends(get_billing_service),
):
    tenant = await get_tenant(session, headers.tenant_id)
    await billing.ensure_subscription(session, tenant.tenant_id)
    stats = await get_usage(session, tenant.tenant_id, metric=metric, limit=days)
    return [
        {
            "tenant_id": str(row.tenant_id),
            "metric": row.metric,
            "period_date": row.period_date.isoformat(),
            "count": row.count,
        }
        for row in stats
    ]


@router.get("/usage/export")
async def export_usage_report(
    format: str = "csv",
    days: int = 30,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    billing: BillingService = Depends(get_billing_service),
    _: None = Depends(require_feature("billing.export")),
):
    if format != "csv":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only CSV export is supported")

    tenant = await get_tenant(session, headers.tenant_id)
    subscription = await billing.get_subscription(session, tenant.tenant_id)

    window_days = max(1, min(days, 365))
    window_end = date.today()
    window_start = window_end - timedelta(days=window_days - 1)

    stmt = (
        select(UsageStat)
        .where(UsageStat.tenant_id == tenant.tenant_id)
        .where(UsageStat.period_date >= window_start)
        .order_by(UsageStat.period_date.asc(), UsageStat.metric.asc())
    )
    result = await session.execute(stmt)
    stats = result.scalars().all()

    generated_at = datetime.now(UTC).isoformat()
    output = io.StringIO()
    fieldnames = [
        "tenant_id",
        "tenant_slug",
        "plan_slug",
        "subscription_status",
        "period_date",
        "metric",
        "count",
        "window_start",
        "window_end",
        "generated_at",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    if stats:
        for row in stats:
            writer.writerow(
                {
                    "tenant_id": str(row.tenant_id),
                    "tenant_slug": tenant.slug,
                    "plan_slug": subscription.plan_slug,
                    "subscription_status": subscription.status,
                    "period_date": row.period_date.isoformat(),
                    "metric": row.metric,
                    "count": row.count,
                    "window_start": window_start.isoformat(),
                    "window_end": window_end.isoformat(),
                    "generated_at": generated_at,
                }
            )
    else:
        writer.writerow(
            {
                "tenant_id": str(tenant.tenant_id),
                "tenant_slug": tenant.slug,
                "plan_slug": subscription.plan_slug,
                "subscription_status": subscription.status,
                "period_date": window_start.isoformat(),
                "metric": "",
                "count": 0,
                "window_start": window_start.isoformat(),
                "window_end": window_end.isoformat(),
                "generated_at": generated_at,
            }
        )

    csv_payload = output.getvalue()
    filename_tenant = tenant.slug or str(tenant.tenant_id)
    filename = f"taskr-usage-{filename_tenant}-{window_end.isoformat()}.csv"
    response = StreamingResponse(iter([csv_payload]), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename=\"{filename}\""
    return response


def _serialize_override(override) -> FeatureOverrideRead:
    return FeatureOverrideRead(
        feature_code=override.feature_code,
        application=override.application,
        enabled=override.enabled,
        expires_at=override.expires_at,
        metadata_json=override.metadata_json or {},
    )


@router.get("/subscription", response_model=SubscriptionRead)
async def get_subscription_details(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    billing: BillingService = Depends(get_billing_service),
):
    tenant = await get_tenant(session, headers.tenant_id)
    subscription = await billing.get_subscription(session, tenant.tenant_id)
    snapshot = await billing.get_effective_features(
        session,
        tenant.tenant_id,
        application="taskr",
    )
    return SubscriptionRead(
        plan_slug=subscription.plan_slug,
        status=subscription.status,
        active_since=subscription.active_since,
        active_until=subscription.active_until,
        features=sorted(snapshot.features),
    )


@router.put("/subscription", response_model=SubscriptionRead)
async def update_subscription_plan(
    payload: SubscriptionUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    billing: BillingService = Depends(get_billing_service),
):
    tenant = await get_tenant(session, headers.tenant_id)
    metadata = payload.metadata_json if payload.metadata_json is not None else None
    subscription = await billing.assign_plan(
        session,
        tenant.tenant_id,
        plan_slug=payload.plan_slug,
        status=payload.status,
        active_until=payload.active_until,
        metadata=metadata,
    )
    snapshot = await billing.get_effective_features(
        session,
        tenant.tenant_id,
        application="taskr",
    )
    return SubscriptionRead(
        plan_slug=subscription.plan_slug,
        status=subscription.status,
        active_since=subscription.active_since,
        active_until=subscription.active_until,
        features=sorted(snapshot.features),
    )


@router.get("/subscription/features", response_model=list[FeatureOverrideRead])
async def list_subscription_overrides(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    billing: BillingService = Depends(get_billing_service),
):
    tenant = await get_tenant(session, headers.tenant_id)
    overrides = await billing.list_overrides(session, tenant.tenant_id, application="taskr")
    return [_serialize_override(item) for item in overrides]


@router.put("/subscription/features", response_model=FeatureOverrideRead, status_code=status.HTTP_201_CREATED)
async def upsert_subscription_override(
    payload: FeatureOverrideUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    billing: BillingService = Depends(get_billing_service),
):
    tenant = await get_tenant(session, headers.tenant_id)
    override = await billing.set_feature_override(
        session,
        tenant.tenant_id,
        payload.feature_code,
        application=payload.application,
        enabled=payload.enabled,
        expires_at=payload.expires_at,
        metadata=payload.metadata_json,
    )
    return _serialize_override(override)


@router.delete("/subscription/features/{application}/{feature_code}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscription_override(
    application: str,
    feature_code: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    billing: BillingService = Depends(get_billing_service),
):
    tenant = await get_tenant(session, headers.tenant_id)
    await billing.clear_feature_override(
        session,
        tenant.tenant_id,
        feature_code,
        application=application,
    )


@router.post("/chaos/guardrail", response_model=PreferenceRolloutRead, status_code=status.HTTP_202_ACCEPTED)
async def trigger_guardrail_drill(
    payload: GuardrailDrillRequest,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> PreferenceRolloutRead:
    tenant = await get_tenant(session, headers.tenant_id)
    rollout = await session.get(PreferenceRollout, payload.rollout_id)
    if rollout is None or rollout.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rollout not found")

    model = rollout.model or await session.get(PreferenceModel, rollout.model_id)
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    variant = rollout.variant or (
        await session.get(PreferenceVariant, rollout.variant_id) if rollout.variant_id else None
    )

    evaluated_at = datetime.now(UTC)
    positive = max(int(payload.total_feedback * (1 - payload.negative_ratio)), 0)
    negative = payload.total_feedback - positive

    rollout.guardrail_metrics = {
        **(rollout.guardrail_metrics or {}),
        "total_feedback": payload.total_feedback,
        "positive": positive,
        "negative": negative,
        "negative_ratio": payload.negative_ratio,
        "last_feedback_at": evaluated_at.isoformat(),
    }
    rollout.metadata_json = {
        **(rollout.metadata_json or {}),
        "guardrail_evaluation": {
            "evaluated_at": evaluated_at.isoformat(),
            "total_feedback": payload.total_feedback,
            "positive": positive,
            "negative": negative,
            "negative_ratio": payload.negative_ratio,
            "decision": payload.target_status,
            "reason": payload.notes or "chaos_drill",
        },
        "chaos_drill": {
            "triggered_at": evaluated_at.isoformat(),
            "target_status": payload.target_status,
            "notes": payload.notes,
        },
    }
    rollout.safety_status = payload.target_status

    variant_key = variant.key if variant else "global"
    label_values = (
        str(tenant.tenant_id),
        model.slug,
        str(rollout.rollout_id),
        variant_key,
    )
    guardrail_status_gauge.labels(*label_values).set(status_to_value(payload.target_status))
    guardrail_negative_ratio_gauge.labels(*label_values).set(payload.negative_ratio)
    guardrail_last_evaluated_gauge.labels(*label_values).set(evaluated_at.timestamp())

    await session.flush()
    await session.refresh(rollout)

    summary = summarize_guardrail(
        payload.target_status,
        payload.total_feedback,
        payload.negative_ratio,
        stage=rollout.stage,
        variant=variant_key,
    )
    await event_bus.publish(
        {
            "type": "preference.guardrail.updated",
            "tenant_id": str(tenant.tenant_id),
            "model_id": str(model.model_id),
            "rollout_id": str(rollout.rollout_id),
            "payload": {
                "safety_status": rollout.safety_status,
                "metadata": rollout.metadata_json,
                "metrics": {
                    "total_feedback": payload.total_feedback,
                    "positive": positive,
                    "negative": negative,
                    "negative_ratio": payload.negative_ratio,
                    "variant": variant_key,
                    "stage": rollout.stage,
                },
                "narrative": summary,
                "summary": summary,
            },
        }
    )

    return PreferenceRolloutRead.model_validate(rollout)
