# TaskR M1 Component Backlog & Build Plan

Date: 2025-02-14  
Owner: Codex (GPT-5)  
Audience: Front-End Platform, Design Systems, AI Experience

## Overview
This backlog enumerates the components and implementation steps required to ship the new shell/navigation experience defined in `docs/design/taskr-shell-spec.md`. Target delivery spans Weeks 1-3 (M1). Prioritize in the order listed unless dependencies dictate otherwise.

## 1. Component Inventory

| ID | Component | Description | Priority | Notes |
| --- | --- | --- | --- | --- |
| C1 | `ShellLayout` | Grid container handling top bar, nav rail, right rail, responsive breakpoints | P0 | Base for all other work; includes context for shell state |
| C2 | `TopBar` | Gradient header bar with view segmented control & quick actions | P0 | Integrates `ViewSegmentedControl`, `QuickActionCluster`, `AIBeacon` |
| C3 | `ViewSegmentedControl` | Pill-based toggle for List/Board/Calendar/etc. with AI indicator | P0 | Reusable across views; supports keyboard shortcuts |
| C4 | `QuickActionCluster` | Search, Quick Create, Automation, Notifications, Profile | P1 | Connects to existing command palette & modals |
| C5 | `NestedNavigationRail` | Multi-level sidebar with collapsible groups, hover quick menu, drag reorder | P0 | Leverages `@dnd-kit`; includes AI insight indicator |
| C6 | `NavQuickMenu` | Context menu (•••) for nav items with AI suggestions submenu | P1 | Pattern reused for workspace switcher & context menus |
| C7 | `WorkspaceSwitcher` | Pill + dropdown listing recent/favorite workspaces | P1 | Invoked from top bar; uses same nested menu pattern |
| C8 | `InsightRail` | Right-side rail with tabs (Notifications, AI, Automations) | P0 | Tied to Dydact AI events; toggle via bell icon |
| C9 | `AIBeacon` | Indicator pill for AI suggestions (top bar & nav) | P1 | Shares state with InsightRail |
| C10 | `ResponsiveControls` | Hook/util managing breakpoints, collapsed states | P1 | Provide context to ShellLayout and components |

## 2. Implementation Sequencing

1. **Token groundwork** (FE + Design Systems)  
   - Import M1 token set (spacing, gradients, shadows) into CSS variables.  
   - Update global styles to allow gradient backgrounds & glass surfaces.

2. **ShellLayout + ResponsiveControls** (C1, C10)  
   - Build flex/grid container, integrate context (sidebar collapsed, rail toggle).  
   - Implement breakpoints per spec (≥1440, 1024–1439, etc.).

3. **NestedNavigationRail** (C5)  
   - Render sections (Global, Resources, Spaces, Favorites).  
   - Add collapsible groups, hover quick menu placeholder.  
   - Integrate drag-and-drop for space reordering (DnD-kit).  
   - Add AI beacon placeholder and accessibility roles.

4. **TopBar** (C2)  
   - Setup gradient background, layout for left/center/right zones.  
   - Insert `WorkspaceSwitcher` placeholder and segmented control stub.

5. **ViewSegmentedControl** (C3)  
   - Build pill toggle with icons, active/inactive states, transitions.  
   - Connect to view state (list/board/calendar); add keyboard shortcuts.

6. **QuickActionCluster + AIBeacon** (C4, C9)**  
   - Implement Search (existing command palette trigger), Quick Create (modal), Automation (new panel), Notification (toggle rail), Profile.  
   - Integrate AI beacon state (if AI suggestions present).

7. **WorkspaceSwitcher & NavQuickMenu** (C6, C7)  
   - Build dropdown with search field, favorites, recent items.  
   - Implement menu pattern with AI suggestions submenu, keyboard nav.

8. **InsightRail** (C8)  
   - Create tabbed rail (Notifications, AI, Automations).  
   - Bind to shell context and Dydact event streams (placeholder data).  
   - Ensure toggling from top bar and keyboard (`Shift+N`).

9. **Polish & Integration**  
   - Hook up AI beacon to InsightRail events.  
   - Wire nav quick menus to actual actions (share, AI summarise).  
   - Run accessibility audit (focus order, ARIA).  
   - Document usage in Storybook.

## 3. Engineering Handoff Notes
- **State Management:** Use React context or Zustand store for shell state; ensure SSR compatibility.  
- **Accessibility:** Follow ARIA patterns for `tree` (sidebar), `menu`, `menuitem`. Include focus outlines and keyboard shortcuts.  
- **Performance:** Defer heavy data fetching in InsightRail; use skeletons for initial load.  
- **Testing:**  
  - Unit tests for segmented control (view switching, keyboard).  
  - Integration tests for nav collapse/expand, quick menu toggles.  
  - Visual regression snapshots (Chromatic) for shell layout.  
- **Telemetry:** Add events for nav interactions, view switching, AI beacon clicks (tie into analytics backlog).

## 4. Design Deliverables Checklist
- [ ] Figma components updated with final states + annotations.  
- [ ] Storybook stories stubbed for each component prior to implementation.  
- [ ] Copy for AI suggestions / quick menus reviewed with Content.  
- [ ] Accessibility acceptance criteria documented.

## 5. Risks & Mitigations
- **Complexity of nested menus:** align with existing design systems to avoid bespoke logic; create reusable menu component.  
- **AI beacon state management:** coordinate with AI team for event schema; stub placeholder data for early development.  
- **Performance with gradients/blur:** leverage CSS GPU-friendly properties; profile after implementation.

## 6. Next Actions
1. FE leads estimate component build effort (C1–C8).  
2. Design Systems confirm token availability.  
3. AI team deliver event schema for InsightRail & beacon.  
4. Schedule engineering kickoff to review spec & backlog.
