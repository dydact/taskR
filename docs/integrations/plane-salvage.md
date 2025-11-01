# Plane Salvage Assessment (2024-XX-XX)

## Repository Snapshot (depth=1)
- **apps/**
  - `web/` Next.js marketing shell.
  - `space/` Next.js authenticated workspace UI (issues, cycles, pages, analytics).
  - `admin/` Next.js admin console.
  - `api/` Django REST API (PostgreSQL, Celery workers under `bgtasks/`).
  - `live/` Node/Next real-time collaboration gateway (WebSocket events).
  - `proxy/` Reverse proxy service for multi-tenant routing.
- **packages/** – pnpm workspace containing shared React UI kit, hooks, services SDK, Tailwind config, etc.
- **deployments/** – Helm charts, k8s manifests, infra scripts.
- **docker-compose.yml** – orchestrates API, worker, live server, postgres, redis, minio, meilisearch.

## Feature Mapping vs taskR Targets
| Capability | Plane Component | Reuse Plan | Gaps / Notes |
| --- | --- | --- | --- |
| Hierarchy (Workspace → Project → Module/List → Issue) | Django `space`, `project`, `module`, `issue` models | Map to taskR `tr_space`, `tr_folder`, `tr_list`, `tr_task` (M2.4). Reuse schema ideas (UUID, slug, ordering). | Need migration strategy & custom status pipelines per space. |
| Custom Fields (“sub properties”) | `issue_property` tables + UI column picker | Reuse data model for M3.4; align field types (text, number, date, select). | Extend to automation hooks + Dydact validation. |
| Pages (Docs) | Plane Pages (ProseMirror editor, AI hooks) inside `space` app | Integrate editor components; back the API with taskR `tr_doc` + DocStrange ingestion (M3.5). | Replace Plane auth with Dydact JWT; ensure memPODS indexing. |
| Cycles / Sprints | `cycles` models + burn-down analytics | Optional reuse for later sprint module. | Align with Dydact analytics service if needed. |
| Analytics / Dashboards | `/apps/space/src/screens/analytics` + Django analytics endpoints | Source widgets for M3.6 dashboards. | Must refit data queries to taskR schema; implement RBAC. |
| Real-time updates | `apps/live` WebSocket events, Redis pub/sub | Study protocol for task update broadcasts; integrate with taskR SSE/WebSocket gateway (M2.5). | Align auth; evaluate reuse vs own gateway. |
| Notifications | Celery tasks + email integration | Concepts to borrow for future notification milestone. | Build on Dydact bus/outbox. |

## Auth & Tenancy Findings
- Plane API defaults to session-based auth (Django session + CSRF disabled). OAuth adapters exist for GitHub, Google.
- No built-in JWT audience/tenant claims; multi-tenancy handled via `workspace_id` scoping in DB.
- For taskR we must replace Plane auth with Dydact JWT + `x-tenant-id`. Adapters required if reusing Django service.
- Recommendation: extract Plane components at module level (schema, services, UI) rather than running Plane API wholesale to avoid auth mismatch.

## Docs / Pages Integration
- Editor: Plane uses ProseMirror (packages/editor) with AI actions. Components reusable in taskR web if we adopt Next.js/React.
- Storage: Django stores page revisions in Postgres; attachments via MinIO. Align with DocStrange ingestion pipeline by transforming uploads through `packages/doc_ingest` and saving raw text + metadata.
- Action Items: build bridge to push docs into memPODS, enable scrAIv summarise/draft hooks in editor toolbar.

## Analytics Widgets
- Charts implemented via shared `packages/ui` (ECharts) + API endpoints returning aggregated stats (issue counts, cycle velocity, etc.).
- These endpoints rely on Django ORM queries. For taskR, replicate query logic in our analytics microservice (M3.6) using SQL/Materialized views.
- Capture widget config schema for dashboard builder (layout, filters).

## Integration Risks & Decisions
- **Tech stack divergence:** Plane runs Django + Node; taskR backend is FastAPI. Direct reuse of Plane API would introduce parallel stacks → prefer extracting patterns not entire service.
- **Frontend salvage:** Components (sidebar, list/board views, editor) are React + Tailwind – compatible with planned workspace UI. Need to convert to our design system tokens.
- **Search:** Plane uses Meilisearch. Evaluate if Dydact will adopt same or rely on Postgres/Elastic. (Follow-up item).
- **License:** Plane under AGPLv3 – ensure compliance if embedding substantial code.

## Next Actions (post M0.3)
1. Draft extraction plan for hierarchy + custom fields (feeds M2.4/M3.4).
2. Spike on embedding Plane Page editor with DocStrange backend (prepare for M3.5).
3. Capture analytics widget configs for M3.6 implementation.
4. Log auth retrofit requirements in `docs/platform/auth-contract.md` (plane API compatibility TBD).
