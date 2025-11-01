from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.events.bus import event_bus
from app.models.core import PreferenceFeedback, PreferenceModel, PreferenceRollout, PreferenceVariant
from app.routes.utils import (
    get_preference_model,
    get_preference_rollout,
    get_preference_variant,
    get_tenant,
)
from app.schemas import (
    PreferenceFeedbackCreate,
    PreferenceFeedbackRead,
    PreferenceModelCreate,
    PreferenceModelRead,
    PreferenceModelUpdate,
    PreferenceRolloutCreate,
    PreferenceRolloutRead,
    PreferenceRolloutUpdate,
    PreferenceVariantCreate,
    PreferenceVariantRead,
    PreferenceVariantUpdate,
    PreferenceGuardrailSummary,
    PreferenceRolloutSummary,
)
from app.services.preferences import evaluate_model_rollouts, refresh_model_metrics
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/preferences", tags=["preferences"])


class PreferenceSummaryCache:
    def __init__(self, ttl_seconds: int = 30) -> None:
        self._ttl = ttl_seconds
        self._store: dict[tuple[str, str, str | None], tuple[float, dict]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: tuple[str, str, str | None]) -> dict | None:
        async with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if expires_at <= asyncio.get_event_loop().time():
                del self._store[key]
                return None
            return value

    async def set(self, key: tuple[str, str, str | None], value: dict) -> None:
        async with self._lock:
            self._store[key] = (asyncio.get_event_loop().time() + self._ttl, value)

    async def invalidate(self, tenant_id: uuid.UUID, model_id: uuid.UUID) -> None:
        async with self._lock:
            keys = [key for key in self._store if key[0] == str(tenant_id) and key[1] == str(model_id)]
            for key in keys:
                self._store.pop(key, None)


summary_cache = PreferenceSummaryCache(ttl_seconds=45)


@router.get("/models", response_model=list[PreferenceModelRead])
async def list_models(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    status_filter: str | None = Query(default=None),
) -> list[PreferenceModel]:
    tenant = await get_tenant(session, headers.tenant_id)
    statement = select(PreferenceModel).where(PreferenceModel.tenant_id == tenant.tenant_id)
    if status_filter:
        statement = statement.where(PreferenceModel.status == status_filter)
    statement = statement.order_by(PreferenceModel.created_at)
    result = await session.execute(statement)
    return result.scalars().all()


@router.post("/models", response_model=PreferenceModelRead, status_code=status.HTTP_201_CREATED)
async def create_model(
    payload: PreferenceModelCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> PreferenceModelRead:
    tenant = await get_tenant(session, headers.tenant_id)

    existing = await session.execute(
        select(PreferenceModel).where(
            PreferenceModel.tenant_id == tenant.tenant_id,
            PreferenceModel.slug == payload.slug,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Model slug already exists")

    model = PreferenceModel(tenant_id=tenant.tenant_id, **payload.model_dump())
    session.add(model)
    await session.flush()
    await session.refresh(model)

    await event_bus.publish(
        {
            "type": "preference.model.created",
            "tenant_id": headers.tenant_id,
            "model_id": str(model.model_id),
            "payload": PreferenceModelRead.model_validate(model).model_dump(),
        }
    )
    return PreferenceModelRead.model_validate(model)


@router.get("/models/{identifier}", response_model=PreferenceModelRead)
async def get_model(
    identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> PreferenceModel:
    tenant = await get_tenant(session, headers.tenant_id)
    return await get_preference_model(session, tenant.tenant_id, identifier)


@router.patch("/models/{model_id}", response_model=PreferenceModelRead)
async def update_model(
    model_id: uuid.UUID,
    payload: PreferenceModelUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> PreferenceModel:
    tenant = await get_tenant(session, headers.tenant_id)
    model = await get_preference_model(session, tenant.tenant_id, model_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(model, field, value)

    await session.flush()
    await session.refresh(model)
    await event_bus.publish(
        {
            "type": "preference.model.updated",
            "tenant_id": headers.tenant_id,
            "model_id": str(model.model_id),
            "payload": PreferenceModelRead.model_validate(model).model_dump(),
        }
    )
    return model


@router.get("/models/{identifier}/variants", response_model=list[PreferenceVariantRead])
async def list_variants(
    identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[PreferenceVariant]:
    tenant = await get_tenant(session, headers.tenant_id)
    model = await get_preference_model(session, tenant.tenant_id, identifier)
    result = await session.execute(
        select(PreferenceVariant)
        .where(
            PreferenceVariant.tenant_id == tenant.tenant_id,
            PreferenceVariant.model_id == model.model_id,
        )
        .order_by(PreferenceVariant.created_at)
    )
    return result.scalars().all()


@router.post("/variants", response_model=PreferenceVariantRead, status_code=status.HTTP_201_CREATED)
async def create_variant(
    payload: PreferenceVariantCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> PreferenceVariantRead:
    tenant = await get_tenant(session, headers.tenant_id)
    model = await get_preference_model(session, tenant.tenant_id, payload.model_id)

    existing = await session.execute(
        select(PreferenceVariant).where(
            PreferenceVariant.tenant_id == tenant.tenant_id,
            PreferenceVariant.model_id == model.model_id,
            PreferenceVariant.key == payload.key,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Variant key already exists")

    variant = PreferenceVariant(
        tenant_id=tenant.tenant_id,
        model_id=model.model_id,
        **payload.model_dump(exclude={"model_id"}),
    )
    session.add(variant)
    await session.flush()
    await session.refresh(variant)
    await summary_cache.invalidate(tenant.tenant_id, variant.model_id)
    await refresh_model_metrics(session, tenant.tenant_id, variant.model_id)
    await event_bus.publish(
        {
            "type": "preference.variant.created",
            "tenant_id": headers.tenant_id,
            "variant_id": str(variant.variant_id),
            "model_id": str(model.model_id),
            "payload": PreferenceVariantRead.model_validate(variant).model_dump(),
        }
    )
    return PreferenceVariantRead.model_validate(variant)


@router.patch("/variants/{variant_id}", response_model=PreferenceVariantRead)
async def update_variant(
    variant_id: uuid.UUID,
    payload: PreferenceVariantUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> PreferenceVariant:
    tenant = await get_tenant(session, headers.tenant_id)
    variant = await get_preference_variant(session, tenant.tenant_id, variant_id)

    data = payload.model_dump(exclude_unset=True)
    if "rollout_rate" in data and data["rollout_rate"] is not None:
        if data["rollout_rate"] < 0 or data["rollout_rate"] > 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="rollout_rate must be between 0 and 1")
    for field, value in data.items():
        setattr(variant, field, value)

    await session.flush()
    await session.refresh(variant)
    await summary_cache.invalidate(tenant.tenant_id, variant.model_id)
    await refresh_model_metrics(session, tenant.tenant_id, variant.model_id)
    await event_bus.publish(
        {
            "type": "preference.variant.updated",
            "tenant_id": headers.tenant_id,
            "variant_id": str(variant.variant_id),
            "model_id": str(variant.model_id),
            "payload": PreferenceVariantRead.model_validate(variant).model_dump(),
        }
    )
    return variant


@router.get("/models/{identifier}/rollouts", response_model=list[PreferenceRolloutRead])
async def list_rollouts(
    identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    stage: str | None = Query(default=None),
) -> list[PreferenceRollout]:
    tenant = await get_tenant(session, headers.tenant_id)
    model = await get_preference_model(session, tenant.tenant_id, identifier)
    statement = select(PreferenceRollout).where(
        PreferenceRollout.tenant_id == tenant.tenant_id,
        PreferenceRollout.model_id == model.model_id,
    )
    if stage:
        statement = statement.where(PreferenceRollout.stage == stage)
    statement = statement.order_by(PreferenceRollout.created_at.desc())
    result = await session.execute(statement)
    return result.scalars().all()


@router.post("/rollouts", response_model=PreferenceRolloutRead, status_code=status.HTTP_201_CREATED)
async def create_rollout(
    payload: PreferenceRolloutCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> PreferenceRolloutRead:
    tenant = await get_tenant(session, headers.tenant_id)
    model = await get_preference_model(session, tenant.tenant_id, payload.model_id)
    variant_id = payload.variant_id
    if variant_id is not None:
        variant = await get_preference_variant(session, tenant.tenant_id, variant_id)
        if variant.model_id != model.model_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Variant not attached to model")

    rollout = PreferenceRollout(
        tenant_id=tenant.tenant_id,
        model_id=model.model_id,
        variant_id=variant_id,
        **payload.model_dump(exclude={"model_id", "variant_id"}),
    )
    session.add(rollout)
    await session.flush()
    await session.refresh(rollout)
    await summary_cache.invalidate(tenant.tenant_id, rollout.model_id)
    await refresh_model_metrics(session, tenant.tenant_id, rollout.model_id)
    await event_bus.publish(
        {
            "type": "preference.rollout.created",
            "tenant_id": headers.tenant_id,
            "rollout_id": str(rollout.rollout_id),
            "model_id": str(rollout.model_id),
            "payload": PreferenceRolloutRead.model_validate(rollout).model_dump(),
        }
    )
    return PreferenceRolloutRead.model_validate(rollout)


@router.patch("/rollouts/{rollout_id}", response_model=PreferenceRolloutRead)
async def update_rollout(
    rollout_id: uuid.UUID,
    payload: PreferenceRolloutUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> PreferenceRollout:
    tenant = await get_tenant(session, headers.tenant_id)
    rollout = await get_preference_rollout(session, tenant.tenant_id, rollout_id)

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        if field in {"target_rate", "current_rate"} and value is not None:
            if value < 0 or value > 1:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field} must be between 0 and 1")
        setattr(rollout, field, value)

    await session.flush()
    await session.refresh(rollout)
    await summary_cache.invalidate(tenant.tenant_id, rollout.model_id)
    await refresh_model_metrics(session, tenant.tenant_id, rollout.model_id)
    await event_bus.publish(
        {
            "type": "preference.rollout.updated",
            "tenant_id": headers.tenant_id,
            "rollout_id": str(rollout.rollout_id),
            "model_id": str(rollout.model_id),
            "payload": PreferenceRolloutRead.model_validate(rollout).model_dump(),
        }
    )
    return rollout


@router.get("/feedback", response_model=list[PreferenceFeedbackRead])
async def list_feedback(
    model_id: uuid.UUID | None = Query(default=None),
    variant_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[PreferenceFeedback]:
    tenant = await get_tenant(session, headers.tenant_id)
    statement = select(PreferenceFeedback).where(PreferenceFeedback.tenant_id == tenant.tenant_id)
    if model_id is not None:
        statement = statement.where(PreferenceFeedback.model_id == model_id)
    if variant_id is not None:
        statement = statement.where(PreferenceFeedback.variant_id == variant_id)
    statement = statement.order_by(PreferenceFeedback.recorded_at.desc()).limit(limit)
    result = await session.execute(statement)
    return result.scalars().all()


@router.post("/feedback", response_model=PreferenceFeedbackRead, status_code=status.HTTP_201_CREATED)
async def create_feedback(
    payload: PreferenceFeedbackCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> PreferenceFeedbackRead:
    tenant = await get_tenant(session, headers.tenant_id)
    model = await get_preference_model(session, tenant.tenant_id, payload.model_id)
    variant_id = payload.variant_id
    if variant_id is not None:
        variant = await get_preference_variant(session, tenant.tenant_id, variant_id)
        if variant.model_id != model.model_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Variant not attached to model")

    now = datetime.utcnow()
    recorded_at = payload.recorded_at or now
    if recorded_at.tzinfo is not None:
        recorded_at = recorded_at.astimezone(UTC).replace(tzinfo=None)
    feedback = PreferenceFeedback(
        tenant_id=tenant.tenant_id,
        model_id=model.model_id,
        variant_id=variant_id,
        task_id=payload.task_id,
        user_id=payload.user_id,
        source=payload.source,
        signal_type=payload.signal_type,
        rating=payload.rating,
        notes=payload.notes,
        metadata_json=payload.metadata_json,
        recorded_at=recorded_at,
        created_at=now,
    )
    session.add(feedback)
    await session.flush()
    await session.refresh(feedback)

    await summary_cache.invalidate(tenant.tenant_id, model.model_id)
    await refresh_model_metrics(session, tenant.tenant_id, model.model_id)

    serialized = PreferenceFeedbackRead.model_validate(feedback)

    await event_bus.publish(
        {
            "type": "preference.feedback.recorded",
            "tenant_id": headers.tenant_id,
            "feedback_id": str(feedback.feedback_id),
            "model_id": str(feedback.model_id),
            "payload": serialized.model_dump(),
        }
    )
    return serialized


@router.get(
    "/models/{identifier}/summary",
    response_model=PreferenceGuardrailSummary,
)
async def get_preference_summary(
    identifier: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    variant_id: uuid.UUID | None = Query(default=None),
) -> PreferenceGuardrailSummary:
    tenant = await get_tenant(session, headers.tenant_id)
    model = await get_preference_model(session, tenant.tenant_id, identifier)

    cache_key = (headers.tenant_id, str(model.model_id), str(variant_id) if variant_id else None)

    async def build_summary() -> dict:
        await refresh_model_metrics(session, tenant.tenant_id, model.model_id)
        await evaluate_model_rollouts(session, tenant.tenant_id, model.model_id)

        rollout_rows = await session.execute(
            select(PreferenceRollout)
            .where(
                PreferenceRollout.tenant_id == tenant.tenant_id,
                PreferenceRollout.model_id == model.model_id,
            )
            .order_by(PreferenceRollout.updated_at.desc())
        )
        rollouts_all = rollout_rows.scalars().all()

        variant_lookup: dict[uuid.UUID, PreferenceVariant] = {}
        variant_ids = [rollout.variant_id for rollout in rollouts_all if rollout.variant_id is not None]
        if variant_ids:
            variant_rows = await session.execute(
                select(PreferenceVariant)
                .where(
                    PreferenceVariant.tenant_id == tenant.tenant_id,
                    PreferenceVariant.variant_id.in_(variant_ids),
                )
            )
            variant_lookup = {variant.variant_id: variant for variant in variant_rows.scalars().all()}

        def _parse_iso(value: str | None) -> datetime | None:
            if not value:
                return None
            try:
                return datetime.fromisoformat(value)
            except ValueError:
                return None

        metrics: dict[str, object]
        safety_status = "pending"
        evaluated_at: datetime | None = None
        rollouts_payload: list[dict[str, object]] = []

        def _snapshot_rollout(rollout: PreferenceRollout) -> dict[str, object]:
            variant = variant_lookup.get(rollout.variant_id) if rollout.variant_id else None
            variant_key = variant.key if variant else "global"
            guardrail = rollout.guardrail_metrics or {}
            evaluation_meta = (rollout.metadata_json or {}).get("guardrail_evaluation", {})
            total_local = int(guardrail.get("total_feedback", 0) or 0)
            positive_local = int(guardrail.get("positive", 0) or 0)
            negative_local = int(guardrail.get("negative", 0) or 0)
            negative_ratio_local = float(
                evaluation_meta.get("negative_ratio")
                if isinstance(evaluation_meta.get("negative_ratio"), (int, float))
                else (negative_local / total_local) if total_local else 0.0
            )
            evaluated_local = _parse_iso(evaluation_meta.get("evaluated_at") if isinstance(evaluation_meta, dict) else None)
            last_feedback_local = guardrail.get("last_feedback_at")
            last_feedback_dt = _parse_iso(last_feedback_local) if isinstance(last_feedback_local, str) else None

            return {
                "rollout_id": str(rollout.rollout_id),
                "variant_id": str(rollout.variant_id) if rollout.variant_id else None,
                "variant_key": variant_key,
                "stage": rollout.stage,
                "current_rate": float(rollout.current_rate or 0),
                "target_rate": float(rollout.target_rate or 0),
                "safety_status": rollout.safety_status,
                "total_feedback": total_local,
                "positive": positive_local,
                "negative": negative_local,
                "negative_ratio": negative_ratio_local,
                "guardrail_evaluated_at": evaluated_local.isoformat() if evaluated_local else None,
                "last_feedback_at": last_feedback_dt.isoformat() if last_feedback_dt else None,
            }

        if variant_id is not None:
            variant = await get_preference_variant(session, tenant.tenant_id, variant_id)
            if variant.model_id != model.model_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Variant not attached to model")
            metrics = variant.metrics_json or {}
            variant_rollouts = [r for r in rollouts_all if r.variant_id == variant.variant_id]
            rollout = variant_rollouts[0] if variant_rollouts else None
            rollouts_payload = [_snapshot_rollout(r) for r in variant_rollouts]
            if rollout is not None:
                safety_status = rollout.safety_status
                eval_meta = (rollout.metadata_json or {}).get("guardrail_evaluation", {})
                evaluated_at = _parse_iso(eval_meta.get("evaluated_at"))
            else:
                safety_status = variant.status
        else:
            metrics = (model.metadata_json or {}).get("feedback_summary", {})
            rollouts_payload = [_snapshot_rollout(r) for r in rollouts_all]
            rollout = rollouts_all[0] if rollouts_all else None
            if rollout is not None:
                safety_status = rollout.safety_status
                eval_meta = (rollout.metadata_json or {}).get("guardrail_evaluation", {})
                evaluated_at = _parse_iso(eval_meta.get("evaluated_at"))
            else:
                safety_status = model.status

        total = int(metrics.get("total_feedback", 0) or 0)
        positive = int(metrics.get("positive", 0) or 0)
        negative = int(metrics.get("negative", 0) or 0)
        avg_rating = metrics.get("avg_rating")
        avg_value: float | None = float(avg_rating) if isinstance(avg_rating, (int, float)) else None
        negative_ratio = (negative / total) if total else 0.0
        last_feedback = _parse_iso(metrics.get("last_feedback_at")) if isinstance(metrics.get("last_feedback_at"), str) else None

        return {
            "model_id": str(model.model_id),
            "variant_id": str(variant_id) if variant_id else None,
            "total_feedback": total,
            "positive": positive,
            "negative": negative,
            "avg_rating": avg_value,
            "negative_ratio": negative_ratio,
            "last_feedback_at": last_feedback.isoformat() if last_feedback else None,
            "safety_status": safety_status,
            "guardrail_evaluated_at": evaluated_at.isoformat() if evaluated_at else None,
            "rollouts": rollouts_payload,
        }

    cached = await summary_cache.get(cache_key)
    if cached is None:
        cached = await build_summary()
        await summary_cache.set(cache_key, cached)

    return PreferenceGuardrailSummary(
        model_id=uuid.UUID(cached["model_id"]),
        variant_id=uuid.UUID(cached["variant_id"]) if cached["variant_id"] else None,
        total_feedback=cached["total_feedback"],
        positive=cached["positive"],
        negative=cached["negative"],
        avg_rating=cached["avg_rating"],
        negative_ratio=cached["negative_ratio"],
        last_feedback_at=datetime.fromisoformat(cached["last_feedback_at"]) if cached["last_feedback_at"] else None,
        safety_status=cached["safety_status"],
        guardrail_evaluated_at=datetime.fromisoformat(cached["guardrail_evaluated_at"]) if cached["guardrail_evaluated_at"] else None,
        rollouts=[
            PreferenceRolloutSummary(
                rollout_id=uuid.UUID(item["rollout_id"]),
                variant_id=uuid.UUID(item["variant_id"]) if item["variant_id"] else None,
                variant_key=item["variant_key"],
                stage=item["stage"],
                current_rate=item["current_rate"],
                target_rate=item["target_rate"],
                safety_status=item["safety_status"],
                total_feedback=item["total_feedback"],
                positive=item["positive"],
                negative=item["negative"],
                negative_ratio=item["negative_ratio"],
                guardrail_evaluated_at=datetime.fromisoformat(item["guardrail_evaluated_at"]) if item["guardrail_evaluated_at"] else None,
                last_feedback_at=datetime.fromisoformat(item["last_feedback_at"]) if item["last_feedback_at"] else None,
            )
            for item in cached.get("rollouts", [])
        ],
    )
