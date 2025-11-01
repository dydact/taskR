import React, { useEffect, useMemo, useRef, useState } from "react";

export type TimelineRibbonTone = "accent" | "info" | "success" | "warning" | "danger" | "neutral";

export type TimelineRibbonBadge = {
  id: string;
  label: string;
  tone?: TimelineRibbonTone;
};

export type TimelineRibbonAction = {
  id: string;
  icon?: React.ReactNode;
  label: string;
  onSelect: () => void;
};

export type TimelineRibbonDetail = {
  label: string;
  value: React.ReactNode;
};

export type TimelineRibbonEvent = {
  id: string;
  title: string;
  subtitle?: string;
  statusTone?: TimelineRibbonTone;
  timestamp: string;
  relativeLabel?: string;
  description?: string;
  badges?: TimelineRibbonBadge[];
  details?: TimelineRibbonDetail[];
  payloadPreview?: React.ReactNode;
  actions?: TimelineRibbonAction[];
};

export type TimelineRibbonProps = {
  events: TimelineRibbonEvent[];
  activeEventId?: string | null;
  onEventSelect?: (event: TimelineRibbonEvent) => void;
  storageKey?: string;
};

const formatRelative = (milliseconds: number) => {
  if (Number.isNaN(milliseconds) || !Number.isFinite(milliseconds)) return "—";
  if (milliseconds <= 0) return "+0m";
  const totalSeconds = Math.floor(milliseconds / 1000);
  if (totalSeconds < 60) return `+${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `+${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `+${totalHours}h`;
  const days = Math.floor(totalHours / 24);
  return `+${days}d`;
};

export const TimelineRibbon: React.FC<TimelineRibbonProps> = ({ events, activeEventId, onEventSelect, storageKey }) => {
  const sortedEvents = useMemo(() => {
    const next = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const base = next.length > 0 ? new Date(next[0].timestamp).getTime() : null;
    if (base) {
      return next.map((event) => {
        if (event.relativeLabel) return event;
        const ts = new Date(event.timestamp).getTime();
        const relativeLabel = formatRelative(ts - base);
        return { ...event, relativeLabel };
      });
    }
    return next;
  }, [events]);

  const [internalActiveId, setInternalActiveId] = useState<string | null>(null);
  const resolvedActiveId = activeEventId ?? internalActiveId;
  useEffect(() => {
    if (sortedEvents.length === 0) {
      setInternalActiveId(null);
      return;
    }
    if (activeEventId && sortedEvents.some((event) => event.id === activeEventId)) {
      setInternalActiveId(activeEventId);
      return;
    }
    if (internalActiveId && sortedEvents.some((event) => event.id === internalActiveId)) {
      return;
    }
    if (storageKey) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored && sortedEvents.some((event) => event.id === stored)) {
          setInternalActiveId(stored);
          return;
        }
      } catch {
        /* ignore */
      }
    }
    setInternalActiveId(sortedEvents.at(-1)?.id ?? null);
  }, [activeEventId, internalActiveId, sortedEvents, storageKey]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showBackToNewest, setShowBackToNewest] = useState(false);
  const newestId = sortedEvents.at(-1)?.id ?? null;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const handle = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setShowBackToNewest(scrollLeft + clientWidth < scrollWidth - 16);
    };
    container.addEventListener("scroll", handle);
    handle();
    return () => {
      container.removeEventListener("scroll", handle);
    };
  }, [sortedEvents]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    // Auto-scroll on new events when user is already at the edge.
    const atEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 16;
    if (atEnd) {
      requestAnimationFrame(() => {
        container.scrollTo({ left: container.scrollWidth, behavior: "smooth" });
      });
    }
  }, [sortedEvents]);

  const activeEvent = useMemo(
    () => sortedEvents.find((event) => event.id === resolvedActiveId) ?? sortedEvents.at(-1) ?? null,
    [resolvedActiveId, sortedEvents]
  );

  useEffect(() => {
    if (storageKey && resolvedActiveId) {
      try {
        localStorage.setItem(storageKey, resolvedActiveId);
      } catch {
        /* ignore */
      }
    }
  }, [resolvedActiveId, storageKey]);

  const selectEvent = (event: TimelineRibbonEvent) => {
    setInternalActiveId(event.id);
    onEventSelect?.(event);
  };

  const handleBackToNewest = () => {
    const container = scrollRef.current;
    if (!container || !newestId) return;
    container.scrollTo({ left: container.scrollWidth, behavior: "smooth" });
    const newestEvent = sortedEvents.find((event) => event.id === newestId);
    if (newestEvent) {
      selectEvent(newestEvent);
    }
  };

  return (
    <div className="timeline-ribbon">
      <div className="timeline-ribbon-track" ref={scrollRef}>
        <div className="timeline-ribbon-line" aria-hidden="true" />
        <div className="timeline-ribbon-nodes">
          {sortedEvents.map((event) => {
            const isActive = event.id === activeEvent?.id;
            return (
              <button
                key={event.id}
                type="button"
                className={`timeline-ribbon-node${isActive ? " active" : ""}`}
                onClick={() => selectEvent(event)}
                aria-pressed={isActive}
              >
                <span className={`timeline-ribbon-node-indicator tone-${event.statusTone ?? "info"}`} aria-hidden="true" />
                <span className="timeline-ribbon-node-label">{event.title}</span>
                {event.relativeLabel && <span className="timeline-ribbon-node-meta">{event.relativeLabel}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {showBackToNewest && (
        <button type="button" className="timeline-ribbon-back" onClick={handleBackToNewest}>
          Back to newest
        </button>
      )}
      {activeEvent && (
        <article className="timeline-ribbon-detail" aria-live="polite">
          <header className="timeline-ribbon-detail-header">
            <div>
              <h4>{activeEvent.title}</h4>
              <p className="timeline-ribbon-detail-sub">
                {activeEvent.subtitle}
                {activeEvent.subtitle && activeEvent.relativeLabel && " • "}
                {activeEvent.relativeLabel}
              </p>
            </div>
            {activeEvent.actions && activeEvent.actions.length > 0 && (
              <div className="timeline-ribbon-actions">
                {activeEvent.actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="timeline-ribbon-action"
                    onClick={action.onSelect}
                    aria-label={action.label}
                    title={action.label}
                  >
                    {action.icon ?? <span aria-hidden="true">↗</span>}
                  </button>
                ))}
              </div>
            )}
          </header>
          {activeEvent.description && <p className="timeline-ribbon-detail-description">{activeEvent.description}</p>}
          {(activeEvent.badges?.length ?? 0) > 0 && (
            <div className="timeline-ribbon-badges">
              {activeEvent.badges?.map((badge) => (
                <span key={badge.id} className={`timeline-ribbon-badge tone-${badge.tone ?? "info"}`}>
                  {badge.label}
                </span>
              ))}
            </div>
          )}
          {(activeEvent.details?.length ?? 0) > 0 && (
            <dl className="timeline-ribbon-detail-list">
              {activeEvent.details?.map((detail) => (
                <div key={detail.label} className="timeline-ribbon-detail-item">
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {activeEvent.payloadPreview && (
            <section className="timeline-ribbon-preview">
              <h5>Payload Preview</h5>
              <div className="timeline-ribbon-preview-body">{activeEvent.payloadPreview}</div>
            </section>
          )}
        </article>
      )}
    </div>
  );
};
