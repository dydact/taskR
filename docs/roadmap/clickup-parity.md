# ClickUp Parity Plan (taskR + scrAIv + Dydact)

## Objective
Achieve functional parity with ClickUp for HR‑centric project operations using:
- taskR: tasks, dashboards, docs, chat, automations
- scrAIv: time clock, timesheets, payroll
- Dydact: central LLM provider (chat, summaries, tools)

## Scope Mapping
- Tasks/Projects: taskR (spaces/folders/lists, kanban/list/calendar, custom fields)
- Docs/Files: taskR (docs + revisions, attachments)
- Collaboration: taskR (comments, chat); notifications in Phase 5
- Time/Attendance: scrAIv (clock in/out, open/history, timesheets, payroll export)
- Performance Reviews/Goals: new module (taskR) in Phase 3–4
- Automations: taskR flows/approvals + Dydact generation/summaries
- Integrations: ToolFront; direct scrAIv gateway; future HRIS connectors

## Phases

### Phase A — Foundations (current)
- Analytics endpoints + widgets (status, workload, velocity, burn-down, cycle efficiency, throughput, overdue)
- Dashboard grid + Plane styling
- Chat with Reason Mode (streaming SSE, sessions, markdown)
- Local LLM bootstrap + dev orchestration

### Phase B — HR Integration (scrAIv)
- Backend (taskR)
  - `TR_SCRAIV_BASE_URL`, `TR_SCRAIV_API_KEY`
  - `integrations/scraiv.py` client + `/hr/*` proxy routes
- Frontend (taskR)
  - `HRView` (Time Clock / Timesheets / Payroll)
  - Time Clock: in/out, open, history (by user)
  - Timesheets: generate review period, approve/reject
  - Payroll: export selection with target system
- Analytics: add HR widgets (Open Clocks, Hours by Pay Code, Pending Timesheets)

### Phase C — Reviews & Goals
- Schema: `tr_review_cycle`, `tr_review`, `tr_goal`
- Routes + UI: cycles, self/peer/manager reviews; goal boards; progress
- Automation: reminders & approvals

### Phase D — Collaboration & Notifications
- Comments threading, mentions; presence indicators
- SSE channels expanded; notifications center (toasts + preferences)

### Phase E — Integrations & Connectors
- HRIS sync (import users/teams, PTO balances)
- Payroll exporter plug‑ins; ToolFront provider mapping for HRIS

## Contracts
- See `docs/integrations/scraiv-taskR-integration.md` for scrAIv ↔ taskR
- See `docs/integrations/dydact-agentic-orchestration.md` for taskR/scrAIv ↔ Dydact LLM

## Acceptance Criteria
- A PM can run hiring/onboarding projects with docs/tasks/comments and see HR time reflected from scrAIv.
- Managers can clock in/out, view history, and run period timesheets from taskR.
- Reviews/goals are tracked in taskR; notifications prompt actions.
- Chat assists with summaries, triage, and content generation.
