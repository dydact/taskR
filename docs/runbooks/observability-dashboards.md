# Observability Dashboards & Alerts

This guide captures the metrics exposed by TaskR and how to visualise them in Grafana.

## Prometheus Metrics
- `taskr_flow_run_transitions_total{tenant_id,status}` – counter per flow-run status transition.
- `taskr_flow_run_duration_seconds_bucket` / `_sum` / `_count` – histogram tracking completed flow run durations.
- `taskr_preference_guardrail_status{tenant_id,model_slug,rollout_id,variant_key}` – latest safety state (-1 pending, 0 healthy, 1 warning, 2 halted).
- `taskr_preference_guardrail_negative_ratio{...}` – latest negative feedback ratio.
- `taskr_retention_deletions_total{tenant_id,resource_type}` – retention deletions per resource.
- `taskr_preference_guardrail_evaluations_total{result}` – guardrail evaluation change vs unchanged counts.
- `taskr_scr_alert_ingest_total{tenant_id,severity,kind}` – scrAIv alerts ingested.
- `taskr_scr_alert_ack_total{tenant_id,kind}` – alerts acknowledged.

## Suggested Grafana Panels
1. **Flow Run Throughput (Stat + Time Series)**
   - Query: `sum(rate(taskr_flow_run_transitions_total{status="completed"}[5m])) by (tenant_id)`
   - Alert when drop >50% compared to baseline.
2. **Flow Run Duration Percentiles (Histogram/Heatmap)**
   - Graph `histogram_quantile(0.95, sum(rate(taskr_flow_run_duration_seconds_bucket[15m])) by (le))`
   - Alert when p95 exceeds 15 minutes.
3. **Guardrail Status Table**
   - Table per rollout: map `taskr_preference_guardrail_status` values to text with `value mappings` in Grafana.
   - Add sparklines for `taskr_preference_guardrail_negative_ratio`.
4. **Retention Deletions (Bar Chart)**
   - `increase(taskr_retention_deletions_total[24h]) by (resource_type)` – ensures jobs execute.

## Alert Rules
- **Guardrail Halted**: trigger when `taskr_preference_guardrail_status == 2` for >5 minutes; route to PagerDuty.
- **Approval Queue Backlog**: (future) pair with queue metrics once available.
- **Retention Job Skipped**: alert if `increase(taskr_retention_deletions_total[48h]) == 0` for critical resources.

## Datasource Notes
- The API exposes `/metrics`; in Kubernetes, the service scrape endpoint should be `http://taskr-api:8000/metrics`.
- Use Grafana folders `TaskR / Automation` for flow metrics and `TaskR / Guardrails` for safety dashboards.
- Record dashboard JSON exports in `docs/runbooks/dashboards/` when promoting to production.

## Alert Routing
- PagerDuty routing keys: `TR_GUARDRAIL_PAGERDUTY_ROUTING_KEY`, component `TR_GUARDRAIL_PAGERDUTY_COMPONENT`.
- Slack webhook: `TR_GUARDRAIL_SLACK_WEBHOOK` receives textual updates from API and alert rules.

## Next Steps
- Add queue metrics for approvals in future milestone.
- Mirror dashboard definitions to scrAIv once its ToolFront integration lands.
