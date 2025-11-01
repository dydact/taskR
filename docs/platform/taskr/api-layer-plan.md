# TaskR Unified API & Client Layer Plan

Date: 2025-02-14  
Prepared for: Dydact Senior Platform Engineer  
Owner: Codex (GPT-5)

## Objective
Establish a shared API contract and client layer so every Dydact application (TaskR, scrAIv, deptx, future apps) consumes services consistently. This plan builds on the newly published [TaskR API Reference](./api-reference.md).

## Guiding Principles
1. **Single Source of Truth:** API reference + OpenAPI spec drive server validation, client generation, docs, and governance.
2. **Tenant & RBAC Enforcement:** Every request includes `x-tenant-id`, `x-user-id`, and respects permission checks.
3. **Tooling First:** Provide reusable TS/JS and Python clients with built-in auth, retries, error handling, and typing.
4. **Backward Compatibility:** Introduce new layer incrementally, maintaining existing integrations until migration completes.

## Deliverables
1. `docs/platform/taskr/taskr-openapi.yaml` – machine-readable contract (mirrors `api-reference.md`).
2. API validation pipeline (lint + schema tests) in backend repo (`services/api`).
3. Shared client libraries:
   - **TypeScript:** `packages/api-client-ts` exported via npm (used by TaskR web, future scrAIv UI).  
   - **Python:** `packages/api_client_py` (used by workers, scripts).
4. Request middleware for auth headers, telemetry, retries.
5. Documentation updates & migration guide for consuming teams.

## Work Breakdown

### Phase 0 – Alignment (Week 0)
- [ ] Review `api-reference.md` with Product/Backend leads; flag missing endpoints.
- [ ] Confirm tenancy & RBAC model (request `Tenant & Role` spec if not already drafted).
- [ ] Define versioning strategy (e.g., `/api/v1` prefix, semantic versioning for clients).

### Phase 1 – OpenAPI Contract (Week 1)
- [ ] Translate `api-reference.md` into `taskr-openapi.yaml` (FastAPI-compatible).  
  • Include schemas for tasks, lists, spaces, analytics, AI jobs, etc.  
  • Document headers, error envelope, pagination meta.  
- [ ] Add OpenAPI generator step to backend CI (GitHub Action).  
- [ ] Expose spec at `GET /openapi.json` (FastAPI native) and host static YAML in docs pipeline.

### Phase 2 – Server Enforcement (Week 2)
- [ ] Implement request models/response models consistent with spec (pydantic).  
- [ ] Add API contract tests (FastAPI + `pytest` verifying example responses).  
- [ ] Introduce schema lint (Spectral/Prism) in CI.  
- [ ] Update backend routers for consistent base paths (`/api/...`) and standard error handling.

### Phase 3 – Client Libraries (Weeks 3-4)
**TypeScript (`packages/api-client-ts`):**
- [ ] Scaffold package (tsup/esbuild) with generated typings via `openapi-typescript`.  
- [ ] Implement `createClient({ baseUrl, getToken, tenantId, userId })` returning strongly typed methods.  
- [ ] Add interceptors for:  
  • Injecting headers (`Authorization`, `x-tenant-id`, etc.)  
  • Retrying idempotent requests (exponential backoff)  
  • Telemetry hooks (emit `api.request`, `api.response` events).  
- [ ] Publish 0.x version to private npm registry; add docs in `README`.

**Python (`packages/api_client_py`):**
- [ ] Build thin wrapper using `httpx`/`requests` with generated models (`datamodel-codegen`).  
- [ ] Provide sync + async clients.  
- [ ] Support automatic retries, instrumentation (OpenTelemetry).  
- [ ] Package to internal PyPI (or use Poetry workspace).

### Phase 4 – Integration & Migration (Weeks 5-6)
- [ ] Update TaskR web app to consume new TS client (replace ad-hoc fetch).  
- [ ] Update scrAIv web/worker repos to use shared clients.  
- [ ] Create migration guide documenting new usage patterns.  
- [ ] Deprecate legacy client utilities after successful rollout.

### Phase 5 – Governance & Maintenance
- [ ] Define release process (version bump on API change, change log).  
- [ ] Set up automated diff detection between running API and OpenAPI spec.  
- [ ] Establish API review board (Platform + Product) to approve breaking changes.

## Dependencies & Open Questions
- Tenant/Role spec finalization (needed to enforce RBAC on server).  
- Decision on authentication flow (current assumption: OAuth/JWT with shared identity).  
- Coordination with scrAIv team for claims/HR bridge endpoints to avoid duplication.  
- Event/SSE contract (`/events/stream`) requires additional schema documentation.

## Suggested Timeline
| Week | Focus |
| --- | --- |
| 0 | Alignment & scope confirmation |
| 1 | OpenAPI spec creation + CI integration |
| 2 | Backend validation & route normalization |
| 3-4 | TS/Python client libraries |
| 5 | TaskR migration to shared client |
| 6 | scrAIv & worker migration, deprecation of old clients |

## Success Criteria
- OpenAPI spec hosted and validated in CI.  
- Shared clients published and adopted by TaskR web + critical backend services.  
- Consistent header/telemetry behavior across apps.  
- Documented process for future endpoint changes.  
- No regressions in API consumer apps; all new UI work leverages shared client.

## Next Actions
1. Schedule alignment call with backend/product (review API reference & roles).  
2. Begin OpenAPI drafting (`taskr-openapi.yaml`).  
3. Stand up repo/package skeletons for TS & Python clients in parallel.  
4. Report progress weekly; adjust scope as new endpoints emerge.
