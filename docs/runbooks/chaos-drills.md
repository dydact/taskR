# Chaos Drill Playbook

Use these drills to validate observability and incident response paths without impacting real customers.

## Guardrail Status Drill
1. Identify a rollout ID in staging (`GET /preferences/models/{slug}`).
2. Run:
   ```bash
   ./scripts/chaos_drill.py <ROLLOUT_ID> --status warning --negative-ratio 0.35 --total-feedback 40 \
     --api-url https://staging.taskr/api --tenant <TENANT_ID>
   ```
3. Verify:
   - PagerDuty/Slack alerts trigger.
   - Grafana guardrail dashboard reflects the warning state.
   - Event bus receives `preference.guardrail.updated` and `preference.rollout.autopilot` (if enabled).
4. Revert by calling the script with `--status healthy` once validation completes.

## Flow Run Latency Drill
1. Trigger a long-running flow manually (e.g. pause an automation worker).
2. Observe `taskr_flow_run_duration_seconds` histogram in Grafana; ensure alert rules notify after threshold.
3. Resume worker and confirm recovery.

## scrAIv Alert Drill
1. Use `scr/tools/publish_task_alert.php` or hit the scrAIv alert endpoint with `source=chaos`.
2. Confirm TaskR receives the alert (watch `/alerts/scr`, SSE stream, and Prometheus counters).
3. Acknowledge via `POST /integrations/alerts/scr/{alert_id}/ack` or the UI and ensure metrics/alerts resolve.

## Retention Job Drill
1. Configure a temporary retention policy with `retention_days=1` for a low-risk resource (`PUT /admin/retention`).
2. Run the retention job (cron or manual invocation) and confirm `taskr_retention_deletions_total` increases.
3. Restore the policy to normal values.

## Cleanup & Notes
- Chaos endpoints are gated behind authenticated admin APIs and leave breadcrumbs in rollout metadata under `chaos_drill`.
- Always document drills in the ops wiki with timestamps, participants, and findings.
- Reset any feature flags toggled during drills and ensure alerts return to green.
