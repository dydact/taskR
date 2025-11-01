"""Utilities for loading and querying the ToolFront registry manifest."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = REPO_ROOT / "toolfront-registry" / "providers.json"


class ManifestNotFoundError(FileNotFoundError):
    """Raised when the ToolFront manifest cannot be located."""


def _manifest_path(path: Optional[os.PathLike[str] | str] = None) -> Path:
    candidate = Path(path or os.getenv("TOOLFRONT_REGISTRY_PATH") or DEFAULT_MANIFEST)
    if not candidate.exists():
        raise ManifestNotFoundError(f"ToolFront manifest not found at {candidate}")
    return candidate


@lru_cache(maxsize=1)
def load_manifest(path: Optional[os.PathLike[str] | str] = None) -> Dict[str, Any]:
    manifest_path = _manifest_path(path)
    data = json.loads(manifest_path.read_text())
    if not isinstance(data, dict):
        raise ValueError("Invalid ToolFront manifest structure")
    return data


@dataclass
class Provider:
    id: str
    operations: List[str]
    default_binding: Dict[str, Any]
    policy_notes: List[str]
    schema_ids: List[str]
    endpoints: Dict[str, Optional[str]]

    def endpoint_for(self, environment: str, fallback: Optional[str] = None) -> Optional[str]:
        return self.endpoints.get(environment, fallback)


class Registry:
    """Helper for reading provider metadata from the manifest."""

    def __init__(self, manifest_path: Optional[os.PathLike[str] | str] = None) -> None:
        self._manifest = load_manifest(manifest_path)
        providers = self._manifest.get("providers", [])
        if not isinstance(providers, Iterable):
            raise ValueError("Manifest providers section malformed")
        self._providers: Dict[str, Provider] = {}
        for entry in providers:
            if not isinstance(entry, dict):
                continue
            provider_id = entry.get("id")
            if not isinstance(provider_id, str):
                continue
            operations = [str(op) for op in entry.get("operations", []) if str(op)]
            policy_notes = [str(note) for note in entry.get("policy_notes", []) if str(note)]
            schema_ids = [str(schema) for schema in entry.get("schema_ids", []) if str(schema)]
            endpoints_raw = entry.get("endpoints", {}) or {}
            endpoints = {
                str(env): (value if value is None else str(value))
                for env, value in endpoints_raw.items()
            }

            provider = Provider(
                id=provider_id,
                operations=operations,
                default_binding=entry.get("default_binding", {}) or {},
                policy_notes=policy_notes,
                schema_ids=schema_ids,
                endpoints=endpoints,
            )
            self._providers[provider_id] = provider

        profiles = self._manifest.get("toolfront_base", {})
        self._toolfront_base = profiles if isinstance(profiles, dict) else {}

    @property
    def manifest(self) -> Dict[str, Any]:
        return self._manifest

    def list_providers(self) -> List[str]:
        return sorted(self._providers.keys())

    def get_provider(self, provider_id: str) -> Optional[Provider]:
        return self._providers.get(provider_id)

    def require_provider(self, provider_id: str) -> Provider:
        provider = self.get_provider(provider_id)
        if provider is None:
            raise KeyError(f"Unknown ToolFront provider '{provider_id}'")
        return provider

    def toolfront_base(self, environment: str, default: Optional[str] = None) -> Optional[str]:
        return self._toolfront_base.get(environment, default)

    def default_binding(self, provider_id: str) -> Dict[str, Any]:
        return self.require_provider(provider_id).default_binding

    def resolve_endpoint(
        self,
        provider_id: str,
        environment: Optional[str] = None,
        fallback: Optional[str] = None,
    ) -> Optional[str]:
        env = environment or os.getenv("TOOLFRONT_ENV") or "cloud"
        provider = self.require_provider(provider_id)
        value = provider.endpoint_for(env)
        if value is None:
            return fallback
        return value


__all__ = ["Registry", "load_manifest", "Provider", "ManifestNotFoundError"]
