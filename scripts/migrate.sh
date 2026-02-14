#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/services/api/migrations"


# Validates environment and DB connection
if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found on host, attempting to run via docker..."
  if ! command -v docker >/dev/null 2>&1; then
      echo "Error: neither psql nor docker found." >&2
      exit 1
  fi
  
  CONTAINER_NAME="taskr-postgres"
  if ! docker ps | grep -q "$CONTAINER_NAME"; then
      echo "Error: $CONTAINER_NAME container is not running." >&2
      exit 1
  fi

  DB_User="taskr"
  DB_NAME="taskr"
  
  for migration in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
    echo "Applying migration (docker): $(basename "$migration")"
    docker exec -i "$CONTAINER_NAME" psql -U "$DB_User" -d "$DB_NAME" < "$migration"
  done
else
  # Use local psql
  DB_PORT="${TASKR_POSTGRES_HOST_PORT:-5433}"
  DB_URL=${DATABASE_URL:-postgresql://taskr:taskr@localhost:${DB_PORT}/taskr}

  for migration in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
    echo "Applying migration (local): $migration"
    psql "$DB_URL" -f "$migration"
  done
fi

echo "Migrations applied successfully"

