import React, { useEffect, useMemo, useRef, useState } from "react";

export type CommandItem = {
  id: string;
  label: string;
  group: string;
  action: () => void;
  subtitle?: string;
  shortcut?: string;
};

type CommandPaletteProps = {
  isOpen: boolean;
  onClose(): void;
  commands: CommandItem[];
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, commands }) => {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setHighlighted(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const lower = query.toLowerCase();
    return commands.filter((item) => item.label.toLowerCase().includes(lower) || item.group.toLowerCase().includes(lower));
  }, [commands, query]);

  useEffect(() => {
    if (highlighted >= filtered.length) {
      setHighlighted(Math.max(filtered.length - 1, 0));
    }
    if (filtered.length === 0) {
      setHighlighted(0);
    }
  }, [filtered, highlighted]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlighted((prev) => (filtered.length === 0 ? 0 : Math.min(prev + 1, filtered.length - 1)));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlighted((prev) => Math.max(prev - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const item = filtered[highlighted];
        if (item) {
          item.action();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [filtered, highlighted, isOpen, onClose]);

  if (!isOpen) return null;

  let currentGroup: string | null = null;

  return (
    <div className="command-palette-overlay" role="dialog" aria-modal="true">
      <div className="command-palette">
        <header>
          <h2>Command Palette</h2>
          <button type="button" onClick={onClose} aria-label="Close command palette">
            ×
          </button>
        </header>
        <input
          ref={inputRef}
          className="command-palette-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(0);
          }}
          placeholder="Search commands…"
        />
        <div className="command-palette-list">
          {filtered.length === 0 ? (
            <p className="command-palette-empty">No commands found.</p>
          ) : (
            filtered.map((item, index) => {
              const showGroup = item.group !== currentGroup;
              currentGroup = item.group;
              return (
                <React.Fragment key={item.id}>
                  {showGroup && <div className="command-group-label">{item.group}</div>}
                  <button
                    type="button"
                    className={`command-item${index === highlighted ? " highlighted" : ""}`}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => {
                      item.action();
                      onClose();
                    }}
                  >
                    <div className="command-item-text">
                      <span className="command-item-label">{item.label}</span>
                      {item.subtitle && <span className="command-item-subtitle">{item.subtitle}</span>}
                    </div>
                    {item.shortcut && <span className="command-item-shortcut">{item.shortcut}</span>}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
