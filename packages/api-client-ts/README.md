# @dydact/taskr-api-client

Shared TypeScript client for the TaskR REST API. The client wraps the endpoints
documented in `docs/platform/taskr/api-reference.md` and will eventually be
generated from `taskr-openapi.yaml`. This initial scaffold provides a typed
fetch wrapper with a few core endpoints (tasks, spaces, preferences, analytics,
AI jobs, notifications, HR timeclock).

## Usage

```ts
import { createTaskRClient } from "@dydact/taskr-api-client";

const client = createTaskRClient({
  baseUrl: "https://staging.taskr.dydact.io/api",
  tenantId: "tenant_123",
  getToken: () => localStorage.getItem("access_token"),
  userId: "user_abc"
});

const tasks = await client.tasks.list({ status: "in_progress" });
const prefs = await client.preferences.get();
await client.preferences.update({ view_density: "compact" });
```

## Scripts

- `npm run build` – compile TypeScript to `dist/`.

## Notes

- Fetch implementation defaults to the global `fetch`. Provide `fetchFn` in
  config when running in Node.
- Error responses throw an `ApiError` with status code and response body.
- This scaffold is intentionally minimal; expand endpoint coverage alongside the
  OpenAPI spec.
