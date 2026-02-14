#!/usr/bin/env python3
"""Unified development startup command.

This script orchestrates the common dev stack components:
- Ensures the Python virtualenv exists and dependencies are installed.
- Applies database migrations.
- Starts API (FastAPI) via uvicorn with proper PYTHONPATH.
- Runs the front-end Vite dev server.

Usage:
  python scripts/dev_up.py [--skip-install] [--skip-migrate] [--skip-llm] [--skip-vite]
                           [--api-port PORT] [--llm-model MODEL]

The script spawns the API and Vite dev server as subprocesses and pipes their
logs with prefixes. Stop the script (Ctrl+C) to terminate child processes.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
VENV_PYTHON = REPO_ROOT / ".venv/bin/python3.11"
PYTHON = Path(sys.executable)

PYTHONPATH = ":".join(
    [
        str(REPO_ROOT / "services/api/src"),
        str(REPO_ROOT / "packages/common_auth/src"),
        str(REPO_ROOT / "packages/common_events/src"),
        str(REPO_ROOT / "packages/doc_ingest/src"),
        str(REPO_ROOT / "packages/common_billing/src"),
        str(REPO_ROOT / "packages/deptx_core/src"),
        str(REPO_ROOT / "packages/common_agents/src"),
    ]
)


def run(cmd: list[str], **kwargs) -> None:
    print(f"[dev-up] Running: {' '.join(cmd)}")
    subprocess.check_call(cmd, **kwargs)


def resolve_compose_cmd() -> list[str] | None:
    if shutil.which("docker"):
        try:
            result = subprocess.run(
                ["docker", "compose", "version"],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode == 0:
                return ["docker", "compose"]
        except Exception:
            pass
    if shutil.which("docker-compose"):
        return ["docker-compose"]
    return None


def resolve_host_bridge() -> str | None:
    script = REPO_ROOT / "scripts" / "host_bridge.sh"
    if not script.exists():
        return None
    result = subprocess.run([str(script)], capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return None
    value = result.stdout.strip()
    return value or None


def resolve_port(env_name: str, default: int) -> int:
    value = os.environ.get(env_name)
    if value:
        try:
            return int(value)
        except ValueError:
            pass
    return default


def ensure_venv(skip_install: bool) -> Path:
    if VENV_PYTHON.exists():
        return VENV_PYTHON
    if skip_install:
        print("[dev-up] Virtualenv missing; cannot skip install")
        sys.exit(1)
    print("[dev-up] Creating Python virtualenv")
    subprocess.check_call([str(PYTHON), "-m", "venv", ".venv"], cwd=REPO_ROOT)
    return VENV_PYTHON


def install_requirements(python: Path, skip_vite: bool) -> None:
    env = os.environ.copy()
    env.setdefault("PIP_BREAK_SYSTEM_PACKAGES", "1")
    print("[dev-up] Installing backend requirements")
    run([str(python), '-m', 'pip', 'install', '-r', 'requirements.txt'], cwd=REPO_ROOT / 'services/api', env=env)
    for package in ["common_auth", "common_events", "doc_ingest", "common_billing", "deptx_core"]:
        req = REPO_ROOT / "packages" / package / "requirements.txt"
        if req.exists():
            print(f"[dev-up] Installing {package} requirements")
            run([str(python), "-m", "pip", "install", "-r", str(req)], cwd=REPO_ROOT, env=env)
    if skip_vite:
        print("[dev-up] Skipping frontend dependencies (skip-vite enabled)")
        return
    if not shutil.which("pnpm"):
        print("[dev-up] pnpm not found; skipping frontend dependency install.")
        return
    print("[dev-up] Installing frontend dependencies")
    run(["pnpm", "install"], cwd=REPO_ROOT / "apps/web")


def ensure_services(skip_containers: bool, compose_cmd: list[str] | None) -> None:
    if skip_containers:
        return
    if not compose_cmd:
        print("[dev-up] Docker Compose not found; skipping containers.")
        return
    env = os.environ.copy()
    if "HOST_BRIDGE" not in env:
        host_bridge = resolve_host_bridge()
        if host_bridge:
            env["HOST_BRIDGE"] = host_bridge
    print("[dev-up] Starting supporting containers")
    run([*compose_cmd, "up", "-d"], cwd=REPO_ROOT, env=env)


def wait_for_postgres(compose_cmd: list[str] | None, port: int, timeout_seconds: int = 45) -> None:
    """Wait until the postgres container is ready to accept connections.

    Uses pg_isready inside the container for reliability AND checks host port accessibility.
    """
    start = time.time()
    
    # 1. Check internal readiness
    if compose_cmd:
        while True:
            try:
                # Quiet check with 1s timeout
                result = subprocess.run(
                    [*compose_cmd, "exec", "-T", "postgres", "pg_isready", "-U", "taskr", "-d", "taskr", "-h", "localhost", "-t", "1", "-q"],
                    cwd=REPO_ROOT,
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if result.returncode == 0:
                    break
            except FileNotFoundError:
                pass
            
            if time.time() - start > timeout_seconds:
                print('[dev-up] Warning: Postgres internal check timeout; continuing anyway')
                break
            time.sleep(1)

    # 2. Check external host connectivity
    # This prevents "Connection refused" if docker-proxy is slow to bind
    import socket
    print(f'[dev-up] Waiting for Postgres on port {port}...')
    while True:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                print('[dev-up] Postgres is ready')
                return
        except (OSError, ConnectionRefusedError):
            pass
            
        if time.time() - start > timeout_seconds:
            print('[dev-up] Warning: Postgres host port unavailable; continuing anyway')
            return
        time.sleep(1)


def apply_migrations() -> None:
    print('[dev-up] Applying database migrations')
    run(['./scripts/migrate.sh'], cwd=REPO_ROOT)


def start_local_llm(model: str | None, skip_llm: bool) -> subprocess.Popen | None:
    if skip_llm:
        print('[dev-up] Skipping local LLM (requested)')
        return None
    # If port 8001 is busy, assume a proxy is already running and skip boot.
    if port_in_use(8001):
        print('[dev-up] Local LLM proxy already running on :8001')
        return None
    env = os.environ.copy()
    cmd = ['bash', './scripts/run_local_llm.sh']
    if model:
        env['MODEL_NAME'] = model
        print(f"[dev-up] Requested LLM model: {model}")
    print('[dev-up] Starting local LLM (Ollama + LiteLLM proxy on :8001)')
    proc = subprocess.Popen(cmd, cwd=REPO_ROOT, env=env)
    # Wait up to ~20s for /v1/models
    for _ in range(20):
        try:
            result = subprocess.run([
                'curl', '-sS', '--max-time', '1', 'http://127.0.0.1:8001/v1/models'
            ], capture_output=True, text=True, check=False)
            if result.returncode == 0 and result.stdout.strip():
                print('[dev-up] Local LLM proxy is reachable on :8001')
                break
        except Exception:
            pass
        time.sleep(1)
    else:
        print('[dev-up] Warning: local LLM proxy not responding on :8001 yet; continuing')
    return proc


def port_in_use(port: int) -> bool:
    try:
        result = subprocess.run(['lsof', '-ti', f'tcp:{port}'], capture_output=True, text=True, check=False)
        return bool(result.stdout.strip())
    except FileNotFoundError:
        return False


def ensure_postgres_host_port(default: int = 5433) -> int:
    env_name = "TASKR_POSTGRES_HOST_PORT"
    value = os.environ.get(env_name)
    if value:
        try:
            port = int(value)
        except ValueError:
            print(f"[dev-up] Invalid {env_name}='{value}'; using {default}.")
            return default
        if port_in_use(port):
            print(f"[dev-up] {env_name}={port} is already in use; docker compose may fail.")
        return port

    if not port_in_use(default):
        return default

    for candidate in range(default + 1, default + 20):
        if not port_in_use(candidate):
            os.environ[env_name] = str(candidate)
            print(f"[dev-up] Postgres port {default} busy; using {candidate} (set {env_name}).")
            return candidate

    print(
        f"[dev-up] Postgres ports {default}-{default + 19} busy; set {env_name} manually.",
    )
    return default


def ensure_nats_monitor_port(default: int = 8222) -> int:
    env_name = "TASKR_NATS_MONITOR_HOST_PORT"
    value = os.environ.get(env_name)
    if value:
        try:
            port = int(value)
        except ValueError:
            print(f"[dev-up] Invalid {env_name}='{value}'; using {default}.")
            return default
        if port_in_use(port):
            print(f"[dev-up] {env_name}={port} is already in use; docker compose may fail.")
        return port

    if not port_in_use(default):
        return default

    for candidate in range(default + 1, default + 20):
        if not port_in_use(candidate):
            os.environ[env_name] = str(candidate)
            print(f"[dev-up] NATS Monitor port {default} busy; using {candidate} (set {env_name}).")
            return candidate

    print(
        f"[dev-up] NATS Monitor ports {default}-{default + 19} busy; set {env_name} manually.",
    )
    return default


def start_api(
    python: Path,
    skip_api: bool,
    api_port: int,
    postgres_port: int,
    redis_port: int,
    nats_port: int,
) -> subprocess.Popen | None:
    if skip_api:
        print('[dev-up] Skipping API start (requested)')
        return None
    if port_in_use(api_port):
        print(f"[dev-up] Detected API already running on :{api_port} — skipping local uvicorn.")
        return None
    env = os.environ.copy()
    env['PYTHONPATH'] = PYTHONPATH
    env.setdefault("TR_DATABASE_URL", f"postgresql://taskr:taskr@localhost:{postgres_port}/taskr")
    env.setdefault("TR_REDIS_URL", f"redis://localhost:{redis_port}/0")
    env.setdefault("TR_NATS_URL", f"nats://localhost:{nats_port}")
    env.setdefault('VITE_TASKR_USER_ID', 'demo-user')
    # Ensure API can see local OpenAI-compatible proxy
    env.setdefault('TR_LOCAL_OPENAI_BASE_URL', 'http://127.0.0.1:8001')
    env.setdefault('TR_LOCAL_OPENAI_MODEL', 'ollama/qwen2.5:14b-instruct')
    env.setdefault('TR_LOCAL_OPENAI_REASON_MODEL', 'ollama/deepseek-r1:32b-qwen-distill-q4_K_M')
    cmd = [
        str(python),
        '-m',
        'uvicorn',
        'app.main:app',
        '--reload',
        '--host',
        '0.0.0.0',
        '--port',
        str(api_port),
    ]
    print('[dev-up] Starting API server')
    return subprocess.Popen(cmd, cwd=REPO_ROOT / 'services/api', env=env)


def start_vite(api_port: int) -> subprocess.Popen | None:
    if not shutil.which("pnpm"):
        print("[dev-up] pnpm not found; skipping Vite dev server.")
        return None
    env = os.environ.copy()
    env.setdefault("VITE_TASKR_API", f"http://127.0.0.1:{api_port}")
    env.setdefault("VITE_TASKR_USER_ID", "demo-user")
    env.setdefault("VITE_TENANT_ID", "demo")
    # Default to HTTP dev unless explicitly requested
    env.setdefault("VITE_DEV_HTTPS", "0")
    print("[dev-up] Starting Vite dev server")
    return subprocess.Popen(["pnpm", "run", "dev"], cwd=REPO_ROOT / "apps/web", env=env)


def stream_process(name: str, proc: subprocess.Popen) -> None:
    assert proc.stdout is None and proc.stderr is None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-install", action="store_true")
    parser.add_argument("--skip-migrate", action="store_true")
    parser.add_argument("--skip-containers", action="store_true")
    parser.add_argument("--skip-api", action="store_true")
    parser.add_argument("--skip-llm", action="store_true")
    parser.add_argument("--skip-vite", action="store_true")
    parser.add_argument("--api-port", type=int, default=8010)
    parser.add_argument("--llm-model", default=None, help="Override local model (e.g., qwen2.5:32b-instruct)")
    args = parser.parse_args()

    compose_cmd = resolve_compose_cmd()
    postgres_port = ensure_postgres_host_port()
    ensure_nats_monitor_port()
    python_path = ensure_venv(args.skip_install)
    if not args.skip_install:
        install_requirements(python_path, args.skip_vite)

    ensure_services(args.skip_containers, compose_cmd)

    if not args.skip_migrate:
        wait_for_postgres(compose_cmd, postgres_port)
        apply_migrations()

    # Start local LLM proxy first so API can use it immediately
    llm_proc = start_local_llm(args.llm_model, args.skip_llm)

    redis_port = resolve_port("TASKR_REDIS_HOST_PORT", 6379)
    nats_port = resolve_port("TASKR_NATS_HOST_PORT", 14222)
    api_proc = start_api(
        python_path,
        args.skip_api,
        args.api_port,
        postgres_port,
        redis_port,
        nats_port,
    )
    time.sleep(1)
    vite_proc = None if args.skip_vite else start_vite(args.api_port)

    procs = [proc for proc in [llm_proc, api_proc, vite_proc] if proc is not None]

    try:
        while True:
            for proc in procs:
                if proc.poll() is not None:
                    name = 'API' if proc is api_proc else 'Vite'
                    raise RuntimeError(f"{name} process exited")
            time.sleep(1.0)
    except KeyboardInterrupt:
        print('\n[dev-up] Shutting down')
    finally:
        for proc in procs:
            proc.terminate()
        for proc in procs:
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
