# Digest Pipeline Runbook

## Overview

The digest service assembles daily (or ad hoc) stand-up summaries per team/space. It relies on core task data and writes canonical copies to `tr_digest_history`, optionally reusing memPODS for retrieval. Use this document to operate and troubleshoot the pipeline.

## Data Model

`tr_digest_history` (see migration `0014_digest_history.sql`) stores each generated summary:

| Column | Notes |
|--------|-------|
| `digest_id` | Primary key. |
| `tenant_id` | Owning tenant (CASCADE deletes with tenant). |
| `team_id` | Optional logical team identifier if digests are grouped by team. |
| `period_start` / `period_end` | Inclusive window of the summary. |
| `summary_text` | Rendered human-readable digest. |
| `metadata_json` | JSON payload, currently includes task statistics (`stats.total`, `stats.completed`, etc.). |
| Timestamps | Standard `created_at` / `updated_at`. |

## Generation Flow

1. Scheduler (Flow or cron) calls `generate_digest()` in `app.services.digests`.
2. The service computes task statistics for the period (total, completed, backlog, overdue).
3. `summary_text` is composed from stats and persisted with metadata.
4. `taskr.digest.generated` event is published. Downstream can fan out to email/Slack once notifications team hooks in.

API access (internal): `POST /summaries/digest` accepts:
```json
{
  "team_id": "optional-uuid",
  "period_start": "2024-02-10T00:00:00Z",
  "period_end": "2024-02-11T00:00:00Z"
}
```
If dates are omitted, defaults to “previous 24 hours”.

## Configuration

No dedicated env vars; reuses standard database settings. Optional knobs (set in `.env` or infrastructure):
- `DIGEST_DEFAULT_PERIOD_DAYS` – if you wrap the service in your scheduler, use a single source of truth for the period.
- Tenants/teams can be scoped by providing `team_id` from the Flow context.

## Operations

### Manual Replay

Use the API to regenerate a digest for a given window:
```bash
curl -X POST "$API_URL/summaries/digest" \\
  -H "x-tenant-id: $TENANT" \\
  -H "Content-Type: application/json" \\
  -d '{"period_start":"2024-02-10T00:00:00Z","period_end":"2024-02-11T00:00:00Z"}'
```

### Inspections

- Verify stored rows:
  ```sql
  SELECT period_start, period_end, summary_text
  FROM tr_digest_history
  WHERE tenant_id = '...'
  ORDER BY created_at DESC
  LIMIT 5;
  ```
- Check recent events:
  ```bash
  stern taskr-api | rg "taskr.digest.generated"
  ```

### Common Issues

| Symptom | Action |
|---------|--------|
| Empty digest text | Ensure the tenant has tasks in the window; stats drive the summary text. |
| Overdue count seems off | Confirm tasks have `due_at` populated; the service ignores null due dates. |
| Duplicates | Deduplicate in scheduler; `generate_digest` does not enforce uniqueness per window. You can delete a row and re-run. |

## Testing

- Unit test: `services/api/tests/test_digests.py` (SQLite + `aiosqlite`) validates stats and API response.
- Trigger from Postman collection `TaskR Summaries` > `Create Digest`.

## Roadmap

- Hook digests into memPODS ingestion (optional field in `tr_digest_history.metadata_json`).
- Send digests via notifications once the multi-channel dispatcher is ready.

