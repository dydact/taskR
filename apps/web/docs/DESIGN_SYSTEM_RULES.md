# TaskR Design System Rules

## Overview
TaskR uses a dark, professional aesthetic with glass morphism effects, purple/blue accent colors, and careful attention to depth and hierarchy.

## Color Palette

### Background Colors
```css
--plane-bg: radial-gradient(circle at 20% 20%, rgba(76, 86, 219, 0.22) 0%, rgba(18, 23, 39, 0.9) 45%, #0b101b 100%)
--plane-bg-solid: #0f172a
--plane-surface: rgba(21, 27, 43, 0.72)
--plane-surface-elevated: rgba(30, 38, 58, 0.78)
--plane-surface-muted: rgba(18, 23, 35, 0.6)
--plane-sidebar: rgba(9, 13, 20, 0.82)
```

### Border Colors
```css
--plane-border: rgba(124, 136, 166, 0.18)
--plane-border-strong: rgba(142, 155, 190, 0.28)
--plane-glass-border: rgba(255, 255, 255, 0.08)
```

### Text Colors
```css
--plane-text: #f8fafc          /* Primary text */
--plane-text-soft: rgba(241, 245, 249, 0.7)  /* Secondary text */
--plane-muted: #94a3b8         /* Muted/disabled text */
```

### Accent Colors
| Name | Value | Usage |
|------|-------|-------|
| Accent | `#6c7bff` | Primary actions, active states, brand |
| Accent Soft | `rgba(108, 123, 255, 0.2)` | Subtle highlights |
| Success | `#4ad0a7` | Completed, approved, positive |
| Warning | `#f7b23b` | Pending, attention needed |
| Danger | `#ff6b6b` | Errors, destructive actions |
| Info | `#38bdf8` | Informational, links |

### Semantic Status Colors
For status badges, use 18% opacity background with 35% opacity border:
```css
/* Active/Accent */
color: var(--plane-accent);
border-color: rgba(108, 123, 255, 0.35);
background: rgba(108, 123, 255, 0.18);

/* Info/Pending */
color: var(--plane-info);
border-color: rgba(56, 189, 248, 0.35);
background: rgba(56, 189, 248, 0.18);

/* Warning/Paused */
color: var(--plane-warning);
border-color: rgba(247, 178, 59, 0.35);
background: rgba(247, 178, 59, 0.16);

/* Success/Completed */
color: var(--plane-success);
border-color: rgba(74, 208, 167, 0.35);
background: rgba(74, 208, 167, 0.16);

/* Danger/Failed */
color: var(--plane-danger);
border-color: rgba(255, 107, 107, 0.35);
background: rgba(255, 107, 107, 0.16);
```

---

## Typography

### Font Stack
```css
font-family: "InterVariable", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

### Type Scale
| Element | Size | Weight |
|---------|------|--------|
| H1 | 1.8rem | 600 |
| H2 | 1.4rem | 600 |
| H3 | 1.1rem | 600 |
| Body | 1rem | 400 |
| Small/Meta | 0.85rem | 400 |
| Caption | 0.75rem | 400 |
| Chip text | 0.72rem | 500 (uppercase, 0.07em tracking) |

---

## Glass Morphism

### Standard Glass Surface
```css
.glass-surface {
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  background: var(--plane-surface);
  border: 1px solid var(--plane-glass-border);
  box-shadow: var(--plane-shadow-strong);
}
```

### Shadow
```css
--plane-shadow-strong: 0 22px 55px rgba(6, 12, 24, 0.65)
```

### Tone Modifiers
Apply tone classes to glass surfaces for semantic coloring:
- `.tone-accent` - Purple border gradient
- `.tone-info` - Blue border gradient
- `.tone-success` - Green border gradient
- `.tone-warning` - Orange border gradient
- `.tone-danger` - Red border gradient
- `.tone-neutral` - Gray border gradient

---

## Border Radius

| Element | Radius |
|---------|--------|
| Full pill/chip | `999px` |
| Large card | `24px` |
| Medium card | `20px` |
| Panel | `18px` |
| Input/Select | `12px` |
| Small elements | `8px` |
| Handle/grip | `4px` |

---

## Spacing

Use 4px base unit:
- `4px` - Tight spacing (between chip elements)
- `8px` - Small gap
- `12px` - Medium gap
- `16px` - Standard gap
- `20px` - Panel padding
- `24px` - Section spacing
- `28px` - Large spacing

---

## Component Patterns

### Chips/Pills
```css
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  border: 1px solid rgba(148, 163, 184, 0.25);
  color: var(--plane-muted);
  background: rgba(15, 22, 35, 0.7);
}
```

### Status Badges
```css
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.7rem;
  /* Apply semantic colors based on status */
}
```

### Buttons
```css
/* Primary button */
.btn-primary {
  background: rgba(108, 123, 255, 0.18);
  color: #fff;
  border: 1px solid rgba(108, 123, 255, 0.35);
  border-radius: 999px;
  padding: 6px 16px;
  font-weight: 500;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

### Inputs
```css
.input {
  background: rgba(15, 22, 35, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  color: var(--plane-text);
  padding: 8px 12px;
}
```

### Cards/Panels
```css
.card {
  background: var(--plane-surface);
  border: 1px solid var(--plane-glass-border);
  border-radius: 20px;
  padding: 20px;
}
```

---

## Interaction States

### Hover/Focus
```css
:hover, :focus-visible {
  background: rgba(56, 64, 94, 0.35);
}
```

### Active/Selected
```css
.active {
  background: rgba(108, 123, 255, 0.2);
  box-shadow: inset 0 0 0 1px rgba(108, 123, 255, 0.4);
}
```

### Dragging
```css
.dragging {
  opacity: 0.5;
}
```

---

## Layout Patterns

### Two-Column Grid
```css
display: grid;
grid-template-columns: 280px minmax(0, 1fr);
```

### Master-Detail Panel
```css
display: grid;
grid-template-columns: 360px minmax(0, 1fr);
gap: 24px;
```

### Responsive Breakpoints
- `1280px` - Collapse to single column
- Mobile-first approach with `minmax(0, 1fr)` patterns

---

## Animation Guidelines

### Transitions
- Duration: `0.2s` for hover states
- Easing: `ease` or `ease-out`

### Entry Animations
- Stagger child elements with `animation-delay`
- Use subtle scale/opacity transforms

---

## AI Feature Indicators

When AI features are enabled (`aiEnhanced: true`), show:
- Floating dock (bottom-left)
- Agent assignment badges on task cards
- MemPODS context panel in task drawer
- AI persona selector in command bar
- Kairos suggestions panel in dashboard

Color coding for AI agents:
- Kairos (time): `#ec4899` (pink)
- Sentinel (monitoring): `#8b5cf6` (purple)
- Oracle (insights): `#3b82f6` (blue)
- Tempo (scheduling): `#10b981` (green)
- Nexus (integration): `#f59e0b` (amber)
- Polaris (navigation): `#06b6d4` (cyan)

---

## Figma Implementation Notes

1. **Use Auto Layout** for all components with proper padding/gap values
2. **Apply blur effects** using Figma's Background Blur feature
3. **Use component variants** for different states (default, hover, active, disabled)
4. **Create color styles** for all `--plane-*` variables
5. **Use text styles** for typography scale
6. **Apply consistent border radius** using corner radius tokens
