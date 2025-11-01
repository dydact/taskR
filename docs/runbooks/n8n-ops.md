# DeptX / n8n Operations Runbook

This runbook captures the minimal steps required to provision the n8n automation stack that backs DeptX workflows.

## 1. Infrastructure Dependencies
- **Postgres:** taskR primary database (used by deptX tables `tr_deptx_*`). Ensure migrations run via `make deptx-migrate`.
- **Redis:** short-lived state cache for node retries and idempotency tokens.
- **NATS:** event fan-out so `deptx.execution.*` notifications reach ToolFront subscribers.
- **n8n service:** container image `ghcr.io/dydact/n8n-deptx:latest`, exposed on port `5678`.
- **Sandbox images:**
  - `ghcr.io/dydact/deptx-sandbox:latest`
  - `ghcr.io/dydact/deptx-sandbox-analytics:latest`

## 2. Secrets Layout
Store automation secrets in the existing secrets loader (e.g. AWS Secrets Manager, Doppler). Required keys:
- `N8N_BASIC_AUTH_USER` / `N8N_BASIC_AUTH_PASSWORD`
- `N8N_JWT_SECRET`
- `VOCOLS_API_KEY` (for `vocols.transcribe` node)
- `INSIGHT_API_KEY`

Expose them to the n8n container via environment variables or Kubernetes `Secret` mounts. The sandbox manager forwards `N8N_BASE_URL` to each profile automatically.

## 3. Bootstrap Steps
1. Apply database migrations:
   ```bash
   make deptx-migrate
   ```
2. Start n8n alongside taskR services (docker-compose snippet):
   ```yaml
   services:
     n8n:
       image: ghcr.io/dydact/n8n-deptx:latest
       environment:
         - N8N_BASIC_AUTH_USER=${N8N_BASIC_AUTH_USER}
         - N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD}
         - N8N_JWT_SECRET=${N8N_JWT_SECRET}
         - DB_POSTGRESDB_HOST=postgres
         - DB_POSTGRESDB_DATABASE=taskr
         - DB_POSTGRESDB_USER=taskr
         - DB_POSTGRESDB_PASSWORD=taskr
       ports:
         - "5678:5678"
   ```
3. Run the smoke test to confirm template import + registry wiring:
   ```bash
   make deptx-smoke
   ```
4. Create a DeptX department via API (see `/deptx/departments`) to seed starter workflows.

## 4. Runtime Monitoring
- Subscribe to `deptx.execution.*` events via ToolFront to watch automation throughput.
- n8n health endpoint: `GET /healthz` (returns JSON status).
- Sandbox pool metrics (CPU/memory) exposed via Prometheus annotations on the sandbox deployment (TODO – hook into Milestone M6.2 hardening).

## 5. Disaster Recovery
- Re-run `make deptx-migrate` on a fresh database restore to recreate schema.
- Re-import templates by PATCHing `/deptx/departments/{id}` with `is_active=true`; seeding logic detects missing workflows.
- Maintain nightly backups for n8n workflow state if operators create custom flows outside the bundled templates.

## 6. Future Enhancements
- Automate n8n provisioning via Terraform module.
- Add smoke workflow that executes the bundled `deptx_task_triage` template end-to-end in staging.
- Instrument sandbox metrics with OpenTelemetry once Milestone M6.2 lands.
