import { useEffect } from "react";

type HotkeyHandler = (event: KeyboardEvent) => void;

type HotkeyMap = Record<string, HotkeyHandler>;

const normalizeKey = (event: KeyboardEvent): string => {
  const parts: string[] = [];
  if (event.metaKey) parts.push("meta");
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");

  const key = event.key.toLowerCase();
  if (!["meta", "ctrl", "alt", "shift"].includes(key)) {
    parts.push(key);
  }
  return parts.join("+");
};

export const useHotkeys = (bindings: HotkeyMap) => {
  useEffect(() => {
    let previous: { combo: string; timestamp: number } | null = null;
    const sequenceWindow = 600;

    const handler = (event: KeyboardEvent) => {
      const combo = normalizeKey(event);
      const direct = bindings[combo];
      if (direct) {
        previous = null;
        direct(event);
        return;
      }

      if (previous && event.timeStamp - previous.timestamp <= sequenceWindow) {
        const sequenceKey = `${previous.combo} ${combo}`;
        const sequenceHandler = bindings[sequenceKey];
        if (sequenceHandler) {
          previous = null;
          sequenceHandler(event);
          return;
        }
      }

      previous = { combo, timestamp: event.timeStamp };
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [bindings]);
};
