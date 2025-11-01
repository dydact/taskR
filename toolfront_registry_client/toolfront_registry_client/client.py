"""HTTP client helpers for ToolFront."""

from __future__ import annotations

import asyncio
import os
from typing import Any, AsyncIterator, Dict, Optional
from uuid import uuid4

import httpx

from .manifest import Registry


class ToolFrontError(Exception):
    """Base error for ToolFront client failures."""


class ToolFrontClient:
    """Minimal async ToolFront client wrapping /ask and admin endpoints."""

    def __init__(
        self,
        *,
        base_url: Optional[str] = None,
        api_token: Optional[str] = None,
        timeout: float = 30.0,
        registry: Optional[Registry] = None,
        environment: Optional[str] = None,
        policy_headers: Optional[Dict[str, str]] = None,
        client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self._registry = registry or Registry()
        self._environment = environment or os.getenv("TOOLFRONT_ENV") or "cloud"
        toolfront_base = base_url or self._registry.toolfront_base(self._environment)
        if not toolfront_base:
            raise ToolFrontError(
                "ToolFront base URL not provided. Set TOOLFRONT_BASE_URL or update manifest."
            )
        self._base_url = toolfront_base.rstrip("/")
        self._api_token = api_token or os.getenv("TOOLFRONT_API_TOKEN")
        self._policy_headers = dict(policy_headers or {})
        self._client = client or httpx.AsyncClient(base_url=self._base_url, timeout=timeout)
        self._owns_client = client is None

    @property
    def base_url(self) -> str:
        return self._base_url

    def _build_headers(
        self,
        *,
        tenant_id: str,
        request_id: Optional[str] = None,
        extra: Optional[Dict[str, str]] = None,
    ) -> Dict[str, str]:
        headers: Dict[str, str] = {
            "x-tenant-id": tenant_id,
            "x-request-id": request_id or str(uuid4()),
            "content-type": "application/json",
        }
        if self._api_token:
            headers["authorization"] = f"Bearer {self._api_token}"
        if self._policy_headers:
            headers.update(self._policy_headers)
        if extra:
            headers.update(extra)
        return headers

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def __aenter__(self) -> "ToolFrontClient":
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.aclose()

    async def ask(
        self,
        *,
        tenant_id: str,
        provider_id: str,
        operation: str,
        parameters: Optional[Dict[str, Any]] = None,
        binding: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        payload = {
            "provider": provider_id,
            "operation": operation,
            "parameters": parameters or {},
        }
        if binding is not None:
            payload["binding"] = binding
        headers = self._build_headers(
            tenant_id=tenant_id,
            request_id=request_id,
            extra=extra_headers,
        )
        response = await self._client.post("/ask", json=payload, headers=headers)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:  # pragma: no cover - network error path
            raise ToolFrontError(str(exc)) from exc
        return response.json()

    async def ask_stream(
        self,
        *,
        tenant_id: str,
        provider_id: str,
        operation: str,
        parameters: Optional[Dict[str, Any]] = None,
        binding: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> AsyncIterator[str]:
        payload = {
            "provider": provider_id,
            "operation": operation,
            "parameters": parameters or {},
        }
        if binding is not None:
            payload["binding"] = binding
        headers = self._build_headers(
            tenant_id=tenant_id,
            request_id=request_id,
            extra=extra_headers,
        )
        async with self._client.stream("POST", "/ask/stream", json=payload, headers=headers) as resp:
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:  # pragma: no cover - network error path
                raise ToolFrontError(str(exc)) from exc
            async for line in resp.aiter_lines():
                if not line:
                    continue
                yield line

    async def list_providers(self) -> Dict[str, Any]:
        response = await self._client.get("/admin/providers")
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:  # pragma: no cover
            raise ToolFrontError(str(exc)) from exc
        return response.json()


def get_registry() -> Registry:
    """Convenience helper to obtain a cached registry instance."""
    return Registry()


__all__ = ["ToolFrontClient", "ToolFrontError", "get_registry"]
