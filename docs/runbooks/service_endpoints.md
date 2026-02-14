# Service Endpoints Matrix

This matrix tracks externally consumed service contracts so implementation and docs stay aligned. Keep entries sorted alphabetically by service name. Use the detail notes below for deep links, auth requirements, and validation steps.

| Service | Endpoint(s) | Method(s) | Primary Consumers | Notes |
| --- | --- | --- | --- | --- |
| DeptX Orchestrator | `/workflows/*`, `/compass/reviews`, `/exo-status` | GET/POST/PUT | Flow plans, TaskR schedulers | See [DeptX brief](../platform/taskr/dedicated-agent-brief.md) for schema references. |
| Exo Mesh | `/health`, `/mesh/summary`, `/nodes/register`, `/enroll`, `/jobs/lease` | GET/POST | DeptX, Flow, TaskR dedicated agent bridge | Contracts captured in `services/exo/main.py` (nodes + job leasing). |
| Flow Executor | `/health`, `/config`, `/plans/{id}/compile`, `/plans/{id}/run` | GET/POST | TaskR automation, DeptX escalations | Plan execution pipeline; ensure compile/run accept latest Polaris payload. |
| TaskR API (Shell bootstrap) | `/profile`, `/preferences`, `/spaces`, `/spaces/{space}/navigation` | GET/PATCH | TaskR shell (React) | `/preferences` accepts partial PATCH; `/spaces` must expose `id` alias; navigation route requires slug passthrough. |
| TaskR Bridge | `/bridge/schedule/sync` | POST | scrAIv, openemr sync jobs | Reconciles TaskR timelines with scrAIv timeline events + openemr bookings; returns created/updated counts and guardrail conflicts. |

## TaskR API notes
- Auth: expects `x-tenant-id`, optional `x-user-id` (stubbed as `demo-user` until unified auth lands).
- `/profile` resolves the first tenant user when `x-user-id` is absent; replace with real identity once auth integration is finished.
- `/preferences` GET/PATCH exchanges the `PreferencesState` contract. Patch bodies are normalized server-side (favorites deduplicated, list columns boolean).
- Shell bootstrap also hits `/spaces` (each record now includes both `space_id` and `id`) and `/spaces/{slug}/navigation`; keep these responses in sync with `ShellContext` when evolving schema or navigation data.
- Keep demo seeding (`services/api/src/app/services/demo_seed.py`) aligned so seeded tenants include users/preferences compatible with these routes.
- `/bridge/schedule/sync` is the orchestration entry point for M5.4: it fetches scrAIv timeline events and openemr appointments, upserts `tr_schedule_timeline`, and publishes `schedule.guardrail` events when status/billing conflicts occur. The response includes `created/updated/unchanged` counts plus any conflicts (mirrored in `ScheduleSyncResponse`).

### Verification checklist
1. Launch the API with `./scripts/start-taskr.sh --seed-demo --port 9080` and confirm the script frees the port if a previous uvicorn instance is still bound.
2. Start the UI via `pnpm --filter @dydact/taskr-ui dev --port 5175 --host 0.0.0.0` (any localhost port is permitted; CORS now accepts all dev ports via regex).
3. From a terminal, hit `curl -i -H 'x-tenant-id: demo' -H 'x-user-id: demo-user' http://localhost:9080/profile` and `curl -i -H 'x-tenant-id: demo' -H 'x-user-id: demo-user' http://localhost:9080/preferences` to verify the contract returns HTTP 200 with the seeded demo user + preferences payload.
4. In the UI, toggle density or favorites. The Network tab should show `PATCH /preferences` with a 200 response, followed by a refreshed `GET /preferences`; reloading the page preserves the changes.
5. Keep `pytest services/api/tests/test_profile_preferences.py` and the stub coverage (`test_claims_stub.py`, `test_hr_stub.py`, `test_scr_alerts.py`) green after schema changes; extend with new cases when wiring real services.

## Cross-service hygiene
- Update this matrix whenever a public surface is added or changed; ripple into corresponding runbooks (analytics, dedicated, scheduler) as needed.
- Reference tests that exercise the contracts (e.g. `services/api/tests/test_profile_preferences.py`) when adjusting schemas to maintain regression coverage.
- Coordinate with the unified auth roadmap before altering identity headers; the contract is shared across TaskR, Flow, DeptX, and Exo.
