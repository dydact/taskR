import React, { useEffect, useMemo, useState } from "react";
import type { Task, TaskComment, CustomFieldValue, Subtask } from "../../types/task";
import type { HierarchyStatus } from "../../types/hierarchy";
import type { Doc } from "../../types/doc";
import type { MeetingNote } from "../../types/meeting";
import { MeetingNoteCard } from "../meeting/MeetingNoteCard";

type TaskUpdate = {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  due_at?: string | null;
};

type TaskDrawerProps = {
  open: boolean;
  task: Task | null;
  statuses: HierarchyStatus[];
  onClose(): void;
  onUpdate(taskId: string, updates: TaskUpdate): Promise<void> | void;
  comments: TaskComment[];
  commentsLoading: boolean;
  onAddComment(taskId: string, body: string): Promise<void>;
  customFields: CustomFieldValue[];
  customFieldsLoading: boolean;
  onCustomFieldChange(fieldId: string, value: unknown): Promise<void>;
  subtasks: Subtask[];
  subtasksLoading: boolean;
  onCreateSubtask(title: string): Promise<void>;
  onToggleSubtask(subtaskId: string, status: string): Promise<void>;
  onDeleteSubtask(subtaskId: string): Promise<void>;
  docs: Doc[];
  docsLoading: boolean;
  meetingNotes: MeetingNote[];
  meetingNotesLoading: boolean;
  meetingNotesError: string | null;
  onRefreshMeetingNotes?: () => void;
  onRegenerateMeetingNote?: (noteId: string) => Promise<void> | void;
};

const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"] as const;

export const TaskDrawer: React.FC<TaskDrawerProps> = ({
  open,
  task,
  statuses,
  onClose,
  onUpdate,
  comments,
  commentsLoading,
  onAddComment,
  customFields,
  customFieldsLoading,
  onCustomFieldChange,
  subtasks,
  subtasksLoading,
  onCreateSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  docs,
  docsLoading,
  meetingNotes,
  meetingNotesLoading,
  meetingNotesError,
  onRefreshMeetingNotes,
  onRegenerateMeetingNote
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "activity" | "subtasks" | "docs">("overview");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<string>("");
  const [commentDraft, setCommentDraft] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [isCreatingSubtask, setIsCreatingSubtask] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
    } else {
      setTitle("");
      setDescription("");
    }
    setActiveTab("overview");
    setEditingField(null);
    setFieldDrafts({});
    setNewSubtaskTitle("");
  }, [task]);

  const selectedStatus = useMemo(
    () => statuses.find((status) => status.name === task?.status),
    [statuses, task?.status]
  );

  const formatDueDate = (value: unknown) => {
    if (!value) return "";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return date.toLocaleDateString();
  };

  if (!open || !task) {
    return null;
  }

  const handleUpdate = async (updates: TaskUpdate) => {
    if (!task) return;
    const filteredEntries = Object.entries(updates).filter(([, value]) => value !== undefined);
    if (filteredEntries.length === 0) return;
    await onUpdate(task.task_id, Object.fromEntries(filteredEntries));
  };

  const handleSubmitComment = async () => {
    if (!commentDraft.trim()) return;
    setSubmittingComment(true);
    try {
      await onAddComment(task.task_id, commentDraft.trim());
      setCommentDraft("");
    } finally {
      setSubmittingComment(false);
    }
  };

  const beginEditField = (field: CustomFieldValue) => {
    setEditingField(field.field_id);
    let valueString = "";
    if (Array.isArray(field.value)) {
      valueString = field.value.join(", ");
    } else if (field.value !== null && field.value !== undefined) {
      valueString = String(field.value);
    }
    setFieldDrafts((prev) => ({ ...prev, [field.field_id]: valueString }));
  };

  const cancelEditField = (fieldId: string) => {
    setEditingField((current) => (current === fieldId ? null : current));
    setFieldDrafts((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const saveField = async (field: CustomFieldValue) => {
    const draft = fieldDrafts[field.field_id] ?? "";
    let parsed: unknown = draft;
    switch (field.field_type) {
      case "number":
        parsed = draft.trim() === "" ? null : Number(draft);
        if (parsed !== null && Number.isNaN(parsed)) {
          console.error("Invalid number input");
          return;
        }
        break;
    case "boolean":
        parsed = draft === "true";
        break;
      case "multi_select":
        parsed = draft
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
        break;
      case "date":
        parsed = draft || null;
        break;
      default:
        parsed = draft;
    }

    await onCustomFieldChange(field.field_id, parsed);
    setEditingField(null);
    setFieldDrafts((prev) => {
      const next = { ...prev };
      delete next[field.field_id];
      return next;
    });
  };

  const handleCreateSubtaskSubmit = async () => {
    if (!newSubtaskTitle.trim()) return;
    setIsCreatingSubtask(true);
    try {
      await onCreateSubtask(newSubtaskTitle.trim());
      setNewSubtaskTitle("");
    } finally {
      setIsCreatingSubtask(false);
    }
  };

  return (
    <div
      className="task-drawer-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <aside
        className="task-drawer"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="task-drawer-header">
          <div>
            <input
              className="task-drawer-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => {
                if (title !== task.title) {
                  handleUpdate({ title });
                }
              }}
            />
            <p className="task-drawer-subtitle">Task ID: {task.task_id.slice(0, 8)}</p>
          </div>
          <button type="button" className="task-drawer-close" onClick={onClose} aria-label="Close task drawer">
            ×
          </button>
        </header>

        <nav className="task-drawer-tabs" aria-label="Task sections">
          {[
            { key: "overview", label: "Overview" },
            { key: "activity", label: "Activity" },
            { key: "subtasks", label: "Subtasks" },
            { key: "docs", label: "Docs" }
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`task-drawer-tab${activeTab === tab.key ? " active" : ""}`}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="task-drawer-content" role="tabpanel">
          {activeTab === "overview" && (
            <div className="task-overview">
              <div className="task-meta-grid">
                <label className="task-meta-field">
                  <span>Status</span>
                  <select
                    value={task.status}
                    onChange={(event) => handleUpdate({ status: event.target.value })}
                  >
                    {statuses.map((status) => (
                      <option key={status.status_id} value={status.name}>
                        {status.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="task-meta-field">
                  <span>Priority</span>
                  <select
                    value={task.priority}
                    onChange={(event) => handleUpdate({ priority: event.target.value })}
                  >
                    {PRIORITY_OPTIONS.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority.charAt(0).toUpperCase() + priority.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="task-meta-field">
                  <span>Due Date</span>
                  <input
                    type="date"
                    value={task.due_at ? task.due_at.substring(0, 10) : ""}
                    onChange={(event) => {
                      const value = event.target.value || null;
                      handleUpdate({ due_at: value });
                    }}
                  />
                </label>
                <div className="task-meta-field">
                  <span>Status Category</span>
                  <p>{selectedStatus?.category ?? "—"}</p>
                </div>
              </div>

              <label className="task-description-field">
                <span>Description</span>
                <textarea
                  value={description}
                  placeholder="Add more context for this task"
                  onChange={(event) => setDescription(event.target.value)}
                  onBlur={() => {
                    if ((task.description ?? "") !== description) {
                      handleUpdate({ description });
                    }
                  }}
                  rows={6}
                />
              </label>

              <section className="task-custom-fields">
                <h3>Custom Fields</h3>
                {customFieldsLoading ? (
                  <p className="task-activity-empty">Loading fields…</p>
                ) : customFields.length === 0 ? (
                  <p className="task-activity-empty">No custom fields configured for this list.</p>
                ) : (
                  <div className="task-custom-fields-grid">
                    {customFields.map((field) => {
                      const isEditing = editingField === field.field_id;
                      const displayValue = Array.isArray(field.value)
                        ? field.value.join(", ")
                        : field.value ?? "—";
                      return (
                        <div key={field.field_id} className="task-custom-field">
                          <span className="task-custom-field-label">{field.field_name}</span>
                          {isEditing ? (
                            <div className="task-custom-field-edit">
                              {field.field_type === "boolean" ? (
                                <select
                                  value={fieldDrafts[field.field_id] ?? String(displayValue)}
                                  onChange={(event) =>
                                    setFieldDrafts((prev) => ({ ...prev, [field.field_id]: event.target.value }))
                                  }
                                >
                                  <option value="true">True</option>
                                  <option value="false">False</option>
                                </select>
                              ) : field.field_type === "select" ? (
                                <input
                                  value={fieldDrafts[field.field_id] ?? String(displayValue)}
                                  onChange={(event) =>
                                    setFieldDrafts((prev) => ({ ...prev, [field.field_id]: event.target.value }))
                                  }
                                  placeholder="Enter value"
                                />
                              ) : field.field_type === "multi_select" ? (
                                <input
                                  value={fieldDrafts[field.field_id] ?? String(displayValue)}
                                  onChange={(event) =>
                                    setFieldDrafts((prev) => ({ ...prev, [field.field_id]: event.target.value }))
                                  }
                                  placeholder="Option1, Option2"
                                />
                              ) : field.field_type === "date" ? (
                                <input
                                  type="date"
                                  value={fieldDrafts[field.field_id] ?? (typeof displayValue === "string" ? displayValue.slice(0, 10) : "")}
                                  onChange={(event) =>
                                    setFieldDrafts((prev) => ({ ...prev, [field.field_id]: event.target.value }))
                                  }
                                />
                              ) : field.field_type === "number" ? (
                                <input
                                  type="number"
                                  value={fieldDrafts[field.field_id] ?? String(displayValue)}
                                  onChange={(event) =>
                                    setFieldDrafts((prev) => ({ ...prev, [field.field_id]: event.target.value }))
                                  }
                                />
                              ) : (
                                <input
                                  value={fieldDrafts[field.field_id] ?? String(displayValue)}
                                  onChange={(event) =>
                                    setFieldDrafts((prev) => ({ ...prev, [field.field_id]: event.target.value }))
                                  }
                                />
                              )}
                              <div className="task-custom-field-actions">
                                <button type="button" onClick={() => saveField(field)}>
                                  Save
                                </button>
                                <button type="button" onClick={() => cancelEditField(field.field_id)}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="task-custom-field-display">
                              <span className="task-custom-field-value">{String(displayValue)}</span>
                              <button type="button" onClick={() => beginEditField(field)}>
                                Edit
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="task-attachments">
                <h3>Attachments</h3>
                <p className="task-attachments-empty">File uploads will be available soon.</p>
                <button type="button" className="task-attachments-btn" disabled>
                  Upload file
                </button>
              </section>

              <section className="task-meeting-notes">
                <div className="task-section-header">
                  <h3>Meeting Summaries</h3>
                  {onRefreshMeetingNotes && (
                    <button type="button" onClick={onRefreshMeetingNotes} disabled={meetingNotesLoading}>
                      {meetingNotesLoading ? "Refreshing…" : "Refresh"}
                    </button>
                  )}
                </div>
                {meetingNotesLoading ? (
                  <p className="task-activity-empty">Loading meeting summaries…</p>
                ) : meetingNotesError ? (
                  <p className="task-meeting-note-error">{meetingNotesError}</p>
                ) : meetingNotes.length === 0 ? (
                  <p className="task-activity-empty">No meeting notes linked to this task.</p>
                ) : (
                  <div className="task-meeting-notes-list">
                    {meetingNotes.map((note) => {
                      const actionItems = Array.isArray(note.action_items) ? note.action_items : [];
                      const canRegenerate = typeof onRegenerateMeetingNote === "function";
                      return (
                        <MeetingNoteCard
                          key={note.note_id}
                          title={note.title || "Meeting Summary"}
                          summary={note.summary}
                          summaryMeta={note.summary_meta ?? undefined}
                          onRegenerate={
                            canRegenerate
                              ? () => {
                                  void Promise.resolve(onRegenerateMeetingNote(note.note_id)).catch(() => {});
                                }
                              : undefined
                          }
                          className="task-meeting-note-card"
                        >
                          <details className="task-meeting-note-details">
                            <summary>Original Note</summary>
                            <p>{note.content}</p>
                          </details>
                          {actionItems.length > 0 && (
                            <div className="task-meeting-note-section">
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
                                    <li key={`${note.note_id}-action-${index}`}>
                                      <span>{text}</span>
                                      {item.owner && <span className="task-meeting-note-meta"> — Owner: {item.owner}</span>}
                                      {item.due && (
                                        <span className="task-meeting-note-meta"> (Due {formatDueDate(item.due)})</span>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                          <div className="task-meeting-note-meta-grid">
                            <span>Note ID: {note.note_id}</span>
                            {note.event_id && <span>Event: {note.event_id}</span>}
                            {note.task_id && <span>Task: {note.task_id}</span>}
                          </div>
                        </MeetingNoteCard>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === "activity" && (
            <div className="task-activity">
              {commentsLoading ? (
                <p className="task-activity-empty">Loading comments…</p>
              ) : comments.length === 0 ? (
                <p className="task-activity-empty">No comments yet. Start the conversation below.</p>
              ) : (
                <ul className="task-comment-list">
                  {comments.map((comment) => (
                    <li key={comment.comment_id} className="task-comment-item">
                      <div className="task-comment-header">
                        <span className="task-comment-author">{comment.author_id ? comment.author_id.slice(0, 8) : "Unknown"}</span>
                        <time dateTime={comment.created_at}>
                          {new Date(comment.created_at).toLocaleString()}
                        </time>
                      </div>
                      <p className="task-comment-body">{comment.body}</p>
                    </li>
                  ))}
                </ul>
              )}

              <div className="task-comment-composer">
                <textarea
                  value={commentDraft}
                  placeholder="Add a comment"
                  rows={3}
                  onChange={(event) => setCommentDraft(event.target.value)}
                />
                <div className="task-comment-actions">
                  <button
                    type="button"
                    disabled={!commentDraft.trim() || submittingComment}
                    onClick={handleSubmitComment}
                  >
                    {submittingComment ? "Posting…" : "Post Comment"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "subtasks" && (
            <div className="task-subtasks">
              {subtasksLoading ? (
                <p className="task-activity-empty">Loading subtasks…</p>
              ) : subtasks.length === 0 ? (
                <p className="task-activity-empty">No subtasks yet. Add one below.</p>
              ) : (
                <ul className="task-subtask-list">
                  {subtasks.map((subtask) => (
                    <li key={subtask.subtask_id} className="task-subtask-item">
                      <label>
                        <input
                          type="checkbox"
                          checked={subtask.status === "done"}
                          onChange={(event) =>
                            onToggleSubtask(subtask.subtask_id, event.target.checked ? "done" : "pending")
                          }
                        />
                        <span className={subtask.status === "done" ? "task-subtask-title done" : "task-subtask-title"}>
                          {subtask.title}
                        </span>
                      </label>
                      <button type="button" onClick={() => onDeleteSubtask(subtask.subtask_id)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="task-subtask-create">
                <input
                  value={newSubtaskTitle}
                  onChange={(event) => setNewSubtaskTitle(event.target.value)}
                  placeholder="New subtask"
                />
                <button
                  type="button"
                  onClick={handleCreateSubtaskSubmit}
                  disabled={!newSubtaskTitle.trim() || isCreatingSubtask}
                >
                  {isCreatingSubtask ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          )}

          {activeTab === "docs" && (
            <div className="task-docs">
              {docsLoading ? (
                <p className="task-activity-empty">Loading docs…</p>
              ) : docs.length === 0 ? (
                <p className="task-activity-empty">No linked docs yet. Create one from the Docs view.</p>
              ) : (
                <ul className="task-doc-list">
                  {docs.map((doc) => (
                    <li key={doc.doc_id} className="task-doc-item">
                      <div>
                        <strong>{doc.title}</strong>
                        {doc.summary && <p className="task-doc-summary">{doc.summary}</p>}
                      </div>
                      <span className="task-doc-updated">
                        Updated {new Date(doc.updated_at).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
