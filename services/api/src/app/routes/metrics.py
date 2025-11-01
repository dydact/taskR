from __future__ import annotations

from fastapi import APIRouter, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.metrics import registry


router = APIRouter(tags=["metrics"])


@router.get("/metrics", include_in_schema=False)
async def metrics_endpoint() -> Response:
    payload = generate_latest(registry)
    return Response(content=payload, media_type=CONTENT_TYPE_LATEST)

