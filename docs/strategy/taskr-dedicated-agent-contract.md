# TaskR Dedicated Agent Contract

## Overview
- TaskR ingests dedicated agent reservations emitted by Exo/DeptX/Flow using the shared `common_agents.assignment` payload.
- Persisted rows live in `tr_assignment` and `tr_assignment_event` with SQLAlchemy models in `services/api/src/app/models/core.py`.
- The contract powers the xOxO panel under the new `dedicated` view in the TaskR UI and the `/dedicated/*` API surface.

## Shared Schema
- Source of truth: `packages/common_agents/src/common_agents/assignment.py`.
- Payload fields cover overlay identity, prompt turns, Polaris obligations, feature flags, tags, metadata, and context blocks.
- PostgreSQL JSON columns mirror the schema so downstream services can hydrate the model without lossy transforms.

## API Surface
| Method | Path | Description | Feature Flag |
| --- | --- | --- | --- |
| `GET` | `/dedicated/assignments` | List assignments with optional `status`, `agent_slug`, `node_id`, or `tag` filters. | `dedicated.agents` |
| `POST` | `/dedicated/assignments` | Upsert an assignment payload; idempotent on `assignment_id`. | `dedicated.agents` |
| `GET` | `/dedicated/assignments/{assignment_id}` | Fetch a single assignment record. | `dedicated.agents` |
| `GET` | `/dedicated/assignments/{assignment_id}/events` | Fetch the most recent AssignmentEvents (default 100). | `dedicated.agents` |
| `POST` | `/dedicated/events` | Record an `AssignmentEventPayload` and apply timeline side-effects. | `dedicated.agents` |
| `GET` | `/dedicated/assignments/stream` | Server-sent events feed for UI updates. Accepts `tenant` query param for browsers. | `dedicated.agents` (checked inline) |
| `POST` | `/dedicated/stubs/assignment` | Local-only helper that seeds a demo reservation for UI smoke tests. | `dedicated.agents` + `TR_ENV in {local, dev, development}` |

### SSE Envelope
```json
{
  "tenant_id": "uuid",
  "topic": "dedicated.assignments",
  "action": "assignment_upserted" | "assignment_event",
  "payload": { /* AssignmentRead or AssignmentEventRead */ }
}
```
- Subscriber clients must filter by `topic`.
- When events arrive, the UI updates the roster and, for matching assignments, augments the event timeline.
- Stream URL: `${BASE}/dedicated/assignments/stream?tenant=<slug>` (the TaskR UI builds this automatically from `env.taskrApiBase`).

### Audit Events
- Flow’s `plans/dedicated_reservation_audit.json` (`/plans/dedicated_reservation_audit/compile|run`) emits `AssignmentEventPayload` bodies with `event_type=assignment.audit` into `/dedicated/events`.
- TaskR persists the payload verbatim into `tr_assignment_event`, keeping audit entries alongside status changes until the UI surfaces them.
- memPODS receives the companion dossier logs (`reservation::<assignment_id>`); keep `FLOW_RESERVATION_AUDIT_INTERVAL_SECONDS` and `MEMPODS_URL` configured so the scheduler and dossier writes stay healthy.

## UI Integration
- The TaskR shell adds a `dedicated` view that renders the xOxO panel (`apps/taskr-ui/src/views/DedicatedView.tsx`).
- Hooks:
  - `useDedicatedAssignments` handles REST fetches + SSE fan-in.
  - `useDedicatedAssignmentEvents` keeps per-assignment timelines synchronized.
- Real-time state is surfaced via a “Live” badge; fallback refresh triggers re-fetch and event sync.

## Client SDK
- `@dydact/taskr-api-client` exposes helpers in `packages/api-client-ts/src/client.ts`:
  - `client.dedicated.list`, `get`, `listEvents`, `ingest`, `ingestEvent`, `seedStub`.
  - Types live in `packages/api-client-ts/src/types.ts` (`Assignment`, `AssignmentEvent`, `AssignmentListParams`, etc.).

## Stubs & Fixtures
- Local developers can call `POST /dedicated/stubs/assignment` (seed API) or use the TaskR UI “Seed Demo Assignment” button.
- Postman collection: `docs/postman/taskr-dedicated-agents.postman_collection.json` covers list/upsert/event/stub flows and the SSE endpoint when the feature flag is active.
- When upstream systems lag, the stub returns a reservation with overlay metadata, sample prompt turns, and demo Polaris obligations for UI smoke coverage.

## Operational Notes
- Feature enforcement relies on `dedicated.agents` (see `services/api/src/app/services/billing.py`).
- SSE uses the in-memory `event_bus`; production wiring to NATS remains via the SQL outbox -> NATS publisher already used by other modules.
- Notifications hook: on assignment event ingestion we emit a synthetic `assignment_upserted` to keep the roster fresh and enqueue Slack-ready alerts for status changes or node-detach events (`dedicated.assignment.status_changed`, `dedicated.assignment.node_detached`).

## TODO for Follow-up Agents
1. Wire Exo/DeptX/Flow emitters to POST the shared contract once services ship their side.
2. Capture channel feedback and tune dedicated notification templates (thresholds, formatting, routing) after pilot tenants exercise the bridge.
3. Backfill integration tests once upstream fixtures are available (current coverage focuses on API plumbing and SSE envelopes).
