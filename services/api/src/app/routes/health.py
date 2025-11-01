from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", summary="Service health check")
async def health() -> dict[str, str]:
    return {"status": "ok"}
