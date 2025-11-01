#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON=${PYTHON:-python3}

if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
  PYTHON="$ROOT_DIR/.venv/bin/python"
fi

export PYTHONPATH="$ROOT_DIR/packages/deptx_core/src:${PYTHONPATH:-}"
export TASKR_ROOT="$ROOT_DIR"

echo "Running deptx_core unit checks"
"$PYTHON" -m pytest "$ROOT_DIR/packages/deptx_core/tests" -q

echo "Validating template importer and registry wiring"
"$PYTHON" - <<'PY'
from pathlib import Path

from deptx_core import SandboxManager, TemplateImporter, ToolRegistry

def main() -> None:
    import os

    base = Path(os.environ["TASKR_ROOT"]) / "packages" / "deptx_core" / "templates"
    importer = TemplateImporter(base)
    templates = importer.list_templates()
    if not templates:
        raise SystemExit("No DeptX templates found")

    registry = ToolRegistry()
    registry.ensure_defaults()
    manager = SandboxManager()
    manager.ensure_defaults()

    print(f"Loaded {len(templates)} template(s); registry size={len(registry.catalog())}; sandboxes={len(manager.catalog())}")


if __name__ == "__main__":
    main()
PY

echo "DeptX smoke check completed"
