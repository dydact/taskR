import React, { ReactNode } from "react";

export type SummaryMeta = {
  summary_id?: string;
  source?: string;
  generated_at?: string;
  [key: string]: unknown;
};

type MeetingNoteCardProps = {
  summary?: string | null;
  summaryMeta?: SummaryMeta | null;
  onRegenerate?: () => void;
  className?: string;
  title?: string;
  children?: ReactNode;
};

const formatDate = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const MeetingNoteCard: React.FC<MeetingNoteCardProps> = ({
  summary,
  summaryMeta,
  onRegenerate,
  className,
  title = "AI Summary",
  children,
}) => {
  if (!summary && !summaryMeta) {
    return null;
  }

  return (
    <section className={`meeting-note-card ${className ?? ""}`}>
      <header className="meeting-note-card__header">
        <h4>{title}</h4>
        {onRegenerate && (
          <button type="button" onClick={onRegenerate} className="meeting-note-card__action">
            Regenerate
          </button>
        )}
      </header>
      {summary && <p className="meeting-note-card__summary">{summary}</p>}
      {summaryMeta && (
        <dl className="meeting-note-card__meta">
          {summaryMeta.summary_id && (
            <div>
              <dt>Summary ID</dt>
              <dd>{String(summaryMeta.summary_id)}</dd>
            </div>
          )}
          {summaryMeta.source && (
            <div>
              <dt>Source</dt>
              <dd>{String(summaryMeta.source)}</dd>
            </div>
          )}
          {summaryMeta.generated_at && (
            <div>
              <dt>Generated</dt>
              <dd>{formatDate(String(summaryMeta.generated_at))}</dd>
            </div>
          )}
        </dl>
      )}
      {children}
    </section>
  );
};
