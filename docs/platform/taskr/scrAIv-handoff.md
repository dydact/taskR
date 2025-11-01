# scrAIv UI Handoff Summary (TaskR Shell Integration)

Date: 2025-10-31  
Prepared by: Codex (GPT-5)  

## Reusable Components
- **ShellContext / ShellProvider** (`apps/taskr-ui/src/context/ShellContext.tsx`): centralizes preferences, navigation, profile hydration, and emits telemetry.
- **TaskRClientProvider** (`apps/taskr-ui/src/lib/taskrClient.tsx`): wraps `@dydact/taskr-api-client` with tenant/user headers.
- **ThemeProvider** (`apps/taskr-ui/src/components/ThemeContext.tsx`): consumes Shell preferences and keeps the UI color system in sync.
- **RightPanel** (`apps/taskr-ui/src/components/RightPanel.tsx`): fetches `/insights/feed`, `/notifications`, `/ai/jobs` and renders tabbed insight rails.
- **ClaimsView / HRView** (`apps/taskr-ui/src/views`): lightweight adapters for the claims bridge and HR endpoints. Both expose loading/error states and async refresh hooks.

## API Contracts Consumed
| Area | Endpoint(s) | Notes |
| --- | --- | --- |
| Preferences | `GET/PATCH /preferences` | Persists theme, density, favorites, right-rail state, AI persona, list column visibility. |
| Navigation | `GET /spaces`, `GET /spaces/{slug}/navigation` | Populates LeftNav; expects `root_lists` + `folders`. |
| Tasks | `GET /tasks?list_id=` | Used for list view data. Space-level filtering pending backend support. |
| Claims | `GET /v1/claims`, `GET /scr/api/claims/{id}/events` | Minimal schema (status, payer, amount, timestamps) required. |
| HR | `/hr/timeclock/open`, `/hr/timeclock/history`, `/hr/timesheets`, `/hr/payroll` | Summaries presented in HR dashboard. |
| Telemetry | `POST /analytics/events` | Event payload `{ event, properties, emitted_at }`. |
| Insights | `GET /insights/feed`, `GET /notifications`, `GET /ai/jobs` | Feeds RightPanel tabs. |

## Integration Notes
- Telemetry helper (`useTelemetry`) can be reused in future scrAIv surfaces—wrap event name + payload and the helper will swallow failures.
- Density cycling and theme toggles already emit preference events; scrAIv UI can piggyback on these patterns for AI persona or guardrail surfacing.
- Claims adapter lives at `apps/taskr-ui/src/lib/claimsApi.ts`; extend for detailed timelines/transmissions as backend expands.

