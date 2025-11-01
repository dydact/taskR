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
export PYTHONPATH="${ROOT_DIR}/services/api/src:${ROOT_DIR}/packages/common_auth/src:${ROOT_DIR}/packages/common_events/src:${ROOT_DIR}/packages/doc_ingest/src:${ROOT_DIR}/packages/common_billing/src:${ROOT_DIR}/packages/deptx_core/src"

ACTION="${1:-up}"
export DATABASE_URL="${DATABASE_URL:-postgresql://taskr:taskr@localhost:5432/taskr}"
export TR_NATS_URL="${TR_NATS_URL:-nats://localhost:14222}"

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

compose_up() {
  echo "[dev] Starting compose services"
  (cd "$ROOT_DIR" && docker compose up -d)
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

  echo "[dev] Installing frontend deps"
  if [[ "${TASKR_USE_NPM:-0}" != "0" ]]; then
    (cd "$ROOT_DIR/apps/web" && npm install)
  elif command -v pnpm >/dev/null 2>&1; then
    (cd "$ROOT_DIR/apps/web" && pnpm install)
  else
    (cd "$ROOT_DIR/apps/web" && npm install)
  fi
}

apply_migrations() {
  echo "[dev] Applying SQL migrations"
  "$ROOT_DIR/scripts/migrate.sh"
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

start_api() {
  echo "[dev] Starting API (uvicorn)"
  export TR_LOCAL_OPENAI_BASE_URL="${TR_LOCAL_OPENAI_BASE_URL:-http://127.0.0.1:8001}"
  export TR_LOCAL_OPENAI_MODEL="${TR_LOCAL_OPENAI_MODEL:-ollama/qwen2.5:14b-instruct}"
  export TR_LOCAL_OPENAI_REASON_MODEL="${TR_LOCAL_OPENAI_REASON_MODEL:-ollama/deepseek-r1:32b-qwen-distill-q4_K_M}"
  if [ -x "$ROOT_DIR/.venv/bin/python3.11" ]; then py="$ROOT_DIR/.venv/bin/python3.11"; else py="$ROOT_DIR/.venv/bin/python3"; fi
  (
    cd "$ROOT_DIR/services/api" && PYTHONPATH="$PYTHONPATH" "$py" -m uvicorn app.main:app --reload
  ) &
  echo $! > "$ROOT_DIR/.dev_api.pid"
}

start_vite() {
  echo "[dev] Starting Vite dev server"
  export VITE_TASKR_API="${VITE_TASKR_API:-http://127.0.0.1:8000}"
  export VITE_TENANT_ID="${VITE_TENANT_ID:-demo}"
  export VITE_TASKR_USER_ID="${VITE_TASKR_USER_ID:-demo-user}"
  if command -v pnpm >/dev/null 2>&1; then
    (
      cd "$ROOT_DIR/apps/web" && pnpm run dev
    ) &
  else
    (
      cd "$ROOT_DIR/apps/web" && npm run dev
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
    start_vite
    echo "[dev] Ready: API http://127.0.0.1:8000 • Vite https://localhost:5173"
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
