# taskR ↔ scrAIv Integration Contract (HR/Time Modules)

## Purpose
Make taskR seamlessly consume scrAIv’s HR/time features (time clock, timesheets, payroll export) while preserving tenant isolation and unified UX.

## Tenancy & Auth
- Required headers on every call:
  - `x-tenant-id: <slug-or-uuid>`
  - `x-user-id: <uuid-or-internal>` (user performing the action)
  - Optional: `idempotency-key: <uuid>` for write calls
- Service-to-service auth:
  - In dev, allow header-only.
  - In prod, accept a short-lived JWT or mTLS; document the scheme in scrAIv.

## Identity Mapping
- Goal: map taskR `tr_user.user_id` ↔ scrAIv `user_id`.
- Recommended:
  - scrAIv exposes `GET /api/users` returning `{user_id, email}`.
  - taskR maintains a simple mapping table (proposed): `tr_external_identity(tenant_id, system, internal_user_id, external_user_id)`.
  - Seed mapping by email on first sync; persist and then prefer ids.

## API Surfaces (scrAIv → used by taskR)

### Time Clock
- `POST /api/timeclock/clock-in`
  - body: `{ session_id?: number, timestamp?: ISO, method?: 'device'|'manual', notes?: string }`
  - returns: `{ data: { clock_id, tenant_id, user_id, session_id, clock_in_ts, method, notes } }`
- `POST /api/timeclock/clock-out`
  - body: `{ timestamp?: ISO }`
  - returns: `{ data: { ...updated clock... } }`
- `GET /api/timeclock/open?user_id?`
  - returns: `{ data: Array<clock> }`
- `GET /api/timeclock/history?start=Y-m-d&end=Y-m-d&user_id?`
  - returns: `{ data: Array<clock> }`

### Timesheets
- `POST /api/timesheets/generate`
  - body: `{ start: 'Y-m-d', end: 'Y-m-d', user_id?: number, pay_code?: string }`
  - returns: `{ data: { generated, clock_ids: number[], skipped } }`
- `GET /api/timesheets?status?=&user_id?=`
  - returns: `{ data: Array<entry> }`
- `POST /api/timesheets/{entry_id}/approve`
  - returns: `{ data: { status: 'approved' } }`
- `POST /api/timesheets/{entry_id}/reject`
  - returns: `{ data: { status: 'rejected' } }`

### Payroll Export
- `POST /api/payroll/export`
  - body: `{ entry_ids: number[], target_system: string }`
  - returns: `{ data: { file_url?: string, records: number, status: 'ok' } }`

## Error Semantics
- 4xx with JSON `{ error: string, details?: any }` for client errors; 409 for double clock-in.
- 5xx with `{ error: string }` for server errors.

## taskR Integration (Work To Implement)
- Config
  - `TR_SCRAIV_BASE_URL`, `TR_SCRAIV_API_KEY` (optional in dev)
- Client: `services/api/src/app/integrations/scraiv.py`
  - Methods: `clock_in/out`, `open_clocks`, `clock_history`, `timesheets_generate/list/approve/reject`, `payroll_export`.
- Router: `services/api/src/app/routes/hr.py`
  - `POST /hr/timeclock/in|out`
  - `GET /hr/timeclock/open|history`
  - `POST /hr/timesheets/generate`, `GET /hr/timesheets`, `POST /hr/timesheets/{id}/approve|reject`
  - `POST /hr/payroll/export`
  - Proxies to scrAIv with tenant/user headers; returns normalized JSON.
- UI: `apps/web/src/views/HRView.tsx`
  - Tabs: Time Clock (in/out + open/history), Timesheets (period, review/approve), Payroll (export)
  - Calls taskR `/hr/*` routes; includes validation & empty states.

## Optional Webhooks/Events (phase 2)
- scrAIv emits events (HTTP or NATS) that taskR can listen to:
  - `timeclock.clocked_in`, `timeclock.clocked_out`, `timesheet.approved/rejected/exported`
- Shape: `{ type, tenant_id, user_id, payload, occurred_at }`

## Acceptance Criteria
- Round-trip clock in/out from taskR UI reflected in scrAIv, and back in taskR list views.
- Generate timesheets for a period; approve/reject flows usable.
- Export endpoint invoked and success state reflected.
- All calls scoped by `x-tenant-id` with correct user mapping.
