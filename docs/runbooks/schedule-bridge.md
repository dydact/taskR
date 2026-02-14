# Schedule Timeline Bridge Runbook

This guide explains how to operate the feature-flagged schedule → worklog → billing
bridge that TaskR exposes for scrAIv and other downstream systems.

## Prerequisites

1. Apply migrations through `0011_schedule_timeline.sql`.
2. Start the API with `TR_BRIDGE_SCHEDULE_ENABLED=true`.
3. Ensure the tenant subscription includes the `schedule.bridge` feature
   (Growth and Enterprise plans enable it by default).

Enable (or disable) the feature for a tenant programmatically:

```bash
curl -X PUT "$TASKR_API/admin/subscription/features" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"feature_code": "schedule.bridge", "application": "taskr", "enabled": true}'
```

## Validating the Bridge Endpoints

For local and development environments, use the helper script:

```bash
python scripts/staging/validate_bridge.py \
  --tenant $TENANT_ID \
  --token "$TOKEN" \
  --base-url http://localhost:9076 \
  --seed \
  --preview \
  --export
```

The script will:

- Enable the `schedule.bridge` feature for the tenant.
- Seed a demo timeline row via `POST /bridge/stubs/timeline` (local/dev only).
- Call `/bridge/schedule`, `/bridge/billing/preview`, and optionally
  `/bridge/billing/export`.

In higher environments without the stub endpoint, seed data through the normal
schedule pipeline before running the validation steps.

## Operational Notes

- The bridge API returns HTTP 503 when the service-level flag is disabled and
  HTTP 403 when the tenant feature is not granted.
- All `/bridge/*` requests require standard TaskR auth headers
  (`Authorization`, `x-tenant-id`).
- Updates trigger normal audit logging and can fan out events to downstream
  processors when the scrAIv bridge is enabled.

Refer to `docs/strategy/taskr-schedule-bridge-contract.md` for the full data
contract and state transitions.
