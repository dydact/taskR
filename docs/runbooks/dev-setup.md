# Developer Setup Runbook

## Prerequisites
- Docker + Docker Compose 2.x
- Python 3.11 with `pip`
- Node 18+ and npm

> macOS tip: if `python3 --version` prints 3.12+ (or anything other than 3.11), install the supported runtime first: `brew install python@3.11` and then re-run commands using `python3.11`. `pyenv install 3.11.9` + `pyenv local 3.11.9` works as well.

## Python Virtual Environment
Create a dedicated virtual environment at the repo root so Python tooling stays isolated:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
```

> Tip: add `source .venv/bin/activate` to your shell profile or run it in every new terminal before executing Python commands (e.g. `make install`, `make migrate`).

## First-Time Setup
1. Clone the repo and install tooling hooks:
   ```bash
   make install
   ```
2. Boot the local stack:
   ```bash
   make up
   ```
3. Apply database migrations:
   ```bash
   make migrate
   ```
4. Start the API locally (optional hot reload):
   ```bash
   cd services/api
   uvicorn app.main:app --reload
   ```
5. Navigate to http://localhost:8000/health to confirm the API is live.
6. Seed demo data (optional but recommended):
   ```bash
   source .venv/bin/activate
   python scripts/seed_demo.py
   ```
   This populates the `demo` tenant with sample spaces/lists/tasks.

## Useful Commands
- `make down` – tear down the local stack
- `make lint` – run formatters/linters
- `scripts/migrate.sh` – replay SQL migrations (uses `$DATABASE_URL`)

## Environment Variables
Create a `.env` file at the repo root or export variables for development:
```
TR_DATABASE_URL=postgresql://taskr:taskr@localhost:5432/taskr
TR_REDIS_URL=redis://localhost:6379/0
TR_NATS_URL=nats://localhost:14222
TR_USE_TOOLFRONT=true
TR_TOOLFRONT_BASE_URL=http://localhost:3002
TR_TOOLFRONT_API_TOKEN=dev-token
TR_TOOLFRONT_ENV=edge
TR_TOOLFRONT_REGISTRY_PATH=../toolfront-registry/providers.json
TR_ROLLOUT_AUTOPILOT_ENABLED=false
TR_SCR_LINKAGE_HTTP_URL=http://localhost:8080
TR_SCR_LINKAGE_HTTP_TOKEN=dev-token
TR_SCR_ALERT_TOKEN=dev-secret
TR_INSIGHT_API_URL=http://127.0.0.1:3003
TR_LOCAL_OPENAI_BASE_URL=http://127.0.0.1:8001
TR_SCRAIV_BASE_URL=https://scr.local/scr/hr
TR_SCRAIV_API_KEY=dev-secret
VITE_TASKR_API=http://127.0.0.1:8000
VITE_CLAIMS_API_BASE=https://scr.local
VITE_TENANT_ID=demo
VITE_TASKR_USER_ID=demo-user
VITE_INSIGHT_API=http://127.0.0.1:3003
VITE_DYDACT_CHAT_URL=https://scr.local/dydact
VITE_DYDACT_RUNTIME_URL=https://scr.local/api/copilot
VITE_DYDACT_SERVICE_ID=taskr
VITE_DYDACT_SERVICE_NAME=TaskR
VITE_DYDACT_AVATAR_URL=https://scr.local/brand/dydactlogocard.png
VITE_DYDACT_CHAT_ICON=/Users/dydact/dev/platform/vNdydact/apps/ui-chat/public/brand/favicon.png
VITE_DYDACT_CONTAINER_URL=https://scr.local/dydact?mode=container
VITE_DYDACT_CONTROL_CENTER_MODULE=@dydact/control-center
```
The FastAPI service reads these via `pydantic-settings`.

Set `TR_USE_TOOLFRONT=false` to temporarily fall back to direct Insight calls
while the ToolFront gateway is unavailable. When enabled, the service will use
the shared registry (`toolfront-registry/providers.json`) to resolve providers
such as `insight.llm`.

### One-Command Dev (API + Web + Local LLM)
Use the unified launcher:

```
./scripts/dev.sh up
```

This script:
- Starts Colima (if available) and resolves the container host bridge.
- Brings up Postgres/Redis/NATS via `docker compose`.
- Creates/updates `.venv`, installs backend + packages dependencies, installs frontend deps.
- Applies SQL migrations.
- Starts the local LLM proxy on :8001 (set `DEV_START_LLM=0` to skip).
- Launches the API (uvicorn --reload) and Vite dev server.

Other commands:
- `./scripts/dev.sh down` – stop API/Vite and compose services.
- `./scripts/dev.sh migrate` – run migrations only.
- `./scripts/dev.sh status` – show compose services + tracked PIDs.

After the stack is up, seed demo data so the UI isn’t empty:
```
source .venv/bin/activate
python scripts/seed_demo.py
```
The seeder is idempotent; rerun anytime to refresh the `demo` tenant.

### macOS (Colima) quickstart
- Install: `brew install colima docker`
- Start: `colima start --vm-type vz --cpu 6 --memory 12 --disk 80`
- Resolve host bridge:
  ```bash
  export HOST_BRIDGE=$(./scripts/host_bridge.sh)
  ./scripts/runtime_check.sh
  ```
- Use `${HOST_BRIDGE}` when you need to reach host services from containers.

### HR & Dydact integrations
- `TR_SCRAIV_BASE_URL=https://scr.local/scr/hr` routes the HR proxy to scrAIv.
- The HR view shows clock/timesheet/payroll data; expect `503` placeholders until scrAIv is reachable.
- `./scripts/send_hr_event.sh` posts a sample `hr.clock.updated` webhook (uses `TR_SCR_ALERT_TOKEN`).
- Append `?refresh=1` to `/hr/users` to bypass the local identity cache if you need a fresh map.
- The floating “Chat” button loads the Dydact assistant overlay. Configure runtime + service metadata with `VITE_DYDACT_*` variables. If the React component cannot load, the portal iframe fallback (`VITE_DYDACT_CONTAINER_URL`, default `https://scr.local/dydact?mode=container`) is used automatically.
- `VITE_DYDACT_CHAT_ICON` controls the trigger badge (set to `/Users/dydact/dev/platform/vNdydact/apps/ui-chat/public/brand/favicon.png` for the shared favicon).
- `VITE_DYDACT_CONTAINER_URL` overrides the iframe fallback URL if you need a custom portal route.
- `VITE_DYDACT_CONTROL_CENTER_MODULE` can be set to a module spec (e.g. a local bundle path) if you want to load the React embed directly; leave blank to use the iframe fallback.
- Tenant admins can manage clearinghouse transport (Claim.MD/SFTP/filedrop) via the Settings panel (Command Palette → "Open Tenant Settings"); values persist to `tr_tenant_config` and override env defaults.

## ToolFront Manifest Drift Check
TaskR vendors the shared ToolFront manifest under `toolfront-registry/`. To
verify it stays in sync with the source copy exported by vNdydact, run:

```
./scripts/check_toolfront_manifest.sh
```

CI executes the same script and fails if the vendored manifest drifts from the
upstream `platform/toolfront-registry/providers.json`.
