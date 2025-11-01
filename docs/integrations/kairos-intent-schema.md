# Kairos Intent Schema (Draft)

Status: Draft -- pending vendor handshake and vNdydact delivery.

## Purpose
- Structure intent hand-offs between Kairos chat surfaces and TaskR automation.
- Capture user utterance context plus TaskR routing hints without coupling to UI transport.

## Envelope
```json
{
  "intent_id": "uuid",
  "tenant_id": "uuid",
  "source": "kairos",
  "captured_at": "2024-11-05T17:21:13Z",
  "locale": "en-US",
  "surface": {
    "channel": "web_chat",
    "session_id": "string",
    "user_id": "uuid"
  }
}
```

## Payload Draft
```json
{
  "utterance": "Schedule a follow-up with the Ops team next Tuesday",
  "entities": {
    "participants": ["Ops team"],
    "datetime": "2024-11-12T15:00:00Z"
  },
  "confidence": 0.74,
  "actions": [
    {
      "type": "schedule_meeting",
      "priority": "high",
      "metadata": {
        "duration_minutes": 30,
        "location": "virtual"
      }
    }
  ],
  "handoff": {
    "requires_confirmation": true,
    "context_window": ["previous_message_id"]
  }
}
```

## Open Questions
- Confirm Kairos session identifiers and authentication claims.
- Validate entity taxonomy (participants vs. contacts vs. teams).
- Align action catalog with AutopM workflow expectations.

> TODO: Replace payload draft once Kairos publishes definitive schema.
