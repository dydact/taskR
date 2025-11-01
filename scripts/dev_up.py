#!/usr/bin/env python3
"""Unified development startup command.

This script orchestrates the common dev stack components:
- Ensures the Python virtualenv exists and dependencies are installed.
- Applies database migrations.
- Starts API (FastAPI) via uvicorn with proper PYTHONPATH.
- Runs the front-end Vite dev server.

Usage:
  python scripts/dev_up.py [--skip-install] [--skip-migrate] [--skip-llm] [--llm-model MODEL]

The script spawns the API and Vite dev server as subprocesses and pipes their
logs with prefixes. Stop the script (Ctrl+C) to terminate child processes.
"""
from __future__ import annotations

import argparse
import os
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
    ]
)


def run(cmd: list[str], **kwargs) -> None:
    print(f"[dev-up] Running: {' '.join(cmd)}")
    subprocess.check_call(cmd, **kwargs)


def ensure_venv(skip_install: bool) -> Path:
    if VENV_PYTHON.exists():
        return VENV_PYTHON
    if skip_install:
        print("[dev-up] Virtualenv missing; cannot skip install")
        sys.exit(1)
    print("[dev-up] Creating Python virtualenv")
    subprocess.check_call([str(PYTHON), "-m", "venv", ".venv"], cwd=REPO_ROOT)
    return VENV_PYTHON


def install_requirements(python: Path) -> None:
    env = os.environ.copy()
    env.setdefault("PIP_BREAK_SYSTEM_PACKAGES", "1")
    print("[dev-up] Installing backend requirements")
    run([str(python), '-m', 'pip', 'install', '-r', 'requirements.txt'], cwd=REPO_ROOT / 'services/api', env=env)
    for package in ["common_auth", "common_events", "doc_ingest", "common_billing", "deptx_core"]:
        req = REPO_ROOT / "packages" / package / "requirements.txt"
        if req.exists():
            print(f"[dev-up] Installing {package} requirements")
            run([str(python), "-m", "pip", "install", "-r", str(req)], cwd=REPO_ROOT, env=env)
    print("[dev-up] Installing frontend dependencies")
    run(["pnpm", "install"], cwd=REPO_ROOT / "apps/web")


def ensure_services(skip_containers: bool) -> None:
    if skip_containers:
        return
    print('[dev-up] Starting supporting containers')
    run(['docker', 'compose', 'up', '-d'], cwd=REPO_ROOT)


def wait_for_postgres(timeout_seconds: int = 45) -> None:
    """Wait until the postgres container is ready to accept connections.

    Uses pg_isready inside the container for reliability.
    """
    start = time.time()
    while True:
        try:
            # Quiet check with 1s timeout
            result = subprocess.run(
                ['docker', 'compose', 'exec', '-T', 'postgres', 'pg_isready', '-U', 'taskr', '-d', 'taskr', '-h', 'localhost', '-t', '1', '-q'],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode == 0:
                print('[dev-up] Postgres is ready')
                return
        except FileNotFoundError:
            # Docker/compose not available, best effort fallback: wait briefly
            pass
        if time.time() - start > timeout_seconds:
            print('[dev-up] Warning: Postgres not ready after wait; continuing anyway')
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


def start_api(python: Path, skip_api: bool) -> subprocess.Popen | None:
    if skip_api:
        print('[dev-up] Skipping API start (requested)')
        return None
    if port_in_use(8000):
        print('[dev-up] Detected API already running on :8000 — skipping local uvicorn.')
        return None
    env = os.environ.copy()
    env['PYTHONPATH'] = PYTHONPATH
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
    ]
    print('[dev-up] Starting API server')
    return subprocess.Popen(cmd, cwd=REPO_ROOT / 'services/api', env=env)


def start_vite() -> subprocess.Popen:
    env = os.environ.copy()
    env.setdefault("VITE_TASKR_API", "http://127.0.0.1:8000")
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
    parser.add_argument("--llm-model", default=None, help="Override local model (e.g., qwen2.5:32b-instruct)")
    args = parser.parse_args()

    python_path = ensure_venv(args.skip_install)
    if not args.skip_install:
        install_requirements(python_path)

    ensure_services(args.skip_containers)

    if not args.skip_migrate:
        wait_for_postgres()
        apply_migrations()

    # Start local LLM proxy first so API can use it immediately
    llm_proc = start_local_llm(args.llm_model, args.skip_llm)

    api_proc = start_api(python_path, args.skip_api)
    time.sleep(1)
    vite_proc = start_vite()

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
