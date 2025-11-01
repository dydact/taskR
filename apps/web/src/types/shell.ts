export type ViewMode = "list" | "board" | "calendar" | "dashboard" | "claims" | "hr";

export type DensityMode = "comfortable" | "compact" | "table";

export type ThemeMode = "dark" | "light";

export type AiPersona = "balanced" | "detailed" | "concise";

export type ShellPreferences = {
  theme: ThemeMode;
  viewDensity: DensityMode;
  favorites: string[];
  lastView: ViewMode;
  rightPanelOpen: boolean;
  aiPersona: AiPersona;
  listViewColumns: Record<string, boolean>;
};
