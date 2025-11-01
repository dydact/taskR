import React from "react";

export type ColumnKey = "status" | "priority" | "due_at";

export type ColumnOption = {
  key: ColumnKey;
  label: string;
};

type ColumnSettingsDrawerProps = {
  isOpen: boolean;
  options: ColumnOption[];
  selected: ColumnKey[];
  onToggle(key: ColumnKey): void;
  onClose(): void;
};

export const DEFAULT_COLUMNS: ColumnOption[] = [
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "due_at", label: "Due Date" }
];

export const ColumnSettingsDrawer: React.FC<ColumnSettingsDrawerProps> = ({
  isOpen,
  options,
  selected,
  onToggle,
  onClose
}) => {
  if (!isOpen) return null;

  const selectedSet = new Set(selected);

  return (
    <div className="column-drawer-overlay" role="dialog" aria-modal="true" aria-label="Column settings">
      <div className="column-drawer">
        <div className="column-drawer-header">
          <h2>Columns</h2>
          <button type="button" className="column-drawer-close" onClick={onClose} aria-label="Close column settings">
            ×
          </button>
        </div>
        <div className="column-drawer-body">
          {options.map((option) => (
            <label key={option.key} className="column-drawer-option">
              <input
                type="checkbox"
                checked={selectedSet.has(option.key)}
                onChange={() => onToggle(option.key)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};
