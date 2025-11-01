# TaskR × ClickUp UI Benchmark (M0 Deliverable)

Date: 2025-02-14  
Owner: Codex (GPT-5)  
Contributors: Design Systems, Front-End Platform, AI Experience

## 1. Reference Assets
- **Figma Board:** _TaskR 2.0 UIX – ClickUp Alignment_ (link to be added after upload).  
- **ClickUp Inspiration Pack:** `/docs/design/reference/clickup/*` (screenshot set provided by Product).  
- **TaskR Current Screens:** Capture via latest Vite build (Claims, Tasks/List, Task/Board, Calendar placeholder, Dashboard, HR, Chat).

## 2. Shell & Navigation Benchmark

| Area | ClickUp Reference | TaskR Current | Gap / Notes | Action Ideas |
| --- | --- | --- | --- | --- |
| Global shell | Gradient header, pill view switcher, compact top-right actions | Dark glass header, command bar anchored at top, fewer gradients | Need gradient overlays and segmented controls to match polish | Define gradient tokens, add pill view toggle with accent border |
| Left navigation | Nested spaces, colored initials/avatars, hover quick menu, subtle separators | Spaces list with icons, limited nesting, no hover quick actions | Introduce multi-level nesting, colored badges, per-space contextual menu | Design `NestedNavigationRail` component with hover tray + AI beacon |
| Notification rail | ClickUp toggles collapse of docs/chat/tray | TaskR lacks persistent tray; AI insights separate per view | Build retractable rail for AI summaries, notifications, automations | Spec rail layout with quick filters + Dydact insights |

## 3. Core Workspace Patterns

| View | ClickUp Highlights | TaskR Current | Gaps | Enhancement Opportunities |
| --- | --- | --- | --- | --- |
| List | Group headers, status chips, assignee avatars inline, quick edit menu, gradient row hover | Table with standard cells, limited hover states, preference feedback buttons | Add grouped headers, inline avatars, status badges, hover quick menu, drag handles | Embed AI suggestion pill (e.g., “Summarize list”, “Prioritize risks”) |
| Board | Rounded cards, WIP counters, drag handles, subtask preview chips | Task cards exist but minimal styling; DnD via DnD-kit | Need card elevation, colored headers, quick action icons, WIP badge per column | Automations: column-level “Run assistant” chip, autopilot metrics |
| Calendar/Gantt | Drag-to-schedule, tinted cards, connecting lines, mini timeline overlay | Placeholder calendar view | Build gradient events, dot connectors, schedule autopilot hints | AI: “Auto-book time” suggestion, conflict indicator |
| Dashboard/Box | KPI cards with ring charts, stacked grids, hover tooltips | Dashboard widgets exist but styling is basic, no hover animation | Update cards with rounded gradient borders, add tooltip micro interactions | AI glimpses: anomaly alerts, predictive metrics, autopilot queue |
| Claims timeline | N/A in ClickUp; must blend timeline + detail | Claims view recently updated with timeline ribbon, summary rail | Ensure timeline nodes adopt gradient halo + interaction parity | Use timeline patterns as template for other modules |
| HR | ClickUp analog: workload/time tracking surfaces | TaskR HR view full-featured but UI not unified | Align card styling, menu patterns with shell updates | AI autopilot cues for overtime, payroll anomalies |

## 4. Micro Interactions & Motion Notes

| Interaction | ClickUp Behavior | TaskR Behavior | Gap | Direction |
| --- | --- | --- | --- | --- |
| Hover quick actions | Appears on list rows/cards; icons fade in | Only preference icons on list rows | Implement quick action cluster (edit, assign, AI) with 150ms fade + slide | Include AI beacon if assistant suggests action |
| Drag handles | Subtle dots + color accent | Standard drag icon | Redesign handle with tinted gradient + haptic feedback in CSS | Add tooltip “Drag to reorder / assign automation” |
| Status chips | Vibrant gradients, pill shape, icon + label | Solid colors, minimal styling | Apply gradient backgrounds, drop shadows, iconography | Allow AI to recommend status change via pill | 
| Tooltips | Soft shadow, micro delay | Basic browser tooltips | Implement custom tooltip component with gradient border | Provide AI explanations in tooltips |

## 5. AI Enhancement Mapping

| Location | ClickUp Parity | Dydact AI Opportunity | Notes |
| --- | --- | --- | --- |
| Command palette | Quick actions, search, view switching | Add “Ask Dydact” section with natural language tasks, summarization, automation triggers | Must surface guardrail states visibly |
| Nested menus | Contextual actions (duplicate, move, comment) | Insert AI suggestions within menu (e.g., “Draft update”, “Predict risk”) | Use subtle icon + color to separate AI entries |
| Notification rail | Update feed | Stream AI events (autopilot suggestions, claims alerts) with ability to accept/decline inline | Provide undo + audit trail link |
| Board column footer | Add task | Provide “Generate tasks from goal” with AI, show automation queue metrics | Need copy guidance for success/failure |
| Calendar event | Drag to adjust | Offer AI reschedule recommendations, highlight conflicts | Use glowing connector to show recommendation path |

## 6. Research Plan Snapshot
- **Interviews (Weeks 1‑2):** Focus on navigation + personalization; 5 participants (existing TaskR + ClickUp power users).  
- **Usability Tests (Weeks 3‑4):** Evaluate shell prototype (M1 deliverable) with tasks: locate space, switch view, trigger AI suggestion.  
- **Analytics Setup:** Track current nav usage, command palette events, preference toggles (baseline).

## 7. Next Steps
1. Populate Figma board with annotated comparisons (Design team).  
2. Begin shell component exploration (NavigationRail, CommandBar) using this matrix.  
3. Coordinate with engineering to confirm token pipeline timeline (required for M1/M2).  
4. Schedule initial user interviews; capture notes in research tracker.

---  
_Document to be updated continually throughout M0 as additional findings emerge._
