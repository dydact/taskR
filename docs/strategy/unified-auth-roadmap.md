# Unified Auth & Web3 Integration Brief

This brief summarizes the proposed unified authentication model for the Dydact
platform so planning agents can evaluate next steps. The intent is to converge
on a wallet-first, chain-issued identity that governs access across TaskR,
scrAIv, memPODS, and future services while enabling tokenized compute usage.

## 1. Current State

- TaskR, scrAIv, and memPODS rely on lightweight JWTs + `X-Tenant-Id` headers,
  issued per service. Secrets (Slack/Twilio webhooks, etc.) are stored directly
  in tenant config tables.
- The new TaskR notification APIs are implemented but blocked on unified auth
  to ensure channel credentials inherit a platform-wide policy.
- memPODS architecture already targets blockchain-backed authorization and
  compute accounting; TaskR should align with that direction.
- xOxO’s dedicated-agent stack (Exo, DeptX, Flow) continues to expose stable
  health/orchestration endpoints (`/health`, `/mesh/summary`, `/nodes/register`,
  `/enroll`, `/jobs/lease`, `/workflows/*`, `/compass/reviews`, `/plans/{id}`
  flows) matching the documented service matrix, so auth integration can assume
  those contracts when wiring device-bound credentials and namespace controls
  (`vNdydact/services/exo/main.py:1592`, `vNdydact/services/exo/main.py:1597`,
  `vNdydact/services/exo/main.py:1602`, `vNdydact/services/exo/main.py:1630`,
  `vNdydact/services/exo/main.py:1812`, `vNdydact/services/deptx/main.py:192`,
  `vNdydact/services/deptx/main.py:197`, `vNdydact/services/deptx/main.py:233`,
  `vNdydact/services/deptx/main.py:303`, `vNdydact/services/flow/main.py:184`,
  `vNdydact/services/flow/main.py:189`, `vNdydact/services/flow/main.py:258`,
  `vNdydact/services/flow/main.py:386`, `vNdydact/docs/runbooks/service_endpoints.md:20`,
  `vNdydact/docs/runbooks/service_endpoints.md:21`,
  `vNdydact/docs/runbooks/service_endpoints.md:22`,
  `vNdydact/docs/runbooks/service_endpoints.md:23`,
  `vNdydact/docs/runbooks/service_endpoints.md:24`,
  `vNdydact/docs/runbooks/service_endpoints.md:25`,
  `vNdydact/docs/runbooks/service_endpoints.md:26`,
  `vNdydact/docs/runbooks/service_endpoints.md:27`,
  `vNdydact/docs/runbooks/service_endpoints.md:28`,
  `vNdydact/docs/runbooks/service_endpoints.md:29`,
  `vNdydact/docs/runbooks/service_endpoints.md:30`,
  `vNdydact/docs/runbooks/service_endpoints.md:31`,
  `vNdydact/docs/runbooks/service_endpoints.md:32`).

## 2. Objectives

1. **Single Source of Identity**  
   Mint a “Dydact Access Token” (DAT) on-chain when a user onboard. Token must
   encode tenant, user address, scopes, and expiry while supporting key
   rotation/revocation.

2. **Auth Gateway**  
   Deploy `auth.dydact.io` that verifies web3 signatures, mints short-lived
   JWT/structured tokens, and injects canonical headers for all downstream
   services (`Authorization`, `X-Tenant-Id`, `X-User-Id`, `X-Scopes`,
   `X-Token-Balance`) while remaining namespace-aware (`.io` public lane vs
   `.dydact` private lane).

3. **Tokenized Compute**  
   Establish a phased ledger: start with off-chain credits tied to DAT metadata,
   fold in stablecoin rails (e.g., USDT) as balances mature, and defer
   speculative ownership rights until securities counsel approves. Gateway
   attaches balance + allotments; services debit usage (memPODS queries,
   automation runs, notifications throughput) and apply environmental or carbon
   fees transparently.

4. **Hardware Root of Trust**  
   Bind DAT issuance to hardware-backed credentials (WebAuthn/FIDO2, TPM, Secure
   Enclave) so device-bound access and future hardware tokens integrate without
   redesigning the auth plane.

5. **Consistent Policy Enforcement**  
   Replace service-specific auth with `common_auth` adapters that validate the
   gateway signature, map scopes to RBAC, and mask sensitive data in responses.

6. **Auditability**  
   Ensure events, logs, and memPODS dossiers capture wallet IDs so every action
   is traceable on-chain or in downstream audit anchors.

## Dual Namespace Strategy

- Keep marketing, docs, email, and initial OAuth flows on `*.dydact.io` to
  preserve universal reach, browser trust, and deliverability.
- Issue premium access under the Handshake-backed `.dydact` namespace, resolved
  through bundled HDNS/Fingertip clients, and require mTLS + device attestation
  for every `.dydact` request (including `platform.dydact`).
- Provide gateway fallbacks (`*.dydact.hns.to`) strictly for shareable,
  read-only previews; canonicalize SEO and deep links to `.dydact.io`.
- Keep resolver enrollment and namespace assignment within the upgrade flow so
  the same DAT drives access policies across both lanes.

## 3. Architecture Overview

1. User authenticates on the public lane (`*.dydact.io`), connects wallet, and
   signs challenge against `auth.dydact.io`.  
2. Gateway verifies on-chain contract, binds the DAT to a hardware-backed
   credential, provisions resolver configuration/.dydact policy manifest, and
   issues short-lived JWT (or MAC token) plus an mTLS client cert for the device.  
3. Device activates resolver (HDNS or trustless) and establishes mTLS session to
   `.dydact` services; gateway forwards namespace-tagged requests via API mesh.  
4. Services read scopes, tenant, token balance; authorize config writes,
   notifications, memPODS access; apply namespace-specific policy.  
5. Billing/compute microservice debits balance post request, logs usage, and
   emits audit events.

## 4. Integration Steps

1. **Inventory & Alignment**
   - Catalogue existing auth flows in TaskR, scrAIv, memPODS, ToolFront.
   - Define required claims/signatures and update common libraries.

2. **Namespace & Resolver Readiness**
   - Bundle HDNS/DoH resolver profiles and trustless options (Fingertip/hnsd) in
     desktop/mobile apps.
   - Document gateway fallbacks and ensure the auth gateway can distinguish
     `.io` vs `.dydact` origins when issuing tokens.
   - Publish initial `.dydact` policy manifests and resolver pinsets.

3. **Chain Contract Design**
   - Implement DAT contract with metadata (tenant ID, wallet, scopes, expiry,
     balance).
   - Plan custody rules (hot wallet vs user-managed) and recovery procedures.

4. **Gateway Build**
   - Challenge/response endpoints, token issuance, refresh, revocation.
   - mTLS or East-West auth between gateway and services.
   - Integrate compute credit checks and eventing to billing/mempods.

5. **Service Refactors**
   - Update `common_auth` to validate gateway tokens, consume scopes, mask
     secrets in new notification APIs.
   - Introduce per-scope guards (e.g., `config.write`, `notifications.write`,
     `memories.query`).

6. **Migration Plan**
   - Run gateway in shadow mode, mint DATs for current users, map to TaskR
     tenants, compare claims vs legacy JWTs.
   - Provide tooling to top-up tokens for compute (initial airdrop).

7. **Observability**
   - Dashboard for auth failures, token balances, compute debit trends.
   - Alerts when balances fall below thresholds.

8. **Documentation & Runbooks**
   - Update service endpoint reference and runbooks with new headers/flow.
   - Provide integration guide for agents and third-party services.

9. **Dedicated Agent Alignment**
   - Finalize shared assignment schema updates in `vNdydact/packages/common_agents` so
     Exo/DeptX/Flow can issue reservations with the new namespace-aware auth
     payloads (`docs/reports/exo_dedicated_agent_gaps.md:1`,
     `docs/plans/exo_dedicated_agents_and_xoxo_panel.md:1`,
     `docs/plans/exo_dedicated_agents_and_xoxo_panel.md:82`).
   - Wire Exo events and DeptX persistence hooks to honor DAT balances and
     hardware-bound identities once TaskR UI signals its payload contract.

## 5. Dependencies & Risks

- memPODS design notes indicate readiness for token-based access. Ensure the
  roadmap stays aligned so the same JWT library and scopes apply.
- Need a secure storage mechanism for secrets during migration (could leverage
  the same chain + vault combination).
- Rollout requires close coordination with front-end clients (wallet UX) and
  mobile apps if applicable.
- Billing/compute microservices must be ready to charge balances prior to
  gateway go-live.
- Policy, financial, and environmental claims must clear MSB/CASP regulations,
  app-store crypto policies, and carbon accounting substantiation before tokens
  or fees are marketed.
- Dedicated-agent deliverables (reservation contract, lifecycle, xOxO control
  panel UX) depend on TaskR UI sign-off and on wiring the shared assignment
  schema with the unified auth headers (`docs/plans/exo_dedicated_agents_and_xoxo_panel.md:1`,
  `docs/plans/exo_dedicated_agents_and_xoxo_panel.md:82`).

## 6. Immediate Actions

1. Assemble requirements from memPODS, TaskR, scrAIv architects and confirm
   scope list (compute, knowledge, automation, config).  
2. Draft DAT smart contract spec and threat model.  
3. Stand up an auth gateway prototype with challenge verification, integrate
   TaskR staging to exercise `/tenant/config/notifications` behind unified auth.  
4. Iterate with ops on account migration, monitoring, and wallet recovery flow.
5. Coordinate with the xOxO dedicated-agent initiative to land the shared
   assignment schema, Exo event wiring, DeptX persistence work, and Flow plan
   updates so agents can reuse DAT-bound reservations when the UI is ready
   (`docs/reports/exo_dedicated_agent_gaps.md:1`,
   `docs/plans/exo_dedicated_agents_and_xoxo_panel.md:82`).

## 7. References

- `docs/taskR-build-plan.md` — TaskR roadmap with notifications milestone.
- `docs/runbooks/taskr-notifications.md` — Current runbook outlining channel
  configuration (note gating on unified auth).
- memPODS internal design notes (referenced in TaskR plan) for blockchain
  alignment.
- `docs/reports/exo_dedicated_agent_gaps.md` — Outstanding schema/API work for
  Exo, DeptX, Flow, and TaskR.
- `docs/plans/exo_dedicated_agents_and_xoxo_panel.md` — Reservation contract,
  lifecycle, xOxO control panel specification.

---

This document should be consumed by the master agent before planning cross-team
auth work so TaskR’s notification feature, memPODS access, and future compute
markets launch on a shared security model.
