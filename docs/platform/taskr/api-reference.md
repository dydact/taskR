# TaskR API Reference (Draft v0.1)

Date: 2025-02-14  
Owner: Codex (GPT-5)  
Audience: Platform Engineering, Product, Front-End teams, scrAIv integration partners

> **Status:** Working draft. Reflects the endpoints enumerated in the TaskR build plan, integration docs, and backend roadmap. Update as routes are implemented or adjusted. All endpoints are FastAPI unless noted.

## 1. Conventions
- **Base URL (TaskR):** `https://{env}.taskr.dydact.io/api`  
  **Base URL (scrAIv bridge):** `https://{env}.scr.dydact.io/scr/api`
- **Headers:**  
  - `Authorization: Bearer <token>` (OAuth/JWT issued by Dydact identity)  
  - `x-tenant-id: <TENANT_ID>`  
  - `x-user-id: <USER_ID>` (when acting on behalf of a user)  
  - Optional: `x-model-profile`, `x-request-id`
- **Response envelope:**  
  ```json
  { "data": <payload>, "meta": { "page": 1, "total": 25 }, "links": { ... } }
  ```
- **Error response:**  
  ```json
  { "error": { "code": "string", "message": "string", "detail": {} } }
  ```
- **Tenancy & RBAC:** Scope every route by tenant; enforce roles (`workspace.manage`, `tasks.manage`, `claims.view`, etc.). See forthcoming Tenant & Role spec.

## 2. Identity & Preferences
| Method | Path | Description |
| --- | --- | --- |
| GET | `/profile` | Current user profile, roles, feature flags |
| GET | `/preferences` | Fetch user preference bundle (`view_density`, `theme`, `ai_persona`, `list_view_columns`, `saved_views`, etc.) |
| PATCH | `/preferences` | Update preference keys (partial). |

## 3. Spaces & Navigation
| Method | Path | Description |
| --- | --- | --- |
| GET | `/spaces` | List spaces accessible to user (id, slug, name, color, counts, favorite flag). |
| POST | `/spaces` | Create a new space (admin only). |
| GET | `/spaces/{slug}` | Space metadata, configurations, role assignments. |
| GET | `/spaces/{slug}/navigation` | Nested tree: folders, lists, docs, dashboards, pinned views (used by sidebar). |
| PATCH | `/spaces/{slug}` | Update space settings (color, description, automations, AI toggles). |
| POST | `/spaces/{slug}/favorite` | Toggle favorite. |
| POST | `/spaces/{slug}/share` | Share/invite members (payload includes role). |

## 4. Lists, Tasks & Activity
| Method | Path | Description |
| --- | --- | --- |
| GET | `/lists` | Query lists (filters: `space_id`, `archived`). |
| POST | `/lists` | Create list. |
| PATCH | `/lists/{id}` | Update list settings (status pipeline, WIP limits, automations). |
| GET | `/tasks` | Paginated tasks (filters: `list_id`, `status`, `assignee`, `tag`, `custom_field`). |
| POST | `/tasks` | Create task. |
| GET | `/tasks/{id}` | Task detail with custom fields, comments, docs, audit trail. |
| PATCH | `/tasks/{id}` | Update task (status, metadata, custom fields). |
| POST | `/tasks/{id}/subtasks` | Create subtask. |
| GET | `/tasks/{id}/activity` | Timeline of events (status changes, comments, automation triggers). |
| POST | `/tasks/{id}/bulk` | Bulk operations (payload: `ids`, `action`). |
| GET | `/custom-fields` | Fetch custom field definitions per space/list. |
| POST | `/custom-fields` | Create/update custom fields. |
| GET | `/comments` | Query comments (filters: `task_id`, `doc_id`). |
| POST | `/comments` | Create comment. |
| DELETE | `/comments/{id}` | Delete comment. |
| POST | `/attachments/sign` | Get signed URL for upload (DocStrange stub). |
| GET | `/attachments/{id}` | Retrieve attachment metadata. |

## 5. Boards & Status Pipelines
| Method | Path | Description |
| --- | --- | --- |
| GET | `/statuses` | List status pipelines (per list/space). |
| PATCH | `/statuses/{id}` | Update ordering, WIP limit, color. |
| POST | `/statuses/reorder` | Reorder statuses (payload: `status_ids`). |

## 6. Calendar & Scheduling
| Method | Path | Description |
| --- | --- | --- |
| GET | `/calendar/events` | Read events (tasks, meetings) within range. |
| POST | `/calendar/events` | Create scheduled event with linked task. |
| GET | `/calendar/freebusy` | Proxy to connected calendars; returns busy blocks. |
| POST | `/calendar/ics/upload` | Upload/subscribe to ICS feed. |
| POST | `/calendar/schedule/candidates` | Suggest scheduling slots (AI assisted). |

## 7. Docs & Knowledge Hub
| Method | Path | Description |
| --- | --- | --- |
| GET | `/docs` | List docs by space/folder. |
| POST | `/docs` | Create doc (title, content). |
| GET | `/docs/{id}` | Fetch doc (latest revision). |
| PATCH | `/docs/{id}` | Update metadata (title, folder, publish state). |
| POST | `/docs/{id}/revisions` | Save new content revision (ProseMirror/TipTap JSON). |
| GET | `/docs/{id}/revisions` | List revisions. |
| POST | `/docs/{id}/attachments` | Link attachments. |

## 8. Analytics & Dashboards
| Method | Path | Description |
| --- | --- | --- |
| GET | `/analytics/status` | Counts per status. |
| GET | `/analytics/workload` | Workload by assignee. |
| GET | `/analytics/velocity` | Velocity trend data. |
| GET | `/analytics/burndown` | Burn-down metrics. |
| GET | `/analytics/throughput` | Histogram of completion per period. |
| GET | `/analytics/overdue` | Overdue tasks gauge. |
| GET | `/dashboards` | List dashboards (per space/user). |
| POST | `/dashboards` | Create dashboard (layout JSON). |
| PATCH | `/dashboards/{id}` | Update layout/widgets. |

## 9. Automations & Agents
| Method | Path | Description |
| --- | --- | --- |
| GET | `/automation/flows/templates` | Catalog of flow templates (deadline monitor, autopm, etc.). |
| POST | `/automation/flows/templates` | Create template (admin). |
| GET | `/automation/flows` | Enabled flows for tenant/space. |
| POST | `/automation/flows` | Enable flow (payload: template_id, config). |
| POST | `/automation/flows/{id}/run` | Trigger a manual run. |
| GET | `/automation/executions` | Execution history (status, latency, metrics). |
| GET | `/presence/ping` | SSE keep-alive/presence handshake (may migrate to WS). |

## 10. AI & Insights
| Method | Path | Description |
| --- | --- | --- |
| POST | `/ai/jobs` | Submit inference job (payload: prompt_id, context, metadata). Returns job_id. |
| GET | `/ai/jobs` | List jobs (filters: status, prompt_id). Includes prompt metadata/provenance. |
| GET | `/ai/jobs/{id}` | Job detail, completion payload or guardrail events. |
| POST | `/ai/jobs/{id}/feedback` | Accept/decline, thumbs rating, guardrail overrides. |
| GET | `/insights/feed` | Pull latest insights (velocity, blockers, autopm). |
| SSE | `/insights/events` | Stream outbox events (AI suggestions, automation outcomes). |

## 11. Notifications
| Method | Path | Description |
| --- | --- | --- |
| GET | `/notifications` | Paginated notifications. |
| POST | `/notifications/{id}/ack` | Acknowledge notification. |
| GET | `/notifications/preferences` | User-level notification preferences. |
| PATCH | `/notifications/preferences` | Update channel/medium settings. |

## 12. Chat & Command Palette
| Method | Path | Description |
| --- | --- | --- |
| GET | `/chat/sessions` | List chat sessions (assistant conversations). |
| POST | `/chat/sessions` | Create session. |
| GET | `/chat/sessions/{id}/messages` | Retrieve messages. |
| POST | `/chat/sessions/{id}/messages` | Append message (role=user/assistant/system). |
| POST | `/chat/completions` | Proxy to Insight/ToolFront completions. |
| GET | `/command/actions` | List available palette actions (navigation, create, AI). |

## 13. Claims (scrAIv bridge)
| Method | Path | Description |
| --- | --- | --- |
| GET | `/v1/claims` | List claims (status, payer, updated). |
| GET | `/v1/claims/{id}` | Claim detail. |
| POST | `/v1/claims/{id}/submission` | Trigger submission. |
| GET | `/scr/api/claims/{claim_id}/transmissions` | Transmission list. |
| GET | `/scr/api/claims/{claim_id}/acks` | Acknowledgements. |
| GET | `/scr/api/claims/{claim_id}/rejects` | Rejects list. |
| GET | `/scr/api/claims/{claim_id}/events` | Claim timeline. |
| GET | `/scr/api/claims/transport/jobs/{job_id}/events` | Job events. |

## 14. HR & Time Tracking (scrAIv bridge)
| Method | Path | Description |
| --- | --- | --- |
| GET | `/hr/users` | Proxy to scrAIv user directory. |
| GET | `/hr/timeclock/open` | Current open timeclock entries. |
| GET | `/hr/timeclock/history` | Historical punches. |
| POST | `/hr/timeclock/clock-in` | Clock in (with metadata). |
| POST | `/hr/timeclock/clock-out` | Clock out. |
| POST | `/hr/timesheets/generate` | Generate timesheet for period. |
| GET | `/hr/timesheets` | Query timesheets. |
| POST | `/hr/timesheets/{id}/approve` | Approve timesheet. |
| POST | `/hr/timesheets/{id}/reject` | Reject timesheet. |
| GET | `/hr/payroll` | Payroll summary. |
| POST | `/hr/payroll/export` | Trigger export (CSV/JSON). |

## 15. Auth, Audit & Admin
| Method | Path | Description |
| --- | --- | --- |
| GET | `/tenants` | List tenants (admin). |
| POST | `/tenants` | Provision tenant. |
| GET | `/tenants/{id}/feature-flags` | View feature flag states. |
| PATCH | `/tenants/{id}/feature-flags` | Update flags. |
| GET | `/audit/events` | Audit log. |
| GET | `/health` | Health check (includes DB, queue, ToolFront status). |

## 16. Event Streams & Outbox
- **SSE:** `/events/stream` — multiplexed channel for tasks, claims, AI, notifications, presence.  
- **Outbox consumer (internal):** `POST /events/outbox/ack` — called by workers after processing outbox row (tenant-scoped).  
- **Retry/backpressure:** determined by outbox consumer plan (see event-driven worker orchestration doc).

## 17. ToolFront & External AI
- TaskR leverages ToolFront for prompt management but exposes internal routes above. ToolFront-specific endpoints are out-of-scope for this reference; see `docs/runbooks/toolfront-rollout.md` and scrAIv backend docs.

## 18. Notes
- Update this document as routers are implemented or renamed.  
- Once stabilized, generate an OpenAPI spec (`docs/platform/taskr/taskr-openapi.yaml`) for tooling and SDK generation.  
- Coordinate with scrAIv team when bridging to ensure consistent paths (`/scr/api/...`).  
- Ensure upcoming Tenant & RBAC spec aligns with scope/permissions implied above.
