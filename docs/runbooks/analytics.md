# Analytics Runbook

This runbook documents taskR analytics for developers: schema, endpoints, testing, and common operations.

## Schema
- Table `tr_space_plan_point`: per-space planned burn-down counts by day.
- Materialized views (optional performance aids):
  - `mv_space_completion_daily`: daily completed tasks by space.
  - `mv_space_worklog_minutes`: total minutes per task (via `tr_worklog`).

Apply with `make migrate` (uses `scripts/migrate.sh` to apply all SQL).

If Postgres lacks `pgcrypto` for `gen_random_uuid()`:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

## Endpoints
All endpoints require `x-tenant-id` and accept a space identifier (slug or UUID).

- `GET /analytics/spaces/{space}/status-summary` – counts by status
- `GET /analytics/spaces/{space}/workload` – tasks per assignee + total minutes
- `GET /analytics/spaces/{space}/velocity?days=30` – daily completions
- `GET /analytics/spaces/{space}/burn-down?days=14` – planned, completed, remaining
- `GET /analytics/spaces/{space}/cycle-efficiency?days=30` – avg cycle/active/wait hours
- `GET /analytics/spaces/{space}/throughput?weeks=12` – weekly completion histogram
- `GET /analytics/spaces/{space}/overdue` – overdue totals, severe, due-soon
- `GET /analytics/spaces/{space}/summary` – metric cards (active, blocked, completed 7d, overdue, avg cycle)

## Cache
- Server-side cache: ~45s TTL per tenant/space/window.
- Invalidated on task/list changes automatically.
- Client-side cache: the dashboard reuses responses for 30s within the session.

## Dev Operations
- Refresh MVs after bulk data loads:
```bash
make refresh-analytics
```

- Seed plan points for demos (example for a space with slug `alpha`):
```sql
INSERT INTO tr_space_plan_point (tenant_id, space_id, target_date, planned_count)
SELECT s.tenant_id, s.space_id, CURRENT_DATE - i, 8
FROM tr_space s, generate_series(0, 6) AS i
WHERE s.slug = 'alpha';
```

## Testing
Run the analytics integration test (uses SQLite + aiosqlite):
```bash
pytest -q services/api/tests/test_analytics.py
```
If needed:
```bash
pip install aiosqlite
```

## Frontend
The dashboard is composed of Plane-style widgets under `apps/web/src/components/dashboard/widgets/` and a drag-and-drop grid.
- Switch to Dashboard view (top bar or press `4`).
- Edit layout to drag widgets; save/cancel/reset.
- Command Palette (Cmd/Ctrl+K): Refresh (R), Edit (E), Save (S).
