import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_VERSION = "v1";

type ResizeTarget = "left" | "right";

export type ResizableColumnsProps = {
  /** Content rendered in the left-most column (e.g., claim list). */
  left: React.ReactNode;
  /** Primary body content rendered in the center column. */
  main: React.ReactNode;
  /** Optional tertiary rail rendered on the right (e.g., session summary). */
  right?: React.ReactNode;
  /** Whether the right rail is currently collapsed. */
  isRightCollapsed?: boolean;
  /** Toggle callback for pinning / collapsing the right rail. */
  onRightCollapseChange?: (collapsed: boolean) => void;
  /** Initial pixel width for the left column. */
  initialLeftWidth?: number;
  /** Initial pixel width for the right column. */
  initialRightWidth?: number;
  /** Minimum pixel width for the left column. */
  minLeftWidth?: number;
  /** Minimum pixel width for the main column. */
  minMainWidth?: number;
  /** Minimum pixel width for the right column when visible. */
  minRightWidth?: number;
  /** Local storage key namespace for remembering widths. */
  storageKey?: string;
};

type StoredSizes = {
  left: number;
  right: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const ResizableColumns: React.FC<ResizableColumnsProps> = ({
  left,
  main,
  right,
  isRightCollapsed = false,
  onRightCollapseChange,
  initialLeftWidth = 360,
  initialRightWidth = 320,
  minLeftWidth = 280,
  minMainWidth = 480,
  minRightWidth = 280,
  storageKey
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
  const [rightWidth, setRightWidth] = useState(initialRightWidth);

  const canShowRight = Boolean(right) && !isRightCollapsed;

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(`${storageKey}:${STORAGE_VERSION}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<StoredSizes>;
      if (parsed.left && Number.isFinite(parsed.left)) {
        setLeftWidth(parsed.left);
      }
      if (parsed.right && Number.isFinite(parsed.right)) {
        setRightWidth(parsed.right);
      }
    } catch (error) {
      console.warn("Failed to parse stored column widths", error);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    const payload: StoredSizes = { left: leftWidth, right: rightWidth };
    try {
      localStorage.setItem(`${storageKey}:${STORAGE_VERSION}`, JSON.stringify(payload));
    } catch (error) {
      console.warn("Failed to persist column widths", error);
    }
  }, [leftWidth, rightWidth, storageKey]);

  const persistWidth = useCallback((nextLeft: number, nextRight: number) => {
    setLeftWidth(nextLeft);
    setRightWidth(nextRight);
  }, []);

  const handleDrag = useCallback(
    (target: ResizeTarget, event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      const startX = event.clientX;
      const startLeft = leftWidth;
      const startRight = rightWidth;

      try {
        (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
      } catch {
        // ignore — not all browsers support pointer capture in this context
      }

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        pointerEvent.preventDefault();
        const delta = pointerEvent.clientX - startX;
        const containerWidth = bounds.width;
        const availableWidth = containerWidth;
        const minMain = minMainWidth;
        if (target === "left") {
          const maxLeft = Math.max(minLeftWidth, availableWidth - minMain - (canShowRight ? rightWidth : 0));
          let nextLeft = clamp(startLeft + delta, minLeftWidth, maxLeft);
          persistWidth(nextLeft, rightWidth);
        } else {
          const rightMinGuard = minRightWidth;
          const currentRight = startRight - delta;
          const maxRight = Math.max(minRightWidth, availableWidth - minMainWidth - leftWidth);
          const nextRight = clamp(currentRight, rightMinGuard, maxRight);
          persistWidth(leftWidth, nextRight);
        }
      };

      const handlePointerUp = () => {
        try {
          (event.currentTarget as HTMLDivElement).releasePointerCapture(event.pointerId);
        } catch {
          // ignore
        }
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [canShowRight, leftWidth, minLeftWidth, minMainWidth, minRightWidth, persistWidth, rightWidth]
  );

  const templateColumns = useMemo(() => {
    if (canShowRight) {
      return `${leftWidth}px minmax(${minMainWidth}px, 1fr) ${rightWidth}px`;
    }
    return `${leftWidth}px minmax(${minMainWidth}px, 1fr)`;
  }, [canShowRight, leftWidth, minMainWidth, rightWidth]);

  return (
    <div className="resizable-columns" ref={containerRef} style={{ gridTemplateColumns: templateColumns }}>
      <div className="resizable-column resizable-column--left">{left}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize claim list"
        className="resizable-handle"
        tabIndex={0}
        onPointerDown={(event) => handleDrag("left", event)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            persistWidth(clamp(leftWidth - 16, minLeftWidth, leftWidth), rightWidth);
          } else if (event.key === "ArrowRight") {
            const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 1200;
            const maxLeft = containerWidth - minMainWidth - (canShowRight ? rightWidth : 0);
            persistWidth(clamp(leftWidth + 16, minLeftWidth, maxLeft), rightWidth);
          }
        }}
      >
        <span className="resizable-handle-grip" aria-hidden="true" />
      </div>
      <div className="resizable-column resizable-column--main">{main}</div>
      {canShowRight && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize session summary"
            className="resizable-handle"
            tabIndex={0}
            onPointerDown={(event) => handleDrag("right", event)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 1200;
                const maxRight = containerWidth - minMainWidth - minLeftWidth;
                const next = clamp(rightWidth + 16, minRightWidth, maxRight);
                persistWidth(leftWidth, next);
              } else if (event.key === "ArrowRight") {
                persistWidth(leftWidth, clamp(rightWidth - 16, minRightWidth, rightWidth));
              }
            }}
          >
            <span className="resizable-handle-grip" aria-hidden="true" />
          </div>
          <div className="resizable-column resizable-column--right">{right}</div>
        </>
      )}
      {!canShowRight && right && (
        <button
          type="button"
          className="resizable-column-reveal"
          onClick={() => onRightCollapseChange && onRightCollapseChange(false)}
        >
          Show session summary
        </button>
      )}
    </div>
  );
};
