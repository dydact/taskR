#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Applying DeptX schema migrations via core migration runner"
"$ROOT_DIR"/scripts/migrate.sh "$@"

echo "DeptX tables (tr_deptx_*) are up to date."
