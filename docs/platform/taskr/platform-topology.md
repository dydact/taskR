# TaskR Platform Topology & Long-Term Architecture

Date: 2025-02-14  
Owner: Codex (GPT-5)

## 1. Domain Map
```
Experience Layer
  ├─ Workspaces: Operations, Claims, Projects, HR, Dashboards, Calendar, Knowledge
  ├─ Intelligence: Analytics widgets, health scoring, digests
  ├─ AI Surfaces: Command palette, chat, agent timelines, automation drawers
  └─ Governance: Tenant admin, preferences, notifications, personalization

Platform Services
  ├─ Task Spine: tasks, projects, lists, statuses, custom fields, attachments
  ├─ Claims & RCM: transmissions, acks, rejects, job tracker (optional module)
  ├─ HR & Time: users, timeclock, timesheets, payroll exports
  ├─ Automations: deptx flows, workflow templates, execution ledger
  ├─ Knowledge: docs, meeting notes, memPODS indexing
  ├─ Intelligence Core: telemetry pipeline, analytics aggregation, KPI cache
  └─ Shared Utilities: identity, tenancy, preferences, notifications, search

Data & Integration Layer
  ├─ Persistence: Postgres (core), Redis (caching), Object storage (files), Pgvector/memPODS (semantic)
  ├─ Connectors: clearinghouses, ticketing, calendars, HRIS, Slack/email, scrAIv EMR (optional)
  └─ Streaming: NATS/Kafka for events, job queue for agents
```

## 2. Deployment Topology
| Layer | TaskR Standalone | TaskR + scrAIv | Notes |
| --- | --- | --- | --- |
| Web | `apps/web` SPA behind CDN | Same SPA with feature flags | Domain detection toggles claims/EMR widgets. |
| API Gateway | TaskR API (Go/TS or Python) with modular services | scrAIv gateway adds EMR routes; TaskR routes unchanged | Use edge routing to prevent cross-tenant leakage. |
| Services | `svc-tasks`, `svc-analytics`, `svc-automations`, optional `svc-claims-lite`, `svc-hr` | scrAIv adds `svc-claims-deep`, `svc-emr`, `svc-phi` | Deploy TaskR services independently; scrAIv shares identity provider. |
| Data | TaskR DB schema (`tr_*` tables), Redis, object storage | scrAIv adds EMR DB (`sc_*` tables) | Keep PHI in scrAIv schema; TaskR references via service contract only. |
| AI | Insight/LLM gateway, memPODS, deptx agent runner | Same + scrAIv clinical models | Model routing per tenant policy. |

## 3. Service Boundaries (Proposed)
| Service | Responsibilities | Interfaces | Feature Flags |
| --- | --- | --- | --- |
| `svc-tasks` | Tenants, spaces, lists, tasks, comments, attachments, activity events | REST + event stream (`task.created`, `task.updated`) | Always on |
| `svc-analytics` | Aggregations for dashboards, trends, velocity, SLA checks | REST `/analytics/*`, scheduled jobs | Always on |
| `svc-claims-lite` | Claims ingestion via clearinghouse APIs, statuses, timeline events | REST `/claims/*`, webhooks, artifact storage | Optional (standalone & scrAIv) |
| `svc-claims-deep` (scrAIv) | EMR-linked claims, PHI, clinical handoffs | gRPC/REST, PHI controls | scrAIv only |
| `svc-hr` | Timesheets, timeclock, payroll exports, meeting digests | REST `/hr/*` | Optional |
| `svc-automations` (deptx) | Workflow registry, execution engine, tool integrations | REST `/automations/*`, webhook triggers | Optional |
| `svc-knowledge` | Docs, knowledge base, memPODS indexing | REST `/knowledge/*`, ingestion jobs | Optional |
| `svc-intent` | Command palette routing, AI plan-of-action, guardrails | REST `/intent/*`, events from palette/chat | Always on |
| `svc-notify` | Toasts, emails, in-app feed, digests | REST `/notify/*`, websocket feed | Always on |

## 4. Integration Modes
- **TaskR SaaS:** Enable `svc-tasks`, `svc-analytics`, `svc-automations`, `svc-knowledge`, optional `svc-claims-lite` and `svc-hr`. Provide third-party connectors (Slack, Google Calendar, QuickBooks) via extension framework.
- **TaskR + scrAIv:** Add `svc-claims-deep`, EMR connectors, PHI-aware analytics, scrAIv-specific automations. Feature flags decide whether to expose clinical data inside TaskR UI.
- **Bridges:** Use event bus (NATS/Kafka) to propagate key events (task status change, claim ack, HR timesheet approval) to agents and downstream notifications.

## 5. Long-Term Architectural Considerations
1. **Feature Flag Matrix:** Implement tenant-scoped capability flags (`claims.deep`, `hr.core`, `automation.deptx`, `knowledge.docs`, `emr.bridge`) with a central config service to ensure safe rollout.
2. **Data Partitioning:** Maintain separate schemas for TaskR vs scrAIv PHI tables, even when sharing databases; enforce row-level security with tenant IDs and role claims.
3. **API Client Consolidation:** Introduce shared SDK (`packages/taskr-sdk`) for front-end data fetching, caching, and telemetry. Replace ad-hoc `fetch` usage.
4. **Telemetry & Observability:** Standardize event/enrichment pipeline; ensure every major action emits structured analytics for dashboards and health scoring.
5. **Extensibility:** Define plug-in contracts (command palette actions, dashboard widgets, automations) so third parties and internal teams can add capabilities without core changes.
6. **Offline/Resilience:** Plan for optimistic UI updates, background synchronization, and offline caching for key views (Claims timeline, Task lists).
7. **Security & Compliance:** SOC2 baseline for TaskR; optional HIPAA mode (when paired with scrAIv) adds stricter logging, data residency, and PHI masking at UI layer.

## 6. Immediate Architecture Tasks
- Document capability flag schema and load order.  
- Draft ERD showing TaskR vs scrAIv tables with relationship boundaries (next milestone).  
- Audit service repos to align namespacing (`tr_*` vs `sc_*`).  
- Plan migration path from current monolithic APIs to modular services above.  
- Define deployment topologies (single-tenant vs multi-tenant clusters) for both products.
