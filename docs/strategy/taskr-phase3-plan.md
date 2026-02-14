# TaskR Phase 3 Execution Plan

This guide expands milestones M3.1–M3.6 with the concrete deliverables,
contracts, and validation steps required for handoff.

## M3.1 memPODS Ingestion Pipeline

### Data Model
- `tr_memory_queue` (UUID, tenant_id, resource_type, resource_id, payload, status,
  attempts, last_error, created_at, updated_at).
- `tr_memory_vector` (UUID, tenant_id, resource_type, resource_id, embedding, metadata,
  created_at, updated_at) stored only when local embedding enabled.

### Service Flow
1. CRUD mutations enqueue `MemoryJob` records (`enqueue_memory_job(resource_type, resource_id)`).
2. Background worker pulls `pending` jobs → fetches latest snapshot via serializers:
   - `tasks`: title, summary, status, tags, due dates, blockers.
   - `meetings`: transcript summary, action items, metadata.
   - `docs`: doc title, sections, linked tasks.
3. Serialize to memPODS dossier schema:
   ```json
   {
     "tenant_id": "...",
     "resource_type": "task",
     "resource_id": "uuid",
     "title": "...",
     "content": "Long-form description/snapshot",
     "tags": ["project:alpha", "priority:high"],
     "metadata": {
       "status": "in_progress",
       "assignee": "user@example.com"
     }
   }
   ```
4. POST to `MEMPODS_URL/api/v1/dossiers` with unified-auth token.
5. On success mark job `completed`; on failure increment attempts with exponential
   backoff (`1m, 5m, 15m, 60m`).

### AI/Embedding Strategy
- Default: rely on memPODS embeddings.
- Optional local embedding when `TR_EMBEDDING_PROVIDER=local` set: call
  `/embeddings` provider and store vector in `tr_memory_vector` for reuse.

### Testing & Tooling
- Unit test worker (mock memPODS API).
- Integration smoke: `pytest services/api/tests/test_mempods_ingestion.py` (TODO).
- Postman collection: `docs/postman/taskr-mempods.postman_collection.json`.
- Runbook: update `docs/runbooks/mempods.md` with procedure to monitor queue
  (`/admin/usage?metric=memories_enqueued`).

## M3.2 Knowledge Assistant API

### Endpoint Contract
- `POST /assistant/query`
  - Headers: `Authorization`, `X-Tenant-Id`, optional `X-User-Id`.
  - Body:
    ```json
    {
      "question": "What changed in Project X this week?",
      "context": {
        "project_id": "uuid",
        "filters": {"status": ["in_progress"]}
      },
      "mode": "summary | detail"
    }
    ```
  - Flow:
    1. Retrieve relevant dossiers from memPODS (`/api/v1/dossiers/search`).
    2. Compose RAG prompt using retrieval snippets + tenant guardrails.
    3. Call ToolFront `insight.llm` provider with `task_profile="reasoning"` when
       `mode=detail` else `general`.
    4. Persist answer + citations in `tr_chat_message` (role=`assistant`).
  - Response:
    ```json
    {
      "answer": "...",
      "sources": [
        {"resource_type": "task", "resource_id": "uuid", "snippet": "..."}
      ]
    }
    ```

### Guards & Features
- Rate limiting: 60 requests/min per tenant.
- Scopes: `knowledge.query` required.
- SSE hook: push `assistant.reply` events via `/events/stream` when enabled.

### Documentation
- Update `docs/strategy/taskr-phase3-plan.md` (this doc) and `docs/runbooks/assistant.md` (TODO).

## M3.3 Summaries & Stand-Up Generator

### Pipeline
1. Cron/Flow job triggers daily per team.
2. Collect task deltas (completed, overdue) + meeting notes via analytics endpoints.
3. Compose summary prompt; run through `insight.llm` with `task_profile="standup"`.
4. Persist to `tr_digest_history` and optionally memPODS.
5. Deliver:
   - In-app notification (new `digest.available` event).
   - Email/SMS/Slack (reuse notification service once unified auth live).

### Schema
- `tr_digest_history`:
  - `digest_id UUID`, `tenant_id`, `team_id`, `period_start`, `period_end`,
    `summary_text`, `metadata_json`, timestamps.

### Testing
- Unit tests for generator (mock Insight).
- Runbook update with manual trigger command (`make digests-run`).

## M3.4 Custom Fields & Workflow Configurations

### Schema
- `tr_custom_field` / `tr_task_custom_field` already defined. Work in this phase:
  - Support new field types (`formula`, `multi_relation`).
  - Add `tr_field_option` table for select/multi-select choices (id, field_id, label, value, color, position).

### API Enhancements
- `POST /custom-fields/{field_id}/options` CRUD for select options.
- Task payload returns `custom_fields` array with resolved values.
- Filtering: extend `/lists/{list_id}/tasks` with `custom_field_filters` param.

### UI
- List view column picker includes custom fields.
- Board cards show highlights (select values, numeric badges).

## M3.5 Docs & Knowledge Hub

### Components
- Backend: `tr_doc`, `tr_doc_revision`, ingestion worker hooking DocStrange.
- API:
  - `POST /docs` create (title, content JSON, linked task IDs).
  - `POST /docs/{id}/revise` new revision; maintain pointer to current revision.
  - `GET /docs/{id}` returns current revision + metadata.
- UI: integrate editor (TipTap) with AI commands (`/docs/{id}/ai/summarize`).
- memPODS: ingest doc revisions similar to tasks.

## M3.6 Dashboards & Reporting

### Backend
- Analytics endpoints:
  - `GET /analytics/spaces/{space_id}/status-summary`
  - `GET /analytics/spaces/{space_id}/velocity`
  - `GET /analytics/spaces/{space_id}/throughput`
  - `GET /analytics/spaces/{space_id}/overdue`
- Each endpoint returns chart-ready JSON (`labels`, `series`).

### UI
- Dashboard builder: drag+drop grid, widget config modals, per-user layout stored in `tr_dashboard_layout`.
- Widgets: status donut, workload bar, velocity trend, throughput histogram, burn-down, cycle efficiency.

### Ops
- Update `docs/runbooks/analytics.md` with instructions to refresh dashboards and debug queries.

---

## Deliverable Checklist (Phase 3)

| Item | Owner | Status |
|------|-------|--------|
| memPODS queue migration (`0012_mempods_queue.sql`) | Backend | ✅ |
| memPODS worker service + tests | Backend | ✅ |
| Assistant API + retrieval pipeline | Backend | ✅ |
| Digest history schema + Flow job | Backend | ✅ |
| Custom field option API + UI updates | Backend/UI | ✅ |
| Docs API + editor integration | Backend/UI | ✅ |
| Analytics endpoints + dashboard builder | Backend/UI | ✅ |
| Postman collections (bridge ✅, memPODS ✅) | Docs | ✅ |
| Runbooks (memPODS, assistant, digests, analytics) | Ops | ✅ |
