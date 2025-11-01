from __future__ import annotations

from datetime import datetime, timezone

from app.models.base import Base, TimestampMixin
from common_billing import TenantFeatureOverrideMixin, TenantSubscriptionMixin


class TenantSubscription(TenantSubscriptionMixin, TimestampMixin, Base):
    """Materialized subscription assignment for a tenant."""

    __tablename__ = "tr_tenant_subscription"

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"TenantSubscription(tenant_id={self.tenant_id}, plan={self.plan_slug})"


class TenantFeatureOverride(TenantFeatureOverrideMixin, TimestampMixin, Base):
    """Per-tenant feature overrides that supplement subscription tiers."""

    __tablename__ = "tr_tenant_feature_override"

    def is_active(self, now: datetime | None = None) -> bool:
        if now is None:
            now = datetime.now(timezone.utc)
        if self.expires_at and self.expires_at < now:
            return False
        return self.enabled


__all__ = ["TenantSubscription", "TenantFeatureOverride"]
