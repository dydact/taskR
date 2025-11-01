# Scheduling Negotiation Stub

TaskR exposes a lightweight negotiation log so we can capture scheduling attempts ahead of live email/chat connectors.

## Endpoints
- `POST /scheduling/negotiations` – create a negotiation record. Accepts subject, channel type, participants, optional `initial_message` payload.
- `GET /scheduling/negotiations` – list negotiations for the current tenant.
- `GET /scheduling/negotiations/{negotiation_id}` – retrieve a single negotiation record.
- `POST /scheduling/negotiations/{negotiation_id}/messages` – append a message/event to the negotiation thread. The payload tracks author, channel, body, optional metadata, and can update the negotiation status.

## Message Schema
```json
{
  "author": "TaskR",
  "channel": "email",
  "body": "Checking availability for next Tuesday",
  "metadata": {"attempt": 1},
  "status": "pending"
}
```

Messages are stored chronologically with server-generated `recorded_at` timestamps. `last_message_at` updates as new entries arrive.

## Notes
- This stub only logs structured events – no outbound email/chat is sent.
- Use the upcoming ToolFront registry integration for real connector calls once available.
- Future deliverables will extend the schema to track scheduling outcomes and calendar bookings.
