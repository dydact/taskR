from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import NotificationChannel
from app.routes.utils import get_tenant
from app.schemas import (
    ClearinghouseConfig,
    ClearinghouseConfigResponse,
    NotificationChannelConfig,
    NotificationConfigPayload,
    NotificationConfigResponse,
)
from app.services.tenant_config import (
    CONFIG_KEY_CLEARINGHOUSE,
    get_config_record,
    upsert_config,
)
from app.services.tenant_notifications import (
    ChannelConfigInput,
    fetch_channels as fetch_notification_channels,
    latest_updated_at as notifications_latest_updated,
    replace_channels as replace_notification_channels,
)
from app.services.notifications import notification_service
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/tenant/config", tags=["tenant-config"])
logger = logging.getLogger(__name__)

_SECRET_KEYS = {"account_key", "password", "secret", "token", "webhook_url", "auth_token", "account_sid"}


def _mask_secret(value: str | None) -> str | None:
    if not value:
        return value
    if len(value) <= 4:
        return "*" * len(value)
    return f"{value[:2]}…{value[-2:]}"


def _sanitize_payload(data: dict[str, Any]) -> dict[str, Any]:
    sanitized: dict[str, Any] = {}
    for key, value in data.items():
        sanitized[key] = _sanitize_value(key, value)
    return sanitized


def _sanitize_value(key: str, value: Any) -> Any:
    if key in _SECRET_KEYS and isinstance(value, str):
        return _mask_secret(value)
    if isinstance(value, dict):
        return {child_key: _sanitize_value(child_key, child_value) for child_key, child_value in value.items()}
    if isinstance(value, list):
        sanitized_list: list[Any] = []
        for item in value:
            if isinstance(item, dict):
                sanitized_list.append({child_key: _sanitize_value(child_key, child_value) for child_key, child_value in item.items()})
            elif key in _SECRET_KEYS and isinstance(item, str):
                sanitized_list.append(_mask_secret(item))
            else:
                sanitized_list.append(item)
        return sanitized_list
    return value


def _channel_to_schema(channel: NotificationChannel) -> NotificationChannelConfig:
    raw_config = channel.config or {}
    sanitized_config = _sanitize_payload(raw_config) if raw_config else {}
    return NotificationChannelConfig(
        channel=channel.channel,
        enabled=channel.enabled,
        events=list(channel.events or []),
        config=sanitized_config,
    )


def _normalized_config_payload(config: ClearinghouseConfig) -> dict[str, Any]:
    payload = config.model_dump(exclude_none=True, exclude_unset=True)

    if not payload.get("credentials"):
        payload.pop("credentials", None)
    if not payload.get("envelope"):
        payload.pop("envelope", None)
    if not payload.get("metadata"):
        payload.pop("metadata", None)

    mode = payload.get("mode")
    if mode == "claimmd":
        payload["mode"] = "claimmd_api"
    return payload


@router.get("/clearinghouse", response_model=ClearinghouseConfigResponse)
async def get_clearinghouse_config(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> ClearinghouseConfigResponse:
    tenant = await get_tenant(session, headers.tenant_id)
    record = await get_config_record(session, tenant.tenant_id, CONFIG_KEY_CLEARINGHOUSE)
    if record is None:
        # Default empty config
        return ClearinghouseConfigResponse(config=ClearinghouseConfig())
    return ClearinghouseConfigResponse(
        config=ClearinghouseConfig.model_validate(record.cfg_value or {}),
        updated_at=record.updated_at,
    )


@router.put("/clearinghouse", response_model=ClearinghouseConfigResponse)
async def update_clearinghouse_config(
    payload: ClearinghouseConfig,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> ClearinghouseConfigResponse:
    tenant = await get_tenant(session, headers.tenant_id)
    value = _normalized_config_payload(payload)
    mode = value.get("mode", "claimmd_api")

    if mode == "claimmd_api" and not value.get("account_key"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account key is required for Claim.MD submissions",
        )

    if mode not in {"claimmd_api", "filedrop", "manual"} and not value.get("credentials"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Credentials are required for the selected mode",
        )

    if mode == "sftp":
        creds = value.get("credentials") or {}
        required = ["host", "username", "password"]
        missing = [key for key in required if not creds.get(key)]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing SFTP credential fields: {', '.join(missing)}",
            )

    await upsert_config(session, tenant.tenant_id, CONFIG_KEY_CLEARINGHOUSE, value)
    await session.commit()
    record = await get_config_record(session, tenant.tenant_id, CONFIG_KEY_CLEARINGHOUSE)
    stored = record.cfg_value if record and record.cfg_value is not None else value
    sanitized = _sanitize_payload(stored)
    updated_at_iso = record.updated_at.isoformat() if record and record.updated_at else None
    sanitized_event = {
        "mode": stored.get("mode"),
        "host": stored.get("host"),
        "config": sanitized,
        "updated_by": headers.user_id,
        "updated_at": updated_at_iso,
    }

    logger.info(
        "tenant_config.clearinghouse.updated",
        extra={
            "tenant_id": str(tenant.tenant_id),
            "mode": stored.get("mode"),
        },
    )

    publisher = getattr(request.app.state, "event_publisher", None)
    if publisher is not None:
        try:
            await publisher.publish(
                "tenant.config.clearinghouse.v1",
                str(tenant.tenant_id),
                sanitized_event,
            )
        except Exception as exc:  # pragma: no cover - best effort logging
            logger.warning("Failed to emit clearinghouse update event: %s", exc)

    return ClearinghouseConfigResponse(
        config=ClearinghouseConfig.model_validate(stored or {}),
        updated_at=record.updated_at if record else None,
    )


@router.get("/notifications", response_model=NotificationConfigResponse)
async def get_notification_config(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> NotificationConfigResponse:
    tenant = await get_tenant(session, headers.tenant_id)
    rows = await fetch_notification_channels(session, tenant.tenant_id)
    channels = [_channel_to_schema(row) for row in rows]
    updated_at = notifications_latest_updated(rows)
    return NotificationConfigResponse(channels=channels, updated_at=updated_at)


@router.put("/notifications", response_model=NotificationConfigResponse)
async def update_notification_config(
    payload: NotificationConfigPayload,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> NotificationConfigResponse:
    tenant = await get_tenant(session, headers.tenant_id)
    inputs = [
        ChannelConfigInput(
            channel=entry.channel,
            enabled=entry.enabled,
            events=[str(event) for event in (entry.events or [])],
            config=dict(entry.config or {}),
        )
        for entry in payload.channels
    ]
    try:
        rows = await replace_notification_channels(session, tenant.tenant_id, inputs)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await session.commit()
    notification_service.invalidate_cache(tenant.tenant_id)
    channels = [_channel_to_schema(row) for row in rows]
    updated_at = notifications_latest_updated(rows)

    logger.info(
        "tenant_config.notifications.updated",
        extra={
            "tenant_id": str(tenant.tenant_id),
            "channels": [entry.channel for entry in inputs],
        },
    )

    return NotificationConfigResponse(channels=channels, updated_at=updated_at)
