from __future__ import annotations

import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest

TEST_FILE = Path(__file__).resolve()
REPO_ROOT = TEST_FILE.parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/api/src"))

import app.services.preferences as preferences_service

from app.events.bus import event_bus
from app.models.core import PreferenceFeedback, PreferenceModel, PreferenceRollout, PreferenceVariant
from app.schemas import PreferenceGuardrailSummary
from app.services.preferences import evaluate_model_rollouts, refresh_model_metrics


class FakeResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return self

    def all(self):
        return list(self._items)


class FakeSession:
    def __init__(self, model, variants, rollouts, feedback):
        self.model = model
        self.variants = {variant.variant_id: variant for variant in variants}
        self.rollouts = {rollout.rollout_id: rollout for rollout in rollouts}
        self.feedback = feedback

    async def execute(self, query):
        entity = query.column_descriptions[0]["entity"]
        if entity is PreferenceFeedback:
            return FakeResult(self.feedback)
        if entity is PreferenceVariant:
            return FakeResult(list(self.variants.values()))
        if entity is PreferenceRollout:
            return FakeResult(list(self.rollouts.values()))
        raise NotImplementedError(f"Unsupported query entity: {entity}")

    async def get(self, model_cls, identifier):
        if model_cls is PreferenceModel and identifier == self.model.model_id:
            return self.model
        if model_cls is PreferenceVariant:
            return self.variants.get(identifier)
        if model_cls is PreferenceRollout:
            return self.rollouts.get(identifier)
        return None

    async def flush(self):
        return None

    async def refresh(self, _obj):
        return None


@pytest.mark.asyncio
async def test_refresh_model_metrics_updates_variant_and_model():
    tenant_id = uuid.uuid4()
    model = PreferenceModel(
        tenant_id=tenant_id,
        slug="default",
        name="Default",
        base_type="classifier",
        status="training",
    )
    model.model_id = uuid.uuid4()
    variant_a = PreferenceVariant(
        tenant_id=tenant_id,
        model=model,
        key="control",
        name="Control",
        status="active",
    )
    variant_a.variant_id = uuid.uuid4()
    variant_a.model_id = model.model_id
    variant_b = PreferenceVariant(
        tenant_id=tenant_id,
        model=model,
        key="treatment",
        name="Treatment",
        status="ramping",
    )
    variant_b.variant_id = uuid.uuid4()
    variant_b.model_id = model.model_id
    rollout = PreferenceRollout(
        tenant_id=tenant_id,
        model=model,
        model_id=model.model_id,
        variant_id=variant_b.variant_id,
        stage="ramp",
        target_rate=0.25,
        current_rate=0.1,
        safety_status="pending",
    )
    rollout.rollout_id = uuid.uuid4()

    feedback = [
        PreferenceFeedback(
            tenant_id=tenant_id,
            model_id=model.model_id,
            variant_id=variant_a.variant_id,
            source="ui",
            signal_type="thumbs",
            rating=1,
        ),
        PreferenceFeedback(
            tenant_id=tenant_id,
            model_id=model.model_id,
            variant_id=variant_b.variant_id,
            source="ui",
            signal_type="thumbs",
            rating=-1,
        ),
        PreferenceFeedback(
            tenant_id=tenant_id,
            model_id=model.model_id,
            variant_id=variant_b.variant_id,
            source="api",
            signal_type="thumbs",
            rating=1,
        ),
    ]

    for item in feedback:
        item.feedback_id = uuid.uuid4()

    session = FakeSession(model, [variant_a, variant_b], [rollout], feedback)

    await refresh_model_metrics(session, tenant_id, model.model_id)

    assert model.metadata_json["feedback_summary"]["total_feedback"] == 3
    assert variant_a.metrics_json["total_feedback"] == 1
    assert pytest.approx(variant_b.metrics_json["avg_rating"], rel=1e-6) == 0.0
    assert rollout.guardrail_metrics["total_feedback"] == 2


@pytest.mark.asyncio
async def test_evaluate_model_rollouts_updates_safety_status():
    tenant_id = uuid.uuid4()
    model = PreferenceModel(
        tenant_id=tenant_id,
        slug="assistant-router",
        name="Assistant Router",
        base_type="reranker",
        status="active",
    )
    model.model_id = uuid.uuid4()
    variant = PreferenceVariant(
        tenant_id=tenant_id,
        model=model,
        key="control",
        name="Control",
        status="active",
    )
    variant.variant_id = uuid.uuid4()
    variant.model_id = model.model_id
    rollout = PreferenceRollout(
        tenant_id=tenant_id,
        model=model,
        model_id=model.model_id,
        variant_id=variant.variant_id,
        stage="ramp",
        target_rate=0.5,
        current_rate=0.2,
        safety_status="pending",
        guardrail_metrics={
            "total_feedback": 10,
            "positive": 6,
            "negative": 4,
        },
    )
    rollout.rollout_id = uuid.uuid4()

    session = FakeSession(model, [variant], [rollout], [])

    changed = await evaluate_model_rollouts(
        session,
        tenant_id,
        model.model_id,
        min_signals=5,
        warning_threshold=0.3,
        halt_threshold=0.4,
    )

    assert rollout.safety_status == "halted"
    assert changed == [rollout]
    assert "guardrail_evaluation" in rollout.metadata_json


@pytest.mark.asyncio
async def test_preference_guardrail_summary_schema():
    summary = PreferenceGuardrailSummary(
        model_id=uuid.uuid4(),
        variant_id=None,
        total_feedback=10,
        positive=6,
        negative=4,
        avg_rating=0.5,
        negative_ratio=0.4,
        safety_status="warning",
        guardrail_evaluated_at=datetime.now(UTC),
        last_feedback_at=datetime.now(UTC),
    )
    data = summary.model_dump()
    assert data["total_feedback"] == 10
    assert data["safety_status"] == "warning"


@pytest.mark.asyncio
async def test_guardrail_event_emitted_when_status_changes():
    tenant_id = uuid.uuid4()
    model = PreferenceModel(
        tenant_id=tenant_id,
        slug="guardian",
        name="Guardrail",
        base_type="reranker",
        status="active",
    )
    model.model_id = uuid.uuid4()
    variant = PreferenceVariant(
        tenant_id=tenant_id,
        model=model,
        key="alpha",
        name="Alpha",
        status="active",
    )
    variant.variant_id = uuid.uuid4()
    variant.model_id = model.model_id
    rollout = PreferenceRollout(
        tenant_id=tenant_id,
        model=model,
        model_id=model.model_id,
        variant_id=variant.variant_id,
        stage="monitor",
        target_rate=0.5,
        current_rate=0.5,
        safety_status="pending",
        guardrail_metrics={
            "total_feedback": 50,
            "positive": 45,
            "negative": 5,
        },
    )
    rollout.rollout_id = uuid.uuid4()

    session = FakeSession(model, [variant], [rollout], [])

    async with event_bus.subscribe() as queue:
        await evaluate_model_rollouts(
            session,
            tenant_id,
            model.model_id,
            min_signals=5,
            warning_threshold=0.2,
            halt_threshold=0.4,
        )

        event = await queue.get()
        assert event["type"] == "preference.guardrail.updated"
        assert event["tenant_id"] == str(tenant_id)
        assert event["model_id"] == str(model.model_id)
        assert event["rollout_id"] == str(rollout.rollout_id)
        assert event["payload"]["safety_status"] == rollout.safety_status
        assert "narrative" in event["payload"]
        assert "variant" in event["payload"]["metrics"]
        assert event["payload"]["metrics"]["stage"] == rollout.stage


@pytest.mark.asyncio
async def test_autopilot_advances_stage_when_healthy(monkeypatch):
    monkeypatch.setattr(preferences_service.settings, "rollout_autopilot_enabled", True)

    tenant_id = uuid.uuid4()
    model = PreferenceModel(
        tenant_id=tenant_id,
        slug="router",
        name="Router",
        base_type="reranker",
        status="active",
    )
    model.model_id = uuid.uuid4()
    variant = PreferenceVariant(
        tenant_id=tenant_id,
        model=model,
        key="beta",
        name="Beta",
        status="active",
    )
    variant.variant_id = uuid.uuid4()
    variant.model_id = model.model_id
    rollout = PreferenceRollout(
        tenant_id=tenant_id,
        model=model,
        model_id=model.model_id,
        variant_id=variant.variant_id,
        stage="ramp",
        target_rate=0.6,
        current_rate=0.3,
        safety_status="pending",
        guardrail_metrics={
            "total_feedback": 20,
            "positive": 18,
            "negative": 2,
        },
        metadata_json={},
    )
    rollout.rollout_id = uuid.uuid4()

    session = FakeSession(model, [variant], [rollout], [])

    async with event_bus.subscribe() as queue:
        await evaluate_model_rollouts(
            session,
            tenant_id,
            model.model_id,
            min_signals=5,
            warning_threshold=0.2,
            halt_threshold=0.5,
        )

        events = [await queue.get(), await queue.get()]

    autop_event = next(e for e in events if e["type"] == "preference.rollout.autopilot")
    assert rollout.stage == "monitor"
    assert autop_event["payload"]["from_stage"] == "ramp"
    assert autop_event["payload"]["to_stage"] == "monitor"
    autop_meta = (rollout.metadata_json or {}).get("autopilot", {})
    assert autop_meta.get("last_to_stage") == "monitor"
    history = autop_meta.get("history", [])
    assert history and history[-1]["to"] == "monitor"
