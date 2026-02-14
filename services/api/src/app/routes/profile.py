from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import Tenant, User
from app.routes.utils import get_tenant
from app.schemas import ProfileRead
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/profile", tags=["profile"])


async def _resolve_profile_user(
    session: AsyncSession,
    tenant: Tenant,
    identifier: str | None,
) -> User:
    user: User | None = None
    if identifier:
        try:
            user_uuid = uuid.UUID(identifier)
        except ValueError:
            user_uuid = None
        if user_uuid:
            user = await session.get(User, user_uuid)
        if user is None:
            result = await session.execute(
                select(User)
                .where(User.tenant_id == tenant.tenant_id, User.email == identifier)
                .limit(1)
            )
            user = result.scalar_one_or_none()
    if user is None:
        result = await session.execute(
            select(User)
            .where(User.tenant_id == tenant.tenant_id)
            .order_by(User.created_at)
            .limit(1)
        )
        user = result.scalar_one_or_none()
    if user is None:
        user = User(
            user_id=uuid.uuid4(),
            tenant_id=tenant.tenant_id,
            email=f"{identifier or 'demo'}@taskr.local",
            given_name="Demo",
            family_name="User",
            status="active",
            roles=["operator"],
            identity_metadata={},
        )
        session.add(user)
        await session.flush()
    return user


def _serialize_profile(user: User) -> ProfileRead:
    full_name = " ".join(
        part
        for part in [user.given_name, user.family_name]
        if isinstance(part, str) and part.strip()
    ).strip()
    if not full_name:
        full_name = user.email
    roles = user.roles if isinstance(user.roles, list) else []
    avatar = None
    metadata = user.identity_metadata or {}
    if isinstance(metadata, dict):
        avatar = metadata.get("avatar_url") or metadata.get("avatar")
    return ProfileRead(
        user_id=user.user_id,
        email=user.email,
        given_name=user.given_name,
        family_name=user.family_name,
        full_name=full_name,
        roles=roles,
        avatar_url=avatar,
    )


@router.get("", response_model=ProfileRead)
async def get_profile(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> ProfileRead:
    tenant = await get_tenant(session, headers.tenant_id)
    user = await _resolve_profile_user(session, tenant, headers.user_id)
    return _serialize_profile(user)
