from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db_session
from app.routes.utils import get_tenant
from app.models.billing import TenantFeatureOverride, TenantSubscription
from common_auth import TenantHeaders, get_tenant_headers
from common_billing import BillingService


billing_service = BillingService(
    default_plan=settings.subscription_default_plan,
    plan_features=settings.subscription_plans,
    subscription_model=TenantSubscription,
    override_model=TenantFeatureOverride,
)


def get_billing_service() -> BillingService:
    return billing_service


async def ensure_default_plan(session: AsyncSession, tenant_id: uuid.UUID) -> TenantSubscription:
    return await billing_service.ensure_subscription(session, tenant_id)


async def is_feature_enabled(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    feature_code: str,
    *,
    application: str = "taskr",
) -> bool:
    return await billing_service.is_feature_enabled(
        session,
        tenant_id,
        feature_code,
        application=application,
    )


async def set_feature_override(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    feature_code: str,
    *,
    application: str = "taskr",
    enabled: bool,
):
    await billing_service.set_feature_override(
        session,
        tenant_id,
        feature_code,
        application=application,
        enabled=enabled,
    )


async def assign_plan(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    plan_slug: str,
    *,
    status: str | None = None,
) -> TenantSubscription:
    return await billing_service.assign_plan(
        session,
        tenant_id,
        plan_slug=plan_slug,
        status=status,
    )


def require_feature(feature_code: str, *, application: str = "taskr"):
    async def dependency(
        session: AsyncSession = Depends(get_db_session),
        headers: TenantHeaders = Depends(get_tenant_headers),
        service: BillingService = Depends(get_billing_service),
    ) -> None:
        tenant = await get_tenant(session, headers.tenant_id)
        allowed = await service.is_feature_enabled(
            session,
            tenant.tenant_id,
            feature_code,
            application=application,
        )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Feature not enabled for this subscription",
            )

    return dependency
