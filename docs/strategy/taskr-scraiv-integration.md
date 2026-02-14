# TaskR ↔ scrAIv Delivery Alignment

This brief synthesizes the current scraiv planning sources and maps the work
TaskR must coordinate so the scrAIv interface can auto-populate once connected.
It should serve both TaskR and scrAIv agents as the canonical handoff until the
shared unified-auth, scheduling, and billing flows are in place.

## Reference Material

- `docs/planning.md` – original architecture doctrine: tenancy model, AI
  surface, billing/payroll ERDs.
- `docs/scraiv_master_plan.md` – phase roadmap (P1–P7) with checklist of UI,
  backend, and ops deliverables.
- `notes/roadmap.md` – execution journal covering environment bootstrap,
  QA baselines, salvage audits, and phase increments.

## Execution Snapshot vs Roadmap

| Phase | Status Snapshot | Gap / Follow-Up |
|-------|-----------------|-----------------|
| **P1 – Auth & RBAC** | Auth provider, access gates, `/auth/me`, role CRUD, and audit surfacing are live (`frontend/src/providers/AuthProvider.tsx`, `AccessGate`, `TenantSettingsPage`). | Ensure unified-auth rollout mirrors these controls; migrate existing roles to chain-based scopes. |
| **P2 – Scheduling & Treatment** | Treatment plans + approvals in production (`PlansPage`, `ApprovalsPage`, `ScheduleController.php`). | Drag/drop calendar per `docs/scraiv_master_plan.md:44` and treatment-plan builder components remain unchecked. |
| **P3 – Notes & Behavior** | Notes drafting/finalization shipping (`NotesPage`, `NotesController`); behavior services & AI inference endpoints live (`BehaviorService.php`). | Template editor UX and supervisor workflow still pending (`docs_scraiv_master_plan.md:130-132`). |
| **P4 – Billing & Revenue** | Claims workflows, transport jobs, timelines in place (`ClaimsPage`, `ClaimTransportController.php`). | ERA inbox + fee schedule manager outstanding (`docs_scraiv_master_plan.md:57-61`). |
| **P5 – Timekeeping & Payroll** | Timesheet approvals, HR bridge, payroll summaries active (`TimesheetsPage`, `HrPage`). | Bulk approval board + export wizard unchecked (`docs_scraiv_master_plan.md:133`). |
| **P6 – Ops & Compliance** | Tenant settings include branding/AI toggles + audit feed. | Incident Mgmt, document retention, observability/backups still open (`docs_scraiv_master_plan.md:136,139-143`). |
| **P7 – Reports & Analytics** | Claims metrics dashboard exists. | Full analytics/report builder not implemented (`docs_scraiv_master_plan.md:137`). |
| **OpenEMR Bridge** | Controllers/services for clients, staff, sessions, plans exist. | Design doc + API error cleanup flagged in `notes/roadmap.md:25-53`. |

## TaskR Coordination Priorities

1. **Shared Scheduling ↔ Worklog ↔ Billing Contract**
   - **Canonical Timeline Entity**
     - `session_id` (UUID) – shared identifier across calendar event, timesheet row, billing line, claim detail.
     - `tenant_id`, `patient_id`, `staff_id`, `location_id`.
     - `service_type` (enum), `authorization_id`, `cpt_code`, `modifier[]`.
     - `scheduled_start/end`, `worked_start/end`, `duration_minutes`.
     - Status ladder: `scheduled → in_progress → worked → approved → exported → claimed → paid`.
     - Links: `timesheet_entry_id`, `payroll_batch_id`, `claim_id`, `transport_job_id`.
   - **Rules & Mapping**
     - Fee schedule lookup: `service_type + location + payer` → `cpt_code`, `rate`, `units`.
     - Authorization checks: ensure `authorization_id` covers date/service/units; emit AI assist if variance detected.
     - Worklog validation: compare worked duration vs scheduled; queue review when variance exceeds threshold.
   - **Reconciliation Flows**
     - *Missed shift*: if no worklog by end-of-day, flag status `missed`, allow admin override to backfill worked times and regenerate payroll/claim events.
     - *Backdated claim*: if ERA/clearinghouse responds with rejection, update timeline status, re-open payroll entry if payment reversed, auto-schedule follow-up.
     - *AI hooks*: Insight monitors for anomalies, SICA proposes corrective actions; notifications queued when human review required.

2. **Backend Surface Harmonization**
   - Feature flag namespace: `notifications`, `schedule_pipeline`, `billing_bridge`.
   - **Planned Endpoints (TaskR → scrAIv)**
     - `GET /bridge/schedule` → paginated timeline entries (filters: date range, status, staff, patient).
     - `POST /bridge/schedule/{session_id}/worklog` → upsert worked times + metadata.
     - `POST /bridge/schedule/{session_id}/lock` → approve / revoke approvals.
     - `GET /bridge/billing/preview?session_id=...` → normalized claim/billing payload (CPT, units, rate, modifiers).
     - `POST /bridge/billing/export` → mark sessions as exported with transport job metadata.
   - **Inbound Hooks (scrAIv → TaskR)**
     - `POST /bridge/claims/status` → update claim/ERA state.
     - `POST /bridge/payroll/reconcile` → confirm payroll batches generated.
   - Migration plan: create `tr_schedule_timeline` table mirroring canonical entity; add indexes for `tenant_id+scheduled_start`, `staff_id+date`.
   - Provide mocked data loaders and FastAPI fixtures so scrAIv QA can call endpoints without UI.

3. **AI/Automation Touchpoints**
   - Embed Insight/SICA hooks across the shared contract (auto-scheduling,
     note/claim draft suggestions, anomaly detection).
   - Expose configuration toggles so when AI is enabled, both TaskR and scrAIv
     understand the same feature flags.

4. **Unified Auth & Secrets**
   - Coordinate with the unified-auth initiative (`docs/strategy/unified-auth-roadmap.md`)
     so token scopes cover scheduling, billing, HR, and notification features.
   - Ensure webhook/Twilio secrets for notifications adhere to the same policy
     before scrAIv triggers them.

5. **Operational Readiness**
   - Stand up shared staging stack where TaskR + scrAIv agents can run end-to-end
     tests (calendar → timesheet → claim).
   - Log updates in `notes/roadmap.md` so both teams know when to exercise new flows.
   - Follow `docs/runbooks/schedule-bridge.md` for feature toggles, validation script usage, and troubleshooting.

## Sequence Overview

1. **Schedule** – TaskR creates timeline entry when calendar session booked (status `scheduled`).  
2. **Worklog** – Staff clocks in/out → TaskR updates `worked_start/end`, raises variance alert if outside tolerance.  
3. **Approval** – Supervisor approves worklog (`approved`). AI suggests adjustments when trends detected.  
4. **Billing Preview** – TaskR exposes `/bridge/billing/preview`, scrAIv renders claim/transport UI.  
5. **Export** – scrAIv submits transport job → TaskR marks status `exported` and stores job metadata.  
6. **Clearinghouse Feedback** – scrAIv posts claim status back; TaskR updates timeline (`claimed/paid`), triggers payroll reconciliation and notifications.

## Deliverables Checklist

- [x] Integration brief (this document).  
- [x] Detailed ER schema + migration draft (`tr_schedule_timeline`, supporting tables).  
- [x] API contract document (OpenAPI excerpt in `docs/strategy/taskr-schedule-bridge-contract.md`).  
- [x] Feature flag configuration (`schedule.bridge`) with default off and per-tenant overrides.  
- [x] Postman collection for staging validation (`docs/postman/taskr-bridge.postman_collection.json`).  
- [ ] Staging pipeline linking TaskR + scrAIv behind unified auth gateway (pending; validation helper now available via `scripts/staging/validate_bridge.py`).

## Next Actions

1. Draft the shared data contract & sequence diagrams and add to the strategy folder.
2. Implement migrations/endpoints with feature flags; deliver Postman/curl scripts
   for scrAIv validation.
3. Coordinate with scrAIv agent on remaining P2/P3 UI pieces once TaskR data
   surface is ready (avoid duplicate UI work until TaskR agent ships the new shell).
4. Update TaskR build plan milestones to reference this integration work and keep
   the roadmap honest about unified-auth dependency.
