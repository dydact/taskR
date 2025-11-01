from __future__ import annotations

import asyncio
from typing import Any

import httpx


async def post_with_retry(
    url: str,
    *,
    payload: dict[str, Any],
    timeout: float,
    retries: int = 1,
    backoff_base: float = 0.2,
) -> httpx.Response:
    """Post JSON payload with a basic exponential backoff retry strategy."""
    attempt = 0
    while True:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                return await client.post(url, json=payload)
        except (httpx.TransportError, httpx.TimeoutException):
            if attempt >= retries:
                raise
            await asyncio.sleep(backoff_base * (2**attempt))
            attempt += 1
