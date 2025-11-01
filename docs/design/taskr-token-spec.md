# TaskR Design Tokens – Color, Typography, Motion (M2 Draft)

Date: 2025-02-14  
Owner: Codex (GPT-5)  
Reviewers: Design Systems, Brand, Accessibility

## 1. Principles
- **ClickUp-inspired vibrancy:** Use luminous gradients, subtle glass effects, and playful duotones.
- **Dydact intelligence cues:** Reserve electric accents (violet/teal) for AI beacons and automated flows.
- **Accessibility first:** All UI states must pass WCAG 2.2 AA contrast in both light and dark themes.

## 2. Palette Overview

### 2.1 Core Gradients
| Token | Value | Usage |
| --- | --- | --- |
| `gradient.primary` | linear-gradient(135deg, #7B3FFF 0%, #2B8BF5 50%, #0D1324 100%) | Shell background, hero surfaces |
| `gradient.secondary` | linear-gradient(145deg, #FF7AE5 0%, #FFB347 52%, #FFD76F 100%) | Accent cards, callouts |
| `gradient.success` | linear-gradient(135deg, #4AD79F 0%, #36B37E 100%) | Status success, automation confirmation |
| `gradient.warning` | linear-gradient(135deg, #FFB547 0%, #FF6F3C 100%) | Warnings, SLA alerts |
| `gradient.danger` | linear-gradient(135deg, #FF5B5B 0%, #D9235D 100%) | Errors, blocking issues |

### 2.2 Solid Foundations
| Token | Light | Dark | Notes |
| --- | --- | --- | --- |
| `color.surface.0` | #FFFFFF | #0B101B | Base canvas |
| `color.surface.100` | #F7F9FF | rgba(12, 16, 29, 0.72) | Cards, nav rail |
| `color.border.muted` | rgba(118, 131, 168, 0.24) | rgba(118, 131, 168, 0.32) | Hairlines |
| `color.text.primary` | #0E1421 | #F5F7FF | Default text |
| `color.text.secondary` | #445174 | rgba(205, 214, 240, 0.72) | Subtext |
| `color.text.inverse` | #FFFFFF | #FFFFFF | On gradient surfaces |

### 2.3 Status Palette
| Status | Token | Base | Foreground |
| --- | --- | --- | --- |
| Ready | `status.ready` | #38B6FF | #05396B |
| In Progress | `status.progress` | #7C5CFF | #160039 |
| Review | `status.review` | #FFB547 | #5A3200 |
| Blocked | `status.blocked` | #FF5B5B | #4C0014 |
| Completed | `status.done` | #4AD79F | #013525 |

> Status pills should use gradient overlays (50% blend) derived from core gradients for hover/active states.

## 3. Typography

| Token | Font | Size | Weight | Usage |
| --- | --- | --- | --- | --- |
| `font.family.primary` | Inter Variable | — | — | Global |
| `font.size.h1` | 28px | 600 | Section headers |
| `font.size.h2` | 22px | 600 | Card titles |
| `font.size.body` | 16px | 500 | Standard copy |
| `font.size.caption` | 13px | 500 | Metadata (dates, statuses) |
| `font.size.mono` | 14px | 500 | Code/tooltips |

- Use optical scaling feature of Inter Variable for large text.  
- Provide `font.weight.ai` = 650 to accentuate AI-suggested text.

## 4. Spacing & Radii
| Token | Value | Notes |
| --- | --- | --- |
| `space.xxs` | 4px | Icon padding |
| `space.xs` | 8px | Pill padding |
| `space.sm` | 12px | Row spacing |
| `space.md` | 16px | Card interior |
| `space.lg` | 24px | Section gutters |
| `space.xl` | 32px | Shell margins |

| Radius Token | Value | Usage |
| --- | --- | --- |
| `radius.sm` | 10px | Pills, chips |
| `radius.md` | 14px | Cards, menus |
| `radius.lg` | 20px | Shell surfaces, rails |

## 5. Shadows & Blur
| Token | Value | Usage |
| --- | --- | --- |
| `shadow.card` | 0 14px 30px rgba(11, 17, 32, 0.22) | Cards, modals |
| `shadow.rail` | 0 24px 56px rgba(8, 13, 26, 0.45) | Nav rail, right rail |
| `blur.glass` | 18px | Glass surfaces (nav, toasts) |

## 6. Motion
| Token | Duration | Curve | Usage |
| --- | --- | --- | --- |
| `motion.default` | 180ms | cubic-bezier(0.22, 1, 0.36, 1) | Hover, focus, segment switches |
| `motion.menu` | 160ms | cubic-bezier(0.16, 1, 0.3, 1) | Nested menu open/close |
| `motion.drag` | 240ms | cubic-bezier(0.4, 0, 0.2, 1) | Sidebar collapses, drag ghost |
| `motion.aiBeacon` | 400ms loop | custom (ease-in-out) | Pulsing AI indicator |

## 7. Token File Structure
- Source tokens stored in `packages/design-tokens/src/taskr.tokens.json`.  
- Build pipeline exports CSS variables under `:root` (light) and `[data-theme="dark"]`.  
- Example excerpt:
```json
{
  "color": {
    "surface": {
      "0": { "value": "#FFFFFF" },
      "100": { "value": "rgba(12, 16, 29, 0.72)" }
    },
    "text": {
      "primary": { "value": "#0E1421" },
      "primary-dark": { "value": "#F5F7FF" }
    }
  },
  "gradient": {
    "primary": { "value": "linear-gradient(135deg, #7B3FFF 0%, #2B8BF5 50%, #0D1324 100%)" }
  }
}
```

## 8. Accessibility Considerations
- Maintain minimum 4.5:1 contrast for text on surfaces; gradient overlays must not reduce readability.  
- Provide high-contrast theme toggle (swap gradient overlays for solid backgrounds).  
- Motion-reduced mode: disable AI beacon pulsing and lower menu animation durations.

## 9. Next Steps
1. Confirm palette with Brand team (Week 1).  
2. Implement tokens in design system pipeline; update Storybook theme (Week 2).  
3. Run accessibility contrast checks and produce alternative palette for high-contrast mode (Week 2).  
4. Document usage examples in Storybook and Figma tokens page.
