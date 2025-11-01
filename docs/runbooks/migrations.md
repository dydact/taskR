# Migrations Runbook

## Overview
TaskR uses plain SQL migrations stored under `services/api/migrations`. The helper script `scripts/migrate.sh` replays them in lexical order against the configured database.

## Apply Migrations Locally
```bash
export DATABASE_URL=postgresql://taskr:taskr@localhost:5432/taskr
./scripts/migrate.sh
```

## Creating a New Migration
1. Create a new SQL file with a sequential prefix, e.g. `services/api/migrations/0002_add_indexes.sql`.
2. Write idempotent SQL (use `IF NOT EXISTS` guards where possible).
3. Update related models in `services/api/src/app/models/`.
4. Document schema changes in `docs/design/data-model.md`.

## Rolling Back
Rollback scripts are not generated automatically. If a migration needs reversal, author a complementary script (e.g. `0002_add_indexes_down.sql`) and document the manual steps in this runbook.

## Deployment Checklist
- [ ] Database URL configured via environment variables.
- [ ] Backup taken for production environments.
- [ ] Migration reviewed for tenant isolation impacts.
- [ ] `scripts/migrate.sh` executed as part of deployment.
