from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Dict, Iterable

from sqlalchemy import JSON, select
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column


@dataclass
class FeatureSnapshot:
    plan_slug: str
    application: str
    features: set[str]


class TenantSubscriptionMixin:
    tenant_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    plan_slug: Mapped[str] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(default="active", nullable=False)
    active_since: Mapped[datetime | None] = mapped_column(nullable=True)
    active_until: Mapped[datetime | None] = mapped_column(nullable=True)
    metadata_json: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)


class TenantFeatureOverrideMixin:
    tenant_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    application: Mapped[str] = mapped_column(primary_key=True)
    feature_code: Mapped[str] = mapped_column(primary_key=True)
    enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(nullable=True)
    metadata_json: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)


class BillingService:
    def __init__(
        self,
        *,
        default_plan: str,
        plan_features: dict[str, dict[str, Iterable[str]]],
        subscription_model,
        override_model,
    ) -> None:
        self._default_plan = default_plan
        self._subscription_model = subscription_model
        self._override_model = override_model
        self._plan_features: dict[str, dict[str, set[str]]] = {}
        for plan_slug, applications in plan_features.items():
            self._plan_features[plan_slug] = {
                app: set(features) for app, features in applications.items()
            }

    async def ensure_subscription(
        self,
        session: AsyncSession,
        tenant_id: uuid.UUID,
    ):
        subscription = await self.get_subscription(session, tenant_id)
        if subscription is not None:
            return subscription
        now = datetime.utcnow()
        subscription = self._subscription_model(
            tenant_id=tenant_id,
            plan_slug=self._default_plan,
            status="active",
            active_since=now,
            metadata_json={},
        )
        session.add(subscription)
        await session.flush()
        await session.refresh(subscription)
        return subscription

    async def get_subscription(self, session: AsyncSession, tenant_id: uuid.UUID):
        return await session.get(self._subscription_model, tenant_id)

    async def assign_plan(
        self,
        session: AsyncSession,
        tenant_id: uuid.UUID,
        *,
        plan_slug: str,
        status: str | None = None,
        active_until: datetime | None = None,
        metadata: dict | None = None,
    ):
        subscription = await self.ensure_subscription(session, tenant_id)
        subscription.plan_slug = plan_slug
        if status is not None:
            subscription.status = status
        subscription.active_since = datetime.utcnow()
        subscription.active_until = active_until
        if metadata is not None:
            subscription.metadata_json = dict(metadata)
        await session.flush()
        await session.refresh(subscription)
        return subscription

    async def list_overrides(
        self,
        session: AsyncSession,
        tenant_id: uuid.UUID,
        *,
        application: str,
    ):
        result = await session.execute(
            select(self._override_model)
            .where(self._override_model.tenant_id == tenant_id)
            .where(self._override_model.application == application)
            .order_by(self._override_model.feature_code)
        )
        return list(result.scalars().all())

    async def _get_override(
        self,
        session: AsyncSession,
        tenant_id: uuid.UUID,
        application: str,
        feature_code: str,
    ):
        result = await session.execute(
            select(self._override_model).where(
                (self._override_model.tenant_id == tenant_id)
                & (self._override_model.application == application)
                & (self._override_model.feature_code == feature_code)
            )
        )
        return result.scalar_one_or_none()

    async def set_feature_override(
        self,
        session: AsyncSession,
        tenant_id: uuid.UUID,
        feature_code: str,
        *,
        application: str,
        enabled: bool,
        expires_at: datetime | None = None,
        metadata: dict | None = None,
    ):
        override = await self._get_override(session, tenant_id, application, feature_code)
        if override is None:
            override = self._override_model(
                tenant_id=tenant_id,
                application=application,
                feature_code=feature_code,
                enabled=enabled,
                expires_at=expires_at,
                metadata_json=dict(metadata or {}),
            )
            session.add(override)
        else:
            override.enabled = enabled
            override.expires_at = expires_at
            override.metadata_json = dict(metadata or {})
        await session.flush()
        await session.refresh(override)
        return override

    async def clear_feature_override(
        self,
        session: AsyncSession,
        tenant_id: uuid.UUID,
        feature_code: str,
        *,
        application: str,
    ):
        override = await self._get_override(session, tenant_id, application, feature_code)
        if override is not None:
            await session.delete(override)
            await session.flush()

    async def get_effective_features(
        self,
        session: AsyncSession,
        tenant_id: uuid.UUID,
        *,
        application: str,
    ) -> FeatureSnapshot:
        subscription = await self.ensure_subscription(session, tenant_id)
        base_features = set(
            self._plan_features.get(subscription.plan_slug, {}).get(application, set())
        )
        overrides = await self.list_overrides(session, tenant_id, application=application)
        now = datetime.utcnow()
        for override in overrides:
            if override.expires_at and override.expires_at < now:
                continue
            if override.enabled:
                base_features.add(override.feature_code)
            else:
                base_features.discard(override.feature_code)
        return FeatureSnapshot(plan_slug=subscription.plan_slug, application=application, features=base_features)

    async def is_feature_enabled(
        self,
        session: AsyncSession,
        tenant_id: uuid.UUID,
        feature_code: str,
        *,
        application: str,
    ) -> bool:
        snapshot = await self.get_effective_features(session, tenant_id, application=application)
        return feature_code in snapshot.features
