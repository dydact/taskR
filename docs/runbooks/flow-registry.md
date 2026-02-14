# Flow Registry Runbook

The flow registry provides lightweight orchestration metadata for TFrameX-compatible plans.

## CRUD
- Templates live under `/flows/templates` (CRUD). Definition JSON must include `nodes` and optionally `edges`; validation ensures acyclic graphs.
- Flow runs are created via `POST /flows/templates/{slug}/run` or directly `POST /flows/templates` followed by `/run`. Each run records context and result payloads.

## Categories
- Use `category` to group templates. The AutoPM agent (`make autopm-agent ARGS="--category auto_pm"`) executes all active templates in the `auto_pm` category.

## AutoPM Suggestions
- `POST /flows/runs/{id}/autopm` generates suggestions for overdue tasks. Suggestions are stored in `tr_autopm_suggestion` and an event `autopm.suggestion.created` is emitted.
- The CLI agent can be scheduled via cron/Kubernetes job; it leverages direct database access through `get_session`.

## Monitoring
- Flow events are emitted via the shared event bus; subscribe to `/events/stream` with type filters `flow.*` or `autopm.*` for live updates.
- Run status transitions (`pending` → `running` → `completed`) are tracked in `tr_flow_run`. Use the `/flows/runs` endpoint for audit queries.

## Failure Recovery
- Validation errors surface as HTTP 400 responses; template updates preserve version numbers so clients can compare revisions.
- AutoPM suggestions can be resolved by PATCHing `status` to `resolved` with a `resolved_at` timestamp.

## Next Steps
- Integrate flow run metrics with the observability pipeline (Prometheus) and extend node budgeting once TFrameX adapters ship from dydact.
