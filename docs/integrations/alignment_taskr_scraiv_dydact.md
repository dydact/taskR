# Alignment: taskR ↔ scrAIv ↔ Dydact (Insight)

This repository implements the integration points to align taskR with scrAIv and Dydact Insight.

Canonical references (source of truth live in dydact):
- dydact/docs/integrations/alignment_taskr_scraiv_dydact.md
- dydact/docs/integrations/insight_summaries_contract.md

Key surfaces wired in taskR:
- Dydact Insight
  - Chat SSE proxy in app or direct via `VITE_INSIGHT_API`: `POST /openai/v1/chat/completions`
  - Summaries: `POST /summaries/meetings`, `POST /summaries/autopm`
  - Info SSE (aligned): `GET /events/stream` (tenant-scoped)
- scrAIv (consumed by taskR)
  - `/hr/*` proxy routes with tenancy headers; requires `TR_SCRAIV_BASE_URL` (and optional `TR_SCRAIV_API_KEY`).
  - Endpoints: timeclock in/out, open/history; timesheets list/generate/approve/reject/submit; payroll get/export; users mapping.
  - Webhook ingestion (optional): `POST /hr/events/webhook` with `x-webhook-token=TR_SCR_ALERT_TOKEN` → rebroadcasts SSE for live indicators.
  - `/hr/users` responses are cached in-process (TTL ~300s) with `?refresh=1` to bypass when needed.
- Tenant admins can configure clearinghouse transport (Claim.MD/SFTP/filedrop) via the TaskR UI; settings persist to `tr_tenant_config` and drive submissions instead of env defaults.
- Every update emits `tenant.config.clearinghouse.v1` on the TaskR event bus with a sanitized payload (secrets masked) so downstream workers can refresh connection state.
- Ack ingestion: the new worker (`php scr/tools/run_claim_ack_worker.php --inbox …`) accepts either JSON payloads or raw X12 999/277/835 files, looks up the matching transmission by ISA13/GS06, and records `scr_claim_ack`/`scr_claim_reject` plus `claim.*` timeline events. When calling `POST /scr/api/claims/transport/submit`, include `control: { isa13, gs06, st02 }` so the controls are persisted for lookup.

Front-end
- Chat (Dydact Chat) streams using SSE. If `VITE_INSIGHT_API` is set, calls Insight directly; otherwise uses taskR `/chat/completions` proxy.
- Chat overlay uses the shared `ControlCenterChat` component when available; otherwise falls back to the `/dydact?mode=container` iframe. Configure via `VITE_DYDACT_*` env vars.
- HR view (`6` key) offers controls and formatted tables for Time Clock, Timesheets, Payroll, and Summaries.

Data contracts (compact)
- Meeting summary: `{ summary: string, action_items: {text, owner?, due?}[], risks?: string[], timeline?: {when, note}[] }`
- AutoPM: `{ summary: string, blockers?: string[], next_actions: {text, owner?, due?}[], owners?: {id?, name}[] }`
- Time clock item: `{ id, user_id, status, started_at, ended_at?, duration_sec? }`
- Timesheet: `{ id, user_id, period: {start, end}, status, approved_ts?, lines: {date, pay_code, hours, approved_ts?}[] }`
- Payroll: `{ period: {start, end}, totals: {user_id, regular, overtime, paid, pending_count}[] }`
- Identity map: `{ id, email, first_name, last_name, display_name, status, roles, created_ts }`

Next steps (tracked)
- Promote `@dydact/control-center` to all environments (set `VITE_DYDACT_CONTROL_CENTER_MODULE=@dydact/control-center`) and deprecate the iframe fallback once validated.
- Wire scrAIv `/summaries/*` proxy to forward tenancy headers and bubble Insight errors so taskR can surface retries.
- Hook the HR upload UI to Insight `/doc/ingest`; persist the returned `document_id` and session metadata for follow-up searches and summaries.
