# ToolFront Integration Draft

This document tracks the assumptions and open questions while we stand up the event spine (Milestone M1.3).

## Planned Bindings
- `insight.llm` – primary LLM binding for knowledge assistant queries (Phase 3).
- `insight.search` – metadata/document retrieval once doc-ingest is salvaged.
- `computer_use` – reserved for Umbra/desktop automations (feature-gated by Polaris).
- `vocols.voice` – voice transcription/synthesis bridge for meeting capture workflows.
- `deptx.workflow.import` – bootstrap n8n templates sourced from `dydact/n8nworkflows`.
- `doc.ingest` – DocStrange-backed ingestion for wiki pages and knowledge assets.
- `doc.publish` – downstream event describing doc/revision updates for memPODS ingestion and AI surfaces.

All bindings are now described in the vendored manifest at
`toolfront-registry/providers.json`, exported from vNdydact. taskR and scrAIv
consume the manifest via the shared `toolfront_registry_client` package so they
no longer hard-code provider URLs or scopes.

## Event Topics (AsyncAPI Draft)
| Topic | Producer | Consumer | Purpose |
| --- | --- | --- | --- |
| `task.event.created` | API | ToolFront listeners, memPODS | Notify downstream services a task has been created. |
| `task.event.updated` | API | ToolFront, automations | Broadcast task status/assignment changes. |
| `meeting.ingested` | Future meeting service | Knowledge assistant | Persist meeting summaries and action items. |
| `automation.executed` | DeptX/Flow | Task timeline | Record automated actions for auditability. |
| `scr.linkage.v1` | TaskR | scrAIv | Task↔scrAIv linkage payloads (create/update/delete). |

## Authentication & Headers
- Pending confirmation from cross-platform auth alignment work.
- All ToolFront calls will reuse the shared tenant header (`X-TR-Tenant`) and a bearer token once available.

## TODOs
- [ ] Author full AsyncAPI spec once the unified event contract solidifies.
- [ ] Define ToolFront provider schemas for task creation, knowledge queries, and automation triggers.
- [ ] Incorporate Polaris policy checks before invoking high-risk bindings (remote LLM, computer use).
- [ ] Document how Vocols/Insight/deptX nodes map to ToolFront providers so taskR workflows can chain across services with consistent auth.
