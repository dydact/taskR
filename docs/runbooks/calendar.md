# Calendar Integration Runbook

## Sources
- Register calendar sources via `POST /calendar/sources` with `slug`, `type` (e.g., `ics`, `google`, `outlook`), and connector config.
- Update or disable sources with `PATCH /calendar/sources/{slug}`.

## Event Ingestion
- Ingest events using `POST /calendar/events` for parsed ICS payloads. Store external IDs for idempotency.
- All events tie back to `tr_calendar_source`, enabling per-source retention policies.

## Free/Busy
- `POST /calendar/freebusy` merges event windows with cached `tr_calendar_slot` entries created by connectors or manual reservation.
- Consumers can filter by owner IDs to produce participant-specific availability.

## Slot Management
- Store holds or confirmed bookings in `tr_calendar_slot`; status values (`free`, `busy`, `hold`) inform scheduling decisions.

## Runbooks & Tooling
- `make scheduler-agent` CLI lists upcoming free windows (see `docs/runbooks/scheduler.md`).
- Retention job purges stale events/slots per tenant policy (`make retention-job`).
- scrAIv connector polls workforce rosters and publishes availability deltas that land in `tr_calendar_slot`; openemr webhook ingests encounter bookings so provider load stays in sync.
- Billing/HR metadata from scrAIv/openemr is stored on calendar events (`billing_codes`, `compliance_flags`) for downstream reporting and AI guardrails.

## Cross-System Sync
- **scrAIv:** configure scheduling API credentials under `TR_SCRAIV_*` env vars; the sync worker reads staffing rosters, blocked time, and billing constraints, writing them into taskR slots each five minutes.
- **openemr:** register the practice management webhook endpoint in openemr to push appointment lifecycle events into taskR; responses include TaskR `slot_id` and billing code acknowledgements.
- **Dydact AI:** memPODS/Insight ingest calendar snapshots nightly so AI assistants can suggest staffing adjustments and highlight compliance/billing anomalies.

## TODO
- Wire to Google/Outlook connectors from `platform/dydact` once secrets/identity mapping complete.
- Add ICS export feed and webhook notifications for cross-product subscribers.
- Automate reconciliation dashboards comparing taskR vs scrAIv/openemr booking totals.
