from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator, Dict

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from app.events.bus import event_bus

router = APIRouter(prefix="/events", tags=["events"])


async def _event_stream(tenant_id: str) -> AsyncIterator[bytes]:
    async with event_bus.subscribe() as queue:
        while True:
            event: Dict[str, object] = await queue.get()
            if event.get("tenant_id") != tenant_id:
                continue
            payload = json.dumps(event)
            yield f"data: {payload}\n\n".encode("utf-8")


@router.get("/tasks/stream")
async def task_event_stream(
    request: Request,
    tenant_override: str | None = Query(default=None, alias="tenant"),
) -> StreamingResponse:
    header_tenant = request.headers.get("x-tenant-id") or request.headers.get("x-scr-tenant")
    tenant_id = tenant_override or header_tenant
    if tenant_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": "missing_tenant"})

    async def generator():
        try:
            async for chunk in _event_stream(tenant_id):
                yield chunk
        except asyncio.CancelledError:
            return

    return StreamingResponse(generator(), media_type="text/event-stream")


@router.get("/stream")
async def info_event_stream(
    request: Request,
    tenant_override: str | None = Query(default=None, alias="tenant"),
) -> StreamingResponse:
    """Generic info SSE stream (model/tool/tool_result/outline/summary events).

    Mirrors the same behavior as tasks stream but aligned to Insight docs.
    """

    header_tenant = request.headers.get("x-tenant-id") or request.headers.get("x-scr-tenant")
    tenant_id = tenant_override or header_tenant
    if tenant_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": "missing_tenant"})

    async def generator():
        try:
            async for chunk in _event_stream(tenant_id):
                yield chunk
        except asyncio.CancelledError:
            return

    return StreamingResponse(generator(), media_type="text/event-stream")
