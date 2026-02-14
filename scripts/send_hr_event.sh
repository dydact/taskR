#!/usr/bin/env bash
# Sends a sample HR webhook event to the local taskR API.

set -euo pipefail

BASE_URL="${TASKR_BASE_URL:-http://localhost:8010}"
TOKEN="${TR_SCR_ALERT_TOKEN:-${WEBHOOK_TOKEN:-dev-secret}}"
TENANT="${TENANT_ID:-demo}"
EVENT_TYPE="${1:-hr.clock.updated}"

payload=$(cat <<JSON
{
  "type": "${EVENT_TYPE}",
  "tenant_id": "${TENANT}",
  "user_id": "${TASKR_USER_ID:-smoke-user}",
  "clock": {
    "id": "clock-smoke",
    "user_id": "${TASKR_USER_ID:-smoke-user}",
    "status": "in",
    "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }
}
JSON
)

curl -fsS \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-webhook-token: ${TOKEN}" \
  -H "x-tenant-id: ${TENANT}" \
  --data "${payload}" \
  "${BASE_URL%/}/hr/events/webhook"

echo
