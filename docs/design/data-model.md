# Data Model Overview

This document captures the initial relational schema for taskR through Milestone M1.1.

## Entities

| Table | Purpose |
| --- | --- |
| `tr_tenant` | Root container for all workspace data; stores name/slug/status plus optional `global_org_id` link to shared platform identity. |
| `tr_user` | Tenant-scoped users with email, roles, optional `global_user_id` + `identity_provider` metadata for cross-app accounts. |
| `tr_space` / `tr_folder` / `tr_list` | Hierarchical units (workspace spaces, grouping folders, task lists) modelled after Plane/ClickUp hierarchy. |
| `tr_list_status` | Configurable status pipelines per list (name, category, ordering, done flag). |
| `tr_task` | Core work items with status, priority, due date, and metadata. |
| `tr_custom_field` | Custom field definitions scoped to space/list (type, config, ordering). |
| `tr_task_custom_field` | Task-level custom field values stored as JSON payloads. |
| `tr_doc` | Wiki/document records linked to spaces/lists with metadata/tags. |
| `tr_doc_revision` | Versioned doc content (markdown/plain text) with authorship metadata. |
| `tr_subtask` | Lightweight checklist items attached to tasks. |
| `tr_comment` | Rich comments with mentions. |
| `tr_attachment` | File metadata for MinIO/S3 objects. |
| `tr_activity_event` | Audit trail of task updates and automation events. |
| `tr_worklog` | Time tracking entries (minutes spent). |
| `tr_task_dependency` | Directed edges between tasks (blocks, relates-to, etc.). |
| `tr_automation_rule` | Stored rules for automation/agents. |
| `tr_dashboard` | Persisted dashboard layouts per space (widget definitions + metadata). |
| `tr_space_usage_snapshot` | Daily per-space usage metrics (active alpha users, task throughput, automation usage). |
| `tr_preference_model` | Preference learner definitions tracking base model type, status, and metadata per tenant. |
| `tr_preference_variant` | Model variants with rollout rates, metrics, and lifecycle state. |
| `tr_preference_rollout` | Rollout controller snapshots including guardrail metrics and safety status. |
| `tr_preference_feedback` | Collected user/automation feedback signals feeding preference learners. |
| `tr_flow_template` | Stored TFrameX-compatible flow definitions with category, tags, and JSON payload. |
| `tr_flow_run` | Flow execution instances capturing context/result payloads and lifecycle timestamps. |
| `tr_autopm_suggestion` | AutoPM agent outputs referencing tasks, flow runs, and approval state. |
| `tr_sica_session` | SICA critique sessions for flows or suggestions. |
| `tr_sica_note` | Commentary within SICA sessions. |
| `tr_outbox_events` | Event outbox for eventual NATS publishing. |

## Relationships
- Most tables include `tenant_id` to enforce multi-tenant isolation.
- `tr_task` links to `tr_project`, `tr_user` (assignee/creator), and surfaces metadata for automation.
- `tr_activity_event` references tasks and actors but remains sparse for low overhead logging.
- `tr_dashboard` is scoped to (`tenant_id`, `space_id`, `slug`) and stores widget layout JSON consumed by the workspace dashboards.
- Preference tables (`tr_preference_*`) are tenant-scoped; `tr_preference_model` owns variants, rollouts, and feedback, enabling staged experimentation with guardrails and audit-friendly metadata.
- `tr_outbox_events` is write-only from the API; dispatcher services will poll and publish to NATS.

## Indexing Strategy
- Composite indexes on high-cardinality queries (`tenant_id` + foreign key).
- Outbox index on `(status, created_at)` for efficient polling.
- Additional indexes will be added as new query patterns emerge (e.g., status/date filtering).

## Next Steps
- Ship deptX salvage tables (`tr_deptx_*`) during Milestone M4.0.
- Decide on global identity source (Keycloak/central auth) and enforce uniqueness constraints once shared auth contract finalises.
- Extend analytics coverage (burnup/burndown, SLA metrics) once workflow agents land.
- Add soft-delete columns when retention requirements are defined.
- Introduce partitioning strategies once table growth patterns are observed.
