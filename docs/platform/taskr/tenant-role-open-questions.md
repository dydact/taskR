# Tenant & Role Specification – Outstanding Questions

Date: 2025-02-14  
Owner: Codex (GPT-5)

The upcoming unified API/client layer requires a completed Tenant & RBAC reference. The following questions remain unanswered and block finalization:

## 1. Tenant Hierarchy & Org Structure
- Do we support nested tenants (e.g., parent org with multiple subsidiaries) or a flat structure? How are cross-org access requests handled?
- What metadata accompanies a tenant (`billing_id`, `industry`, `feature_flags`, `regions`)?
- Are there legacy scrAIv tenants that must be migrated or shared between scrAIv and TaskR?

## 2. Workspace Ownership & Membership
- Are workspaces scoped strictly within a tenant, or can they span tenants (shared client projects)?
- How are workspace admins assigned? Do they inherit tenant admin rights automatically?
- What is the relationship between spaces, folders, lists, and role inheritance?

## 3. Role Definitions & Permissions
- Final list of roles (`tenant_admin`, `workspace_admin`, `contributor`, `viewer`, `automation_admin`, etc.) and the exact capabilities per API route. 
- How do roles map across TaskR and scrAIv (e.g., scrAIv clinical roles gaining claims access)?
- Can roles be customized per tenant (role templates/feature toggles), or do we ship a fixed matrix?

## 4. Feature Flags & Capabilities
- Which features are controlled at tenant level vs workspace level (claims, HR, automations, AI guardrail levels)?
- How are feature flags propagated to clients (in `/profile` response?) and enforced server-side?

## 5. Automation & AI Permissions
- Does accepting an AI suggestion or running an automation require explicit permissions? (e.g., `automation.run`, `ai.execute`)
- How do guardrail overrides interact with roles (who can bypass, who can approve)?

## 6. Audit & Compliance
- What audit events must be recorded for role changes, tenant feature toggles, automation activation? 
- Retention requirements for audit logs (per compliance standards). 

## 7. Migration & Legacy
- Are there existing scrAIv roles/permissions that need to be migrated or mapped to the new model?
- Timeline and process for migrating current TaskR beta tenants into the finalized schema.

## 8. API Enforcement Hooks
- Confirm middleware strategy for injecting `tenant_id`, `user_id`, and validating roles per request.
- Decide on error semantics when access denied (`403` vs `404` to obscure existence?).

**Action:** Coordinate with Platform PM + Identity team to answer the above. Document final matrix in a dedicated Tenant & Role spec and reference it from the API layer plan.
