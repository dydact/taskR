from __future__ import annotations

import sys
from pathlib import Path


def _ensure_package_path() -> None:
    root = Path(__file__).resolve().parents[2]
    packages = root / "packages"
    for name in ("common_auth", "common_events", "doc_ingest", "common_billing", "common_agents", "deptx_core"):
        candidate = packages / name / "src"
        if candidate.exists():
            path_str = str(candidate)
            if path_str not in sys.path:
                sys.path.append(path_str)


_ensure_package_path()

__all__ = ["_ensure_package_path"]
