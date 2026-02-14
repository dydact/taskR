#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=9076
SEED_DEMO=false
TENANT_SLUG="demo"
PYTHON_BIN="${PYTHON_BIN:-python3.11}"
NATS_BIN="${NATS_BIN:-nats-server}"
PNPM_BIN="${PNPM_BIN:-pnpm}"
START_FRONTEND=true
FRONTEND_PORT=5175
NATS_PID=""
VITE_PID=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --seed-demo           Populate demo data before launching the API (default: off)
  --tenant <slug>       Tenant slug to seed when --seed-demo is enabled (default: demo)
  --port <port>         Port to expose (default: 9076)
  --python <path>       Python binary to use for virtualenv creation (default: python3.11)
  --no-frontend         Skip launching the taskr-ui dev server
  --frontend-port <n>   Port for taskr-ui dev server (default: 5175)
  -h, --help            Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed-demo) SEED_DEMO=true; shift ;;
    --tenant) TENANT_SLUG="${2:-}"; shift 2 ;;
    --port) PORT="${2:-9076}"; shift 2 ;;
    --python) PYTHON_BIN="${2:-python3.11}"; shift 2 ;;
    --no-frontend) START_FRONTEND=false; shift ;;
    --frontend-port) FRONTEND_PORT="${2:-5175}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Error: Python interpreter '$PYTHON_BIN' not found." >&2
  exit 1
fi

if [[ ! -d "$ROOT_DIR/.venv" ]]; then
  echo "Creating virtual environment (.venv)..."
  "$PYTHON_BIN" -m venv "$ROOT_DIR/.venv"
  source "$ROOT_DIR/.venv/bin/activate"
  pip install --upgrade pip >/dev/null
  pip install -r "$ROOT_DIR/services/api/requirements.txt"
else
  source "$ROOT_DIR/.venv/bin/activate"
fi

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
  set +a
fi

export TR_DATABASE_URL="${TR_DATABASE_URL:-postgresql://taskr:taskr@localhost:5433/taskr}"
export TR_REDIS_URL="${TR_REDIS_URL:-redis://localhost:6379/0}"
export TR_NATS_URL="${TR_NATS_URL:-nats://localhost:14222}"
export TR_USE_TOOLFRONT="${TR_USE_TOOLFRONT:-true}"
export TR_TOOLFRONT_REGISTRY_PATH="${TR_TOOLFRONT_REGISTRY_PATH:-$ROOT_DIR/toolfront-registry/providers.json}"
export TR_ROLLOUT_AUTOPILOT_ENABLED="${TR_ROLLOUT_AUTOPILOT_ENABLED:-false}"
export TR_ALLOWED_CORS_ORIGINS="${TR_ALLOWED_CORS_ORIGINS:-[]}"
export TR_ALLOWED_CORS_ORIGIN_REGEX="${TR_ALLOWED_CORS_ORIGIN_REGEX:-^https?://(?:localhost|127\.0\.0\.1)(?::[0-9]+)?$}"
export TR_LOCAL_OPENAI_BASE_URL="${TR_LOCAL_OPENAI_BASE_URL:-http://127.0.0.1:8001}"
export TR_LOCAL_OPENAI_MODEL="${TR_LOCAL_OPENAI_MODEL:-ollama/qwen2.5:14b-instruct}"
export TR_BRIDGE_SCHEDULE_ENABLED="${TR_BRIDGE_SCHEDULE_ENABLED:-true}"
export PYTHONPATH="$ROOT_DIR/services/api/src:$ROOT_DIR/packages/common_events/src:$ROOT_DIR/packages/common_auth/src:$ROOT_DIR/packages/doc_ingest/src:$ROOT_DIR/packages/common_billing/src:$ROOT_DIR/packages/deptx_core/src:$ROOT_DIR/packages/common_agents/src"

ensure_port_available() {
  local port="$1"
  local attempts=0
  local max_attempts=5
  local pids=()

  while true; do
    # shellcheck disable=SC2207
    pids=($(lsof -ti tcp:"$port" 2>/dev/null || true))
    if [[ ${#pids[@]} -eq 0 ]]; then
      break
    fi

    if [[ $attempts -eq 0 ]]; then
      echo "Detected existing process listening on port $port (PID(s): ${pids[*]}). Attempting to stop it..."
    fi

    if [[ $attempts -lt $max_attempts ]]; then
      kill "${pids[@]}" 2>/dev/null || true
    else
      echo "Processes still active on port $port after $attempts attempts; force killing..."
      kill -9 "${pids[@]}" 2>/dev/null || true
    fi

    sleep 1
    attempts=$((attempts + 1))
  done

  echo "Port $port is free."
}

ensure_port_available "$PORT"

if [[ "$START_FRONTEND" == "true" ]]; then
  ensure_port_available "$FRONTEND_PORT"
fi

cleanup() {
  if [[ -n "${NATS_PID:-}" ]]; then
    if kill -0 "$NATS_PID" >/dev/null 2>&1; then
      echo "Stopping local NATS (PID $NATS_PID)..."
      kill "$NATS_PID" >/dev/null 2>&1 || true
      wait "$NATS_PID" 2>/dev/null || true
    fi
    NATS_PID=""
  fi
  if [[ -n "${VITE_PID:-}" ]]; then
    if kill -0 "$VITE_PID" >/dev/null 2>&1; then
      echo "Stopping taskr-ui dev server (PID $VITE_PID)..."
      kill "$VITE_PID" >/dev/null 2>&1 || true
      wait "$VITE_PID" 2>/dev/null || true
    fi
    VITE_PID=""
  fi
}

trap cleanup EXIT

resolve_nats_host() {
  python - <<'PY'
from urllib.parse import urlparse
import os
url = urlparse(os.environ.get("TR_NATS_URL", "nats://localhost:14222"))
print(url.hostname or "localhost")
PY
}

resolve_nats_port() {
  python - <<'PY'
from urllib.parse import urlparse
import os
url = urlparse(os.environ.get("TR_NATS_URL", "nats://localhost:14222"))
print(url.port or 4222)
PY
}

start_nats_if_needed() {
  local host port
  host="$(resolve_nats_host)"
  port="$(resolve_nats_port)"

  # Only auto-start when pointing to localhost/127.0.0.1
  if [[ "$host" != "localhost" && "$host" != "127.0.0.1" ]]; then
    return
  fi

  if lsof -ti tcp:"$port" >/dev/null 2>&1; then
    echo "Detected NATS already running on ${host}:${port}."
    return
  fi

  if ! command -v "$NATS_BIN" >/dev/null 2>&1; then
    echo "Warning: cannot start NATS automatically; '$NATS_BIN' not found in PATH."
    return
  fi

  echo "Starting local NATS on ${host}:${port}..."
  "$NATS_BIN" --jetstream --addr "$host" --port "$port" >/dev/null 2>&1 &
  NATS_PID=$!
  sleep 1
}

start_nats_if_needed

if [[ "$SEED_DEMO" == "true" ]]; then
  echo "Seeding demo data for tenant '$TENANT_SLUG'..."
  python "$ROOT_DIR/scripts/dev/populate_taskr_demo.py" \
    --tenant "$TENANT_SLUG"
fi

start_frontend() {
  if [[ "$START_FRONTEND" != "true" ]]; then
    return
  fi

  if ! command -v "$PNPM_BIN" >/dev/null 2>&1; then
    echo "Warning: pnpm not found; skipping taskr-ui dev server startup."
    return
  fi

  echo "Starting taskr-ui dev server on port $FRONTEND_PORT..."
  (cd "$ROOT_DIR/apps/taskr-ui" && "$PNPM_BIN" dev --host 0.0.0.0 --port "$FRONTEND_PORT") &
  VITE_PID=$!
  sleep 2
}

start_frontend

echo "Starting TaskR API on port $PORT..."
cd "$ROOT_DIR/services/api"
uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
