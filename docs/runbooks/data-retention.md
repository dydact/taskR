# Data Retention Runbook

## Policies
- Policies are stored per tenant in `tr_retention_policy` and managed via `/admin/retention` (PUT upserts a policy for a resource).
- Supported resource types: `meeting_note`, `calendar_event`, `calendar_slot`, `preference_feedback`, `autopm_suggestion`, `sica_session`.

## CLI Job
- Run `make retention-job ARGS="--tenant tenant-slug"` from cron/Kubernetes to apply policies. The job derives defaults when no policy exists (e.g., meeting notes 365 days).
- Output lists deleted record counts per resource for auditing.

## Safety Controls
- Policies with `retention_days=0` remove records immediately; use with caution.
- The job only deletes records older than the retention window based on `updated_at`/`created_at` fields.

## Monitoring
- Emit metrics by wrapping the CLI with your preferred scheduler and capture stdout or convert to Prometheus counters.
- Combine with SICA sessions to investigate high deletion counts.

## Future Enhancements
- Integrate with Dydact central policy manager when available.
- Add soft-delete option if regulatory requirements demand reversible retention.
