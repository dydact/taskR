# Dydact Platform Authentication & Tenant Contract (Mirror)

Canonical copy: `platform/docs/platform/auth-contract.md`. Update the master first and mirror changes here when needed.

## Headers
- `x-tenant-id`: canonical tenant identifier (slug or UUID). Required on every request.
- `x-scr-tenant`: legacy header accepted for backwards compatibility. **Gateway normalizes** by copying its value to `x-tenant-id`.
- `x-request-id`: optional; gateway injects when missing.
- `idempotency-key`: optional header for write operations.

## JWT Requirements
- Bearer token issued by Dydact identity service.
- Minimum claims:
  - `tid`: tenant identifier (matches `x-tenant-id`).
  - `sub`: global user UUID.
  - `email`: user email.
  - `roles`: array of role strings.
  - `permissions`: array of granted permissions.
  - `org` (optional): global organization ID.
- Tokens without matching `tid` must be rejected.
- Services may set `SERVICE_AUTH_TOKEN` for trusted automation traffic when user JWT is unavailable.

## Middleware Expectations
- All FastAPI services must call `common_auth.add_tenant_middleware(app)` and use `get_tenant_headers` dependency.
- Slim/PHP services should accept both `X-SCR-Tenant` and `x-tenant-id`, logging warnings when only the legacy header is supplied.
- Gateway reverse proxies normalize headers (dual-read/single-write) before requests reach services.

## Database Hooks
- Tables exposing user identity should include `global_user_id` (maps to JWT `sub`).
- Tenant tables may include `global_org_id` to align with cross-app organizations.

## Testing Checklist
1. Missing `x-tenant-id` → 400.
2. Header present but tenant not found → 404.
3. Header + JWT mismatch → 403.
4. Request with only `X-SCR-Tenant` passes once shim is active.
5. Service token-protected endpoints reject invalid `x-service-token`.

## Rollout Notes
- Monitor gateway logs for frequency of uppercase-only headers to determine deprecation timeline.
- Update documentation and SDKs as new claims/headers are introduced.
