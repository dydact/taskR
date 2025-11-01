#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/services/api/migrations"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to run migrations" >&2
  exit 1
fi

DB_URL=${DATABASE_URL:-postgresql://taskr:taskr@localhost:5432/taskr}

for migration in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  echo "Applying migration: $migration"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$migration"
done

echo "Migrations applied"
