# Preference Rollout Runbook

This runbook outlines how to operate the preference learning pipeline (collector → variantor → reranker) that drives adaptive agent behaviour.

## 1. Components
- **API surface:** `/preferences` endpoints manage models, variants, rollouts, and feedback.
- **Collector:** TaskR UI and integrations call `POST /preferences/feedback` with user signals (thumbs, notes). Feedback automatically updates variant metrics and rollout guardrails.
- **Variantor:** Configure variants via `POST /preferences/variants` and tune rollout rates to allocate traffic.
- **Reranker/guardrails:** `PreferenceRollout.guardrail_metrics` captures freshness, totals, and sentiment blended from feedback; use it to halt ramps when quality dips.

## 2. Bootstrap Steps
1. Create a model:
   ```bash
   curl -X POST "$TASKR_API/preferences/models" \
     -H "x-tenant-id: TENANT" -H "Content-Type: application/json" \
     -d '{"slug": "assistant-router", "name": "Assistant Router", "base_type": "reranker"}'
   ```
2. Add two variants (`control`, `treatment`) and set rollout rates.
3. For the web app, configure `VITE_PREFERENCE_MODEL_SLUG` in `.env` (defaults to `assistant-router`) so thumbs-up/down actions publish feedback against the intended model.
4. (Optional) When running guardrail checks from cron, set environment variables:
   - `PREFERENCE_GUARDRAIL_TENANT`
   - `PREFERENCE_GUARDRAIL_MODEL`
   - `PREFERENCE_GUARDRAIL_MIN_SIGNALS`
   - `PREFERENCE_GUARDRAIL_WARNING`
   - `PREFERENCE_GUARDRAIL_HALT`
5. Start a rollout targeting the treatment variant:
   ```bash
   curl -X POST "$TASKR_API/preferences/rollouts" ...
   ```
6. Monitor guardrail metrics via `GET /preferences/models/{slug}/summary`, the automation guardrail dashboard widget (cached for ~45s client-side), and Grafana dashboards (TODO: instrument gauge once metrics exporter lands).

## 3. Smoke Tests
- Run `make preference-smoke` after code changes; it executes targeted pytest covering metric aggregation.
- Use `make preference-guardrail ARGS="--warning 0.3 --halt 0.6"` to dry-run guardrail evaluation (intended for cron or CI). Ensure the local `.venv` is installed (`make install`) and Postgres is running (`docker compose up -d postgres`) so the script can read `tr_preference_*` tables.
- Expect `No guardrail changes...` when no active rollouts meet the threshold criteria; seed a rollout to observe status transitions during testing.
- Run `make preference-monitor ARGS="--interval 120 --pushgateway http://localhost:9091"` to keep guardrail evaluations looping; combine with `--exit-on-change` to fail CI when a rollout crosses safety thresholds.
- Ensure CI invokes `make test` so preference tests run alongside existing suites.

Guardrail Prometheus gauges are exposed at `/metrics` (FastAPI service) and can be pushed to a Pushgateway by providing `PREFERENCE_GUARDRAIL_PUSHGATEWAY`/`PREFERENCE_GUARDRAIL_PUSHJOB` or CLI flags when running the monitor.
- Alert webhooks: set `TR_GUARDRAIL_SLACK_WEBHOOK` (Slack incoming URL) and/or `TR_GUARDRAIL_PAGERDUTY_ROUTING_KEY` (+ optional `TR_GUARDRAIL_PAGERDUTY_COMPONENT`) before running the monitor or API service to emit notifications when a rollout shifts to `warning`/`halted` and to auto-resolve once it returns to `healthy`.

## 4. Safety Controls
- **Bounds:** API enforces rollout/target rates between 0 and 1; stages and safety statuses are validated against the allowed set.
- **Guardrails:** Feedback ingestion recalculates variant and rollout metrics immediately. Use these values to programmatically halt ramps when negative feedback spikes.
- **Audit trail:** Every create/update emits events (`preference.*`). Guardrail recalculations now raise `preference.guardrail.updated` when safety status changes so alerting systems can subscribe without polling.
- **Metrics:** `taskr_preference_guardrail_status` and companion gauges are emitted for each rollout so monitors can alert on warning/halt states without parsing API responses.
- **Notifications:** Slack + PagerDuty hooks (see environment variables above) receive succinct guardrail change events containing tenant/model metadata, rollout rates, and negative-feedback ratios.
- **Autopilot:** When `TR_ROLLOUT_AUTOPILOT_ENABLED=true`, guardrail evaluations that land in a `healthy` state automatically advance rollouts along the stage sequence (`draft → ramp → monitor → completed`) and emit `preference.rollout.autopilot` events with transition context for auditors.

## 5. Incident Response
- To halt a rollout, PATCH `/preferences/rollouts/{id}` with `{ "stage": "completed", "safety_status": "halted", "current_rate": 0 }`.
- Capture context by recording feedback entries with `source="operator"` and notes describing the failure.
- File a post-incident summary in the ops workspace wiki including guardrail readings and remediation.

## 6. TODO / Future Enhancements
- Wire automated safety monitor to push alerts into PagerDuty when guardrail metrics exceed thresholds.
- Expose aggregated metrics via Prometheus exporter for long-term trend analysis.
- Automatically attach memPODS insight summaries to rollout metadata once the summariser milestone lands.

## 7. TaskR UI Hotkeys
- In the list and board views, select a task (click or focus) and press `[` for negative feedback or `]` for positive feedback. The hotkeys reuse the same collector payload as the on-screen thumbs and respect the configured `VITE_PREFERENCE_MODEL_SLUG`.
- The dashboard guardrail widget now surfaces per-rollout Prometheus metrics (variant key, stage, status, rates, evaluation timestamp) alongside the global summary, enabling ops to triage escalations directly from TaskR.
