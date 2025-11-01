from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.core.config import settings
from app.events.bus import event_bus
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/hr", tags=["hr-webhooks"])


@router.post("/events/webhook")
async def hr_events_webhook(
    payload: Dict[str, Any],
    headers: TenantHeaders = Depends(get_tenant_headers),
    x_webhook_token: str | None = Header(default=None, alias="x-webhook-token"),
) -> dict[str, str]:
    expected = (settings.scr_alert_token or "").strip()
    provided = (x_webhook_token or "").strip()
    if not expected:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="webhook not configured")
    if provided != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token")

    event_type = str(payload.get("type") or payload.get("event") or "").strip()
    if not event_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="missing event type")

    await event_bus.publish(
        {
            "type": event_type,
            "tenant_id": headers.tenant_id,
            "user_id": headers.user_id,
            "payload": payload,
        }
    )
    return {"status": "ok"}

