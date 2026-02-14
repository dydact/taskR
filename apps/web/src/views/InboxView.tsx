import React, { useCallback, useMemo, useState } from "react";
import type { Task } from "../types/task";

type FilterTab = "needs_action" | "waiting" | "snoozed" | "all";

type InboxViewProps = {
  tasks: Task[];
  onOpenTask: (taskId: string) => void;
  onCompleteTask: (taskId: string) => void;
  onSnoozeTask: (taskId: string, until: string) => void;
  onDelegateTask: (taskId: string) => void;
};

const SNOOZE_OPTIONS = [
  { label: "1 hour", value: 1 },
  { label: "4 hours", value: 4 },
  { label: "Tomorrow", value: 24 },
  { label: "Next week", value: 168 },
];

const priorityOrder: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

const priorityLabel = (priority: string) => {
  const normalized = priority.toLowerCase();
  if (normalized === "urgent") return "Urgent";
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";
  return "None";
};

const statusToFilter = (status: string): FilterTab => {
  const normalized = status.toLowerCase();
  if (["done", "completed", "closed"].includes(normalized)) return "all";
  if (["waiting", "blocked", "on_hold"].includes(normalized)) return "waiting";
  if (["snoozed", "deferred"].includes(normalized)) return "snoozed";
  return "needs_action";
};

const formatRelativeTime = (dateString?: string | null): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < -7) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  if (diffDays < -1) return `${Math.abs(diffDays)} days ago`;
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7) return `In ${diffDays} days`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const isOverdue = (dateString?: string | null): boolean => {
  if (!dateString) return false;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
};

const getSnoozeUntil = (hours: number): string => {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
};

export const InboxView: React.FC<InboxViewProps> = ({
  tasks,
  onOpenTask,
  onCompleteTask,
  onSnoozeTask,
  onDelegateTask,
}) => {
  const [activeTab, setActiveTab] = useState<FilterTab>("needs_action");
  const [snoozeOpenFor, setSnoozeOpenFor] = useState<string | null>(null);

  const categorizedTasks = useMemo(() => {
    const categories: Record<FilterTab, Task[]> = {
      needs_action: [],
      waiting: [],
      snoozed: [],
      all: [],
    };

    for (const task of tasks) {
      const filter = statusToFilter(task.status);
      categories[filter].push(task);
      categories.all.push(task);
    }

    // Sort each category by priority then due date
    const sortFn = (a: Task, b: Task) => {
      const priorityDiff =
        (priorityOrder[a.priority.toLowerCase()] ?? 4) -
        (priorityOrder[b.priority.toLowerCase()] ?? 4);
      if (priorityDiff !== 0) return priorityDiff;

      const aTime = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const bTime = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      return aTime - bTime;
    };

    categories.needs_action.sort(sortFn);
    categories.waiting.sort(sortFn);
    categories.snoozed.sort(sortFn);
    categories.all.sort(sortFn);

    return categories;
  }, [tasks]);

  const counts = useMemo(
    () => ({
      needs_action: categorizedTasks.needs_action.length,
      waiting: categorizedTasks.waiting.length,
      snoozed: categorizedTasks.snoozed.length,
      all: categorizedTasks.all.length,
    }),
    [categorizedTasks]
  );

  const filteredTasks = categorizedTasks[activeTab];

  const handleSnooze = useCallback(
    (taskId: string, hours: number) => {
      onSnoozeTask(taskId, getSnoozeUntil(hours));
      setSnoozeOpenFor(null);
    },
    [onSnoozeTask]
  );

  const toggleSnoozePicker = useCallback((taskId: string) => {
    setSnoozeOpenFor((prev) => (prev === taskId ? null : taskId));
  }, []);

  return (
    <div className="inbox-view">
      <header className="inbox-header glass-surface">
        <div className="inbox-header__title">
          <h2>Inbox</h2>
          <p className="inbox-header__subtitle">
            Tasks assigned to you that need attention
          </p>
        </div>
        <div className="inbox-summary">
          <div className="inbox-summary__item">
            <span className="inbox-summary__value">{counts.needs_action}</span>
            <span className="inbox-summary__label">Needs Action</span>
          </div>
          <div className="inbox-summary__item">
            <span className="inbox-summary__value">{counts.waiting}</span>
            <span className="inbox-summary__label">Waiting</span>
          </div>
          <div className="inbox-summary__item">
            <span className="inbox-summary__value">{counts.snoozed}</span>
            <span className="inbox-summary__label">Snoozed</span>
          </div>
        </div>
      </header>

      <nav className="inbox-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "needs_action"}
          className={activeTab === "needs_action" ? "active" : ""}
          onClick={() => setActiveTab("needs_action")}
        >
          Needs Action
          {counts.needs_action > 0 && (
            <span className="inbox-tab-badge inbox-tab-badge--urgent">
              {counts.needs_action}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "waiting"}
          className={activeTab === "waiting" ? "active" : ""}
          onClick={() => setActiveTab("waiting")}
        >
          Waiting
          {counts.waiting > 0 && (
            <span className="inbox-tab-badge">{counts.waiting}</span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "snoozed"}
          className={activeTab === "snoozed" ? "active" : ""}
          onClick={() => setActiveTab("snoozed")}
        >
          Snoozed
          {counts.snoozed > 0 && (
            <span className="inbox-tab-badge">{counts.snoozed}</span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          className={activeTab === "all" ? "active" : ""}
          onClick={() => setActiveTab("all")}
        >
          All
          {counts.all > 0 && (
            <span className="inbox-tab-badge inbox-tab-badge--muted">
              {counts.all}
            </span>
          )}
        </button>
      </nav>

      <div className="inbox-list" role="tabpanel">
        {filteredTasks.length === 0 ? (
          <div className="inbox-empty glass-surface">
            <p>
              {activeTab === "needs_action"
                ? "No tasks need action right now."
                : activeTab === "waiting"
                ? "No tasks are waiting."
                : activeTab === "snoozed"
                ? "No snoozed tasks."
                : "No tasks in your inbox."}
            </p>
          </div>
        ) : (
          <ul className="inbox-task-list">
            {filteredTasks.map((task) => (
              <li key={task.task_id} className="inbox-task-item glass-surface">
                <button
                  type="button"
                  className="inbox-task-card"
                  onClick={() => onOpenTask(task.task_id)}
                >
                  <div className="inbox-task-card__header">
                    <span
                      className={`inbox-priority inbox-priority--${task.priority.toLowerCase()}`}
                      title={`Priority: ${priorityLabel(task.priority)}`}
                    >
                      {priorityLabel(task.priority)}
                    </span>
                    <span className={`inbox-status inbox-status--${task.status.toLowerCase().replace(/\s/g, "_")}`}>
                      {task.status}
                    </span>
                  </div>

                  <h3 className="inbox-task-card__title">{task.title}</h3>

                  {task.description && (
                    <p className="inbox-task-card__description">
                      {task.description.length > 120
                        ? `${task.description.slice(0, 120)}...`
                        : task.description}
                    </p>
                  )}

                  <div className="inbox-task-card__meta">
                    {task.due_at && (
                      <span
                        className={`inbox-due ${isOverdue(task.due_at) ? "inbox-due--overdue" : ""}`}
                      >
                        Due {formatRelativeTime(task.due_at)}
                      </span>
                    )}
                    {task.list_id && (
                      <span className="inbox-list-tag">{task.list_id}</span>
                    )}
                  </div>
                </button>

                <div className="inbox-task-actions">
                  <button
                    type="button"
                    className="inbox-action inbox-action--complete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCompleteTask(task.task_id);
                    }}
                    title="Mark as complete"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Complete
                  </button>

                  <div className="inbox-snooze-wrapper">
                    <button
                      type="button"
                      className="inbox-action inbox-action--snooze"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSnoozePicker(task.task_id);
                      }}
                      title="Snooze task"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      Snooze
                    </button>

                    {snoozeOpenFor === task.task_id && (
                      <div className="inbox-snooze-picker">
                        {SNOOZE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSnooze(task.task_id, option.value);
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="inbox-action inbox-action--delegate"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelegateTask(task.task_id);
                    }}
                    title="Delegate task"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    Delegate
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
