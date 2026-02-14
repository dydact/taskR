# Plane Salvage Assessment (2025-11-20)

## Executive Summary
Plane’s open-source stack continues to be our fastest path to feature completeness for taskR, but we will only salvage concepts/patterns—not whole services—to preserve FastAPI + Dydact auth parity. This document captures what we keep, what we rebuild, and the concrete tasks blocking the end of Phase 0 / start of Phase 1.

## Repository Snapshot (depth=1)
- **apps/**
  - `web/` – marketing Next.js shell.
  - `space/` – authenticated workspace UI (issues, cycles, pages, analytics).
  - `admin/` – admin console.
  - `api/` – Django REST API (PostgreSQL, Celery workers under `bgtasks/`).
  - `live/` – Node/Next real-time gateway (WebSocket events via Redis pub/sub).
  - `proxy/` – reverse proxy for multi-tenant routing.
- **packages/** – pnpm workspace: shared React kit, hooks, Tailwind config, editor.
- **deployments/** – Helm charts / infra scripts.
- **docker-compose.yml** – orchestrates API, worker, live server, Postgres, Redis, MinIO, Meilisearch.

## Feature Mapping vs taskR Targets
| Capability | Plane Component | Reuse Plan | Gaps / Notes |
| --- | --- | --- | --- |
| Hierarchy (Workspace → Project → Module/List → Issue) | Django `space`, `project`, `module`, `issue` models | Map to taskR `tr_space`, `tr_folder`, `tr_list`, `tr_task` (M2.4). Reuse schema ideas: UUIDs, slugs, ordering, soft delete. | Need migration strategy + custom status pipelines per space; add Alembic tests. |
| Custom Fields (“sub properties”) | `issue_property` tables + UI column picker | Reuse data model for M3.4; align field types (text, number, date, select). | Extend to automation hooks + Dydact validation + per-tenant limits. |
| Pages (Docs) | Plane Pages (ProseMirror editor, AI hooks) | Embed editor components inside `taskR/apps/web` and persist to `tr_doc` + DocStrange ingestion. | Replace Plane auth with Dydact JWT; ensure memPODS indexing + search metadata. |
| Cycles / Sprints | `cycles` models + burn-down analytics | Optional reuse for sprint module; store in `tr_cycle` tables. | Align with Dydact analytics service + SLA reporting. |
| Analytics / Dashboards | `/apps/space/src/screens/analytics` + Django analytics endpoints | Source widget configs for `taskR/apps/taskr-ui/src/components/dashboard`. | Must refit data queries to FastAPI analytics service; enforce RBAC filters. |
| Real-time updates | `apps/live` WebSocket protocol | Borrow event envelopes + retry semantics; terminate on new SSE/WebSocket gateway (M2.5). | Align auth tokens; ensure replay via NATS not Redis.
| Notifications | Celery tasks + email integration | Borrow concepts for future alert center. | Build on Dydact outbox + Pagerduty connectors. |
| Preference Experiments | Plane “Rollouts” service + analytics tables | Use evaluation pattern in `taskR/services/api/src/app/routes/preferences.py`. | Need tenant-aware caches + audit logging + pytest coverage. |
| Workspace Shell / Sidebar | `apps/space/src/components/layout/sidebar` | Recreate layout in `taskR/apps/web/src/components/navigation/Sidebar.tsx`; keep search + keyboard surfaces. | Swap to `plane-tokens.css`, plug into `useShell`. |
| List / Board Views | Kanban & list React components | Salvage drag/drop + column settings for `taskR/apps/web/src/views/ListView.tsx` and `BoardView.tsx`. | Integrate with FastAPI filters + memPODS metadata; add RTL tests. |

## Auth & Tenancy Findings
- Plane defaults to session auth (Django session + CSRF disabled) with optional GitHub/Google OAuth. No JWT or tenant claim enforcement.
- Multi-tenancy is implicit via `workspace_id` filters. We require explicit `x-tenant-id` + JWT subject propagation.
- **Action:** salvage schema/UI only. All runtime services stay in FastAPI so we keep `common_auth`, audit trails, rate limits, and zero-trust headers.
- `taskR/apps/web/src/App.tsx` already depends on `env.tenantId`/`env.userId` via `useShell`. Any Plane component we port must consume that context instead of Plane’s Redux store.

## Docs / Pages Integration
- Plane uses ProseMirror + AI toolbar actions packaged in `packages/editor`.
- Django stores page revisions + attachments (MinIO). We will pipe uploads through DocStrange, store metadata in `tr_doc`, and push text into memPODS for retrieval.
- **Spike (M3.5):** embed editor stub inside `apps/web/src/components/docs/` (new) and prove DocStrange ingest + memPODS indexing works.

## Analytics Widgets & taskR Hooks
- Plane widgets rely on Django ORM aggregates. We will mirror widget configs in `taskR/apps/taskr-ui/src/components/dashboard/widgets` and feed them with FastAPI analytics endpoints.
- `DashboardView.tsx` already mimics Plane’s cards/donuts: finish hooking `useAnalytics` to new endpoints, add Vitest + RTL coverage for stats/velocity/responsive rendering.
- Capture widget schema (filters, metrics, chart types) as JSON for future builder tooling.

## Integration Risks & Mitigations
1. **Tech stack divergence:** running Django + FastAPI would double our ops load. → Extract patterns only; keep runtime in FastAPI.
2. **AGPLv3 obligations:** Plane is AGPL; we must avoid copy/paste of substantial code. → Re-implement components, cite inspiration, keep doc trail.
3. **Design/token drift:** Plane uses Tailwind tokens; we need deterministic theming. → Introduce `apps/web/src/styles/plane-tokens.css` mapping palette/spacings to CSS variables.
4. **Testing debt:** Salvage without tests invites regressions. → Follow taskR build plan mandate: unit + integration tests per salvaged slice.

## Adoption Plan for taskR
| Track | Plane Source | taskR Destination | Notes |
| --- | --- | --- | --- |
| Data model & migrations | `apps/api/space/models/*.py` | `taskR/services/api/migrations/versions/*` + SQLAlchemy models | Produce ERD + Alembic scripts, run `pytest tests/migrations` each CI run. |
| Preferences & Experiments | `apps/api/space/features/rollouts` | `taskR/services/api/src/app/routes/preferences.py` + `/services/preferences.py` | Implement cache invalidation + guardrail summaries; add pytest + load tests. |
| Workspace UI | `apps/space/src/components/layout/*`, `screens/issues/*` | `taskR/apps/web/src/components/*` & `views/*` | Replace Plane data hooks with `useTaskRClient` + `useTaskStream`; add Storybook for each salvaged component. |
| Analytics | `apps/space/src/screens/analytics`, `packages/ui/charts` | `taskR/apps/taskr-ui/src/components/dashboard` | Port widget configs, use Recharts/ECharts wrappers we already ship, back them with FastAPI endpoints. |
| Docs & Pages | `packages/editor`, `apps/space/src/screens/pages` | `taskR/apps/web/src/components/docs/*` (new) | Hook uploads into DocStrange, guarantee memPODS ingestion + retrieval tests. |
| Real-time updates | `apps/live`, Redis pub/sub | `taskR/services/gateway` (future) | Mirror payload format, but emit via NATS topics; document SSE/WebSocket contracts. |

## Testing & Tooling Requirements
- Extend Makefile with `make plane-scan` (lint salvaged React + run FastAPI pytest suites).
- Add Postman/contract tests mirroring Plane endpoints we emulate (hierarchy CRUD, analytics, preferences) and run them in CI.
- Add Playwright smoke covering salvaged List/Board/Sidebar flows inside `taskR/apps/web` to ensure drag/drop + keyboard shortcuts survive upgrades.
- Require ≥90 % unit coverage on salvaged Python modules (`preferences`, analytics) and RTL/Vitest snapshots for React components.

## Ready-to-Execute Tasks
1. **Schema parity (M1.1):** codify Plane hierarchy + custom-field tables in Alembic; capture diffs in `docs/design/data-model.md`.
2. **UI extraction (M2.x):** scaffold `plane-tokens.css`, import sidebar/list/board components, cover them with Storybook + RTL tests.
3. **Preferences hardening (M2.x):** finish FastAPI endpoints plus pytest coverage for rollouts/guardrails; benchmark cache hit-rate.
4. **Analytics backlog (M3.x):** export widget configs, wire FastAPI analytics, add contract tests for `/analytics/*` endpoints.
5. **Docs & memPODS (M3.x):** embed ProseMirror editor, route uploads via DocStrange, ensure memPODS indexing + retrieval docs exist.

## Next Actions (post M0.3)
1. Draft extraction plan for hierarchy + custom fields (feeds M2.4/M3.4) with owner + timeline.
2. Spike on embedding Plane Page editor with DocStrange backend (M3.5 proof of concept).
3. Capture analytics widget configs for M3.6 (JSON + filter documentation) and commit under `docs/design/taskR-plane-integration-plan.md`.
4. Log auth retrofit requirements in `docs/platform/auth-contract.md` (Plane compatibility TBD) and add regression tests for FastAPI headers.
5. Schedule a “Plane salvage demo” once List/Board views run on FastAPI to validate UX + performance before continuing.
