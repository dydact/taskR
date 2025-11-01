#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON=${PYTHON:-python3}

if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
  PYTHON="$ROOT_DIR/.venv/bin/python"
fi

echo "Running preference metrics unit checks"
"$PYTHON" -m pytest "$ROOT_DIR/services/api/tests/test_preference_metrics.py" -q

echo "Preference smoke check completed"
