import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { Preferences as ApiPreferences, SpaceSummary } from "@dydact/taskr-api-client";
import { useTaskRClient } from "../lib/client";
import type { NavigationFolder, NavigationList, NavigationSpace } from "../types/navigation";
import type {
  AiPersona,
  DensityMode,
  ShellPreferences,
  ThemeMode,
  ViewMode
} from "../types/shell";

type ShellSpace = {
  id: string;
  spaceId: string;
  space_id: string;
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
  updatePreferences: (patch: Partial<ShellPreferences>, options?: PreferenceUpdateOptions) => void;
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
  refreshPreferences: () => Promise<void>;
  refreshSpaces: () => Promise<void>;
  refreshNavigation: () => Promise<void>;
  profile: unknown;
  profileLoading: boolean;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
};

const DEFAULT_PREFERENCES: ShellPreferences = {
  theme: "dark",
  viewDensity: "comfortable",
  favorites: [],
  lastView: "list",
  rightPanelOpen: true,
  aiPersona: "balanced",
  listViewColumns: {},
  aiEnhanced: false
};

const VIEW_MODES: ViewMode[] = [
  "list",
  "board",
  "calendar",
  "dashboard",
  "gantt",
  "inbox",
  "goals",
  "claims",
  "hr",
  "docs",
  "dedicated",
  "xoxo"
];
const DENSITIES: DensityMode[] = ["comfortable", "compact", "table"];
const THEMES: ThemeMode[] = ["dark", "light"];
const PERSONAS: AiPersona[] = ["balanced", "detailed", "concise"];

const ShellContext = createContext<ShellContextValue | null>(null);

const isViewMode = (value: unknown): value is ViewMode =>
  typeof value === "string" && VIEW_MODES.includes(value as ViewMode);

const isDensity = (value: unknown): value is DensityMode =>
  typeof value === "string" && DENSITIES.includes(value as DensityMode);

const isTheme = (value: unknown): value is ThemeMode =>
  typeof value === "string" && THEMES.includes(value as ThemeMode);

const isPersona = (value: unknown): value is AiPersona =>
  typeof value === "string" && PERSONAS.includes(value as AiPersona);

const resolveShellPreferences = (input?: ApiPreferences | null): ShellPreferences => {
  const favoritesRaw = Array.isArray(input?.favorites)
    ? input?.favorites.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const favorites = Array.from(new Set(favoritesRaw));
  const columns =
    input?.list_view_columns && typeof input.list_view_columns === "object" && !Array.isArray(input.list_view_columns)
      ? Object.fromEntries(
          Object.entries(input.list_view_columns).map(([key, value]) => [
            key,
            Boolean(value)
          ])
        )
      : {};

  return {
    theme: isTheme(input?.theme) ? input?.theme : DEFAULT_PREFERENCES.theme,
    viewDensity: isDensity(input?.view_density) ? input?.view_density : DEFAULT_PREFERENCES.viewDensity,
    favorites,
    lastView: isViewMode(input?.last_view) ? input?.last_view : DEFAULT_PREFERENCES.lastView,
    rightPanelOpen:
      typeof input?.right_panel_open === "boolean"
        ? input.right_panel_open
        : DEFAULT_PREFERENCES.rightPanelOpen,
    aiPersona: isPersona(input?.ai_persona) ? input.ai_persona : DEFAULT_PREFERENCES.aiPersona,
    listViewColumns: columns,
    aiEnhanced:
      typeof input?.ai_enhanced === "boolean"
        ? input.ai_enhanced
        : DEFAULT_PREFERENCES.aiEnhanced
  };
};

const mapToApiPatch = (patch: Partial<ShellPreferences>): Partial<ApiPreferences> => {
  const apiPatch: Partial<ApiPreferences> = {};
  if (patch.theme !== undefined) apiPatch.theme = patch.theme;
  if (patch.viewDensity !== undefined) apiPatch.view_density = patch.viewDensity;
  if (patch.favorites !== undefined) apiPatch.favorites = patch.favorites;
  if (patch.lastView !== undefined) apiPatch.last_view = patch.lastView;
  if (patch.rightPanelOpen !== undefined) apiPatch.right_panel_open = patch.rightPanelOpen;
  if (patch.aiPersona !== undefined) apiPatch.ai_persona = patch.aiPersona;
  if (patch.listViewColumns !== undefined) apiPatch.list_view_columns = patch.listViewColumns;
  if (patch.aiEnhanced !== undefined) apiPatch.ai_enhanced = patch.aiEnhanced;
  return apiPatch;
};

const sanitizeShellPreferencePatch = (patch: Partial<ShellPreferences>): Partial<ShellPreferences> => {
  const sanitized: Partial<ShellPreferences> = {};
  if (patch.theme !== undefined && isTheme(patch.theme)) {
    sanitized.theme = patch.theme;
  }
  if (patch.viewDensity !== undefined && isDensity(patch.viewDensity)) {
    sanitized.viewDensity = patch.viewDensity;
  }
  if (patch.lastView !== undefined && isViewMode(patch.lastView)) {
    sanitized.lastView = patch.lastView;
  }
  if (patch.rightPanelOpen !== undefined) {
    sanitized.rightPanelOpen = Boolean(patch.rightPanelOpen);
  }
  if (patch.aiPersona !== undefined && isPersona(patch.aiPersona)) {
    sanitized.aiPersona = patch.aiPersona;
  }
  if (patch.favorites !== undefined) {
    sanitized.favorites = Array.from(
      new Set(
        patch.favorites.filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    );
  }
  if (patch.listViewColumns !== undefined) {
    const nextColumns: Record<string, boolean> = {};
    Object.entries(patch.listViewColumns).forEach(([key, value]) => {
      if (typeof key === "string" && key.length > 0) {
        nextColumns[key] = Boolean(value);
      }
    });
    sanitized.listViewColumns = nextColumns;
  }
  if (patch.aiEnhanced !== undefined) {
    sanitized.aiEnhanced = Boolean(patch.aiEnhanced);
  }
  return sanitized;
};

const toShellSpace = (space: SpaceSummary): ShellSpace => ({
  id: space.id,
  spaceId: space.id,
  space_id: space.id,
  slug: space.slug,
  name: space.name,
  color: space.color ?? null,
  favorite: typeof space.favorite === "boolean" ? space.favorite : undefined
});

const asString = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
};

const normalizeNavigationList =
  (spaceId: string) =>
  (input: unknown): NavigationList | null => {
    if (!input || typeof input !== "object") return null;
    const record = input as Record<string, unknown>;
    const listId = asString(record.list_id ?? record.id);
    if (!listId) return null;
    const folderRaw = record.folder_id ?? (record.folder as Record<string, unknown> | undefined)?.id;
    const folderId = folderRaw ? asString(folderRaw) : null;

    return {
      list_id: listId,
      name: typeof record.name === "string" && record.name.trim().length > 0 ? record.name : "Untitled list",
      folder_id: folderId && folderId.length > 0 ? folderId : null,
      color: typeof record.color === "string" ? record.color : null,
      space_id: asString(record.space_id ?? record.spaceId) || spaceId
    };
  };

const normalizeNavigationFolder =
  (spaceId: string) =>
  (input: unknown): NavigationFolder | null => {
    if (!input || typeof input !== "object") return null;
    const record = input as Record<string, unknown>;
    const folderId = asString(record.folder_id ?? record.id);
    if (!folderId) return null;
    const normalizeList = normalizeNavigationList(spaceId);
    const lists = Array.isArray(record.lists)
      ? record.lists.map(normalizeList).filter((entry): entry is NavigationList => entry !== null)
      : [];

    return {
      folder_id: folderId,
      name:
        typeof record.name === "string" && record.name.trim().length > 0 ? record.name : "Untitled folder",
      space_id: spaceId,
      lists
    };
  };

const normalizeNavigation = (input: unknown, space?: ShellSpace | null): NavigationSpace => {
  const root = (input as { data?: unknown; navigation?: unknown })?.data ??
    (input as { data?: unknown; navigation?: unknown })?.navigation ??
    input;
  const record = (root ?? {}) as Record<string, unknown>;
  const spaceId = asString(record.space_id ?? record.spaceId) || space?.spaceId || space?.id || "";
  const slug = asString(record.slug) || space?.slug || "";
  const name =
    typeof record.name === "string" && record.name.trim().length > 0
      ? record.name
      : space?.name ?? slug ?? "Unnamed space";
  const color = typeof record.color === "string" ? record.color : space?.color ?? null;
  const normalizeList = normalizeNavigationList(spaceId);
  const normalizeFolder = normalizeNavigationFolder(spaceId);

  const rootLists = Array.isArray(record.root_lists)
    ? record.root_lists
        .map(normalizeList)
        .filter((entry): entry is NavigationList => entry !== null)
    : [];
  const folders = Array.isArray(record.folders)
    ? record.folders
        .map(normalizeFolder)
        .filter((entry): entry is NavigationFolder => entry !== null)
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

  const pendingPreferencePatchRef = useRef<Partial<ApiPreferences>>({});
  const preferenceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmountedRef = useRef(false);

  const spaces = useMemo(() => {
    if (spacesRaw.length === 0) return spacesRaw;
    const favoritesSet = new Set(preferences.favorites);
    return spacesRaw.map((space) => ({
      ...space,
      favorite: space.favorite ?? favoritesSet.has(space.spaceId)
    }));
  }, [spacesRaw, preferences.favorites]);

  const flushPreferencePatch = useCallback(async () => {
    if (preferenceDebounceRef.current) {
      clearTimeout(preferenceDebounceRef.current);
      preferenceDebounceRef.current = null;
    }
    const outbound = pendingPreferencePatchRef.current;
    pendingPreferencePatchRef.current = {};
    if (Object.keys(outbound).length === 0) {
      return;
    }
    try {
      const updated = await client.preferences.update(outbound);
      if (!isUnmountedRef.current) {
        setPreferences(resolveShellPreferences(updated));
        setPreferencesError(null);
      }
    } catch (err) {
      console.error("Failed to update preferences", err);
      if (!isUnmountedRef.current) {
        setPreferencesError(err instanceof Error ? err.message : String(err));
      }
    }
  }, [client]);

  const queuePreferencePatch = useCallback(
    (patch: Partial<ApiPreferences>, options?: PreferenceUpdateOptions) => {
      if (!patch || Object.keys(patch).length === 0) {
        return;
      }
      pendingPreferencePatchRef.current = {
        ...pendingPreferencePatchRef.current,
        ...patch
      };
      if (options?.immediate) {
        void flushPreferencePatch();
        return;
      }
      if (preferenceDebounceRef.current) {
        clearTimeout(preferenceDebounceRef.current);
      }
      preferenceDebounceRef.current = setTimeout(() => {
        preferenceDebounceRef.current = null;
        void flushPreferencePatch();
      }, 350);
    },
    [flushPreferencePatch]
  );

  const updatePreferencesDirect = useCallback(
    (patch: Partial<ShellPreferences>, options?: PreferenceUpdateOptions) => {
      const sanitized = sanitizeShellPreferencePatch(patch);
      if (Object.keys(sanitized).length === 0) {
        return;
      }
      setPreferencesError(null);
      setPreferences((prev) => {
        const next = { ...prev, ...sanitized };
        const apiPatch = mapToApiPatch(sanitized);
        queuePreferencePatch(apiPatch, options);
        return next;
      });
    },
    [queuePreferencePatch]
  );

  const updatePreferencesWith = useCallback(
    (updater: (prev: ShellPreferences) => Partial<ShellPreferences>, options?: PreferenceUpdateOptions) => {
      setPreferencesError(null);
      setPreferences((prev) => {
        const patch = sanitizeShellPreferencePatch(updater(prev));
        if (Object.keys(patch).length === 0) {
          return prev;
        }
        const next = { ...prev, ...patch };
        const apiPatch = mapToApiPatch(patch);
        queuePreferencePatch(apiPatch, options);
        return next;
      });
    },
    [queuePreferencePatch]
  );

  const updatePreferences = useCallback(
    (patch: Partial<ShellPreferences>, options?: PreferenceUpdateOptions) => {
      updatePreferencesDirect(patch, options);
    },
    [updatePreferencesDirect]
  );

  const setTheme = useCallback(
    (theme: ThemeMode) => {
      updatePreferencesDirect({ theme }, { immediate: true });
    },
    [updatePreferencesDirect]
  );

  const setDensity = useCallback(
    (density: DensityMode) => {
      updatePreferencesDirect({ viewDensity: density });
    },
    [updatePreferencesDirect]
  );

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      updatePreferencesDirect({ lastView: mode });
    },
    [updatePreferencesDirect]
  );

  const toggleRightPanel = useCallback(
    (open?: boolean) => {
      updatePreferencesWith((prev) => ({
        rightPanelOpen: typeof open === "boolean" ? open : !prev.rightPanelOpen
      }));
    },
    [updatePreferencesWith]
  );

  const setAiPersona = useCallback(
    (persona: AiPersona) => {
      updatePreferencesDirect({ aiPersona: persona });
    },
    [updatePreferencesDirect]
  );

  const updateListViewColumns = useCallback(
    (columns: Record<string, boolean>) => {
      const snapshot = Object.fromEntries(
        Object.entries(columns).map(([key, value]) => [key, Boolean(value)])
      );
      updatePreferencesDirect({ listViewColumns: snapshot });
    },
    [updatePreferencesDirect]
  );

  const toggleFavorite = useCallback(
    (spaceId: string) => {
      if (!spaceId) return;
      updatePreferencesWith((prev) => {
        const exists = prev.favorites.includes(spaceId);
        const favorites = exists
          ? prev.favorites.filter((id) => id !== spaceId)
          : [...prev.favorites, spaceId];
        return { favorites };
      });
    },
    [updatePreferencesWith]
  );

  const setFavorites = useCallback(
    (favoriteIds: string[]) => {
      const normalized = Array.from(
        new Set(favoriteIds.filter((id) => typeof id === "string" && id.length > 0))
      );
      updatePreferencesDirect({ favorites: normalized });
    },
    [updatePreferencesDirect]
  );

  const refreshPreferences = useCallback(async () => {
    setPreferencesLoading(true);
    setPreferencesError(null);
    try {
      await flushPreferencePatch();
      const data = await client.preferences.get();
      if (!isUnmountedRef.current) {
        setPreferences(resolveShellPreferences(data));
      }
    } catch (err) {
      console.error("Failed to load preferences", err);
      if (!isUnmountedRef.current) {
        setPreferencesError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (!isUnmountedRef.current) {
        setPreferencesLoading(false);
      }
    }
  }, [client, flushPreferencePatch]);

  const refreshSpaces = useCallback(async () => {
    setSpacesLoading(true);
    setSpacesError(null);
    try {
      const response = await client.spaces.list();
      const data = Array.isArray(response?.data) ? response.data : (response as SpaceSummary[] | null) ?? [];
      const normalized = data.map(toShellSpace);
      if (!isUnmountedRef.current) {
        setSpacesRaw(normalized);
      }
    } catch (err) {
      console.error("Failed to load spaces", err);
      if (!isUnmountedRef.current) {
        setSpacesRaw([]);
        setSpacesError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (!isUnmountedRef.current) {
        setSpacesLoading(false);
      }
    }
  }, [client]);

  const refreshNavigation = useCallback(async () => {
    if (!activeSpaceId) {
      setNavigation(null);
      return;
    }
    const space =
      spacesRaw.find((entry) => entry.spaceId === activeSpaceId || entry.id === activeSpaceId) ?? null;
    const slug = space?.slug || activeSpaceId;
    setNavigationLoading(true);
    setNavigationError(null);
    try {
      const payload = await client.request<NavigationSpace>({
        path: `/spaces/${slug}/navigation`,
        method: "GET"
      });
      if (!isUnmountedRef.current) {
        setNavigation(normalizeNavigation(payload, space));
      }
    } catch (err) {
      console.error("Failed to load navigation", err);
      if (!isUnmountedRef.current) {
        setNavigation(null);
        setNavigationError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (!isUnmountedRef.current) {
        setNavigationLoading(false);
      }
    }
  }, [client, activeSpaceId, spacesRaw]);

  const refreshProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const response = await client.request<unknown>({ path: "/profile", method: "GET" });
      const data = (response as { data?: unknown })?.data ?? response;
      if (!isUnmountedRef.current) {
        setProfile(data);
      }
    } catch (err) {
      console.error("Failed to load profile", err);
      if (!isUnmountedRef.current) {
        setProfile(null);
        setProfileError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (!isUnmountedRef.current) {
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
      if (!current) {
        return spacesRaw[0]?.spaceId ?? null;
      }
      const exists = spacesRaw.some((space) => space.spaceId === current || space.id === current);
      return exists ? current : spacesRaw[0]?.spaceId ?? null;
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
      isUnmountedRef.current = true;
      if (preferenceDebounceRef.current) {
        clearTimeout(preferenceDebounceRef.current);
      }
      const outbound = pendingPreferencePatchRef.current;
      pendingPreferencePatchRef.current = {};
      if (Object.keys(outbound).length > 0) {
        void client.preferences.update(outbound).catch(() => undefined);
      }
    };
  }, [client]);

  const setActiveSpace = useCallback((spaceId: string) => {
    setActiveSpaceId(spaceId);
  }, []);

  const ready = !preferencesLoading && !spacesLoading;

  const value = useMemo<ShellContextValue>(
    () => ({
      ready,
      preferences,
      preferencesLoading,
      preferencesError,
      updatePreferences,
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
      refreshPreferences,
      refreshSpaces,
      refreshNavigation,
      profile,
      profileLoading,
      profileError,
      refreshProfile
    }),
    [
      ready,
      preferences,
      preferencesLoading,
      preferencesError,
      updatePreferences,
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
      refreshPreferences,
      refreshSpaces,
      refreshNavigation,
      profile,
      profileLoading,
      profileError,
      refreshProfile
    ]
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
};

export const useShell = () => {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error("useShell must be used within a ShellProvider");
  }
  return ctx;
};
