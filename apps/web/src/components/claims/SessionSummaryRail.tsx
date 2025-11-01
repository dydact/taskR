import React from "react";

export type SessionSummaryTone = "accent" | "info" | "success" | "warning" | "danger" | "neutral";

export type SessionSummaryQuickAction = {
  id: string;
  icon?: React.ReactNode;
  label: string;
  onSelect: () => void;
};

export type SessionSummaryMetric = {
  label: string;
  value: React.ReactNode;
  hint?: string;
};

export type SessionSummaryCard = {
  id: string;
  title: string;
  subtitle?: string;
  statusLabel?: string;
  tone?: SessionSummaryTone;
  metrics?: SessionSummaryMetric[];
  quickActions?: SessionSummaryQuickAction[];
  footer?: React.ReactNode;
};

export type SessionSummaryRailProps = {
  cards: SessionSummaryCard[];
  isPinned: boolean;
  onTogglePinned: () => void;
};

export const SessionSummaryRail: React.FC<SessionSummaryRailProps> = ({ cards, isPinned, onTogglePinned }) => {
  return (
    <aside className="session-summary-rail" aria-label="Session summary">
      <header className="session-summary-rail-header">
        <h3>Session Summary</h3>
        <button type="button" className="session-summary-pin" onClick={onTogglePinned} aria-pressed={isPinned}>
          {isPinned ? "Unpin" : "Pin"}
        </button>
      </header>
      <div className="session-summary-cards">
        {cards.map((card) => (
          <article key={card.id} className={`session-summary-card glass-surface tone-${card.tone ?? "accent"}`}>
            <header>
              <div className="session-summary-card-titles">
                <h4>{card.title}</h4>
                {card.subtitle && <p className="session-summary-card-sub">{card.subtitle}</p>}
              </div>
              {card.statusLabel && <span className="session-summary-status">{card.statusLabel}</span>}
            </header>
            {(card.metrics?.length ?? 0) > 0 && (
              <dl className="session-summary-metrics">
                {card.metrics?.map((metric) => (
                  <div key={metric.label} className="session-summary-metric">
                    <dt>{metric.label}</dt>
                    <dd>
                      <span>{metric.value}</span>
                      {metric.hint && <span className="session-summary-hint">{metric.hint}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {card.footer && <footer className="session-summary-footer">{card.footer}</footer>}
            {card.quickActions && card.quickActions.length > 0 && (
              <div className="session-summary-actions" role="group" aria-label={`${card.title} actions`}>
                {card.quickActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="session-summary-action"
                    onClick={action.onSelect}
                    aria-label={action.label}
                    title={action.label}
                  >
                    {action.icon ?? <span aria-hidden="true">↗</span>}
                  </button>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </aside>
  );
};
