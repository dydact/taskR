# Resilience Runbook

## Circuit Breakers
- `scripts/autopm_agent.py` wraps flow execution in a circuit breaker. After repeated failures (default 5) the agent stops processing templates until the recovery timeout (60s) elapses.
- Extend the same `CircuitBreaker` utility for external connectors once available.

## Load/Chaos Testing
- Use the `scheduler-agent` and `preference-guardrail` CLIs in conjunction with external tools (k6/locust). Recommended scenario: ramp to 100 req/s on `/calendar/freebusy` while monitoring guardrail events.
- Run `make preference-smoke` after resilience tuning to ensure guardrail pipeline still passes.

## Fallbacks
- Flow runs and AutoPM suggestions emit events that can trigger SICA sessions for manual remediation.
- Guardrail events (`preference.guardrail.updated`) should be wired into alerting (PagerDuty/Slack) to halt rollouts automatically.

## Recovery Drills
- Simulate database failover by running `make retention-job` and `make autopm-agent` against staging after toggling read replica roles.
- Document findings in SICA sessions to build longitudinal improvement dossiers.

## Next Steps
- Integrate connector-level circuit breakers once Google/Outlook sync ships from `platform/dydact`.
- Add Prometheus exporters for flow run latency and guardrail status to feed Grafana dashboards.
