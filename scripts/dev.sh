#!/usr/bin/env bash
# Unified dev launcher (single entrypoint)
# - Starts Colima (if available) and resolves HOST_BRIDGE
# - Boots compose deps (Postgres/Redis/NATS), waits for Postgres
# - Sets up Python venv + installs backend deps; installs frontend deps
# - Applies SQL migrations
# - Optionally starts local LLM proxy on :8001
# - Starts API (uvicorn --reload) and Vite dev server; cleans up on exit

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PYTHONPATH="${ROOT_DIR}/services/api/src:${ROOT_DIR}/packages/common_auth/src:${ROOT_DIR}/packages/common_events/src:${ROOT_DIR}/packages/doc_ingest/src:${ROOT_DIR}/packages/common_billing/src:${ROOT_DIR}/packages/deptx_core/src:${ROOT_DIR}/packages/common_agents/src"

ACTION="${1:-up}"
export TASKR_API_PORT="${TASKR_API_PORT:-8010}"

# Resolve host bridge once (Colima vs Docker Desktop)
resolve_host_bridge() {
  if docker context show 2>/dev/null | grep -qi colima; then
    echo host.lima.internal
  else
    echo host.docker.internal
  fi
}

ensure_colima() {
  if command -v colima >/dev/null 2>&1; then
    if ! docker context show 2>/dev/null | grep -qi colima; then
      # Colima installed but not the active context; still ok to run
      :
    fi
    # Start if not running; ignore failures on non-mac hosts
    if ! colima status 2>/dev/null | grep -qi running; then
      echo "[dev] Starting Colima"
      colima start --vm-type vz --cpu 6 --memory 12 --disk 80 || true
    fi
  fi
}

ensure_tools() {
  for bin in docker psql; do
    command -v "$bin" >/dev/null 2>&1 || { echo "[dev] Missing required tool: $bin" >&2; exit 1; }
  done
}

find_free_port() {
  local port="$1"
  while lsof -Pi ":${port}" -sTCP:LISTEN >/dev/null 2>&1; do
    port=$((port + 1))
  done
  echo "$port"
}

compose_up() {
  local desired_pg_port="${TASKR_POSTGRES_HOST_PORT:-5433}"
  local desired_nats_port="${TASKR_NATS_HOST_PORT:-14222}"
  local desired_monitor_port="${TASKR_NATS_MONITOR_HOST_PORT:-8222}"
  local free_pg_port
  local free_nats_port
  local free_monitor_port

  free_pg_port=$(find_free_port "$desired_pg_port")
  free_nats_port=$(find_free_port "$desired_nats_port")
  free_monitor_port=$(find_free_port "$desired_monitor_port")

  if [ "$free_pg_port" != "$desired_pg_port" ]; then
    echo "[dev] Postgres port ${desired_pg_port} busy; using ${free_pg_port}"
  fi
  if [ "$free_nats_port" != "$desired_nats_port" ]; then
    echo "[dev] NATS client port ${desired_nats_port} busy; using ${free_nats_port}"
  fi
  if [ "$free_monitor_port" != "$desired_monitor_port" ]; then
    echo "[dev] NATS monitor port ${desired_monitor_port} busy; using ${free_monitor_port}"
  fi

  export TASKR_POSTGRES_HOST_PORT="$free_pg_port"
  export TASKR_NATS_HOST_PORT="$free_nats_port"
  export TASKR_NATS_MONITOR_HOST_PORT="$free_monitor_port"
  if [ -z "${DATABASE_URL:-}" ] || [ "${DATABASE_URL}" = "postgresql://taskr:taskr@localhost:${desired_pg_port}/taskr" ]; then
    export DATABASE_URL="postgresql://taskr:taskr@localhost:${free_pg_port}/taskr"
  fi
  if [ -z "${TR_NATS_URL:-}" ] || [ "${TR_NATS_URL}" = "nats://localhost:${desired_nats_port}" ]; then
    export TR_NATS_URL="nats://localhost:${free_nats_port}"
  fi

  echo "[dev] Starting compose services (postgres, redis, nats, minio)"
  (cd "$ROOT_DIR" && docker compose up -d postgres redis nats minio)
}

wait_for_postgres() {
  echo "[dev] Waiting for Postgres to be ready"
  local start; start=$(date +%s)
  while true; do
    if (cd "$ROOT_DIR" && docker compose exec -T postgres pg_isready -U taskr -d taskr -h localhost -t 1 -q); then
      echo "[dev] Postgres is ready"
      break
    fi
    if [ $(( $(date +%s) - start )) -gt 45 ]; then
      echo "[dev] Warning: Postgres not ready after 45s; continuing"
      break
    fi
    sleep 1
  done
}

ensure_venv() {
  if [ ! -x "$ROOT_DIR/.venv/bin/python3" ] && [ ! -x "$ROOT_DIR/.venv/bin/python3.11" ]; then
    echo "[dev] Creating Python virtualenv (.venv)"
    if command -v python3.11 >/dev/null 2>&1; then
      (cd "$ROOT_DIR" && python3.11 -m venv .venv)
    else
      (cd "$ROOT_DIR" && python3 -m venv .venv)
    fi
  fi
}

install_backend() {
  echo "[dev] Installing backend deps"
  local py
  if [ -x "$ROOT_DIR/.venv/bin/python3.11" ]; then py="$ROOT_DIR/.venv/bin/python3.11"; else py="$ROOT_DIR/.venv/bin/python3"; fi
  (cd "$ROOT_DIR/services/api" && PIP_BREAK_SYSTEM_PACKAGES=1 "$py" -m pip install -r requirements.txt)
  for pkg in common_auth common_events doc_ingest common_billing deptx_core; do
    local req="$ROOT_DIR/packages/$pkg/requirements.txt"
    [ -f "$req" ] && (cd "$ROOT_DIR" && PIP_BREAK_SYSTEM_PACKAGES=1 "$py" -m pip install -r "$req") || true
  done
}

install_frontend() {
  if [[ "${TASKR_SKIP_FRONTEND_INSTALL:-0}" == "1" ]]; then
    echo "[dev] Skipping frontend dependency installation (TASKR_SKIP_FRONTEND_INSTALL=1)"
    return
  fi

  echo "[dev] Installing frontend deps (TaskR UI)"
  if [[ "${TASKR_USE_NPM:-0}" != "0" ]]; then
    (cd "$ROOT_DIR/apps/taskr-ui" && npm install)
  elif command -v pnpm >/dev/null 2>&1; then
    (cd "$ROOT_DIR/apps/taskr-ui" && pnpm install)
  else
    (cd "$ROOT_DIR/apps/taskr-ui" && npm install)
  fi

  if [[ "${TASKR_INSTALL_WEB_SHELL:-0}" == "1" ]]; then
    echo "[dev] Installing legacy web shell deps"
    if command -v pnpm >/dev/null 2>&1; then
      (cd "$ROOT_DIR/apps/web" && pnpm install)
    else
      (cd "$ROOT_DIR/apps/web" && npm install)
    fi
  fi
}

apply_migrations() {
  echo "[dev] Applying SQL migrations"
  "$ROOT_DIR/scripts/migrate.sh"
}

seed_demo_data() {
  if [[ "${DEV_SKIP_SEED:-0}" == "1" ]]; then
    echo "[dev] Skipping demo seed (DEV_SKIP_SEED=1)"
    return
  fi

  local py
  if [ -x "$ROOT_DIR/.venv/bin/python3.11" ]; then
    py="$ROOT_DIR/.venv/bin/python3.11"
  else
    py="$ROOT_DIR/.venv/bin/python3"
  fi

  if [ ! -x "$py" ]; then
    echo "[dev] Skipping demo seed (virtualenv python missing)"
    return
  fi

  local seed_api="${TASKR_SEED_API:-http://127.0.0.1:${TASKR_API_PORT}}"
  local seed_tenant="${VITE_TENANT_ID:-demo}"

  echo "[dev] Seeding demo data (tenant=${seed_tenant})"
  if ! (cd "$ROOT_DIR" && "$py" scripts/seed_demo.py --api "$seed_api" --tenant "$seed_tenant"); then
    echo "[dev] Warning: demo seed failed; continuing without sample data" >&2
  fi
}

start_llm() {
  # Optional: start local LLM proxy if script exists and port 8001 free
  if [ "${DEV_START_LLM:-1}" != "1" ]; then return; fi
  if lsof -ti tcp:8001 >/dev/null 2>&1; then
    echo "[dev] LLM proxy already on :8001"
    return
  fi
  if [ -x "$ROOT_DIR/scripts/run_local_llm.sh" ]; then
    echo "[dev] Starting local LLM (Ollama + LiteLLM)"
    (
      cd "$ROOT_DIR" && bash ./scripts/run_local_llm.sh
    ) &
    echo $! > "$ROOT_DIR/.dev_llm.pid"
  else
    echo "[dev] Skipping LLM (scripts/run_local_llm.sh not found)"
  fi
}

kill_pid_file() {
  local file="$1"
  if [ -f "$file" ]; then
    local pid
    pid=$(cat "$file" || true)
    if [ -n "${pid:-}" ] && ps -p "$pid" >/dev/null 2>&1; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
    rm -f "$file"
  fi
}

start_api() {
  echo "[dev] Starting API (uvicorn)"
  export TR_LOCAL_OPENAI_BASE_URL="${TR_LOCAL_OPENAI_BASE_URL:-http://127.0.0.1:8001}"
  export TR_LOCAL_OPENAI_MODEL="${TR_LOCAL_OPENAI_MODEL:-ollama/qwen2.5:14b-instruct}"
  export TR_LOCAL_OPENAI_REASON_MODEL="${TR_LOCAL_OPENAI_REASON_MODEL:-ollama/deepseek-r1:32b-qwen-distill-q4_K_M}"
  if [ -x "$ROOT_DIR/.venv/bin/python3.11" ]; then py="$ROOT_DIR/.venv/bin/python3.11"; else py="$ROOT_DIR/.venv/bin/python3"; fi
  kill_pid_file "$ROOT_DIR/.dev_api.pid"
  (
    cd "$ROOT_DIR/services/api" && PYTHONPATH="$PYTHONPATH" "$py" -m uvicorn app.main:app --reload --port "$TASKR_API_PORT"
  ) &
  echo $! > "$ROOT_DIR/.dev_api.pid"
}

wait_for_api() {
  local timeout="${1:-60}"
  echo "[dev] Waiting for API healthcheck"
  local start; start=$(date +%s)
  while true; do
    if curl -fsS -H "x-tenant-id: ${VITE_TENANT_ID:-demo}" -H "x-user-id: ${VITE_TASKR_USER_ID:-dev-script}" "http://127.0.0.1:${TASKR_API_PORT}/health" >/dev/null 2>&1; then
      echo "[dev] API is ready"
      return 0
    fi
    if [ $(( $(date +%s) - start )) -ge "$timeout" ]; then
      echo "[dev] Warning: API not healthy after ${timeout}s; continuing"
      return 1
    fi
    sleep 1
  done
}

start_vite() {
  echo "[dev] Starting TaskR UI (Vite)"
  export TASKR_API_URL="${TASKR_API_URL:-http://127.0.0.1:${TASKR_API_PORT}}"
  export VITE_TASKR_API="${VITE_TASKR_API:-/api}"
  export VITE_CLAIMS_API_BASE="${VITE_CLAIMS_API_BASE:-/scr}"
  export VITE_TENANT_ID="${VITE_TENANT_ID:-demo}"
  export VITE_TASKR_USER_ID="${VITE_TASKR_USER_ID:-demo-user}"
  kill_pid_file "$ROOT_DIR/.dev_vite.pid"
  if command -v pnpm >/dev/null 2>&1; then
    (
      cd "$ROOT_DIR" && pnpm --filter @dydact/taskr-ui dev
    ) &
  else
    (
      cd "$ROOT_DIR/apps/taskr-ui" && npm run dev
    ) &
  fi
  echo $! > "$ROOT_DIR/.dev_vite.pid"
}

cleanup() {
  echo "\n[dev] Shutting down"
  for f in .dev_vite.pid .dev_api.pid .dev_llm.pid; do
    if [ -f "$ROOT_DIR/$f" ]; then
      pid=$(cat "$ROOT_DIR/$f" || true)
      if [ -n "${pid:-}" ] && ps -p "$pid" >/dev/null 2>&1; then kill "$pid" 2>/dev/null || true; fi
      rm -f "$ROOT_DIR/$f"
    fi
  done
}

case "$ACTION" in
  up)
    ensure_tools
    ensure_colima || true
    export HOST_BRIDGE="${HOST_BRIDGE:-$(resolve_host_bridge)}"
    compose_up
    wait_for_postgres
    ensure_venv
    install_backend
    install_frontend
    apply_migrations
    start_llm
    trap cleanup EXIT INT TERM
    start_api
    wait_for_api 60 || true
    seed_demo_data
    start_vite
    echo "[dev] Ready: API http://127.0.0.1:${TASKR_API_PORT} • UI https://localhost:5175"
    # Keep script alive while children run
    while true; do sleep 60; done
    ;;
  down)
    cleanup || true
    (cd "$ROOT_DIR" && docker compose down) || true
    ;;
  migrate)
    ensure_tools
    compose_up
    wait_for_postgres
    apply_migrations
    ;;
  status)
    (cd "$ROOT_DIR" && docker compose ps)
    echo "API PID: $(cat "$ROOT_DIR/.dev_api.pid" 2>/dev/null || echo '-')" ; echo "Vite PID: $(cat "$ROOT_DIR/.dev_vite.pid" 2>/dev/null || echo '-')"
    ;;
  *)
    echo "Usage: $0 [up|down|migrate|status]" >&2
    exit 1
    ;;
esac
