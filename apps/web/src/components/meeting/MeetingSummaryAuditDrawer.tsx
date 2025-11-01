import React from "react";
import { MeetingNote } from "../../types/meeting";
import { MeetingNoteCard } from "./MeetingNoteCard";

type MeetingSummaryAuditDrawerProps = {
  open: boolean;
  notes: MeetingNote[];
  loading: boolean;
  error: string | null;
  onClose(): void;
  onRefresh(): void;
  onRegenerate(noteId: string): Promise<void> | void;
};

export const MeetingSummaryAuditDrawer: React.FC<MeetingSummaryAuditDrawerProps> = ({
  open,
  notes,
  loading,
  error,
  onClose,
  onRefresh,
  onRegenerate
}) => {
  const formatDate = (value: unknown) => {
    if (!value) return "";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return date.toLocaleDateString();
  };

  const formatDateTime = (value: unknown) => {
    if (!value) return "";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return date.toLocaleString();
  };

  if (!open) {
    return null;
  }

  return (
    <div className="meeting-audit-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <aside
        className="meeting-audit-drawer"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="meeting-audit-header">
          <div>
            <h2>Meeting Summary Audit</h2>
            <p className="meeting-audit-subtitle">
              Review captured meeting notes, regenerate summaries, and inspect metadata.
            </p>
          </div>
          <div className="meeting-audit-actions">
            <button type="button" onClick={onRefresh} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button type="button" className="meeting-audit-close" onClick={onClose} aria-label="Close audit drawer">
              ×
            </button>
          </div>
        </header>
        <div className="meeting-audit-content">
          {error && <p className="meeting-audit-error">{error}</p>}
          {!error && loading && <p className="meeting-audit-message">Loading notes…</p>}
          {!error && !loading && notes.length === 0 && (
            <p className="meeting-audit-message">No meeting notes recorded for this tenant yet.</p>
          )}
          {!error && !loading && notes.length > 0 && (
            <div className="meeting-audit-list">
              {notes.map((note) => {
                const actionItems = Array.isArray(note.action_items) ? note.action_items : [];
                return (
                  <div key={note.note_id} className="meeting-audit-card">
                    <div className="meeting-audit-meta">
                      <span>Note ID: {note.note_id}</span>
                      {note.event_id && <span>Event: {note.event_id}</span>}
                      {note.task_id && <span>Task: {note.task_id}</span>}
                      <span>Captured: {formatDateTime(note.created_at)}</span>
                    </div>
                    <MeetingNoteCard
                      title={note.title || "Meeting Summary"}
                      summary={note.summary}
                      summaryMeta={note.summary_meta ?? undefined}
                      onRegenerate={() => {
                        void Promise.resolve(onRegenerate(note.note_id)).catch(() => {});
                      }}
                    >
                      <details className="meeting-audit-details">
                        <summary>Original Note</summary>
                        <p>{note.content}</p>
                      </details>
                      {actionItems.length > 0 && (
                        <div className="meeting-audit-section">
                          <h4>Action Items</h4>
                          <ul>
                            {actionItems.map((item, index) => {
                              const text =
                                typeof item.text === "string"
                                  ? item.text
                                  : typeof item.summary === "string"
                                  ? item.summary
                                  : typeof item.title === "string"
                                  ? item.title
                                  : JSON.stringify(item);
                              return (
                                <li key={index}>
                                  <span>{text}</span>
                                  {item.owner && <span className="meeting-audit-item-meta"> — Owner: {item.owner}</span>}
                                  {item.due && (
                                    <span className="meeting-audit-item-meta"> (Due {formatDate(item.due)})</span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </MeetingNoteCard>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
