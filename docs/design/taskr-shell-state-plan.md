# TaskR Shell State & Persistence Plan (Step 2)

Date: 2025-02-14  
Owner: Codex (GPT-5)  
Audience: Front-End Platform, Backend API team

## Purpose
Provide implementation guidance for wiring the TaskR shell to real data and persisting personalization settings via the `/preferences` API (see `docs/platform/taskr/api-reference.md`). This is Step 2 following the API/client layer work.

## Goals
- Centralize shell state (view mode, right rail, navigation tree, favorites, density, theme, AI persona).
- Persist user preferences to backend and hydrate on load.
- Align components with the forthcoming shared API client.

## Architecture Overview

```
<App>
 └── ShellProvider (new)
      ├─ provides ShellContext (view, panel, loading, nav data)
      ├─ hooks into PreferencesClient (GET/PATCH /preferences)
      ├─ orchestrates initial hydration (spaces, preferences, feature flags)
      └─ emits events (analytics, SSE)
```

### Key Modules
| Module | Responsibility |
| --- | --- |
| `lib/client.ts` | Shared API client (from API layer plan). |
| `context/ShellContext.tsx` | React context storing shell state; wraps current ThemeContext. |
| `hooks/usePreferences.ts` | Fetch + mutate preferences via API. |
| `hooks/useNavigationTree.ts` | Fetch `/spaces/{slug}/navigation` when active space changes. |
| `hooks/useFeatureFlags.ts` | Hydrate feature flags from `/profile`. |
| `store/useShellStore.ts` (optional Zustand) | Provide persistent store for shell states with hydration. |

### Preference Keys
| Key | Description | Default | API Field |
| --- | --- | --- | --- |
| `theme` | `dark` or `light` | `dark` | `theme` |
| `density` | `comfortable`, `compact`, `table` | `comfortable` | `view_density` |
| `favorites` | array of space/list ids | `[]` | `favorites` |
| `last_view` | `list`/`board`/etc | `list` | `last_view` |
| `right_panel_open` | boolean | `true` | `right_panel_open` |
| `ai_persona` | `balanced`/`detailed`/`concise` | `balanced` | `ai_persona` |
| `list_view_columns` | column visibility config | {} | `list_view_columns` |

## Hydration Flow
1. App boot: call `/profile` (features + flags) and `/preferences`.  
2. Initialize ShellContext with server values (theme, density).  
3. Fetch spaces via `/spaces` and active space navigation tree.  
4. Render shell once data ready (fallback skeleton while loading).  
5. Persist changes optimistically (update local state, issue `PATCH /preferences`). Use debounce for frequent updates (e.g., density toggle).  
6. Track analytics events (`shell.view_changed`, `shell.right_panel_toggle`, `preferences.updated`).

## Tasks

### Front-End
1. **Create ShellProvider & Context**
   - Combine theme, view mode, right panel, favorites, loading states.
   - Expose setter functions (e.g., `setViewMode`, `toggleRightPanel`, `setDensity`).
2. **Integrate API Client**
   - Use shared client (once ready) to call `/profile`, `/preferences`, `/spaces`.
   - Implement error handling (show toast if preferences save fails, retry).
3. **Navigation Data**
   - Move `LeftNav` to consume data from context (`spaces`, `navigationTree`, `favorites`).
   - Add skeleton placeholders while loading.
4. **Preferences Hook**
   - `usePreferences` handles GET + PATCH with caching (React Query or SWR).
   - Provide `updatePreference(key, value)` that updates context + server (debounced).
5. **Persisted Toggles**
   - Theme toggle uses new preference (update ThemeContext to consume ShellContext).
   - Density modes switch list/board components layout (pull values from context).
   - Right panel open state persisted.
6. **Analytics**
   - Emit events via instrumentation helper when state changes (integrate with existing analytics plan).

### Backend (if needed)
1. **Preferences API Audit**
   - Ensure `/preferences` supports keys listed above; extend schema if missing.
   - Verify RBAC (user can only mutate own preferences).
2. **Spaces & Navigation**
   - Confirm `/spaces` and `/spaces/{slug}/navigation` return necessary fields (counts, AI indicators, WIP).
3. **Feature Flags Endpoint**
   - Include feature flags in `/profile` response (AI availability, claims module toggle).

## Data Structures (Examples)

```ts
type Preferences = {
  theme: 'dark' | 'light';
  view_density: 'comfortable' | 'compact' | 'table';
  favorites: string[];
  last_view: 'list' | 'board' | 'calendar' | 'gantt' | 'dashboard';
  right_panel_open: boolean;
  ai_persona: 'balanced' | 'detailed' | 'concise';
  list_view_columns: Record<string, boolean>;
};

type ShellState = {
  view: Preferences['last_view'];
  rightPanelOpen: boolean;
  theme: Preferences['theme'];
  density: Preferences['view_density'];
  favorites: string[];
  navigation: NavigationTree | null;
  loading: boolean;
};
```

## Timeline (Suggested)
| Week | Focus |
| --- | --- |
| 1 | Implement ShellProvider, integrate preferences GET/PATCH, hydrate theme & view |
| 2 | Wire navigation data to API, persist favorites, density, right panel |
| 3 | Hook analytics, finalize error handling, QA with mock data + backend |

## Risks & Mitigations
- **API readiness:** preferences or navigation endpoints may be incomplete → coordinate with backend, stub responses if necessary.
- **State duplication:** ensure ThemeContext and ShellContext do not maintain conflicting state—ThemeContext becomes a thin wrapper around ShellContext.
- **Performance:** caching for spaces/navigation; use virtualization for large nav trees.

## Next Steps
1. FE: scaffold ShellProvider and integrate basic preference hydration.  
2. Backend: confirm `/preferences` schema + navigation endpoints deliver required fields.  
3. Update design docs with density/AI persona toggles once implemented.  
4. Coordinate QA once API client is ready (per API layer timeline).
