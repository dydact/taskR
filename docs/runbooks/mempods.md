# memPODS Ingestion Queue Runbook

## Overview

TaskR republishes task, meeting note, and doc snapshots to the memPODS dossier
API so downstream knowledge assistants can retrieve unified context. The API
service ships with an in-process worker (`MemoryQueueService`) that polls the
`tr_memory_queue` table and delivers dossiers to `POST /api/v1/dossiers`.

## Configuration

- `TR_MEMPODS_URL` – Base URL for the memPODS cluster (required for delivery).
- `TR_MEMPODS_API_TOKEN` – Unified auth bearer token for dossier writes.
- `TR_EMBEDDING_PROVIDER` – Optional; set to `local` to call a sidecar
  embeddings service at `TR_LOCAL_EMBEDDING_BASE_URL`.
- `TR_LOCAL_EMBEDDING_BASE_URL` – Base URL for local embeddings (only read when
  `TR_EMBEDDING_PROVIDER=local`).
- `TR_LOCAL_EMBEDDING_MODEL` – Identifier passed to `/embeddings`.

All configuration lives alongside the existing `TR_` prefixed variables; restart
the API container to apply changes.

## Monitoring

- API: `GET /admin/usage?metric=memories_enqueued` returns the current queue
  depth and processed counts per tenant.
- Database: run
  ```sql
  select status, count(*) from tr_memory_queue group by status;
  ```
  to confirm jobs are draining (`pending` should remain near zero).
- Logs: grep for `MemoryQueueService` messages in the API service to confirm the
  worker is running.

## Retry Semantics

Jobs follow an exponential backoff (`60s, 5m, 15m, 60m`) before being marked
`failed`. Once configuration is restored, requeue stuck items with:

```sql
update tr_memory_queue
set status = 'pending', attempts = 0, available_at = now()
where status = 'failed';
```

## Manual Replays

To force a re-ingest for a specific resource, delete the corresponding queue row
and re-enqueue via the API:

```sql
delete from tr_memory_queue
where tenant_id = '<tenant>'::uuid and resource_type = 'task' and resource_id = '<task>'::uuid;
```

Then trigger the standard API mutation (e.g., PATCH the task) so the worker
captures a fresh snapshot.
