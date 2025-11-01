# TaskR M2 Storybook Coverage Plan

Date: 2025-02-14  
Owner: Codex (GPT-5)  
Audience: Front-End Platform, QA, Design Systems

## 1. Purpose
Track Storybook stories required to support the M2 component system (tokens + core components) and ensure visual regression coverage. Each story should reference its design spec (Figma frame, documentation) and support controls for interactive states.

## 2. Story Index

| Component | Story File | Controls / Args | States | Linked Spec |
| --- | --- | --- | --- | --- |
| Task Card | `components/task/TaskCard.stories.tsx` | status, assignees, AI suggestion toggle, automation badge | default, hover, selected, dragging | Task Card (Figma > TaskR Components) |
| Board Column | `components/board/Column.stories.tsx` | WIP count, AI badge, automation chip | collapsed, expanded | Workspace Kit – Board |
| Status Pill | `components/common/StatusPill.stories.tsx` | status type, size, withCounter, aiRecommendation | default, hover, focused | Status Pill spec |
| Nested Menu | `components/menus/NestedMenu.stories.tsx` | depth, includeAISection, keyboardFocus | default, submenu open, keyboard nav | Nested Menu spec |
| View Segmented Control | `components/navigation/ViewSegmentedControl.stories.tsx` | active view, aiIndicator, disabled views | default, AI recommended | Shell spec |
| Navigation Rail | `components/navigation/NestedNavigationRail.stories.tsx` | collapsed, highlightSpace, aiIndicator | default, hover (space), drag | Shell spec |
| Workspace Switcher | `components/navigation/WorkspaceSwitcher.stories.tsx` | favorites, recents, searchTerm | default, search results, AI suggestion | Shell spec |
| Insight Rail Card | `components/insight/InsightCard.stories.tsx` | type (notification/AI/automation), status, CTAs | default, hover, expanded | Insight Rail guidelines |
| Toast | `components/feedback/Toast.stories.tsx` | severity, message, aiSuggestion, actions | info, success, warning, error | Toast guideline |
| Skeleton Loaders | `components/feedback/Skeleton.stories.tsx` | variant (card/list/row/timeline) | default, animated | Component guidelines |

## 3. Implementation Notes
- **Controls:** Use Storybook Controls to toggle AI-related props (suggestion, automation).  
- **Docs Tab:** Provide usage guidance, code snippets, and Figma link via design tokens panel.  
- **Accessibility:** Add `play` function stories to test keyboard navigation (e.g., nested menu).  
- **Visual Regression:** Enable Chromatic snapshots for each story (key states).  
- **Theming:** Add story-level decorators to demonstrate light/dark themes and high-contrast mode.

## 4. Tasks & Owners (Suggested)
- FE Dev A: TaskCard, Board Column, Status Pill.  
- FE Dev B: ViewSegmentedControl, NavigationRail, WorkspaceSwitcher.  
- FE Dev C: NestedMenu, InsightRail, Toast.  
- QA: Configure Chromatic thresholds and review.  
- Design Systems: Verify token usage in stories.

## 5. Timeline
- Week 2: Scaffold stories with placeholder data.  
- Week 3: Connect to real components and tokens after implementation.  
- Week 4: Run final Chromatic baseline and sign off with Design Systems.

---  
_Update this map as additional components or states are added to the M2 scope._
