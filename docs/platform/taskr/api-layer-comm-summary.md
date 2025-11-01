# API Layer Update – Stakeholder Brief

Date: 2025-02-14  
To: Backend Leads, Platform PM  
From: Codex (GPT-5)

## New Artifacts
1. **API Reference:** `docs/platform/taskr/api-reference.md`
   - Consolidated endpoint catalog for TaskR + scrAIv bridge (spaces, tasks, analytics, AI, automations, HR, notifications, etc.).
2. **API Layer Plan:** `docs/platform/taskr/api-layer-plan.md`
   - Implementation roadmap for unified OpenAPI spec, shared TS/Python clients, CI validation, and migration timeline.
3. **OpenAPI Draft:** `docs/platform/taskr/taskr-openapi.yaml`
   - Skeleton spec seeded with tasks, spaces, analytics, AI jobs, notifications, HR endpoints. To be expanded per reference.
4. **Tenant/RBAC Questions:** `docs/platform/taskr/tenant-role-open-questions.md`
   - Outstanding decisions required to finalize RBAC enforcement in API layer.

## Immediate Requests
- **Review & Feedback:** Confirm API reference coverage; flag missing or inaccurate endpoints. Provide feedback on OpenAPI skeleton before automation.
- **Tenant & Role Alignment:** Assign owner to resolve open questions and produce final spec (needed before Phase 2 of API plan).
- **Timeline Confirmation:** Validate proposed timeline (Weeks 0–6) for spec, clients, and migration. Adjust based on engineering capacity.

## Next Milestones (per API Plan)
1. Week 0: Alignment meeting – agree on scope, versioning, RBAC owner.
2. Week 1: Expand `taskr-openapi.yaml`, integrate spec generation into CI.
3. Week 2: Update FastAPI routes + tests to match spec.
4. Weeks 3–4: Build TS & Python clients; publish initial packages.
5. Week 5: Update TaskR web to shared client.
6. Week 6: Migrate scrAIv + workers, deprecate legacy clients.

## Additional Notes
- ToolFront remains AI-specific; new client layer serves general REST endpoints.
- SSE/event schemas still need documentation (future iteration).  
- Once RBAC spec finalized, update API documentation and client type definitions accordingly.

Please review the documents and respond with:
- Approval or adjustments to the endpoint list & plan.
- Assigned owner + due date for tenant/role spec.
- Any blockers or dependencies we should track.
