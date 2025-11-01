# M1 Shell Prototype – Usability Test Plan

Date: 2025-02-14  
Owner: Codex (GPT-5)  
Research Partner: Product Research Team

## 1. Study Overview
- **Objective:** Validate that the redesigned shell (top bar, nested navigation, AI beacon/insight rail) improves discoverability and efficiency compared to current TaskR UI and meets ClickUp parity expectations.
- **Prototype:** Figma interactive prototype covering navigation rail, view switcher, quick actions, insight rail interactions.
- **Participants:** 6–8 participants (mix of existing TaskR users and ClickUp power users).  
  • 3 Revenue Ops / Claims specialists  
  • 2 Agency ops managers  
  • 1 Design or PM who frequently uses ClickUp  
  • Bonus: 2 internal stakeholders for pilot runs
- **Duration:** 30 minutes per session (remote moderated).

## 2. Key Metrics
- **Task Completion Time:**  
  • Navigation to specified space/list (<30s target).  
  • Switching view via segmented control (<20s).  
  • Opening AI insight rail (<15s).  
- **Error Rate:** Number of mis-clicks or wrong paths per task (target ≤2).  
- **System Usability Scale (SUS):** Post-session questionnaire (target ≥80).  
- **Qualitative:** Confidence ratings (1–5) after each scenario; highlight AI beacon clarity and nested menu comprehension.

## 3. Tasks & Scenarios

| Task ID | Scenario | Success Criteria | Notes |
| --- | --- | --- | --- |
| T1 | “You’re asked to review the Marketing space backlog. Navigate to the Marketing → Campaigns list.” | Participant expands spaces, selects Marketing, opens child list without assistance | 1 retry allowed |
| T2 | “Switch to the Board view for the same list.” | Uses segmented control or keyboard shortcut; board view indicator highlights | Timing recorded |
| T3 | “An AI beacon appears. Discover what it suggests and decide whether to accept the recommendation.” | Participant clicks AI beacon, opens insight rail, reads suggestion, chooses Accept/Decline, gives rationale | Capture sentiment about clarity |
| T4 | “Use the quick create button to add a new task assigned to yourself.” | Opens quick create, fills minimal info, completes flow | Validate modal/usability |
| T5 | “Open the workspace switcher and jump to HR → Timesheets.” | Workspace switcher used effectively; participant reports ease/difficulty | Evaluate menu search |
| T6 (stretch) | “From the notification rail, locate the latest automation alert and review details.” | Participant toggles notifications tab, views details | Optional depending on session time |

## 4. Discussion Guide (Summary)
1. **Warm-up (3 min):** Current tool usage (TaskR/ClickUp familiarity).  
2. **Prototype tasks (20 min):** Follow tasks T1–T5 (+ T6 if time).  
3. **Wrap-up (7 min):**  
   - Overall impressions (“How does this compare to ClickUp?”).  
   - Feedback on AI beacon/insight rail clarity.  
   - Preferences for nested menu behavior, quick actions.  
   - SUS questionnaire + open-ended comments.

Detailed script to be stored in `/docs/design/research/guides/m1-shell-usability.md` (to be created).

## 5. Logistics
- **Tools:** Zoom + screen share recording; FigJam for notes; Figma prototype.  
- **Recording Storage:** Secure drive per privacy guidelines.  
- **Scheduling:** Use `#taskr-ux-research` Slack channel & Calendly link.  
- **Data Capture:** Observers log time-on-task, errors, notable quotes. Use shared Google Sheet or Airtable.

## 6. Analysis Plan
- Aggregate quantitative metrics (time, errors, SUS).  
- Thematic analysis for qualitative feedback (navigation, AI clarity, aesthetics).  
- Compare results with baseline (current TaskR metrics if available).  
- Present findings in milestone readout (`/docs/design/research/findings/m1-shell-usability.md`).

## 7. Timeline
- **Week 2:** Finalize prototype, pilot session (internal).  
- **Week 3:** Conduct sessions (6–8 participants).  
- **Week 4:** Synthesize findings, share with design + engineering; adjust spec if needed.

## 8. Risks & Mitigations
- **Prototype fidelity limitations:** Ensure key interactions (hover menus, AI beacon) are sufficiently interactive; supplement with scripted verbal cues if needed.  
- **Participant availability:** Recruit early; keep backup participants.  
- **Learning curve:** Provide short orientation to maintain realism but avoid over-instruction.

---  
_Update this plan with final recruitment list, scheduling details, and script references before sessions commence._
