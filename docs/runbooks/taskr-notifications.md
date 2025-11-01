# TaskR Omni-Channel Notifications

This runbook explains how to configure and operate TaskR’s outbound
notifications for Slack, Discord, and SMS. The add-on converts existing TaskR
events (meeting notes, task updates, clearinghouse jobs) into real-time
messages delivered per tenant. It avoids altering core workflows by consuming
the same service-layer events already used for SSE.

> **Auth prerequisite:** Channel configuration requires the unified auth stack
> (API gateway headers + secrets policy). Do not enable this feature in
> production until unified auth is deployed for TaskR tenants.

## Overview

- Notification sources reuse TaskR events such as meeting note creation/
  regeneration, task status updates, and clearinghouse job lifecycle events.
- Each tenant can enable specific channels (Slack, Discord, SMS) and attach the
  events they care about.
- Channel delivery happens asynchronously via a lightweight queue and channel
  adapters. Failures are retried with backoff and recorded in logs.

## Configuration API

Endpoints (documented in the service endpoint reference):

```
GET  /tenant/config/notifications
PUT  /tenant/config/notifications
```

Both require standard TaskR auth headers (`Authorization`, `X-Tenant-Id`, optional
`X-User-Id`). The payload is a list of channel objects:

```jsonc
{
  "channels": [
    {
      "channel": "slack",
      "enabled": true,
      "events": ["meeting.note.created", "meeting.note.updated"],
      "config": {
        "webhook_url": "https://hooks.slack.com/services/TXXXXX/BXXXXX/XXXXXXXX",
        "username": "TaskR Bot",
        "icon": ":memo:"
      }
    },
    {
      "channel": "discord",
      "enabled": true,
      "events": ["task.updated"],
      "config": {
        "webhook_url": "https://discord.com/api/webhooks/XXXXX/XXXXX",
        "username": "TaskR"
      }
    },
    {
      "channel": "sms",
      "enabled": false,
      "events": ["task.due.reminder"],
      "config": {
        "provider": "twilio",
        "account_sid": "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        "auth_token": "••••••••••••••••",
        "from_number": "+15555555555",
        "recipients": ["+12223334444", "+12223335555"]
      }
    }
  ]
}
```

Secrets are masked in GET responses but retained in storage. Each channel must
declare supported event types.

### Event Type Reference

| Event Key                 | Trigger                                                         |
|---------------------------|-----------------------------------------------------------------|
| `meeting.note.created`    | `/meetings/notes` POST generates a new meeting note summary.    |
| `meeting.note.updated`    | `/meetings/notes/{id}/regenerate` recomputes a summary.         |
| `task.updated`            | Task status/field changes emitted via `/tasks`/`/lists/*`.      |
| `task.due.reminder`       | Scheduled reminders for overdue tasks (AutoPM).                 |
| `clearinghouse.job.*`     | Clearinghouse transport jobs (if enabled in tenant config).     |

Future event sources can be added by extending both the TaskR event emitter and
channel filter lists.

## Environment Variables

TaskR API additions (set in `.env` or infrastructure secrets):

| Variable                         | Description                                                                        |
|----------------------------------|------------------------------------------------------------------------------------|
| `TR_NOTIFICATION_QUEUE_SIZE`     | Max in-memory queue length for pending notifications (default 1000).              |
| `TR_NOTIFICATION_RETRY_LIMIT`    | Number of retry attempts per delivery (default 3).                                |
| `TR_NOTIFICATION_RETRY_DELAY`    | Base delay (seconds) before retrying; exponential backoff is applied.             |
| `TR_TWILIO_ACCOUNT_SID`          | Fallback Twilio credentials if not provided per tenant.                           |
| `TR_TWILIO_AUTH_TOKEN`           | (Sensitive) Twilio auth token fallback.                                            |
| `TR_TWILIO_FROM_NUMBER`          | Default SMS sender number; tenant config can override.                            |
| `TR_NOTIFICATION_LOG_FAILURES`   | When `true`, writes failed deliveries to audit table/log.                         |

Per-tenant secrets should reside in the notifications config payload; any
global defaults must be stored securely (e.g., Vault or encrypted env).

## Deployment Checklist

1. Apply the database migration creating `notification_channel` (and optional
   `notification_delivery` audit table).
2. Deploy TaskR API with notification service modules.
3. Ensure `.env` or secret manager contains the new environment variables (at
   minimum, queue sizes and Twilio defaults if SMS is required).
4. Restart the API (`./scripts/dev.sh up` or deployment pipeline).
5. Configure channels per tenant via `PUT /tenant/config/notifications`.
6. Verify delivery by creating a meeting note and observing Slack/Discord/SMS
   messages.

## Sample cURL Commands

```bash
# Configure Slack notifications for meeting notes
curl -X PUT http://127.0.0.1:8000/tenant/config/notifications \
  -H "Authorization: Bearer <token>" \
  -H "X-Tenant-Id: demo" \
  -H "Content-Type: application/json" \
  -d '{
    "channels": [
      {
        "channel": "slack",
        "enabled": true,
        "events": ["meeting.note.created", "meeting.note.updated"],
        "config": {
          "webhook_url": "https://hooks.slack.com/services/TXXXXX/BXXXXX/XXXXXXXX",
          "username": "TaskR Bot"
        }
      }
    ]
  }'
```

## Operations & Monitoring

- **Logging:** Notification dispatch logs include tenant id, channel, event, and
  outcome. Failures include HTTP response or Twilio error code.
- **Metrics:** Expose counters (e.g., `notification_sent_total{channel="slack"}`) and failure rates.
- **Retries:** Built-in exponential backoff up to `TR_NOTIFICATION_RETRY_LIMIT`. Persistent failures
  should be escalated to ops for credential or webhook validation.
- **Sensitive Data:** Mask webhook URLs, tokens, and numbers in logs/metrics. Use
  encrypted storage for config JSON fields when available.
- **Rate Limits:** Slack/Discord webhooks tolerate bursts; SMS providers may enforce rate limits.
  If hitting limits, tune queue size and delay or implement provider-side throttling.

## Troubleshooting

- **No notifications sent**: Check that `enabled=true` and events list include the triggered event.
  Verify the background worker is running (look for `NotificationService started` log).
- **Slack/Discord failure (4xx/5xx)**: Validate webhook URL and that the channel still exists.
- **SMS failure**: Confirm Twilio credentials and that the `from_number` is verified. Check Twilio's
  message logs for rejection reason.
- **Duplicate notifications**: Ensure upstream events aren’t firing twice. The NotificationService
  deduplicates by event id; if duplicates persist, inspect event emitter logic.

## Roadmap / Future Enhancements

- Tenant-admin UI for managing channel configs (post-API launch).
- Support for Microsoft Teams, email, or push notifications.
- User-specific subscriptions inherited from tenant defaults.
- Integration with centralized vault for secret rotation.
