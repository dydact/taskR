import React from "react";
import type { ViewMode } from "../../types/shell";

type CommandBarProps = {
  viewMode: ViewMode;
  onViewModeChange(mode: ViewMode): void;
  onOpenColumnSettings(): void;
  onOpenCommandPalette(): void;
  onOpenPreferences?: () => void;
  onOpenTenantSettings?: () => void;
  claimSearchTerm?: string;
  onClaimSearchTermChange?: (value: string) => void;
  claimSearchRef?: React.RefObject<HTMLInputElement>;
};

const VIEW_LABELS: Record<ViewMode, string> = {
  list: "List",
  board: "Board",
  calendar: "Calendar",
  dashboard: "Dashboard",
  claims: "Claims",
  hr: "HR"
};

const ORDER: ViewMode[] = ["claims", "list", "board", "calendar", "dashboard", "hr"];

export const CommandBar: React.FC<CommandBarProps> = ({
  viewMode,
  onViewModeChange,
  onOpenColumnSettings,
  onOpenCommandPalette,
  onOpenPreferences,
  onOpenTenantSettings,
  claimSearchTerm = "",
  onClaimSearchTermChange,
  claimSearchRef
}) => {
  return (
    <div className="command-bar-shell">
      <div className="command-bar-floating glass-surface">
        <div className="command-bar-views" role="tablist" aria-label="Primary views">
          {ORDER.map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={viewMode === mode}
              className={`command-bar-view${viewMode === mode ? " active" : ""}`}
              onClick={() => onViewModeChange(mode)}
            >
              <span className="command-bar-view-icon" aria-hidden="true">
                {mode === "claims" ? "⌁" : mode === "dashboard" ? "▦" : mode === "calendar" ? "◷" : "○"}
              </span>
              <span>{VIEW_LABELS[mode]}</span>
            </button>
          ))}
        </div>

        {viewMode === "claims" ? (
          <div className="command-bar-search">
            <span className="command-bar-key" aria-hidden="true">
              ⌘K
            </span>
            <input
              type="search"
              value={claimSearchTerm}
              onChange={(event) => onClaimSearchTermChange?.(event.currentTarget.value)}
              placeholder="Quick search claims, control numbers, payers"
              aria-label="Search claims"
              ref={claimSearchRef}
            />
          </div>
        ) : (
          <div className="command-bar-actions">
            <button
              type="button"
              className="command-bar-pill"
              onClick={() => onOpenTenantSettings?.()}
              title="Tenant settings"
            >
              ⚙
            </button>
            <button
              type="button"
              className="command-bar-pill"
              onClick={() => onOpenPreferences?.()}
              title="Preferences"
            >
              ✦
            </button>
            <button
              type="button"
              className="command-bar-pill"
              onClick={onOpenCommandPalette}
              title="Command palette (⌘K)"
            >
              ⌘
            </button>
            <button
              type="button"
              className="command-bar-pill"
              onClick={onOpenColumnSettings}
              disabled={viewMode !== "list"}
              title="Column settings"
            >
              ☰
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
