import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  Preferences as ApiPreferences,
  SpaceSummary
} from "@dydact/taskr-api-client";
import { ApiError } from "@dydact/taskr-api-client";
import { useTaskRClient } from "../lib/taskrClient";
import { useTelemetry } from "../lib/telemetry";
import type {
  AiPersona,
  DensityMode,
  ShellPreferences,
  ThemeMode,
  ViewMode
} from "../types/shell";
import type { NavigationFolder, NavigationList, NavigationSpace } from "../types/navigation";

export type ShellSpace = {
  id: string;
  spaceId: string;
  slug: string;
  name: string;
  color?: string | null;
  favorite?: boolean;
};

type PreferenceUpdateOptions = {
  immediate?: boolean;
};

type ShellContextValue = {
  ready: boolean;
  preferences: ShellPreferences;
  preferencesLoading: boolean;
  preferencesError: string | null;
  setTheme: (theme: ThemeMode) => void;
  setDensity: (density: DensityMode) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleRightPanel: (open?: boolean) => void;
  setAiPersona: (persona: AiPersona) => void;
  updateListViewColumns: (columns: Record<string, boolean>) => void;
  favorites: string[];
  toggleFavorite: (spaceId: string) => void;
  setFavorites: (favorites: string[]) => void;
  spaces: ShellSpace[];
  spacesLoading: boolean;
  spacesError: string | null;
  activeSpaceId: string | null;
  setActiveSpace: (spaceId: string) => void;
  navigation: NavigationSpace | null;
  navigationLoading: boolean;
  navigationError: string | null;
  profile: unknown;
  profileLoading: boolean;
  profileError: string | null;
  refreshPreferences: () => Promise<void>;
  refreshSpaces: () => Promise<void>;
  refreshNavigation: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updatePreferences: (patch: Partial<ShellPreferences>, options?: PreferenceUpdateOptions) => void;
};

const DEFAULT_PREFERENCES: ShellPreferences = {
  theme: "dark",
  viewDensity: "comfortable",
  favorites: [],
  lastView: "list",
  rightPanelOpen: true,
  aiPersona: "balanced",
  listViewColumns: {}
};

const VIEW_MODES: ViewMode[] = ["list", "board", "calendar", "gantt", "dashboard", "claims", "hr"];
const THEMES: ThemeMode[] = ["dark", "light"];
const DENSITIES: DensityMode[] = ["comfortable", "compact", "table"];
const PERSONAS: AiPersona[] = ["balanced", "detailed", "concise"];

const ShellContext = createContext<ShellContextValue | null>(null);

const isTheme = (value: unknown): value is ThemeMode => typeof value === "string" && THEMES.includes(value as ThemeMode);
const isDensity = (value: unknown): value is DensityMode => typeof value === "string" && DENSITIES.includes(value as DensityMode);
const isViewMode = (value: unknown): value is ViewMode => typeof value === "string" && VIEW_MODES.includes(value as ViewMode);
const isPersona = (value: unknown): value is AiPersona => typeof value === "string" && PERSONAS.includes(value as AiPersona);

const normalizePreferences = (input?: ApiPreferences | null): ShellPreferences => {
  const favorites = Array.isArray(input?.favorites)
    ? Array.from(
        new Set(
          (input.favorites as unknown[]).filter(
            (value): value is string => typeof value === "string" && value.length > 0
          )
        )
      )
    : [];
  const listColumns =
    input?.list_view_columns && typeof input.list_view_columns === "object" && !Array.isArray(input.list_view_columns)
      ? Object.fromEntries(
          Object.entries(input.list_view_columns).map(([key, value]) => [key, Boolean(value)])
        )
      : {};

  return {
    theme: isTheme(input?.theme) ? input.theme : DEFAULT_PREFERENCES.theme,
    viewDensity: isDensity(input?.view_density) ? input.view_density : DEFAULT_PREFERENCES.viewDensity,
    favorites,
    lastView: isViewMode(input?.last_view) ? input.last_view : DEFAULT_PREFERENCES.lastView,
    rightPanelOpen:
      typeof input?.right_panel_open === "boolean"
        ? input.right_panel_open
        : DEFAULT_PREFERENCES.rightPanelOpen,
    aiPersona: isPersona(input?.ai_persona) ? input.ai_persona : DEFAULT_PREFERENCES.aiPersona,
    listViewColumns: listColumns
  };
};

const toApiPatch = (patch: Partial<ShellPreferences>): Partial<ApiPreferences> => {
  const payload: Partial<ApiPreferences> = {};
  if (patch.theme !== undefined) payload.theme = patch.theme;
  if (patch.viewDensity !== undefined) payload.view_density = patch.viewDensity;
  if (patch.favorites !== undefined) payload.favorites = patch.favorites;
  if (patch.lastView !== undefined) payload.last_view = patch.lastView;
  if (patch.rightPanelOpen !== undefined) payload.right_panel_open = patch.rightPanelOpen;
  if (patch.aiPersona !== undefined) payload.ai_persona = patch.aiPersona;
  if (patch.listViewColumns !== undefined) payload.list_view_columns = patch.listViewColumns;
  return payload;
};

const sanitizePreferencePatch = (patch: Partial<ShellPreferences>): Partial<ShellPreferences> => {
  const result: Partial<ShellPreferences> = {};
  if (patch.theme !== undefined && isTheme(patch.theme)) result.theme = patch.theme;
  if (patch.viewDensity !== undefined && isDensity(patch.viewDensity)) result.viewDensity = patch.viewDensity;
  if (patch.lastView !== undefined && isViewMode(patch.lastView)) result.lastView = patch.lastView;
  if (patch.aiPersona !== undefined && isPersona(patch.aiPersona)) result.aiPersona = patch.aiPersona;
  if (patch.rightPanelOpen !== undefined) result.rightPanelOpen = Boolean(patch.rightPanelOpen);
  if (patch.favorites !== undefined) {
    result.favorites = Array.from(
      new Set(patch.favorites.filter((value): value is string => typeof value === "string" && value.length > 0))
    );
  }
  if (patch.listViewColumns !== undefined) {
    const next: Record<string, boolean> = {};
    Object.entries(patch.listViewColumns).forEach(([key, value]) => {
      if (typeof key === "string" && key.length > 0) {
        next[key] = Boolean(value);
      }
    });
    result.listViewColumns = next;
  }
  return result;
};

const mapSpace = (space: SpaceSummary): ShellSpace => ({
  id: space.id,
  spaceId: space.id,
  slug: space.slug,
  name: space.name,
  color: space.color ?? null,
  favorite: typeof space.favorite === "boolean" ? space.favorite : undefined
});

const toStringOrEmpty = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
};

const normalizeNavigationList =
  (spaceId: string) =>
  (input: unknown): NavigationList | null => {
    if (!input || typeof input !== "object") return null;
    const raw = input as Record<string, unknown>;
    const listId = toStringOrEmpty(raw.list_id ?? raw.id);
    if (!listId) return null;
    const folderRaw = raw.folder_id ?? (raw.folder as { id?: unknown } | undefined)?.id;
    const folderId = folderRaw ? toStringOrEmpty(folderRaw) : null;
    return {
      list_id: listId,
      name: typeof raw.name === "string" && raw.name.trim().length > 0 ? raw.name : "Untitled list",
      folder_id: folderId && folderId.length > 0 ? folderId : null,
      color: typeof raw.color === "string" ? raw.color : null,
      space_id: toStringOrEmpty(raw.space_id ?? raw.spaceId) || spaceId
    };
  };

const normalizeNavigation = (input: unknown, space?: ShellSpace | null): NavigationSpace => {
  const root = (input as { data?: unknown })?.data ?? input;
  const record = (root ?? {}) as Record<string, unknown>;
  const spaceId = toStringOrEmpty(record.space_id ?? record.spaceId) || space?.spaceId || space?.id || "";
  const slug = toStringOrEmpty(record.slug) || space?.slug || "";
  const name =
    typeof record.name === "string" && record.name.trim().length > 0 ? record.name : space?.name ?? slug ?? "Untitled space";
  const color = typeof record.color === "string" ? record.color : space?.color ?? null;
  const listNormalizer = normalizeNavigationList(spaceId);

  const rootLists = Array.isArray(record.root_lists)
    ? record.root_lists
        .map(listNormalizer)
        .filter((value): value is NavigationList => value !== null)
    : [];

  const folders: NavigationFolder[] = Array.isArray(record.folders)
    ? record.folders
        .map((folderRaw) => {
          if (!folderRaw || typeof folderRaw !== "object") return null;
          const folder = folderRaw as Record<string, unknown>;
          const folderId = toStringOrEmpty(folder.folder_id ?? folder.id);
          if (!folderId) return null;
          const lists = Array.isArray(folder.lists)
            ? folder.lists
                .map(listNormalizer)
                .filter((value): value is NavigationList => value !== null)
            : [];
          return {
            folder_id: folderId,
            name:
              typeof folder.name === "string" && folder.name.trim().length > 0
                ? folder.name
                : "Untitled folder",
            space_id: spaceId,
            lists
          };
        })
        .filter((folder): folder is NavigationFolder => folder !== null)
    : [];

  return {
    space_id: spaceId,
    slug,
    name,
    color,
    root_lists: rootLists,
    folders
  };
};

export const ShellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const client = useTaskRClient();
  const { track: trackTelemetry } = useTelemetry();
  const [preferences, setPreferences] = useState<ShellPreferences>(DEFAULT_PREFERENCES);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);

  const [spacesRaw, setSpacesRaw] = useState<ShellSpace[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(true);
  const [spacesError, setSpacesError] = useState<string | null>(null);

  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);

  const [navigation, setNavigation] = useState<NavigationSpace | null>(null);
  const [navigationLoading, setNavigationLoading] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);

  const [profile, setProfile] = useState<unknown>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const pendingPatchRef = useRef<Partial<ApiPreferences>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const spaces = useMemo(() => {
    const favoriteIds = new Set(preferences.favorites);
    return spacesRaw.map((space) => ({
      ...space,
      favorite: space.favorite ?? favoriteIds.has(space.spaceId)
    }));
  }, [spacesRaw, preferences.favorites]);

  const flushPreferencePatch = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (!patch || Object.keys(patch).length === 0) return;
    try {
      const updated = await client.preferences.update(patch);
      if (!unmountedRef.current) {
        setPreferences(normalizePreferences(updated));
        setPreferencesError(null);
      }
    } catch (err: unknown) {
      console.error("Failed to update preferences", err);
      if (!unmountedRef.current) {
        setPreferencesError(err instanceof Error ? err.message : String(err));
      }
    }
  }, [client]);

  const queuePreferencePatch = useCallback(
    (patch: Partial<ApiPreferences>, options?: PreferenceUpdateOptions) => {
      if (!patch || Object.keys(patch).length === 0) return;
      pendingPatchRef.current = {
        ...pendingPatchRef.current,
        ...patch
      };
      if (options?.immediate) {
        void flushPreferencePatch();
        return;
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void flushPreferencePatch();
      }, 300);
    },
    [flushPreferencePatch]
  );

  const applyPreferencePatch = useCallback(
    (patch: Partial<ShellPreferences>, options?: PreferenceUpdateOptions) => {
      if (Object.keys(patch).length === 0) return;
      setPreferences((prev) => {
        const next = { ...prev, ...patch };
        const apiPatch = toApiPatch(patch);
        queuePreferencePatch(apiPatch, options);
        return next;
      });
    },
    [queuePreferencePatch]
  );

  const updatePreferences = useCallback(
    (patch: Partial<ShellPreferences>, options?: PreferenceUpdateOptions) => {
      const sanitized = sanitizePreferencePatch(patch);
      if (Object.keys(sanitized).length === 0) return;
      applyPreferencePatch(sanitized, options);
    },
    [applyPreferencePatch]
  );

  const updatePreferencesWith = useCallback(
    (updater: (prev: ShellPreferences) => Partial<ShellPreferences>, options?: PreferenceUpdateOptions) => {
      setPreferences((prev) => {
        const patch = sanitizePreferencePatch(updater(prev));
        if (Object.keys(patch).length === 0) {
          return prev;
        }
        const next = { ...prev, ...patch };
        const apiPatch = toApiPatch(patch);
        queuePreferencePatch(apiPatch, options);
        return next;
      });
    },
    [queuePreferencePatch]
  );

  const setTheme = useCallback(
    (theme: ThemeMode) => {
      if (!isTheme(theme)) return;
      updatePreferences({ theme }, { immediate: true });
    },
    [updatePreferences]
  );

  const setDensity = useCallback(
    (density: DensityMode) => {
      if (!isDensity(density)) return;
      updatePreferences({ viewDensity: density });
      void trackTelemetry({
        name: "preferences.density_changed",
        properties: { density }
      });
    },
    [updatePreferences, trackTelemetry]
  );

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      if (!isViewMode(mode)) return;
      updatePreferences({ lastView: mode });
    },
    [updatePreferences]
  );

  const toggleRightPanel = useCallback(
    (open?: boolean) => {
      updatePreferencesWith(
        (prev) => ({
          rightPanelOpen: typeof open === "boolean" ? open : !prev.rightPanelOpen
        }),
        { immediate: true }
      );
    },
    [updatePreferencesWith]
  );

  const setAiPersona = useCallback(
    (persona: AiPersona) => {
      if (!isPersona(persona)) return;
      updatePreferences({ aiPersona: persona });
      void trackTelemetry({
        name: "preferences.ai_persona_changed",
        properties: { persona }
      });
    },
    [updatePreferences, trackTelemetry]
  );

  const updateListViewColumns = useCallback(
    (columns: Record<string, boolean>) => {
      const normalized = Object.fromEntries(
        Object.entries(columns).map(([key, value]) => [key, Boolean(value)])
      );
      updatePreferences({ listViewColumns: normalized });
      void trackTelemetry({
        name: "preferences.list_columns_updated",
        properties: {
          columns: Object.keys(normalized).filter((key) => normalized[key])
        }
      });
    },
    [updatePreferences, trackTelemetry]
  );

  const toggleFavorite = useCallback(
    (spaceId: string) => {
      if (!spaceId) return;
      updatePreferencesWith((prev) => {
        const exists = prev.favorites.includes(spaceId);
        return {
          favorites: exists
            ? prev.favorites.filter((value) => value !== spaceId)
            : [...prev.favorites, spaceId]
        };
      });
      void trackTelemetry({
        name: "navigation.favorite_toggled",
        properties: {
          space_id: spaceId
        }
      });
    },
    [updatePreferencesWith, trackTelemetry]
  );

  const setFavorites = useCallback(
    (favoriteIds: string[]) => {
      const normalized = Array.from(
        new Set(favoriteIds.filter((id) => typeof id === "string" && id.length > 0))
      );
      updatePreferences({ favorites: normalized });
      void trackTelemetry({
        name: "navigation.favorites_updated",
        properties: {
          count: normalized.length
        }
      });
    },
    [updatePreferences, trackTelemetry]
  );

  const refreshPreferences = useCallback(async () => {
    setPreferencesLoading(true);
    setPreferencesError(null);
    try {
      await flushPreferencePatch();
      const data = await client.preferences.get();
      if (!unmountedRef.current) {
        setPreferences(normalizePreferences(data));
      }
    } catch (err: unknown) {
      if (!unmountedRef.current) {
        const message =
          err instanceof ApiError
            ? err.message || `Failed to load preferences (HTTP ${err.status})`
            : err instanceof Error
            ? err.message
            : String(err);
        setPreferencesError(message);
      }
    } finally {
      if (!unmountedRef.current) {
        setPreferencesLoading(false);
      }
    }
  }, [client, flushPreferencePatch]);

  const refreshSpaces = useCallback(async () => {
    setSpacesLoading(true);
    setSpacesError(null);
    try {
      const response = await client.spaces.list();
      let payload: SpaceSummary[] = [];
      if (Array.isArray((response as any)?.data)) {
        payload = (response as { data: SpaceSummary[] }).data;
      } else if (Array.isArray(response)) {
        payload = response as SpaceSummary[];
      }
      const mapped = payload.map(mapSpace);
      if (!unmountedRef.current) {
        setSpacesRaw(mapped);
      }
    } catch (err: unknown) {
      console.error("Failed to load spaces", err);
      if (!unmountedRef.current) {
        const message =
          err instanceof ApiError
            ? err.message || `Failed to load spaces (HTTP ${err.status})`
            : err instanceof Error
            ? err.message
            : String(err);
        setSpacesRaw([]);
        setSpacesError(message);
      }
    } finally {
      if (!unmountedRef.current) {
        setSpacesLoading(false);
      }
    }
  }, [client]);

  const refreshNavigation = useCallback(async () => {
    if (!activeSpaceId) {
      setNavigation(null);
      return;
    }
    const space = spacesRaw.find((entry) => entry.spaceId === activeSpaceId || entry.id === activeSpaceId) ?? null;
    const slug = space?.slug || activeSpaceId;
    setNavigationLoading(true);
    setNavigationError(null);
    try {
      const payload = await client.request<NavigationSpace>({
        path: `/spaces/${slug}/navigation`,
        method: "GET"
      });
      if (!unmountedRef.current) {
        setNavigation(normalizeNavigation(payload, space));
      }
    } catch (err: unknown) {
      console.error("Failed to load navigation", err);
      if (!unmountedRef.current) {
        const message =
          err instanceof ApiError
            ? err.message || `Failed to load navigation (HTTP ${err.status})`
            : err instanceof Error
            ? err.message
            : String(err);
        setNavigation(null);
        setNavigationError(message);
      }
    } finally {
      if (!unmountedRef.current) {
        setNavigationLoading(false);
      }
    }
  }, [client, activeSpaceId, spacesRaw]);

  const refreshProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const payload = await client.request<unknown>({ path: "/profile", method: "GET" });
      const data = (payload as { data?: unknown })?.data ?? payload;
      if (!unmountedRef.current) {
        setProfile(data);
      }
    } catch (err: unknown) {
      console.error("Failed to load profile", err);
      if (!unmountedRef.current) {
        const message =
          err instanceof ApiError
            ? err.message || `Failed to load profile (HTTP ${err.status})`
            : err instanceof Error
            ? err.message
            : String(err);
        setProfile(null);
        setProfileError(message);
      }
    } finally {
      if (!unmountedRef.current) {
        setProfileLoading(false);
      }
    }
  }, [client]);

  useEffect(() => {
    void refreshPreferences();
    void refreshSpaces();
    void refreshProfile();
  }, [refreshPreferences, refreshSpaces, refreshProfile]);

  useEffect(() => {
    if (spacesRaw.length === 0) {
      setActiveSpaceId(null);
      setNavigation(null);
      return;
    }
    setActiveSpaceId((current) => {
      if (current && spacesRaw.some((space) => space.spaceId === current || space.id === current)) {
        return current;
      }
      return spacesRaw[0]?.spaceId ?? null;
    });
  }, [spacesRaw]);

  useEffect(() => {
    if (!activeSpaceId) {
      setNavigation(null);
      return;
    }
    void refreshNavigation();
  }, [activeSpaceId, refreshNavigation]);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      const pending = pendingPatchRef.current;
      pendingPatchRef.current = {};
      if (Object.keys(pending).length > 0) {
        void client.preferences.update(pending).catch(() => undefined);
      }
    };
  }, [client]);

  const setActiveSpace = useCallback((spaceId: string) => {
    if (!spaceId) return;
    setActiveSpaceId(spaceId);
  }, []);

  const ready = !preferencesLoading && !spacesLoading;

  const value = useMemo<ShellContextValue>(
    () => ({
      ready,
      preferences,
      preferencesLoading,
      preferencesError,
      setTheme,
      setDensity,
      setViewMode,
      toggleRightPanel,
      setAiPersona,
      updateListViewColumns,
      favorites: preferences.favorites,
      toggleFavorite,
      setFavorites,
      spaces,
      spacesLoading,
      spacesError,
      activeSpaceId,
      setActiveSpace,
      navigation,
      navigationLoading,
      navigationError,
      profile,
      profileLoading,
      profileError,
      refreshPreferences,
      refreshSpaces,
      refreshNavigation,
      refreshProfile,
      updatePreferences
    }),
    [
      ready,
      preferences,
      preferencesLoading,
      preferencesError,
      setTheme,
      setDensity,
      setViewMode,
      toggleRightPanel,
      setAiPersona,
      updateListViewColumns,
      toggleFavorite,
      setFavorites,
      spaces,
      spacesLoading,
      spacesError,
      activeSpaceId,
      setActiveSpace,
      navigation,
      navigationLoading,
      navigationError,
      profile,
      profileLoading,
      profileError,
      refreshPreferences,
      refreshSpaces,
      refreshNavigation,
      refreshProfile,
      updatePreferences
    ]
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
};

export const useShell = () => {
  const context = useContext(ShellContext);
  if (!context) {
    throw new Error("useShell must be used within a ShellProvider");
  }
  return context;
};
