# taskR × Plane Salvage Execution Plan

## Purpose
Deliver a taskR alpha that matches Plane’s core workspace sophistication while preserving Dydact’s FastAPI/event-driven architecture. This document translates the salvage analysis into concrete workstreams, sequencing, and ownership guidance.

## Guiding Principles
- **Selective lift, native adaptation:** Recreate Plane features inside taskR’s stack (FastAPI, React/Vite, shared `common_*` packages) rather than forking Django services. Attribute UI/code patterns where borrowed.
- **License compliance:** Avoid embedding Plane AGPLv3 code verbatim. Reimplement behavior informed by Plane’s UX and schema.
- **Tenant-first:** Every lifted capability respects `x-tenant-id`, audit logging, and feature flag requirements documented in `docs/taskR-build-plan.md`.
- **Incremental delivery:** Ship enhancements iteratively with demo value each sprint; maintain alpha usability throughout.

## Workstream Overview
| Workstream | Objective | Key Plane Artifacts | taskR Targets |
| --- | --- | --- | --- |
| A. Workspace Shell | Match Plane’s navigation, layout, command tools | `apps/space/src/components/layout`, command palette, sidebar, hotkeys | React shell updates, keyboard shortcuts, role-aware nav |
| B. Task Surfaces | Achieve list/board/calendar parity with inline editing | Issue list views, Kanban components, filter drawers | Enhanced list/board, column config, calendar stub |
| C. Detail Panels | Implement task drawer with tabs, activity feed | `IssueDetail`, comments, checklists | Drawer UI, comment API stubs, attachments placeholder |
| D. Custom Fields & Filters | Replicate Plane’s sub-properties, filters, column toggles | `issue_property`, dynamic column UI | Extend existing custom field schema & React controls |
| E. Analytics & Dashboards | Port Plane widgets & styling | Analytics screens (status, workload, velocity, burn-down) | Add plane-styled widgets backed by FastAPI analytics |
| F. Docs/Pages | Introduce rich editor & revisions | ProseMirror editor packages | Doc routes + React editor integration |
| G. Real-time & Notifications | Move toward Plane’s live updates | `apps/live`, presence indicators | SSE enhancements now; WebSocket bridge later |
| H. Automation & Command Palette | Recreate quick actions, command menu, reminders | Command palette, Celery tasks | Palette component, automation stubs via ToolFront |

## Sequenced Plan

### Phase 1 – Shell & Task Views (Weeks 0-2)
1. **Navigation & Layout**
   - Introduce left sidebar with space/list tree, quick links, and a collapsible layout inspired by Plane.
   - Implement top command bar with view switchers and status indicators.
   - Add keyboard shortcuts (`?` help modal, `Cmd+K` command palette skeleton).
2. **List View Enhancements**
   - Build column configuration drawer (persisted per user).
   - Add filter panel (status, assignee, custom field values).
   - Integrate row selection, bulk actions (placeholder).
3. **Board View Upgrade**
   - Style headers, column counts, WIP warnings using Plane palette.
   - Support drag reordering of statuses and card virtualization.
4. **Calendar View Stub**
   - Create placeholder monthly/weekly calendar referencing Plane design but powered by dummy data until scheduling API is ready.

**Implementation Outline**
- **Frontend**
  - Create `apps/web/src/layout/WorkspaceShell.tsx` modeled on Plane’s `apps/space/src/layouts/WorkspaceLayout.tsx` (sidebar + topbar composition).
  - Add sidebar component `apps/web/src/components/navigation/Sidebar.tsx` with tenants/spaces list; styling tokens in `apps/web/src/styles/plane-tokens.css`.
  - Implement command bar scaffold `apps/web/src/components/navigation/CommandBar.tsx`; wire shortcut handlers via `apps/web/src/hooks/useHotkeys.ts` (new).
  - Extend list view in `apps/web/src/views/ListView.tsx` (new) splitting logic out of `App.tsx`; introduce column settings drawer `apps/web/src/components/list/ColumnSettingsDrawer.tsx`.
  - Rework board view as `apps/web/src/views/BoardView.tsx` using new `apps/web/src/components/board/StatusColumn.tsx`; apply virtualization with `@tanstack/react-virtual`.
  - Add calendar stub `apps/web/src/views/CalendarView.tsx` using `@fullcalendar/react` (dependencies via `apps/web/package.json`).
- **Backend**
  - Expose endpoint for sidebar data: extend `services/api/src/app/routes/spaces.py` to include nested lists/folders summary (`GET /spaces/{slug}/navigation`).
  - Introduce user preferences store in `services/api/src/app/routes/preferences.py` for column settings (persist `list_view_columns` JSON).
- **Styling Assets**
  - Add `apps/web/src/styles/plane-tokens.css` translating Plane Tailwind tokens (primary palette, spacing, shadow) to CSS variables.
  - Update global stylesheet to consume new tokens for background/typography.
- **Plane References**
  - Sidebar inspiration: `apps/space/src/components/layout/Sidebar.tsx`.
  - Command palette trigger: `apps/space/src/components/command-palette/CommandKPalette.tsx`.
  - Filter drawer: `apps/space/src/components/issues/ListFiltersDrawer.tsx`.

### Phase 2 – Task Detail & Custom Fields (Weeks 2-4)
1. **Task Drawer**
   - Implement sliding panel with tabs (Overview, Activity, Subtasks, Docs).
   - Hook up existing task API for inline title/description edits, status changes.
   - Add activity log list (using `tr_activity_event` when available; otherwise placeholder).
2. **Comments & Attachments**
   - Define comment API endpoints (FastAPI) aligned with Plane’s comment experience.
   - Introduce attachment section (UI stub + upload integration plan).
3. **Custom Field UX**
   - Reuse Plane’s property chips and inline editing patterns.
   - Extend React state to surface `TaskRead.custom_fields`, include editing modals.
4. **Filter & Search Integration**
   - Build filter chips mirroring Plane’s UI, persisting to query string.
   - Implement quick search in list (client-side now, server filtering later).

**Status:** Complete – task drawer now supports inline field edits, comments, subtasks, and docs; custom fields, filters, and persistence are wired to the API.

**Implementation Outline**
- **Frontend**
  - Add task drawer component `apps/web/src/components/task/TaskDrawer.tsx` with tabbed layout referencing Plane’s `apps/space/src/screens/issues/detail/IssueDetail.tsx`.
  - Create tab panels: `TaskOverviewTab.tsx`, `TaskActivityTab.tsx`, `TaskSubtasksTab.tsx`, `TaskDocsTab.tsx`.
  - Build comment composer `apps/web/src/components/task/CommentComposer.tsx` mirroring Plane’s rich text input (use textarea placeholder initially).
  - Develop custom field editor `apps/web/src/components/task/CustomFieldEditor.tsx` referencing Plane’s `IssueProperty` components.
  - Implement filter chips in `apps/web/src/components/filters/FilterBar.tsx`; maintain state in URL via `useSearchParams`.
- **Backend**
  - Create new FastAPI router `services/api/src/app/routes/comments.py` with CRUD endpoints for `tr_comment`.
  - Add `services/api/src/app/routes/attachments.py` (stub) with signed URL generator (integration with DocStrange later).
  - Extend `TaskRead` schema to include `comments_count`, `attachments_count`.
  - Write Alembic migration to ensure indexes for `tr_comment` and `tr_task_custom_field`.
  - Implement search endpoint `GET /tasks/search` accepting filters (status, assignee, custom fields).
- **Plane References**
  - Comments: `apps/space/src/components/issues/activity/IssueComment.tsx`.
  - Custom fields: `apps/space/src/components/issues/issue-properties`.
  - Filters: `apps/space/src/components/issues/filters`.

### Phase 3 – Analytics & Dashboards (Weeks 4-6)
1. **Widget Library**
   - Catalog Plane’s widgets (status donut, workload bar, velocity chart, burn-down, lead time).
   - Define shared chart components styled with Plane’s color tokens using `react-chartjs-2` or ECharts.
2. **API Alignment**
   - Extend FastAPI analytics endpoints to provide data required by new widgets (burn-down, lead/lag metrics).
   - Cache results via `analytics_cache`.
3. **Dashboard Layout**
   - Implement drag-and-drop widget grid (Plane-like positions, resizing).
   - Add editing mode toggles, persistence via `dashboards` routes.
4. **Styling**
   - Match typography, spacing, palette to Plane designs to avoid net-new design work.

**Implementation Outline**
- **Frontend**
  - Create widget directory `apps/web/src/components/dashboard/widgets/` with reusable base (`WidgetCard.tsx`) and individual widgets (e.g., `StatusDonutWidget.tsx`, `BurnDownWidget.tsx`).
  - Implement dashboard grid `apps/web/src/components/dashboard/DashboardGrid.tsx` using `@hello-pangea/dnd` or `react-grid-layout` to mimic Plane arrangement.
  - Add analytics overview page `apps/web/src/views/AnalyticsDashboard.tsx` styled after Plane’s `apps/space/src/screens/analytics`.
  - Incorporate theming from `packages/ui` tokens (plane) into chart components.
- **Backend**
  - Extend `services/api/src/app/routes/analytics.py` with endpoints:
    - `GET /analytics/spaces/{space}/burn-down`
    - `GET /analytics/spaces/{space}/lead-time`
    - `GET /analytics/spaces/{space}/throughput`
  - Add SQLAlchemy queries using CTEs/materialized views for cycle metrics; ensure tests under `services/api/tests/test_analytics.py`.
  - Update caching strategies to include new keys; add invalidation hooks in task mutations.
- **Plane References**
  - Widget designs in `apps/space/src/components/analytics/widgets`.
  - Dashboard grid logic in `apps/space/src/components/dashboard`.

### Phase 4 – Docs & Knowledge (Weeks 6-8)
1. **Doc Schema & API**
   - Finalize doc routes in FastAPI (`/docs`, `/docs/{id}/revisions` already exist).
   - Store revision metadata akin to Plane’s versioning.
2. **Editor Integration**
   - Embed Plane’s ProseMirror components (converted to our build tooling) for the document editor and task-linked docs.
   - Hook slash commands/placeholders but use Dydact AI endpoints (ToolFront) for completions.
3. **Doc Indexing**
   - Outline memPODS ingestion pipeline for doc content.
   - Define search placeholders for future implementation.

**Implementation Outline**
- **Frontend**
  - Integrate ProseMirror via `@tiptap/core` or fork Plane’s editor: create `apps/web/src/components/docs/DocEditor.tsx` referencing Plane’s `packages/editor`.
  - Implement doc list view `apps/web/src/views/DocsView.tsx` with breadcrumb navigation.
  - Add doc attachments panel `DocAttachments.tsx` similar to Plane.
- **Backend**
  - Ensure `services/api/src/app/routes/docs.py` supports revisions, publish/unpublish actions.
  - Add background task in `services/api/src/app/services/doc_ingest.py` to push doc updates to memPODS (stub).
  - Update schema `DocRead` with `last_edited_by`, `revision_count`.
- **Plane References**
  - Editor: `packages/editor/src`.
  - Doc routes (Django): `apps/api/plane/api/views/docs.py`.

### Phase 5 – Real-time & Automation Foundations (Weeks 8-10)
1. **Presence & Live Updates**
   - Expand SSE to include presence pings, board/list updates (simulate via event_bus).
   - Document plan to move to WebSockets (inspired by Plane `apps/live`).
2. **Notifications**
   - Design notification settings UI (Plane’s pattern).
   - Implement FastAPI background tasks using event outbox to send email/slack (ToolFront) notifications.
3. **Command Palette & Quick Actions**
   - Build `Cmd+K` palette listing navigation targets, create actions.
   - Integrate with automation hooks (trigger ToolFront flows).

**Implementation Outline**
- **Frontend**
  - Enhance `useTaskStream` to multiplex events (presence, notifications) into context.
  - Create presence indicator component `apps/web/src/components/presence/PresenceAvatars.tsx`.
  - Implement command palette `apps/web/src/components/command/CommandPalette.tsx` using `cmdk` library; populate actions from config.
  - Add notification toast system `apps/web/src/components/notifications/NotificationCenter.tsx`.
- **Backend**
  - Extend event bus publisher to emit presence events; add endpoint `POST /presence/ping`.
  - Implement notification router `services/api/src/app/routes/notifications.py` storing preferences in `tr_notification_preference`.
  - Integrate ToolFront flows in `services/api/src/app/services/automation.py` for reminders triggered on task events.
- **Plane References**
  - Live presence: `apps/live/src/server`.
  - Command palette: `apps/space/src/components/command-palette`.
  - Notifications: `apps/api/plane/api/notifications`.

### Phase 6 – Polish & Hardening (Weeks 10-12)
1. **Theme & Accessibility**
   - Ensure color contrast, keyboard navigation match Plane’s accessibility.
2. **Testing**
   - Add Jest/Vitest component tests mirroring Plane’s coverage.
3. **Performance**
   - Introduce virtualization (e.g., `react-window`) for large lists/boards.
4. **Docs & Runbooks**
   - Update feature documentation, onboarding guides, and integration runbooks.

## Analytics Widget Porting Checklist
- ✅ Status Summary (donut) — already implemented; restyle to Plane palette.
- ✅ Workload Allocation (bar) — adjust styling and labeling.
- ✅ Velocity Trend (line) — ensure new SQL join; match tooltip UI.
- ⬜ Burn-down/Burn-up Chart — add endpoint calculating planned vs. completed.
- ⬜ Cycle Flow Efficiency — compute average lead/cycle time per status.
- ⬜ Overdue Tasks Gauge — simple numeric widget.
- ⬜ Throughput Histogram — weekly task completions.
- ⬜ Custom Metric Cards — quick stats for active tasks, blockers, etc.

Each widget entry should include:
1. Required backend data / query.
2. Plane-styled React component (with colors/legend).
3. Dashboard configuration schema entry.

| Widget | API Endpoint | Data Model Notes | Frontend Component | Plane Reference |
| --- | --- | --- | --- | --- |
| Status Donut | `GET /analytics/spaces/{space}/status-summary` | Uses `Task.status`; ensure status color mapping via custom fields | `StatusDonutWidget.tsx` | `apps/space/src/components/analytics/widgets/StatusChart.tsx` |
| Workload Bar | `GET /analytics/spaces/{space}/workload` | Requires assignee map (`tr_user`) | `WorkloadBarWidget.tsx` | `.../WorkloadChart.tsx` |
| Velocity Trend | `GET /analytics/spaces/{space}/velocity` | Completed tasks grouped by day | `VelocityLineWidget.tsx` | `.../VelocityChart.tsx` |
| ✅ Burn-down | `GET /analytics/spaces/{space}/burn-down` | Requires planned vs completed; add `planned_points` table | `BurnDownWidget.tsx` | `.../BurnDownChart.tsx` |
| ✅ Cycle Efficiency | `GET /analytics/spaces/{space}/cycle-efficiency` | Compute lead/cycle time per task | `CycleEfficiencyWidget.tsx` | `.../CycleEfficiency.tsx` |
| ✅ Overdue Gauge | `GET /analytics/spaces/{space}/overdue` | Count tasks with due date < now and status not done | `OverdueGaugeWidget.tsx` | `.../OverdueTasks.tsx` |
| ✅ Throughput Histogram | `GET /analytics/spaces/{space}/throughput` | Weekly completions | `ThroughputHistogramWidget.tsx` | `.../ThroughputChart.tsx` |
| ✅ Metric Cards | `GET /analytics/spaces/{space}/summary` | Aggregated counts (active, blockers) | `MetricCardWidget.tsx` | `.../SummaryCards.tsx` |

## Styling & Theming Guidelines
- Reference Plane’s Tailwind configuration for colors, shadows, spacing; translate to CSS variables in `apps/web/src/styles.css`.
- Create shared tokens (e.g., `--plane-bg`, `--plane-accent`) to minimize redesign.
- Adopt Plane’s component anatomy for headers, cards, drawers, modals; ensure responsive breakpoints align.

## Dependencies & Tooling
- Node 18+ with pnpm for managing forked Plane packages (UI/editor) if needed.
- Review licensing compliance for any component code; if uncertain, reimplement behavior.
- Extend `Makefile` with commands to install plane-derived UI packages (`make ui-install`), run Tests (`npm run test -- workspaces` pattern).

## Risks & Mitigations
- **Scope creep:** Prioritize workstream milestones; track progress in docs.
- **Licensing:** Document any borrowed code with attribution or rewrite.
- **Auth divergence:** Ensure all UI components interact with FastAPI/JWT, not Plane API assumptions.
- **Performance:** Monitor UI responsiveness when adding virtualization and real-time updates.
- **Resource load:** Large UI overhaul may strain the team; consider staging releases or feature flags.

## File Backlog Summary
| Path | Description | Phase |
| --- | --- | --- |
| `apps/web/src/layout/WorkspaceShell.tsx` | Plane-style workspace shell | Phase 1 |
| `apps/web/src/components/navigation/Sidebar.tsx` | Sidebar tree component | Phase 1 |
| `apps/web/src/components/navigation/CommandBar.tsx` | Top command bar | Phase 1 |
| `apps/web/src/hooks/useHotkeys.ts` | Global hotkey handler | Phase 1 |
| `apps/web/src/components/list/ColumnSettingsDrawer.tsx` | Column management UI | Phase 1 |
| `apps/web/src/views/ListView.tsx` | Extracted list view container | Phase 1 |
| `apps/web/src/views/BoardView.tsx` | Updated board view | Phase 1 |
| `apps/web/src/views/CalendarView.tsx` | Calendar stub | Phase 1 |
| `services/api/src/app/routes/spaces.py` (update) | Navigation summary endpoint | Phase 1 |
| `apps/web/src/components/task/TaskDrawer.tsx` | Task detail drawer | Phase 2 |
| `apps/web/src/components/task/TaskOverviewTab.tsx` | Overview tab | Phase 2 |
| `apps/web/src/components/task/TaskActivityTab.tsx` | Activity tab | Phase 2 |
| `apps/web/src/components/task/CustomFieldEditor.tsx` | Custom field UI | Phase 2 |
| `services/api/src/app/routes/comments.py` | Comment CRUD | Phase 2 |
| `services/api/src/app/routes/attachments.py` | Attachment stub | Phase 2 |
| `apps/web/src/components/filters/FilterBar.tsx` | Filter chips | Phase 2 |
| `apps/web/src/components/dashboard/widgets/*` | Analytics widgets | Phase 3 |
| `apps/web/src/components/dashboard/DashboardGrid.tsx` | Drag-and-drop layout | Phase 3 |
| `services/api/src/app/routes/analytics.py` (update) | Additional analytics endpoints | Phase 3 |
| `apps/web/src/components/docs/DocEditor.tsx` | ProseMirror integration | Phase 4 |
| `apps/web/src/views/DocsView.tsx` | Docs list view | Phase 4 |
| `services/api/src/app/services/doc_ingest.py` | Doc ingestion stub | Phase 4 |
| `apps/web/src/components/presence/PresenceAvatars.tsx` | Presence UI | Phase 5 |
| `apps/web/src/components/command/CommandPalette.tsx` | Cmd+K palette | Phase 5 |
| `services/api/src/app/routes/notifications.py` | Notification settings | Phase 5 |
| `apps/web/src/components/notifications/NotificationCenter.tsx` | Toast/notification center | Phase 5 |

## Deliverables
- Updated `apps/web` with Plane-inspired shell, list/board/calendar views, task drawer, analytics dashboards, docs editor, command palette.
- FastAPI endpoints covering analytics, comments, attachments, notifications.
- Documentation updates:
  - This plan (living document).
  - Component implementation notes under `docs/design/`.
  - Runbooks for new features (`docs/runbooks/analytics.md`, `docs/runbooks/docs.md`).
- Test suites for new UI/endpoint coverage.

## Next Steps
1. Socialize this plan with stakeholders, assign owners per workstream.
2. Update the product roadmap (`docs/taskR-build-plan.md`) to reflect adjusted milestones.
3. Kick off Phase 1 tasks, create tracking tickets with references to relevant Plane components for guidance.
4. Establish weekly review to assess progress, adjust sequencing if blockers arise.
