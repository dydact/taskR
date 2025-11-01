from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import UserPreference
from app.routes.utils import get_tenant
from app.schemas import UserPreferenceRead, UserPreferenceUpsert
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/user-preferences", tags=["user-preferences"])


def _require_user(headers: TenantHeaders) -> str:
    if not headers.user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing user identifier")
    return headers.user_id


@router.get("", response_model=list[UserPreferenceRead])
async def list_preferences(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[UserPreferenceRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    user_id = _require_user(headers)
    query = select(UserPreference).where(
        UserPreference.tenant_id == tenant.tenant_id,
        UserPreference.user_id == user_id,
    ).order_by(UserPreference.key)
    result = await session.execute(query)
    preferences = result.scalars().all()
    return [UserPreferenceRead.model_validate(pref) for pref in preferences]


@router.get("/{key}", response_model=UserPreferenceRead | None)
async def get_preference(
    key: str,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> UserPreferenceRead | None:
    tenant = await get_tenant(session, headers.tenant_id)
    user_id = _require_user(headers)
    preference = await session.execute(
        select(UserPreference).where(
            UserPreference.tenant_id == tenant.tenant_id,
            UserPreference.user_id == user_id,
            UserPreference.key == key,
        )
    )
    record = preference.scalar_one_or_none()
    if record is None:
        return None
    return UserPreferenceRead.model_validate(record)


@router.put("/{key}", response_model=UserPreferenceRead)
async def upsert_preference(
    key: str,
    payload: UserPreferenceUpsert,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> UserPreferenceRead:
    tenant = await get_tenant(session, headers.tenant_id)
    user_id = _require_user(headers)

    result = await session.execute(
        select(UserPreference).where(
            UserPreference.tenant_id == tenant.tenant_id,
            UserPreference.user_id == user_id,
            UserPreference.key == key,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.value_json = payload.value
        existing.updated_at = datetime.utcnow()
        await session.flush()
        await session.refresh(existing)
        return UserPreferenceRead.model_validate(existing)

    preference = UserPreference(
        tenant_id=tenant.tenant_id,
        user_id=user_id,
        key=key,
        value_json=payload.value,
    )
    session.add(preference)
    await session.flush()
    await session.refresh(preference)
    return UserPreferenceRead.model_validate(preference)
