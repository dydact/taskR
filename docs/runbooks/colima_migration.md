# Colima Migration (macOS) — Container Runtime Guidance

This doc helps run taskR (and collaborating agents) on macOS without Docker Desktop by using Colima. It includes a portable host-bridge helper so containers can reach host services reliably.

## Install Colima + Docker CLI
```
brew install colima docker
```

## Start Colima (Apple Silicon)
```
colima start --vm-type vz --cpu 6 --memory 12 --disk 80
# Optional: use the Colima context explicitly
# docker context use colima
```

## Host Bridge Resolver
When using Colima, containers reach host services at `host.lima.internal` (not `host.docker.internal`). Resolve once and export it:

```
# POSIX-safe one-liner
HOST_BRIDGE=$( (docker context show 2>/dev/null | grep -qi colima) && echo host.lima.internal || echo host.docker.internal )
export HOST_BRIDGE
```

For convenience, this repo provides:
- `scripts/host_bridge.sh` — prints the resolved host bridge.
- `scripts/runtime_check.sh` — prints Docker context and HOST_BRIDGE, for quick verification.

Example:
```
export HOST_BRIDGE=$(./scripts/host_bridge.sh)
./scripts/runtime_check.sh
```

## Compose and ENV
Never hard‑code `host.docker.internal`. Use `${HOST_BRIDGE}` in env files and Compose:

```
# .env (example)
TR_INSIGHT_API_URL=http://${HOST_BRIDGE}:3003
TR_LOCAL_OPENAI_BASE_URL=http://${HOST_BRIDGE}:8001
TR_SCRAIV_BASE_URL=https://scr.local/scr/hr
VITE_DYDACT_CHAT_URL=https://scr.local/dydact
```

Compose example (environment section):
```
environment:
  DYDACT_BASE_URL: "http://${HOST_BRIDGE}:3003"
  SCRAIV_BASE_URL: "https://scr.local/scr/hr"
```

This repo’s `docker-compose.yml` is parameterized to respect `${HOST_BRIDGE}` for the local LLM proxy.

## Image/Arch
- On Apple Silicon, prefer `linux/arm64` images; avoid emulation.
- Local builds: `docker build --platform linux/arm64 ...`

## Volumes/FS
- Prefer smaller bind mounts; avoid heavy mounts like `node_modules` or `.next`.
- For large trees, use read‑only binds or named volumes for speed.

## Networking + VPN
- After sleep or VPN changes, restart Colima:
```
colima stop && colima start
```

## Agent‑specific Hints

- scrAIv (HR/time)
  - Export `HOST_BRIDGE` and pass:
    - `SCRAIV_BASE_URL=https://scr.local/scr/hr`
    - If calling host DB/cache: `host.lima.internal:PORT`
  - Health + smoke:
    - `curl -fsS http://localhost:<scraiv_port>/health`
    - `curl -fsS http://localhost:<scraiv_port>/api/users`
    - Optional webhook test from taskR: `./scripts/send_hr_event.sh`

- taskR (this repo)
  - Export `HOST_BRIDGE` and use:
    - `TR_SCRAIV_BASE_URL=http://${HOST_BRIDGE}:<port>`
    - `TR_INSIGHT_API_URL=http://${HOST_BRIDGE}:3003`
    - Vite: `VITE_INSIGHT_API=http://${HOST_BRIDGE}:3003`
  - Summaries (strict JSON):
    - `POST http://${HOST_BRIDGE}:3003/summaries/meetings`
    - `POST http://${HOST_BRIDGE}:3003/summaries/autopm`
  - Acceptance smokes:
    - Chat streams in taskR (SSE)
    - `/summaries/*` return structured JSON (try 3 realistic samples)
    - HR widgets show open clocks, pending timesheets, payroll totals

## References
- dydact/docs/runbooks/colima_migration.md
- dydact/docs/plans/dydact_chat_alpha_plan.md
