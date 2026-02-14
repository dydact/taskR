# Dedicated Agent Bridge – Verification Plan

Use this checklist when promoting the xOxO bridge across environments or when handing the work off to the next delivery milestone.

## 1. Pre-flight
- Ensure migrations `0012_dedicated_assignments.sql` are applied.
- Toggle `dedicated.agents` feature flag for the tenant under test (see `/admin/features` or `make feature-enable FEATURE=dedicated.agents`).
- Seed baseline data via:
  ```bash
  python scripts/seed_dedicated.py --base-url http://127.0.0.1:8000 --tenant demo --token dev-token
  ```
- Start a tail on the SSE stream:
  ```bash
  curl -H "Accept: text/event-stream" "http://127.0.0.1:8000/dedicated/assignments/stream?tenant=demo"
  ```

## 2. API Contract
| Scenario | Request | Expected Result |
| --- | --- | --- |
| Upsert assignment (idempotent) | `POST /dedicated/assignments` (fixtures) | `202 Accepted` with assignment payload; second call returns identical payload, no duplicates in DB. |
| Event ingestion | `POST /dedicated/events` | `202 Accepted`; SSE stream emits `assignment_event` and `assignment_upserted`. |
| List assignments | `GET /dedicated/assignments` | Includes seeded assignment; filters (`status`, `agent_slug`, `tag`) narrow results. |
| List events | `GET /dedicated/assignments/{id}/events` | Returns recent events, ordered by `occurred_at`. |
| Stream auth guard | Remove feature flag or disable tenant | `GET /dedicated/assignments/stream` returns `403 feature_disabled`. |

## 3. UI Validation
1. Log into TaskR UI → select the `xOxO` view.
2. Confirm roster entry shows status badges, overlay label, feature flags.
3. Open detail drawer → prompt history, obligations, capabilities render using JSON-backed layout.
4. Trigger `assignment.status_changed` to `failed` via Postman or script (use `--event docs/fixtures/dedicated/assignment-event.sample.json` after editing `payload.status`).
5. Observe immediate update in the timeline and highlight in the roster.

## 4. Notifications
| Trigger | Expected Channel Output |
| --- | --- |
| `assignment.status_changed` → `failed` | Slack message in pilot channel with agent slug + status. |
| `assignment.node_detached` | Slack message noting node + reason. |

If no Slack notification arrives, check:
1. Tenant notification settings (`/admin/notifications` or database table `tr_notification_channel`).
2. `services/api` logs for warnings from `NotificationService`.

## 5. Integration Hooks (Upstream Teams)
| Service | Action | Owner |
| --- | --- | --- |
| Exo | Emit reservation on schedule create/update; send `assignment.status_changed` when scheduler flips states. | @exo-owners |
| DeptX | Forward workflow state transitions as events (`node_attached`, `node_detached`). | @deptx-automation |
| Flow | Append prompt turns (`assignment.prompt_appended`) and mark completion. | @flow-control |

Provide them the contract fixtures (`docs/fixtures/dedicated`) and the Postman collection (`docs/postman/taskr-dedicated-agents.postman_collection.json`).

## 6. Follow-up Work Items
1. Add synthetic integration test once upstream exposes staging payloads (TaskR receives → SSE update visible).
2. Tune notification templates/severity after pilot feedback (guard against noise for transient failures).
3. Wire PagerDuty routing when Polaris defines the escalation policy for dedicated-agent outages.

Keep this document updated as we add telemetry dashboards or additional contract fields.
