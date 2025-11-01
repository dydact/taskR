# Meeting Capture Runbook

## Ingestion
- Upload ICS or external events via `POST /calendar/events` after registering a source (`/calendar/sources`).
- Meeting notes stored with `POST /meetings/notes` and can reference a calendar event and optional task.
- Action items (array of dict) allow downstream automation to create tasks or autopm suggestions.

## Workflow
1. Event ingested (ICS or connector) and stored in `tr_calendar_event`.
2. Meeting facilitator submits notes with highlights/action items.
3. AutoPM agent or operators convert action items to tasks; SICA sessions track follow-up quality.
4. scrAIv bridge posts summaries to care-plan timelines and updates staffing/billing queues; openemr connector records billed encounters and HR flags.

## Monitoring
- Query `/meetings/notes?event_id=...` to check coverage.
- Calendar widget on dashboard uses `/preferences/models/{id}/summary` for guardrails but combine with `GET /calendar/events` to track throughput.
- scrAIv/openemr sync workers emit Prometheus counters (`taskr_scrAiv_sync_total`, `taskr_openemr_sync_total`) for reconciliation.

## TODO
- Integrate summarisation via Insight binding and automatically populate notes.
- Link action items to TaskR tasks once the UI editing pass ships.
- Auto-classify billing codes via Dydact AI and push real-time denials back to openemr.
