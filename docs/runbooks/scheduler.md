# Smart Scheduler Runbook

## Free/Busy
- Use `/calendar/freebusy` with `FreeBusyRequest` payload (owner IDs optional) to compute availability. The API merges calendar events and cached slots (`tr_calendar_slot`).
- Slots can be pre-populated by connectors (Google/Outlook) or manually via `/calendar` routes (future connectors TBD).
- scrAIv staffing bridge writes shift assignments and PTO holds into slots nightly; openemr feed contributes clinic bookings and billing locks.

## CLI Probe
- Run `make scheduler-agent ARGS="--owner <uuid> --horizon 48"` to print upcoming free windows for an owner.

## Booking Flow (M5.2 foundation)
1. Query free/busy for participants.
2. Select candidate windows and create a proposed slot.
3. Emit invitations via connectors (placeholder; to be implemented when connectors land).
4. Push confirmed bookings to scrAIv scheduling service and openemr encounters; record ACKs for reconciliation.

## Monitoring
- `tr_calendar_slot.status` tracks `free`, `busy`, or `hold`. Use analytics dashboard or Prometheus gauges (todo) to monitor slot usage.
- Combine with `preference.guardrail.updated` events to evaluate scheduler quality once connectors are live.
- Monitor `taskr_scheduler_sync_latency_seconds` (todo) to ensure cross-product updates stay under SLA.

## Next Steps
- Integrate connector polling (Google/Outlook) and event creation with Dydact identity once available from `platform/vNdydact`.
- Automate HR policy checks with Dydact AI (memPODS, Insight) before finalizing bookings and raise PagerDuty if staffing thresholds breached.
