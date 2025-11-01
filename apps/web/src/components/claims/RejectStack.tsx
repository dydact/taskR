import React from "react";

export type RejectTone = "danger" | "warning" | "info";

export type RejectPillAction = {
  id: string;
  label: string;
  onSelect: () => void;
};

export type RejectPill = {
  id: string;
  code: string;
  description?: string;
  tone?: RejectTone;
  levelLabel: string;
  occurredAt?: string;
  primaryAction?: RejectPillAction;
  secondaryActions?: RejectPillAction[];
};

export type RejectGroup = {
  id: string;
  label: string;
  count: number;
  pills: RejectPill[];
};

export type RejectStackProps = {
  groups: RejectGroup[];
};

export const RejectStack: React.FC<RejectStackProps> = ({ groups }) => {
  if (groups.length === 0) {
    return <p className="claims-empty">No rejects recorded.</p>;
  }

  return (
    <div className="reject-stack">
      {groups.map((group) => (
        <section key={group.id} className="reject-group glass-surface">
          <header className="reject-group-header">
            <h4>{group.label}</h4>
            <span className="reject-group-count">{group.count}</span>
          </header>
          <div className="reject-pill-collection">
            {group.pills.map((pill) => (
              <article key={pill.id} className={`reject-pill tone-${pill.tone ?? "danger"}`}>
                <div className="reject-pill-header">
                  <span className="reject-pill-code">{pill.code}</span>
                  <span className="reject-pill-level">{pill.levelLabel}</span>
                </div>
                {pill.description && <p className="reject-pill-description">{pill.description}</p>}
                {pill.occurredAt && <p className="reject-pill-meta">{pill.occurredAt}</p>}
                <div className="reject-pill-actions">
                  {pill.primaryAction && (
                    <button type="button" className="reject-pill-primary" onClick={pill.primaryAction.onSelect}>
                      {pill.primaryAction.label}
                    </button>
                  )}
                  {pill.secondaryActions?.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      className="reject-pill-secondary"
                      onClick={action.onSelect}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
