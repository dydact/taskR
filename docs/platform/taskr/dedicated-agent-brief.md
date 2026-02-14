# Dedicated Agent & xOxO Coordination Brief

Date: 2025-10-31  
Prepared for: Next implementation agent  

## Endpoint Audit
- **Exo** (FastAPI) continues to expose:
  - `/health`, `/mesh/summary`, `/nodes/register`, `/enroll`, `/jobs/lease`
  - References: `dydact/services/exo/main.py` (lines 1592, 1597, 1602, 1630, 1812)
- **DeptX** advertises orchestration routes:
  - `/workflows/*`, `/compass/reviews`, Exo status hook
  - References: `dydact/services/deptx/main.py` (lines 192, 197, 233, 303)
- **Flow** API surface:
  - `/health`, `/config`, `/plans/{id}/compile`, `/plans/{id}/run`
  - References: `dydact/services/flow/main.py` (lines 184, 189, 258, 386)
- Service matrix documenting these contracts remains current: `dydact/docs/runbooks/service_endpoints.md` (Flow, DeptX, Exo rows at lines 20‑32).

## Planning & Gap Tracking
- Blueprint finalized: `docs/plans/exo_dedicated_agents_and_xoxo_panel.md` (full plan starting at #1, implementation task breakdown near line 82).
- Gap log tracking schema/API deltas: `docs/reports/exo_dedicated_agent_gaps.md`.
- Contract alignment confirmed; no discrepancies between implementation plan and current code/docs.
- TaskR server + UI bridge landed (
  `/dedicated/*` endpoints, SSE stream, and `dedicated` view). See `docs/strategy/taskr-dedicated-agent-contract.md` for full contract and stubs.

## Next Actions (pending TaskR UI details)
1. Shared assignment schema (`packages/common_agents`) updated with overlay identity, prompt revisions, and Polaris obligations; next step is wiring Exo endpoints/events to emit the contract.
2. Move DeptX onto persistent storage (`tr_deptx_*` tables) and expose reservation proxies for TaskR UI consumption.
3. Update Flow to request/reuse dedicated assignments prior to plan execution and respect Polaris constraints.
4. Build the xOxO panel (roster, detail drawer, node health, timeline) leveraging new APIs + Control Center patterns.

## Current Implementation Snapshot
- TaskR API now enforces tenant-scoped ingestion for assignments and events, broadcasting both SSE envelopes (`assignment_event`, `assignment_upserted`) on every mutation.
- A NATS consumer normalises `exo.agent.*` events into the rich `AssignmentPayload`, persists them through the `/dedicated/*` services, and re-broadcasts snapshots so the xOxO panel stays in sync with Exo in real time.
- Flow’s `dedicated_reservation_audit` plan POSTs `AssignmentEventPayload` bodies with `event_type=assignment.audit` to TaskR `/dedicated/events`; TaskR durably stores them alongside status changes while memPODS tracks dossiers (`reservation::<assignment_id>`). Keep `FLOW_RESERVATION_AUDIT_INTERVAL_SECONDS` and `MEMPODS_URL` configured so audits continue to run and log.
- `packages/common_agents` publishes the full dedicated-agent contract (capabilities, policy, prompt profile, overlay, Polaris obligations) for Exo/DeptX/Flow alignment.
- The TaskR web client surfaces a feature-flagged xOxO panel (`ViewMode.xoxo`) with live SSE updates, assignment filtering, timeline view, and stub seeding for local workflows.
- The TypeScript client exposes `/dedicated/*` convenience helpers (list/get/ingest/events/stub) so xOxO and future ToolFront panels can reuse the same primitives.

The team is staged to begin execution as soon as the TaskR agent confirms remaining UI specifics. Until then, the above plan and gap tracker serve as the coordination source of truth.
