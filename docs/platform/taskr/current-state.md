# TaskR Platform – Current State Audit

Date: 2025-02-14  
Owner: Codex (GPT-5)

## 1. Application Skeleton
- **Front-end:** React 18 + Vite app in `apps/web`. Core layout is provided by `workspace-shell` (`apps/web/src/layout/WorkspaceShell.tsx`) with a left navigation rail, floating command bar, and content slot.
- **State & Data:** The root shell (`apps/web/src/App.tsx`) orchestrates spaces/lists, task data, navigation, command palette, chat overlay, preferences, and analytics widgets. It wires to multiple APIs (TaskR, Claims, HR, Insight, deptx) via `fetch` calls with tenant/user headers.
- **Styling:** Global theme lives in `apps/web/src/styles.css`, using a dark glassmorphic palette, density modes, and globally scoped utility classes. Chart.js is registered in `App.tsx` for dashboard widgets.
- **Dependencies:**  
  - Drag & drop via `@dnd-kit`.  
  - Virtualized lists with `@tanstack/react-virtual`.  
  - Chart components under `apps/web/src/components/dashboard/widgets`.  
  - Preferences, command palette, chat, and task drawers implemented under `apps/web/src/components`.

## 2. Navigation & Shell Components
- **Sidebar (`apps/web/src/components/navigation/Sidebar.tsx`):**  
  - Renders spaces → folders → lists with expandable sections.  
  - Badges show task counts per space/list (computed in `App.tsx`).  
  - Uses local `expandedSpaces` state; persistence is not yet implemented.
- **Command Bar (`apps/web/src/components/navigation/CommandBar.tsx`):**  
  - Floating glass toolbar with view toggle, claim-first quick search, and context actions.  
  - Accepts keyboard focus and integrates with global hotkeys (Cmd/Ctrl+K, `/`, `g` then `c`) defined in `App.tsx`.
- **Resizable Columns (`apps/web/src/components/layout/ResizableColumns.tsx`):**  
  - Shared split-pane layout (used by Claims today) with draggable gutters, width persistence, and right-rail collapse toggles.

## 3. Workspace Views (apps/web/src/views)
- **ListView.tsx:** Virtualized task table with configurable columns (Status, Priority, Due), inline preference feedback, and selection handling.
- **BoardView.tsx:** Kanban columns based on list statuses with drag-and-drop and move-to-list actions.
- **CalendarView.tsx:** Placeholder awaiting scheduling implementation.
- **DashboardGrid.tsx (+ widgets):** Configurable analytics surface using Chart.js widgets (status donut, workload bar, velocity line, burn down, throughput histogram, metric cards, overdue gauge). Widgets consume data from API orchestrations inside `App.tsx`.
- **ClaimsView.tsx:** Rich, recently modernized workspace with resizable tri-pane layout, timeline ribbon, session summary rail, reject stack, personalization (favorites, density toggles, timeline state), and toast hooks. Serves as blueprint for future surfaces.
- **HRView.tsx:** Full-featured module covering users, time clock, timesheets, payroll exports, meeting summaries, and autopm integrations; relies on HR API endpoints with local utility formatting.
- **ChatView.tsx:** Multi-session conversational UI with local persistence, server sync, reasoning mode toggle, command hooks, and streaming completions.
- **Calendar/Board/List/Claims integrate with shared task drawer (`apps/web/src/components/task/TaskDrawer.tsx`) and preference feedback collector.**

## 4. Shared Systems & Utilities
- **Preferences:** Local storage backed settings (`taskr_prefs_v1`, density toggles, claim layout, chat model profile) with UI in `components/preferences/PreferencesPanel.tsx`.
- **Command Palette (`components/command/CommandPalette.tsx`):** Summons cross-app commands; integrated with hotkeys.
- **Meeting & Documentation Components:** `components/meeting/MeetingSummaryAuditDrawer.tsx`, `MeetingNoteCard.tsx`.
- **Dashboard widgets** under `components/dashboard/widgets` supply chart primitives.
- **Toast system** wired in `App.tsx` with container styles in `styles.css`.
- **Hooks:** `useHotkeys.ts` (global combos + sequences), `useTaskStream.ts` (event subscription).

## 5. Data & Integration Touchpoints
- **Task domain:** Fetches from `${API_BASE}/spaces/...`, `${API_BASE}/tasks`, etc., handling pagination fallbacks and event-driven updates.
- **Claims domain:** Client in `apps/web/src/lib/claimsClient.ts` with typed responses. Claims view queries claims, transmissions, acks, rejects, jobs, artifacts.
- **HR domain:** `ApiFetch` helper hits `/hr/*` endpoints for time clock, timesheets, payroll.
- **Chat/Insight:** Uses `/chat/sessions`, `/chat/completions`, optional `VITE_INSIGHT_API` override.
- **Preferences / analytics / dashboard:** `App.tsx` fetches `/preferences`, `/analytics`, `/dashboard`.
- **deptx / automations:** References to automation services exist but are not yet surfaced in UI beyond placeholders.

## 6. Current Strengths
- Consistent React architecture with modular components.
- Mature implementations for Claims and HR showing desired glassmorphic aesthetic, micro-interactions, and personalization patterns.
- Reusable primitives (timeline ribbon, session rails, reject stack, resizable columns, command palette) ready to be applied across other surfaces.
- Hotkey infrastructure and density/persistence patterns already established.

## 7. Gaps & Risks
- Many workspaces (Calendar, some dashboards) remain placeholders or inconsistent with the newer visual language.
- Navigation expansion state lacks persistence; spaces need richer metadata (icons, ownership, alerts).
- No consolidated design system documentation; tokens live only in CSS.
- Task, claims, HR modules each fetch data independently—opportunity to centralize API clients and caching.
- Integration boundaries between TaskR standalone and Scraiv (EMR, deptx) are implicit; no explicit module/feature toggles yet.
- Automation/AI agents exist conceptually but lack unified UX across views.

## 8. Suggested Next Steps (Feeds into Milestone Plan)
1. Normalize visual and interaction language across all workspaces using the new glass primitives.
2. Define feature toggles / capability flags to separate TaskR SaaS from Scraiv vertical modules.
3. Extract shared service layer for data fetching, persistence, and telemetry to support future multi-product architecture.
4. Publish design token catalog and Storybook to align future implementation.
