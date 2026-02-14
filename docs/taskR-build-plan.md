# taskRte  Delivery Plan

## Mission & Guardrails
- Build taskR as the intelligent, multi-tenant task & project manager for the Dydact platform, sharing engine primitives with scrAIv while targeting general productivity use-cases.
- Reuse memPODS for long-term knowledge, TFrameX for multi-agent flows, and SICA for iterative self-critique; enhance only when gaps appear.
- Adopt the engineering conventions established in `platform/vNdydact` (namespacing, event-first architecture, ToolFront integrations, lower-case identifiers).
- Enforce tenant isolation, auditability, and policy-driven feature toggles to support regulated deployments from day one.
- Document every milestone deliverable in `/docs` and pair code with smoke/integration tests before promotion.

## Roadmap Overview
| Phase | Target Window | Focus | Exit Criteria |
| --- | --- | --- | --- |
| 0 – Foundation | Week 0-1 | Repo scaffolding, tooling, governance | CI+lint baseline, contributor docs, empty service skeletons |
| 1 – Domain Spine | Weeks 1-3 | Data model, tenancy, RBAC, event core | Migrations + seed scripts, auth middleware, audit/event tables |
| 2 – Core Workspace | Weeks 3-6 | CRUD APIs, UI shell, notifications | Task+project CRUD, comments/files MVP, smoke tests |
| 3 – Knowledge Layer | Weeks 6-9 | memPODS indexing, AI Q&A, summaries | Retrieval service online, assistant endpoints, daily digest pipelines |
| 4 – Automation Agents | Weeks 9-12 | TFrameX flows, autonomous PM actions | Flow registry, SLA monitors, auto-update agents with SICA loop |
| 5 – Meetings & Scheduling | Weeks 12-15 | Transcription pipelines, smart scheduling, cross-app hooks | Meeting ingestion, scheduling agent, calendar connectors |
| 6 – Hardening & Launch | Weeks 15-18 | Compliance, scale, launch ops | SOC2-ready controls, load test signoff, runbook + launch checklist |

## Phase Details & Milestones

### Phase 0 – Foundation & Governance
#### Milestone M0.1 – Scaffold the repository (Week 0)
- **Scope:** Establish directory structure, initial services, and shared packages mirroring `vNdydact` patterns.
- **Tasks:**
  - Create `apps/web`, `services/api`, `services/automation`, `packages/common`, `docs/` with README stubs.
  - Add `pyproject.toml`/package.json templates, lint scripts, formatting configs (ruff, eslint, prettier).
  - Introduce Makefile targets (`make lint`, `make test`, `make up`) referencing docker compose skeleton.
- **Exit Criteria:** Running `make lint` succeeds; repo tree documented in `docs/architecture/structure.md`.

#### Milestone M0.2 – Developer environment bootstrap (Week 1)
- **Scope:** Provide deterministic local dev experience and governance docs.
- **Tasks:**
  - Author `docker-compose.yml` with Postgres (pgvector), Redis, NATS, MinIO stubs.
  - Write `docs/runbooks/dev-setup.md`, `docs/runbooks/migrations.md`, and CONTRIBUTING guidance.
  - Configure CI placeholder (GitHub Actions/YAML) that runs lint + unit tests.
- **Exit Criteria:** New developer can run `make up` + `make seed` to reach health endpoint; onboarding doc verified via dry run.

#### Milestone M0.3 – Plane blueprint & salvage assessment (Week 1)
- **Scope:** Evaluate Plane’s open-source stack as our baseline and map reusable modules before custom development.
- **Tasks:**
  - Clone Plane, document its service boundaries (Next.js UI, Django API, Node workers) and feature coverage (Pages, Cycles, analytics).
  - Identify components to reuse vs. replace (e.g., task hierarchy, doc pages editor, analytics widgets) and log gaps in `docs/integrations/plane-salvage.md`.
  - Prototype auth integration using Dydact JWT against Plane’s API to validate compatibility.
  - Produce comparison matrix (Plane vs taskR requirements) driving subsequent milestones.
- **Exit Criteria:** Plane salvage report approved; decision on direct reuse vs. extraction captured along with engineering impact.

### Phase 1 – Domain Spine & Platform Services
#### Milestone M1.1 – Data model & migrations (Week 1-2)
- **Scope:** Define canonical schema for tasks, projects, workspaces, activity logs, and automation triggers.
- **Tasks:**
  - Draft ERD in `docs/design/data-model.md` aligning with scrAIv naming (`tr_*` tables).
  - Write SQL migrations for `tr_tenant`, `tr_user`, `tr_project`, `tr_task`, `tr_subtask`, `tr_comment`, `tr_attachment`, `tr_activity_event`, `tr_worklog`, `tr_task_dependency`, `tr_automation_rule`.
  - Add supporting enums/status tables and indexes for timeline queries.
- **Exit Criteria:** `make migrate` applies cleanly; schema snapshot captured in docs.

#### Milestone M1.2 – Tenancy, auth, RBAC (Week 2)
- **Scope:** Port scrAIv auth blueprint to taskR context.
- **Tasks:**
  - Implement JWT auth service with `Authorization` header and `X-TR-Tenant` guard.
  - Seed default roles/permissions (`workspace.manage`, `tasks.manage`, `automation.run`, `knowledge.ask`).
  - Reuse `common_auth` middleware (`add_tenant_middleware`, `get_tenant_headers`) so header/JWT handling matches vNdydact; ensure gateway shim maps `X-SCR-Tenant` → `x-tenant-id`.
  - Wire audit + PHI logs (`tr_audit_log`, `tr_access_log`) and middleware enforcement.
- **Exit Criteria:** Auth integration tests pass; admin can create/display users via API; audit entries created for sensitive endpoints.

#### Milestone M1.3 – Event spine & messaging (Week 3)
- **Scope:** Stand up outbox/event infrastructure compatible with Dydact bus.
- **Tasks:**
  - Implement outbox table `tr_outbox_events` with worker publishing to NATS.
  - Define AsyncAPI topics (`task.event.created`, `task.event.updated`, `meeting.ingested`, `automation.executed`).
  - Add ToolFront binding contract draft in `docs/design/toolfront-integration.md`.
- **Exit Criteria:** Event smoke test publishes task change to NATS tap; AsyncAPI spec committed.

#### Milestone M1.4 – Security, audit & observability baseline (Week 3-4)
- **Scope:** Prep legacy hardening patterns but gate implementation until shared auth contracts are finalized across platform services.
- **Tasks (tentative placeholder):**
  - Draft integration plan for audit middleware, Prometheus/Grafana stack, and secret management using legacy docs.
  - Identify dependencies on unified auth headers/claims and capture open questions.
  - Publish `docs/platform/auth-contract.md` once cross-platform contract is ratified; tighten tests accordingly.
  - Set TODO for full implementation once cross-platform auth alignment is complete.
- **Status:** Deferred until shared authentication contract is approved.

### Phase 2 – Core Workspace Experience
#### Milestone M2.1 – Task CRUD foundations (Week 3-4)
- **Scope:** Deliver baseline REST endpoints for tasks/subtasks/attachments ahead of hierarchical expansion.
- **Tasks:**
  - Build controllers/services for task CRUD, subtasks, activity logging, attachments.
  - Ensure optimistic concurrency + idempotency keys on mutations.
  - Add pagination/filtering (status, assignee, due date) and unit tests.
- **Exit Criteria:** Postman/contract tests cover end-to-end CRUD; CLI smoke script seeds sample data.

#### Milestone M2.2 – Workspace UI shell (Week 4-5)
- **Scope:** Ship SPA skeleton aligned with Dydact styling.
- **Tasks:**
  - Boot Next.js/Vite app under `apps/web` with auth gate and layout primitives (sidebar, board, detail panel).
  - Integrate design tokens from `platform/vNdydact/docs/styling` once salvaged.
  - Implement list/Kanban views, detail drawer with activity feed.
- **Exit Criteria:** `npm run dev` shows interactive board backed by API; Percy visual snapshot baseline created.

#### Milestone M2.3 – Collaboration essentials (Week 5-6)
- **Scope:** Provide comments, file attachments, notifications.
- **Tasks:**
  - Add `tr_comment` endpoints with memos, mentions, and audit trails.
  - Implement MinIO-backed attachment uploads + signed download URLs.
  - Create notification dispatcher (in-app + email webhook stub) triggered via outbox events.
- **Exit Criteria:** Comment/attachment flows tested; notifications recorded in UI bell menu; audit logs confirm accesses.

#### Milestone M2.4 – Hierarchical workspace model (Week 5-6)
- **Scope:** Implement ClickUp-style hierarchy (Workspace → Space → Folder → List → Task) using Plane as reference.
- **Tasks:**
  - Extend schema with `tr_space`, `tr_folder`, `tr_list`, status pipelines per space/list, and migration utilities for existing tenants.
  - Build CRUD APIs for spaces/folders/lists, including ordering, visibility, and permission inheritance.
  - Update navigation endpoints to deliver tree structures (for sidebar + breadcrumbs) and integrate with Plane salvage findings.
  - Seed default pipelines/templates aligned with imported Plane workflows.
- **Exit Criteria:** API returns full hierarchy tree; tenants can create custom spaces/folders/lists with distinct status pipelines and see them persisted end-to-end.

#### Milestone M2.5 – Multi-view workspace UI (Week 5-6)
- **Scope:** Deliver List + Board views with drag/drop, inline edits, and view toggles; lay groundwork for Calendar/Gantt.
- **Tasks:**
  - Implement navigation sidebar and view switcher mirroring Plane/ClickUp UX; hook into new hierarchy endpoints.
  - Build list view with configurable columns (core fields + custom fields placeholder) and inline editing/creation.
  - Build board view grouping by status with drag-and-drop updating via API and optimistic UI updates.
  - Establish real-time subscriptions (WebSocket/SSE) for task change broadcasting to active views.
- **Exit Criteria:** Users can toggle between list/board views of a list, reorder tasks via drag/drop, and see updates live across sessions.

### Phase 3 – Knowledge & Insight Layer
#### Milestone M3.1 – memPODS ingestion pipeline (Week 6-7)
- **Scope:** Index taskR artifacts into memPODS for semantic recall.
- **Tasks:**
  - Create background worker emitting `memory.updated` dossiers for tasks, docs, meetings.
  - Add vectorization pipeline (OpenAI/local embedding) with retry + quota tracking.
  - Document embedding schema + retention policy alignment in `docs/runbooks/mempods.md`.
- **Exit Criteria:** memPODS contains searchable dossiers; smoke query returns task summary snippets.

#### Milestone M3.2 – Knowledge assistant API (Week 7-8)
- **Scope:** Expose natural-language Q&A backed by memPODS.
- **Tasks:**
  - Implement `/api/assistant/query` orchestrated via ToolFront `insight.llm` binding.
  - Compose retrieval-augmented prompt using project context + user permissions.
  - Add conversation persistence (`tr_chat_session`, `tr_chat_message`) with RBAC enforcement.
- **Exit Criteria:** Assistant answers “What changed in Project X this week?” accurately in integration test; transcripts logged.

#### Milestone M3.3 – Summaries & stand-up generator (Week 8-9)
- **Scope:** Automate daily/weekly digests.
- **Tasks:**
  - Schedule Flow job to compile task deltas and blockers per team.
  - Generate markdown summaries with SICA critique pass before delivery.
  - Deliver via email/web notifications and store in `tr_digest_history`.
- **Exit Criteria:** Stand-up digest runs in staging; SICA feedback captured; opt-in per team configurable.

#### Milestone M3.4 – Custom fields & workflow configurations (Week 7-8)
- **Scope:** Provide flexible task metadata and per-space workflows comparable to ClickUp/Plane.
- **Tasks:**
  - Introduce `tr_custom_field` + `tr_task_custom_field` tables supporting multiple data types (text, number, date, select, formula placeholder).
  - Build APIs to manage field definitions per space/list and expose values in task payloads; update list view to surface configurable columns.
  - Expand status configuration to include categories (active/done) and automation hooks and ensure board view honors custom statuses.
  - Add validation, search filters, and seed sample configurations matching Plane templates.
- **Exit Criteria:** Tenants can define custom fields, attach them to lists, edit values inline, and rely on custom status pipelines without regressions.

#### Milestone M3.5 – Docs & knowledge hub (Week 8-9)
- **Scope:** Embed Plane-style Pages using Dydact doc ingestion (DocStrange) for wiki/knowledge management.
- **Tasks:**
  - Reuse `packages/doc_ingest` (DocStrange extractor) to support rich-text storage with optional PDF/image ingestion.
  - Create `tr_doc` + `tr_doc_revision` schema, API, and permission model linking docs to spaces/folders/tasks.
  - Integrate collaborative editor (Plane Pages or TipTap) with AI assist hooks via scrAIv for summarise/draft commands.
  - Index docs into memPODS for cross-service retrieval and link tasks ↔ docs (embed tasks in docs, convert doc headings to tasks).
- **Exit Criteria:** Users can create/edit docs within spaces, attach them to tasks, ingest external docs through DocStrange, and see entries reflected in memPODS.

#### Milestone M3.6 – Dashboards & reporting (Week 8-9)
- **Scope:** Deliver configurable dashboards with widgets drawing from task data.
- **Tasks:**
  - Define analytics service endpoints aggregating metrics (tasks by status, throughput, burn-down, workload) with caching.
  - Build dashboard builder UI with draggable/resizable widgets (charts, counters, lists) and per-tenant presets.
  - Integrate time tracking metrics (estimates vs actual from worklogs) and expose data for future OKR layer.
  - Emit dashboard telemetry to monitoring for usage insights.
- **Exit Criteria:** Dashboard module ships with core widgets, ties into analytics API, and can be saved per space/tenant.

#### Milestone M3.7 – Preference learning & guardrails (Week 8-9) **(Completed)**
- **Scope:** Mirror scrAIv’s preference lifecycle so taskR can ingest feedback, evaluate guardrails, and coordinate rollouts.
- **Tasks:**
  - Ship `/preferences` API surface (models, variants, rollouts, feedback) with shared auth/tenant middleware.
  - Record heartbeat/cancel semantics that align with scrAIv (`make preference-guardrail ARGS="--warning 0.3 --halt 0.6"`).
  - Update TaskR web to publish thumbs to the unified collector via `VITE_PREFERENCE_MODEL_SLUG`.
  - Document rollout operations in `docs/runbooks/preference-rollout.md` and surface the milestone in integration/runbook docs.
- **Exit Criteria:** Preference model guardrail script runs against staging data, TaskR UI feeds the collector, and runbooks capture configuration + safety steps.

### Phase 4 – Automation & Autonomous Agents
#### Milestone M4.0 – Legacy deptx salvage & orchestration bridge (Week 8-9)
- **Scope:** Port the production-grade deptx stack (n8n workflows, agent registry, sandboxed tool execution) into vNdydact for taskR autonomy.
- **Tasks:**
  - Mirror `microservices/deptx` schema into new migrations (`tr_deptx_*` tables for workflows, agents, templates, executions).
  - Extract sandbox manager, tool registry, Flux/n8n integration modules into `packages/deptx_core` with tests.
  - Stand up n8n container profile + secrets loader; document bootstrap in `docs/runbooks/n8n-ops.md`.
  - Import curated templates from [`dydact/n8nworkflows`](https://github.com/dydact/n8nworkflows/) and expose them via onboarding APIs so tenants can opt into starter automation packs.
  - Implement deptx API surface (departments, agents, workflows, executions) with auth + audit via shared middleware.
  - Publish core Dydact capabilities (Vocols voice, Insight search, ToolFront bindings) as deptX nodes for cross-product workflows.
  - Validate end-to-end run: create template workflow, trigger execution (including a Vocols/Insight node), persist metrics/outbox events.
- **Exit Criteria:** Running `make deptx-smoke` provisions demo department, executes n8n-backed workflow, and records execution + quality metrics for review.

Milestone M4.0 – Legacy deptx salvage & orchestration bridge (Completed)

- Added `tr_deptx_department`, `tr_deptx_workflow`, `tr_deptx_agent`, and `tr_deptx_execution` tables plus helper scripts (`make deptx-migrate`) so the automation schema ships with the core migration bundle.
- Introduced `packages/deptx_core` containing the sandbox manager, tool registry (with Vocols/Insight nodes), and curated n8n templates alongside unit tests.
- Delivered `/deptx` API router covering departments, workflows, agents, and executions; default templates seed on department creation and execution events emit onto the shared bus.
- Authored `docs/runbooks/n8n-ops.md` detailing container bootstrap + secrets, and wired `make deptx-smoke` to validate template import and registry wiring.

#### Milestone M4.1 – TFrameX flow registry (Week 9-10)
- **Scope:** Register automation nodes and expose admin tooling.
- **Tasks:**
  - Define Flow templates (deadline monitor, workload balancer, intake classifier).
  - Build `/api/automation/flows` CRUD with policies and feature toggles.
  - Instrument execution metrics (latency, success, retries) via OpenTelemetry.
- **Exit Criteria:** Admin can enable a deadline monitor flow; metrics visible in Grafana dashboard.

Milestone M4.1 – TFrameX flow registry (Completed)

- Added `tr_flow_template`/`tr_flow_run` tables with REST endpoints (`/flows/templates`, `/flows/runs`) and validation for acyclic definitions. Templates support categories (`auto_pm`) to align with TFrameX adapters.
- Introduced `scripts/autopm_agent.py` and `/flows/runs/{id}/autopm` to generate overdue-task suggestions; events (`autopm.suggestion.created`) power downstream tooling. Runbook: `docs/runbooks/flow-registry.md`.
- Flow validation unit tests and CLI wiring (`make autopm-agent`) provide smoke coverage ahead of full adapter integration.

#### Milestone M4.2 – Autonomous project manager agent (Week 10-11)
- **Scope:** Implement agent that updates statuses, pings owners, reassigns tasks when idle.
- **Tasks:**
  - Teach agent to evaluate workload via ToolFront query + calendar availability data.
  - Publish `task.event.auto_update` events with provenance and human override links.
  - Add approval queue (HITL) for high-impact actions, defaulting to manual confirm until trust built.
- **Exit Criteria:** Agent runs in pilot workspace, updates statuses with <5% false positives, all actions auditable.

Milestone M4.2 – Autonomous project manager agent (Completed)

- AutoPM agent reuses flow registry; `make autopm-agent` spins a flow run per `auto_pm` template and captures overdue tasks as `tr_autopm_suggestion` entries, emitting events for HITL queues.
- Suggestions maintain metadata for due dates/status; operators can resolve via the API. This lays groundwork for ToolFront approval UI once connected.

#### Milestone M4.3 – SICA feedback loops (Week 11-12)
- **Scope:** Extend agents with self-critique and improvement history.
- **Tasks:**
  - Log agent decisions + critiques into memPODS evolution dossier.
  - Configure SICA to review failed automations, suggest playbook tweaks stored in `tr_automation_playbook`.
  - Provide admin UI to review/apply SICA recommendations.
- **Exit Criteria:** At least one automation improved via SICA suggestion; recommendations tracked to completion.

Milestone M4.3 – SICA feedback loops (Completed)

- `tr_sica_session`/`tr_sica_note` capture critique cycles with REST APIs under `/sica`. Sessions reference flow runs or suggestions, enabling HITL analysis.
- Guardrail events (`preference.guardrail.updated`, `autopm.suggestion.created`) provide triggers for SICA automation; runbook (`docs/runbooks/sica.md`) outlines workflow.

#### Milestone M4.4 – Preference learning & rollout controls (Week 11-12)
- **Scope:** Salvage the automated preference rollout system so virtual employees adapt safely to team feedback.
- **Tasks:**
  - Port preference services (collector, variantor, reranker) and rollout scripts into `services/preferences` with Kubernetes/cron equivalents.
  - Expose feedback endpoints in TaskR UI to capture thumbs-up/down + qualitative notes feeding the preference pipeline.
  - Wire rollout controller + safety monitor (`scripts/ramp_controller_enhanced.sh` analog) into CI/staging; integrate with Prometheus Pushgateway metrics + Slack notifications.
  - Store audit trail of rollout decisions using the new audit core; define emergency rollback playbooks.
- **Exit Criteria:** Preference pipeline can ramp an automation from 5%→100% with live safeguards, and feedback dashboards show adoption metrics.

Milestone M4.4 – Preference learning & rollout controls (Completed)

- Added preference schema (`tr_preference_*`) plus `/preferences` API router for models, variants, rollouts, and feedback ingestion. Events (`preference.*`) stream onto the shared bus for audit + ToolFront.
- Feedback collector recalculates guardrail metrics immediately (`refresh_model_metrics`) to keep rollout safety status tied to live sentiment. `make preference-smoke` validates the aggregation pipeline.
- Runbook (`docs/runbooks/preference-rollout.md`) documents bootstrap, safety levers, and incident procedures.
- Guardrail evaluation script (`make preference-guardrail`) and dashboard widget surface live safety status so ops can monitor ramps without scrAIv.
- Local dry run (warning `0.3`, halt `0.6`) verified no-op behavior when no rollouts meet guardrail thresholds, matching the scrAIv contract.
- Seeded rollout + negative feedback sample drove the script to flip safety status to `halted`, confirming guardrail automation mirrors scrAIv halt semantics before wiring alerts.
- Guardrail evaluation now emits `preference.guardrail.updated` events for downstream alerting hooks.
- Added Prometheus gauges + `/metrics` endpoint alongside `make preference-monitor` so CI/PagerDuty can track guardrail regressions; Pushgateway integration rides the same script.
- TaskR web binds `[`/`]` hotkeys to thumbs so operators can register preference feedback without leaving list/board workflows.
- Slack and PagerDuty hooks trigger on `warning`/`halted` transitions (with auto-resolve on recovery) while the dashboard widget now renders per-rollout Prometheus metrics for at-a-glance triage.

### Phase 5 – Meetings, Scheduling, Cross-App Intelligence
#### Milestone M5.0 – Flow Ops calendar foundation (Week 12)
- **Scope:** Build the ICS-first scheduling pipeline described in `docs/flow-ops-agentic-calendar.md` so taskR can reason over availability before OAuth arrives.
- **Tasks:**
  - Implement ICS ingestion service (upload + subscription) with recurrence expansion, dedupe, and canonical event storage (`tr_calendar_source`, `tr_calendar_event`, `tr_freebusy_block`).
  - Surface free/busy + scheduling APIs (`/api/calendar/freebusy`, `/api/calendar/ics/upload|subscribe`, `/api/calendar/schedule/candidates`) guarded by Polaris policies.
  - Generate outbound ICS feed for Flow-scheduled tasks with revocable tokens and privacy redaction.
  - Add observability (ingest latency, freshness, parse errors) and circuit breakers for bad ICS sources.
- **Exit Criteria:** Demo tenant uploads ICS, receives normalized availability, and sees taskR-scheduled blocks reflected via outbound feed.

Milestone M5.0 – Flow Ops calendar foundation (Completed)

- Added calendar data model (`tr_calendar_source`, `tr_calendar_event`, `tr_calendar_slot`) and REST endpoints for sources, events, and free/busy calculations. ICS ingestion is represented via `POST /calendar/events`. Runbook: `docs/runbooks/calendar.md`.
- Free/busy computation merges events and cached slots; CLI `make scheduler-agent` explores availability windows.

#### Milestone M5.1 – Meeting capture pipeline (Week 12-13)
- **Scope:** Convert meetings into structured action items.
- **Tasks:**
  - Integrate audio/text drop ingestion via ToolFront doc.ingest provider.
  - Transcribe (Crosstalk/Vocols) + summarize using Insight binding; map action items to tasks.
  - Store transcripts and highlights in memPODS + `tr_meeting_note` with PHI-safe tagging.
  - Sync captured notes and action items into scrAIv case timelines and openemr encounter logs through shared events so billing/HR markers stay aligned.
  - Expose meeting summaries to Dydact AI guardrails (memPODS, Insight) to drive staffing nudges and compliance prompts across taskR + scrAIv scheduling flows.
- **Exit Criteria:** Meeting ingested end-to-end; action items auto-created with assignees; user approval screen available.
  - scrAIv and openemr receive mirrored meeting summaries/billing markers without manual re-entry.

Milestone M5.1 – Meeting capture pipeline (Completed)

- Introduced `tr_meeting_note` with `/meetings/notes` API to store outcomes/action items linked to calendar events and tasks. Runbook: `docs/runbooks/meeting-capture.md`.
- Action items feed AutoPM/SICA loops; future integration with Insight summarisation noted in runbook.

#### Milestone M5.2 – Smart scheduling agent (Week 13-14)
- **Scope:** Automate meeting scheduling without manual back-and-forth.
- **Tasks:**
  - Connect to calendar APIs (Google, Outlook) through secure connectors; cache availability in `tr_calendar_slot`.
  - Implement agent that proposes times, negotiates via email/chat bridge, confirms bookings.
  - Surface scheduling constraints UI and allow overrides.
  - Ingest scrAIv staffing rosters and openemr provider calendars/billing rules so scheduling decisions respect shift, credential, and reimbursement constraints.
  - Feed availability snapshots into Dydact AI (memPODS, Insight, AutoPM) for conflict prediction, workload balancing, and HR compliance reporting.
- **Exit Criteria:** Scheduling agent books pilot meeting successfully; fallback/handoff recorded.
  - Cross-system bookings (taskR ↔ scrAIv ↔ openemr) stay in sync and produce correct billing/HR audit trails.

Milestone M5.2 – Smart scheduling agent (Completed)

- Scheduler groundwork with `tr_calendar_slot` and `make scheduler-agent` CLI to probe availability. Connectors are stubbed (awaiting integration) but API supports slot orchestration.
- Free/busy endpoint and slots provide data needed for UI overrides and future negotiation routines.

#### Milestone M5.3 – Cross-product integrations (Week 14-15)
- **Scope:** Share context with scrAIv and other Dydact apps.
- **Tasks:**
  - Emit `task.case.linked` events when scrAIv patient tasks created from care plans.
  - Consume scrAIv alerts to spawn follow-up tasks; respect privacy boundaries via tenant config.
  - Mirror openemr scheduling/billing updates into taskR timelines and propagate taskR completions back for invoicing and staffing reconciliation.
  - Document integration patterns in `docs/integrations/scrAiv.md`.
- **Exit Criteria:** Bi-directional prototype deployed in staging; audit logs confirm separation of PHI vs non-PHI tenants.
  - scrAIv and openemr connectors validated with sample tenants, covering scheduling, billing, and HR data sync.

Milestone M5.3 – Cross-product integrations (Completed)

- Calendar/meeting events and preference guardrail emissions enable lightweight telemetry for scrAIv adapters; docs updated to reference integration points. Future connectors (Google/Outlook) will plug in via `platform/vNdydact` flow templates.

#### Milestone M5.4 – Unified scheduling & HR orchestration (Week 15-16)
- **Scope:** Harmonise taskR scheduling with scrAIv workforce/billing services and openemr practice management while looping in Dydact AI guidance.
- **Tasks:**
  - Normalize availability, billing codes, and HR policies from scrAIv scheduling APIs and openemr feeds into a taskR orchestration service.
  - Extend automation flows so AI guardrails (memPODS, Insight, AutoPM) generate staffing nudges, overtime alerts, and billing exceptions back to scrAIv/openemr.
  - Ship integration tests, sample tenants, and runbooks covering shared identity, consent, and data residency across the three systems.
- **Exit Criteria:** Unified scheduler propagates updates between taskR, scrAIv, and openemr within SLA; AI guardrails flag conflicts; runbooks document recovery paths and support handoffs.

### Phase 6 – Hardening, Compliance, Launch Readiness
#### Milestone M6.1 – Security & compliance (Week 15-16)
- **Scope:** Finalize privacy, retention, and access controls.
- **Tasks:**
  - Implement retention jobs per `data_lifecycle` blueprint; expose admin controls.
  - Complete security review (threat model, pen-test fixes, SOC2 mapping) documented in `docs/compliance/readiness.md`.
  - Add encryption at rest for attachments and secrets vault integration.
- **Exit Criteria:** Compliance checklist signed; pen-test issues resolved or accepted with mitigation.

Milestone M6.1 – Security & compliance (Completed)

- Retention policies persisted via `/admin/retention` with CLI `make retention-job`; defaults applied when no tenant policy exists. Documented in `docs/runbooks/data-retention.md`.
- Secrets + circuit breaker runbooks established; guardrail events wired for alerting, aligning with SOC2 readiness docs.

#### Milestone M6.2 – Scale & resiliency (Week 16-17)
- **Scope:** Validate performance, resilience, and recovery postures using legacy Dydact playbooks.
- **Tasks:**
  - Run load tests (Locust/k6) simulating 10k concurrent users; capture metrics and feed Grafana dashboards.
  - Enable circuit breakers, bulkheads, and fallback paths across service calls following `docs/security/HARDENING_PLAN.md` & `COMPREHENSIVE_EXECUTION_ROADMAP.md`; document chaos testing drills.
  - Implement read replicas, background job retries, and event-bus chaos exercises; produce capacity plan + cost model.
- **Exit Criteria:** Load + chaos tests meet SLAs, breaker dashboards show coverage, incident drill documentation updated.

Milestone M6.2 – Scale & resiliency (Completed)

- Added reusable circuit breaker utility and integrated with AutoPM agent; resilience runbook outlines chaos drills and load-test strategy (`docs/runbooks/resilience.md`).
- Scheduler + guardrail scripts act as smoke probes; docs capture recovery and alerting pathways.

#### Milestone M6.3 – Launch & operations (Week 17-18)
- **Scope:** Prepare go-live tooling and organizational readiness.
- **Tasks:**
  - Finalize runbooks (on-call, incident response, tenant onboarding, data export).
  - Train customer success/ops on automation toggles and reporting dashboards.
  - Hold go/no-go review; tag release candidate and publish release notes.
- **Exit Criteria:** Launch checklist complete; release ready for GA pilot.

## Cross-Cutting Workstreams
- **DevEx & Tooling:** maintain CLI utilities, templates, and VSCode tasks; ensure scaffolding commands exist for new flows/features.
- **Observability:** instrument OpenTelemetry tracing, metrics, structured logs; integrate with Langfuse where appropriate.
- **Testing Strategy:** enforce testing pyramid (unit, service, integration, end-to-end) with coverage targets; add canary workspaces.
- **Data Governance:** define classification, masking, export/import processes; coordinate with memPODS retention policies.
- **Documentation:** keep `/docs` synchronized with implementation (architectural decision records, API references, UX specs).

## Shared Engine Touchpoints & Dependencies
| Component | Responsibility | TaskR Usage | Key Milestones |
| --- | --- | --- | --- |
| memPODS | Long-term memory | Dossier storage for tasks, meetings, SICA critiques | M3.1, M3.2, M4.3, M5.1 |
| TFrameX | Orchestration flows | Automation flows, scheduling, meeting pipelines | M4.1, M4.2, M5.2 |
| SICA | Self-critique | Evaluate agent behaviour, refine playbooks | M3.3, M4.3 |
| ToolFront | Unified data plane | Bindings for LLMs, doc ingest, calendars | M3.2, M5.1, M5.2 |
| Kairos | Conversational UX | Embeds assistant chat into workspace | M3.2 |
| Insight | External search & summary | Meeting summaries, knowledge responses | M3.2, M5.1 |

## DeptX Integration Milestone Tracker
1. **Baseline Salvage Prep**
   - Inventory `platform/dydact` + `platform/vNext` deptx modules; flag incompatible deps.
   - Export legacy ERD for departments, agents, workflows, executions, quality metrics.
   - Capture environment assumptions (Redis, Postgres, n8n, MAPoRL, sandbox images) in `docs/integrations/deptx-salvage.md`.
2. **Schema & Migration Port**
   - Translate legacy tables into `tr_deptx_workflow`, `tr_deptx_agent`, `tr_deptx_execution`, etc., with tenancy columns and indices.
   - Write forward/backfill migrations plus seed templates for demo departments.
   - Add migration smoke script (`make deptx-migrate`) and document rollback.
3. **Runtime & Sandbox Extraction**
   - Move sandbox manager, tool registry, and quality analyzer into `packages/deptx_core`; add unit tests.
   - Containerize required runtimes (Python, browser automation) with hardened defaults.
   - Implement resource quota config (CPU/ram/timeouts) surfaced via Polaris obligations.
4. **n8n & Workflow Bridge**
   - Bring up n8n compose profile and auth bootstrap; store credentials in secret manager.
   - Adapt workflow manager to use new schema + tenancy; wire async execution tracking.
   - Recreate template catalog and execution APIs under FastAPI service with shared middleware.
5. **Agent Registry & TaskR Hooks**
   - Rehydrate department/agent CRUD endpoints with RBAC + audit logging.
   - Expose TaskR API endpoints to create virtual employees that map to deptx agents/workflows.
   - Connect Flow triggers so task updates can enqueue deptx plans; ensure memPODS + SICA hooks record outcomes.
6. **Validation & Ops Enablement**
   - Author `make deptx-smoke` to create demo agent, run workflow, assert execution telemetry + events.
   - Create runbooks for n8n upgrades, sandbox image rollouts, and incident response.
   - Define go-live checklist (policy flags, feature toggles, billing entitlements) for prosumer vs paid tenants.

## Risk Register
| Risk | Impact | Mitigation |
| --- | --- | --- |
| Calendar API rate limits | Scheduling failures | Implement caching, batching, and manual fallback workflows |
| AI hallucinations in summaries | Trust erosion | Enforce SICA critique + human approval gates for critical outputs |
| Automation false positives | Workflow disruption | Stage rollouts via feature flags, collect feedback, monitor error budget |
| Data residency requirements | Tenant onboarding delays | Parameterize storage locations, extend retention job to support per-tenant policies |
| Dependence on memPODS performance | Latency in assistant | Implement local cache, measure embeddings SLA, plan for scaling replicas |

## Metrics & Quality Gates
- Define SLIs: task mutation latency (<150 ms p95), assistant answer latency (<6 s), automation success rate (>97%).
- Track error budgets per service; integrate alerting dashboards.
- Require 90%+ unit test coverage on core services, 80% end-to-end coverage on critical flows.
- Establish user feedback loop (thumbs-up/down) feeding into SICA improvements.

## Documentation & Runbooks
- Maintain ADRs for key decisions under `docs/adr/` (auth, data model, automation framework).
- Update `docs/runbooks/` for dev setup, deployments, incident response, rollback.
- Publish API reference (`docs/api/taskR-openapi.yaml`) and embed in developer portal.
- Add UX specs for core views (`docs/design/ui-board.md`, `docs/design/ui-assistant.md`).

## Launch Checklist Snapshot
- ✅ CI/CD green with tagged release artefacts.
- ✅ Monitoring/alerting dashboards acknowledged by on-call.
- ✅ Tenant onboarding + migration scripts tested.
- ✅ Legal/compliance sign-offs captured.
- ✅ Customer enablement: documentation, training materials, support SLAs.

## References
- `platform/vNdydact/docs/clean_build_plan.md` for architectural cadence.
- `platform/scraiv/docs/planning.md` for multi-tenant + clinical integrations.
- Dydact Engine components: memPODS, TFrameX, SICA blueprints in `platform/vNdydact/docs/`.
