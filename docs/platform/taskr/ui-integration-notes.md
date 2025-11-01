# TaskR UI Integration Notes

Date: 2025-10-31  
Owner: Platform Front-End (Codex)  

## Summary
- The TaskR web workspace now runs from `apps/taskr-ui` and is wired to the shared `@dydact/taskr-api-client` along with a lightweight claims adapter.
- Preferences (`/preferences`), spaces/navigation (`/spaces`, `/spaces/{slug}/navigation`), notifications, AI insights, HR endpoints, and claims feeds are all consumed through the central Shell context.
- Telemetry events are dispatched to `/analytics/events` for view switches, density changes, right-rail toggles, and favorites updates.

## Follow-Ups
| Area | Observation | Next Step |
| --- | --- | --- |
| Tasks API | `tasks.list` lacks an obvious filter for `space_id`; currently filtering by `list_id` only. | Confirm backend filter support or add space-scoped endpoint. |
| Navigation counts | Space/list badge counts currently rely on fetched tasks; needs dedicated metrics endpoint for accuracy. | Expose `/analytics/spaces/{id}/counts` or include counts in `/spaces/{slug}/navigation`. |
| Claims insights | `GET /scr/api/claims/{id}/events` schema inferred; awaiting backend confirmation of fields (`status`, `description`). | Align with API contract, add missing fields to OpenAPI. |
| HR payroll | `/hr/payroll` response assumed to expose `total_pay`, `pending`. | Document actual payload in API reference after backend confirmation. |
| Telemetry sink | `POST /analytics/events` implemented optimistically. | Confirm endpoint or provide dedicated analytics ingest route. |

## Testing
- `pnpm --filter @dydact/taskr-ui build` (Vite production bundle)
- Manual smoke checks (claims feed, HR dashboard, theme/density toggles) pending live backend connectivity.

