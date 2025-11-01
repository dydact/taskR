# TaskR Shell & Navigation Spec (M1 Deliverable Draft)

Date: 2025-02-14  
Owner: Codex (GPT-5)  
Reviewers: Design Systems, Front-End Platform, AI Experience, Product

## 1. Goals
- Recreate ClickUp’s polished shell (gradient header, segmented view controls, nested sidebar) while integrating Dydact AI quick actions and insight rail.
- Provide a build-ready specification for engineering (layout tokens, state behavior, accessibility).

## 2. Layout Overview

```
┌──────────────────────────────────────────────────────────────┐
│ Top Bar (64px)                                                │
│ ├─ Left: Workspace switcher pill, breadcrumb                  │
│ ├─ Center: Segmented view switcher (List, Board, Calendar…)   │
│ └─ Right: Search, Quick Create (+), Automation launcher ⚡,    │
│          Notification bell, Profile avatar, AI beacon         │
├──────────────────────────────────────────────────────────────┤
│ Nested Sidebar (270px) │ Main Workspace Canvas (flex)        │
│                        │ ├─ Primary content (view dependent) │
│ - Global nav (Home,    │ ├─ Right rail (toggle)              │
│   Inbox, Goals…)       │                                      │
│ - Resources (Timesheet)│                                      │
│ - Spaces (multi-level) │                                      │
│   • Space chip         │                                      │
│   • Hover quick menu   │                                      │
│   • AI indicator       │                                      │
│ - Shortcuts/Favorites  │                                      │
└──────────────────────────────────────────────────────────────┘
```

## 3. Visual Tokens

| Token | Value | Notes |
| --- | --- | --- |
| `shell.bg.gradient` | linear-gradient(135deg, #7937ff 0%, #2b8bf5 45%, #0d1222 100%) | Desktop default; lighten for standalone light mode |
| `shell.surface` | rgba(17, 25, 41, 0.75) | Used for floating nav rail + rails |
| `shell.radius.large` | 20px | Navigation rail, command bar |
| `shell.radius.small` | 12px | Menu items, segmented controls |
| `shell.shadow.elevated` | 0 24px 56px rgba(9, 13, 24, 0.45) | Rail + floating elements |
| `shell.blur` | 18px | Background blur for glass surfaces |
| `shell.motion.default` | 180ms ease-out | Hover transitions, menu open |
| `shell.motion.drag` | 250ms ease-in-out | Sidebar expansion |

## 4. Top Bar Details

### 4.1 Workspace Switcher
- Pill with gradient border + avatar icon.
- States: default, hover (glow), active (expanded).  
- When clicked, reveals nested menu (see Section 6) listing recent workspaces and search.

### 4.2 Segmented View Switcher
- Items: List, Board, Calendar, Gantt, Dashboard, Docs (configurable per module).
- Each segment: pill button with icon + label; active state has gradient fill and subtle elevation animation (2px lift).
- Hotkeys: `Ctrl/Cmd+1..5`.
- AI quick action: if Dydact suggests a view change (e.g., “Board suits backlog”), a glowing dot appears on the recommended segment; clicking runs both view change and optional automation.

### 4.3 Quick Actions
- **Search:** command input (Cmd/Ctrl+K).  
- **Quick Create:** opens radial menu (task, doc, claim, automation).  
- **Automation Launcher (⚡):** brings up AI automation palette.  
- **Notification Bell:** toggles right rail.  
- **Profile:** user menu, settings, preferences.  
- **AI Beacon:** shows when agent has suggestion; clicking opens right rail with highlight.

## 5. Nested Sidebar

### 5.1 Sections
1. **Global** (`Home`, `Inbox`, `Goals`, etc.) – pinned top.
2. **Resources** (Timesheet, Workload, Team View).
3. **Spaces** – each with color-coded circle, gradient fill, nested lists/folders.
4. **Favorites/Shortcuts** – user-defined.

### 5.2 Interaction States
- Hover over space: reveals quick menu (•••) with options: open in new tab, rename, share, AI insight (“Summarize activity”), automation.  
- Nested lists slide open with 180ms ease-out animation.  
- Drag-and-drop reordering with gradient ghost.  
- AI indicator (dot) shows when agent has actionable insight for that space; hover preview displays snippet.

### 5.3 Accessibility
- Keyboard navigation: Tab/Shift+Tab for sections, Arrow keys to expand/collapse nested lists, Enter to open.  
- ARIA roles: `nav`, `tree`, `treeitem`, `group`.  
- Visible focus ring: 2px accent glow (#7c5cff) around item.

## 6. Context & Nested Menus

### 6.1 Right-Click / Overflow (•••)
- Structure:  
  ```
  ┌──────────────┐
  │ Open in new… │
  │ Duplicate    │
  │ Share…       │
  ├──────────────┤
  │ AI Suggestions ▶│
  └──────────────┘
  ```
- `AI Suggestions` opens submenu with recommended actions (e.g., “Draft weekly recap”, “Predict blockers”).  
- Icons differentiate human vs AI actions (sparkle icon for AI).  
- Animations: fade + slide-up (180ms), highlight on hover.  
- Accessibility: `menu`, `menuitem`, `aria-haspopup`, `aria-expanded`.

### 6.2 Workspace Switcher Menu
- Search bar on top, pinned favorites, recent spaces with gradient accent, quick action icons.  
- Supports filtering (⌘+F) and keyboard nav.

## 7. Right Insight Rail

- Width: 320px, collapsible.  
- Tabs: `Notifications`, `AI`, `Automations`.  
- Each item card uses gradient accent, standard card component.  
- Accept/Decline buttons for AI suggestions with inline feedback (thumbs).  
- Keyboard toggle: `Shift+N`.  
- Mobile behavior: slides over content.

## 8. Responsive Behavior

| Breakpoint | Top Bar | Sidebar | Right Rail |
| --- | --- | --- | --- |
| ≥1440 | Full layout, persistent right rail toggle | Lock width 270px | Optional |
| 1024–1439 | Sidebar collapsible (icon-only), right rail overlays | | |
| 768–1023 | Top bar condenses (overflow menu), sidebar hidden behind hamburger | Right rail overlays fullscreen |
| ≤767 | Mobile shell (bottom nav), top bar minimal | Right rail becomes modal |

## 9. Engineering Notes
- Components to build: `ShellLayout`, `TopBar`, `ViewSegmentedControl`, `NestedNav`, `RightInsightRail`, `QuickActionMenu`.  
- Token integration: existing `styles.css` to migrate to CSS variables sourced from token JSON.  
- Use React context for shell state (sidebar collapsed, right rail open, AI beacon).  
- Motion: use CSS transitions; avoid heavy JS for simple animations.  
- Integrate `@dnd-kit` for sidebar reordering; ensure drag handles follow spec.

## 10. Next Steps
- Finalize Figma components (Week 1).  
- Pair with FE team to estimate component build (Week 2).  
- Prepare interactive prototype for M1 usability testing.  
- Sync with AI team to define beacon states + menu copy.

---  
_Update this spec as adjustments are made during design-engineering collaboration._
