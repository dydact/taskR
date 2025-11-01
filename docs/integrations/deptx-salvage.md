# DeptX Salvage Notes

## Phase 1 – Baseline Prep
- [x] Inventory legacy repos (`platform/dydact`, `platform/vNext`) for deptX modules.
- [x] Catalogue environment dependencies (Postgres schema, Redis, n8n, sandbox images).
- [x] Export ERD for departments, agents, workflows, executions, quality metrics (captured in `docs/design/data-model.md`).

## Phase 2 – Schema & Migration Port
- [x] Define new `tr_deptx_*` tables mirroring production schema while aligning with taskR naming conventions (see `tr_deptx_department`, `tr_deptx_workflow`, `tr_deptx_agent`, `tr_deptx_execution`).
- [x] Plan migration order for workflows → agents → executions → automation metadata (incorporated into `scripts/deptx_migrate.sh`).
- [x] Document ownership boundaries between taskR API, Flow, and deptX services (summary below).
- [x] Inventory n8n workflow templates from [`dydact/n8nworkflows`](https://github.com/dydact/n8nworkflows/) and prepare import automation so tenants receive curated starter flows during onboarding.

## Notes
- n8n integration, sandbox management, and MAPoRL hooks live under `microservices/deptx` in the legacy repo. We extracted the reusable bits into `packages/deptx_core` (`SandboxManager`, `ToolRegistry`, `TemplateImporter`).
- Preference learning components (variantor, reranker) interface with deptX reporting; incorporate during Milestone M4.4.
- Expose Dydact core capabilities (Vocols, Insight, ToolFront bridges) as deptX nodes so workflows can call speech, retrieval, scheduling, and other platform services. Initial node metadata is registered in the tool registry and surfaced via the `/deptx/catalog/tools` endpoint.

## Current Salvage Snapshot (M4.0)
- **Schema:** `tr_deptx_*` tables ported with tenancy + indexing; `scripts/deptx_migrate.sh` wraps the migration runner so operators can apply the schema bundle directly.
- **Core package:** `packages/deptx_core` hosts sandbox profiles, tool registry, and bundled n8n templates; unit tests cover default registrations and template loading.
- **API surface:** `/deptx` router ships CRUD for departments, workflows, agents, and executions. Default workflows are seeded from curated templates during department creation. Execution lifecycle emits `deptx.execution.*` events via the shared bus.
- **Smoke validation:** `make deptx-smoke` runs package tests and verifies template/registry wiring, acting as the fast feedback loop while n8n containers are provisioned.
- **Runbook:** Bootstrap steps and environment requirements captured in `docs/runbooks/n8n-ops.md` (Postgres, Redis, n8n service, sandbox images, secrets loader).

This file will expand as the salvage work progresses.
