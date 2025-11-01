# TaskR Component Visual Guidelines (M2 Draft)

Date: 2025-02-14  
Owner: Codex (GPT-5)  
Audience: Design Systems, Front-End Platform, AI Experience

## 1. Task Card (List & Board)

### Layout
- **Header:** status pill (left), title (primary text), quick actions (right).  
- **Body:** metadata rows (assignees, due date, tags, AI suggestions).  
- **Footer (optional):** progress bar, subtask count, automation badge.

### Style
- Background: `color.surface.100` with `shadow.card`.  
- Border: `color.border.muted`; hover adds gradient edge (2px) using `gradient.primary`.  
- Radius: `radius.md` (14px).  
- Avatars: 28px circle with subtle shadow.  
- Quick actions: icon buttons (24px) appearing on hover (fade-in 120ms).

### AI Enhancements
- AI suggestion chip (sparkle icon) sits below title when assistant recommends action.  
- Accept/Decline inline buttons appear on hover (right side).  
- Automation badge uses `gradient.secondary` with lightning icon.

### States
- Hover: elevate (translateY(-2px)), glow border, show quick actions.  
- Selected: outline with `gradient.primary`, maintain hover effects.  
- Dragging: scale 1.02, apply `motion.drag` easing.

## 2. Status Pill

### Structure
- Pill shape with icon + label (12px uppercase).  
- Optional counter bubble when aggregated (board columns).  
- Icon uses duotone version of status color.

### Styles per Status
- Background gradient: blend status color with `gradient.primary` at 45% opacity for hover state.  
- Text: `color.text.inverse`.  
- Borderless; rely on shadow for depth.

### Interaction
- Hover: lighten gradient, show tooltip with AI recommendation (if available).  
- Keyboard: accessible via `Tab`, toggles status change menu (arrow keys within).

## 3. Nested Menu (Context Menu, Workspace Switcher)

### Components
- **Menu Container:** glass surface, `radius.md`, drop shadow `shadow.card`.  
- **Menu Item:** 40px height, left icon (20px), label, right chevron if submenu.  
- **Submenu:** slides out with 160ms `motion.menu` (shift + fade).  
- **Group headers:** uppercase caption, tinted background (5% of accent color).

### AI Items
- Use sparkle icon, gradient text highlight (#7B3FFF → #2B8BF5).  
- Provide short description on right (secondary text).  
- Include “Powered by Dydact” inline in tooltip.

### Accessibility
- Use `role="menu"` and `aria-haspopup` for nested items.  
- Support keyboard navigation (Arrow keys, Enter, Esc).

## 4. View Segmented Control

- Container: glass pill with `radius.lg`, gradient stroke (1px).  
- Segment: 44px height, icon + label; active segment uses `gradient.primary` fill, 200ms slide animation for indicator background.  
- Hover: subtle glow, `motion.default`.  
- AI indicator: small pulsing dot at top-right of segment when suggestion available.

## 5. Insight Rail Cards

- Card layout: `radius.md`, background `color.surface.100`, accent stripe (4px) colored by event type (AI, automation, notification).  
- Icons: duotone with gradient overlay.  
- Accept/Decline buttons: pill style, ghost variant default, filled variant on hover for action emphasis.  
- Provide timestamp + source meta (claims, HR, task).

## 6. Notification Toast

- Max width 360px, `radius.md`, background `color.surface.100`, left border (4px) using gradient based on severity.  
- Includes icon, title, description, action button(s).  
- Entry animation: slide-in from bottom (180ms), exit fade-out (150ms).  
- AI-specific toasts include suggestion summary + “Open insight rail” secondary action.

## 7. Motion & Micro Interaction Summary
- Hover states: use 120–180ms easing for subtle responsiveness.  
- Drag: apply scale + drop shadow changes with `motion.drag`.  
- Menu open/close: `motion.menu` (ease-out).  
- AI beacon: pulsing animation using CSS keyframes; respect reduced motion preference.

## 8. Deliverables Checklist
- Update Figma component set with variants for task card, board card, nested menu.  
- Storybook stories per component with interactive knobs (status variants, AI toggles).  
- Accessibility annotations (focus order, ARIA labels).  
- Attach animation references (GIF or Lottie) for drag/hover/beacon states.

---  
_Update this document as component definitions evolve. Ensure development handoff includes links to the latest Figma frames and Storybook stories._
