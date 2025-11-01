# TaskR Product Charter (v0.1)

Date: 2025-02-14  
Owner: Codex (GPT-5)  
Stakeholders: Platform PM, Operations PM, scrAIv PM, Engineering Leads

## 1. Mission
Deliver TaskR as the agentic operations cockpit for knowledge-heavy teams—uniting task execution, analytics, and AI-assisted workflows—while remaining decoupled from scrAIv’s EMR stack. TaskR must thrive as:
- **Standalone SaaS** for non-clinical organizations seeking AI-native task/project automation.
- **Companion module** for scrAIv customers requiring deep claims or clinical integrations.

## 2. Target Segments & Personas
| Persona | Segment | Core Jobs | Pain Points Today | Key Wins |
| --- | --- | --- | --- | --- |
| **Revenue Ops Lead** | RCM & billing teams (healthcare, insurance) | Monitor claims/tickets, coordinate follow-ups, report throughput | Fragmented data across portals, slow status visibility, manual escalations | Unified claim timeline, AI summaries, automation triggers for follow-up |
| **Operations Director** | General SMB/enterprise ops | Orchestrate projects, assign work, enforce SLAs, view KPIs | Tool sprawl, static dashboards, no AI copiloting | AI-driven insights, dynamic dashboards, agentic workflows |
| **Service Agency Owner** | Marketing/consulting agencies | Manage clients, resource calendars, deliverables | Limited automation, weak knowledge reuse | Command palette, smart scheduling, knowledge linking, client-ready reporting |
| **HR/People Ops Manager** | Internal ops | Track timesheets, payroll, meetings, compliance | Manual exports, siloed HR data, limited AI support | Integrated HR view, autopilot summaries, export-ready reports |

## 3. Product Pillars
1. **Adaptive Workspaces:** Modular surfaces (List, Board, Timeline, Timeline Ribbon, Dashboard) configurable per space with density, splits, and favorites.
2. **Agentic Assistance:** Command palette, conversational chat, and background agents (deptx flows) that convert context into actions while capturing audit trails.
3. **Unified Intelligence:** Live analytics, health scoring, and digest pipelines spanning tasks, claims, HR, and automations.
4. **Extensible Platform:** API-first architecture, integration slots, and modular feature flags enabling TaskR-only deployments or scrAIv-augmented bundles.

## 4. Capability Matrix (TaskR Standalone vs TaskR+scrAIv)
| Capability | TaskR Standalone | TaskR + scrAIv | Notes |
| --- | --- | --- | --- |
| Core task/project management | ✅ Full | ✅ Shared | Same data model; scrAIv adds clinical contexts. |
| Claims workspace | ✅ Light (optional addon) | ✅ Deep integration | Standalone uses clearinghouse APIs; scrAIv taps EMR + EDI pipelines. |
| HR/time tracking | ✅ Built-in module | ✅ Shared | scrAIv may enrich with clinical staffing metrics. |
| AI Command palette & chat | ✅ | ✅ | Same AI substrate; model routing may differ by tenant policy. |
| Automations (deptx) | ✅ pluggable | ✅ pre-wired | Provide template packs for standalone customers. |
| EMR/Clinical data | 🚫 | ✅ | Keep clinical/PHI modules behind scrAIv boundary. |
| Compliance (HIPAA, PHI) | Baseline SOC2-ready | HIPAA/PHI controls via scrAIv | Drive modular policy engine. |
| Integrations marketplace | ✅ Third-party connectors | ✅ + scrAIv native tools | Expose extension slots for partners. |

## 5. Strategic Guardrails
- **Modularization:** Ensure every major feature (claims, HR, dashboards, automations) can be toggled per tenant. Shared services must detect TaskR-only tenants to avoid scrAIv assumptions.
- **Data Isolation:** Multi-tenant posture with hard boundaries between TaskR data, scrAIv EMR data, and shared identity providers.
- **AI Safety:** Reuse preference/guardrail infrastructure; default safer model profiles for TaskR standalone until trust is earned.
- **Scalability:** Design to host mid-market accounts (hundreds of users, millions of tasks/claims) without requiring scrAIv infrastructure.

## 6. Success Metrics (First 12 Months)
- 90-day activation: ≥70% of invited users execute an AI-assisted action (command palette, agent, summary).
- Task resolution velocity: +30% improvement in pilot cohorts (measured via throughput widgets).
- Claims module attachment rate: ≥60% of scrAIv customers adopt TaskR claims; ≥25% of standalone customers enable claims lite.
- Support tickets per tenant: <0.5/month post onboarding, driven by in-product guidance.
- NPS: ≥40 across target segments.

## 7. Immediate Next Steps (Feeds Milestones)
1. Finalize platform topology & domain map (Milestone M0).  
2. Define feature flag matrix and tenancy model for TaskR vs scrAIv modules.  
3. Align engineering squads around pillar ownership (Workspaces, Intelligence, AI/Automation, Platform).  
4. Validate charter with GTM and Operations leadership; capture assumptions for iterative refinement.
