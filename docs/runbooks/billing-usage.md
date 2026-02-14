# Billing Usage & Feature Tier Smoke Checks

_Last updated: 2025-10-06

## Prerequisites
- TaskR API running locally (via `make up` or `uvicorn`)
- Python virtualenv bootstrapped in `labs.nosync/platform/taskR/.venv`
- Tenant slug or UUID you want to exercise

## 1. Verify current subscription state
```
make billing-console ARGS="--base-url http://localhost:8010 --tenant <tenant> plan"
```
Expect JSON containing `plan_slug`, `status`, and the resolved `features` set.

## 2. Flip plan tiers
```
make billing-console ARGS="--base-url http://localhost:8010 --tenant <tenant> set-plan --plan starter"
make billing-console ARGS="--base-url http://localhost:8010 --tenant <tenant> set-plan --plan growth"
```
After each change, re-run the `plan` subcommand to confirm the effective feature set updates.

## 3. Enable/disable feature overrides
```
make billing-console ARGS="--base-url http://localhost:8010 --tenant <tenant> set-override --feature flows.core"
make billing-console ARGS="--base-url http://localhost:8010 --tenant <tenant> overrides"
make billing-console ARGS="--base-url http://localhost:8010 --tenant <tenant> delete-override --feature flows.core"
```
These calls should add/remove entries under `/admin/subscription/features` and immediately influence the `plan` output.

## 4. Confirm gated APIs respect tiers
- With `starter` plan (no override), call the flows run endpoint:
  - `curl -H "x-tenant-id: <tenant>" http://localhost:8010/flows/templates/foo/run` → expect `403`.
- Re-enable the `flows.core` override and retry → expect `201`.

## 5. Download usage report
```
make billing-export ARGS="--taskr-url http://localhost:8010 --tenant <tenant> --days 7 --output usage.csv"
```
Open the generated CSV and confirm rows contain tenant metadata plus per-day counts. Without `billing.export`, the endpoint returns `403`.

## 6. Clean up overrides (optional)
```
make billing-console ARGS="--base-url http://localhost:8010 --tenant <tenant> overrides"
```
Ensure no temporary overrides remain unless needed for manual testing.

## Troubleshooting
- `403` on plan/override endpoints → ensure `x-tenant-id` header matches an existing tenant and your auth token (if required) is valid.
- `403` on `/admin/usage/export` with `growth` plan → verify `billing.export` feature appears in the plan output.
- Async tests failing locally → recreate the venv with Python 3.12 (`python3.12 -m venv .venv`) and re-install requirements: `cd services/api && ../../.venv/bin/pip install -r requirements.txt`.
