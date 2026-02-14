import React, { useMemo, useState } from "react";
import type { Task } from "../types/task";
import { useAIFeatures } from "../hooks/useAIFeatures";

type DashboardViewProps = {
  tasks: Task[];
  onOpenTask: (taskId: string) => void;
  onAcceptInsight?: (insightId: string) => void;
  onDeclineInsight?: (insightId: string) => void;
};

type AIInsight = {
  id: string;
  type: "velocity" | "blocker" | "grouping";
  title: string;
  description: string;
  primaryAction: string;
  secondaryAction: string;
};

type Milestone = {
  id: string;
  date: Date;
  title: string;
  time: string;
};

const MOCK_INSIGHTS: AIInsight[] = [
  {
    id: "insight-1",
    type: "velocity",
    title: "Sprint Velocity Insight",
    description: "Your team is trending 15% ahead of schedule. Consider pulling in 2-3 tasks from the backlog.",
    primaryAction: "Accept",
    secondaryAction: "Decline"
  },
  {
    id: "insight-2",
    type: "blocker",
    title: "Blocker Detected",
    description: "3 tasks in \"Review\" have been waiting for approval for over 48 hours.",
    primaryAction: "Notify Team",
    secondaryAction: "Dismiss"
  },
  {
    id: "insight-3",
    type: "grouping",
    title: "Smart Task Grouping",
    description: "I found 5 similar tasks that could be batched together for efficiency.",
    primaryAction: "Group Tasks",
    secondaryAction: "Skip"
  }
];

const MOCK_MILESTONES: Milestone[] = [
  { id: "m1", date: new Date(Date.now() + 86400000 * 1), title: "Sprint Planning", time: "2:00 PM" },
  { id: "m2", date: new Date(Date.now() + 86400000 * 3), title: "Design Review", time: "10:00 AM" },
  { id: "m3", date: new Date(Date.now() + 86400000 * 5), title: "Launch Deadline", time: "5:00 PM" },
  { id: "m4", date: new Date(Date.now() + 86400000 * 7), title: "Retrospective", time: "3:00 PM" }
];

function getStatusGroup(status: string): "ready" | "in_progress" | "review" | "other" {
  const s = status.toLowerCase();
  if (s === "todo" || s === "ready" || s === "open" || s === "backlog") return "ready";
  if (s === "in progress" || s === "in_progress" || s === "active" || s === "doing") return "in_progress";
  if (s === "review" || s === "in review" || s === "pending" || s === "waiting") return "review";
  return "other";
}

function getProgressFromTask(task: Task): { completed: number; total: number } {
  // Check for subtask progress in metadata or custom fields
  if (task.metadata_json?.subtask_progress) {
    const progress = task.metadata_json.subtask_progress as { completed: number; total: number };
    return progress;
  }
  // Default mock progress
  return { completed: Math.floor(Math.random() * 5), total: 5 };
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = ["#6c7bff", "#4ad0a7", "#f7b23b", "#ff6b6b", "#38bdf8", "#ec4899"];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const InsightCard: React.FC<{
  insight: AIInsight;
  onPrimary: () => void;
  onSecondary: () => void;
}> = ({ insight, onPrimary, onSecondary }) => {
  const iconMap = {
    velocity: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    blocker: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    grouping: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1" strokeLinecap="round" />
        <rect x="14" y="3" width="7" height="7" rx="1" strokeLinecap="round" />
        <rect x="3" y="14" width="7" height="7" rx="1" strokeLinecap="round" />
        <rect x="14" y="14" width="7" height="7" rx="1" strokeLinecap="round" />
      </svg>
    )
  };

  return (
    <div className={`dashboard-insight dashboard-insight--${insight.type}`}>
      <div className="dashboard-insight__icon">{iconMap[insight.type]}</div>
      <div className="dashboard-insight__content">
        <h4 className="dashboard-insight__title">{insight.title}</h4>
        <p className="dashboard-insight__description">{insight.description}</p>
      </div>
      <div className="dashboard-insight__actions">
        <button type="button" className="dashboard-insight__btn dashboard-insight__btn--primary" onClick={onPrimary}>
          {insight.primaryAction}
        </button>
        <button type="button" className="dashboard-insight__btn dashboard-insight__btn--secondary" onClick={onSecondary}>
          {insight.secondaryAction}
        </button>
      </div>
    </div>
  );
};

const BoardPreviewCard: React.FC<{
  task: Task;
  onClick: () => void;
}> = ({ task, onClick }) => {
  const progress = getProgressFromTask(task);
  const assignee = task.metadata_json?.assignee as string | undefined;
  const initials = assignee ? getInitials(assignee) : "??";
  const avatarColor = assignee ? getAvatarColor(assignee) : "#94a3b8";

  return (
    <button type="button" className="board-preview__card" onClick={onClick}>
      <span className="board-preview__card-title">{task.title}</span>
      <div className="board-preview__card-footer">
        <span className="board-preview__avatar" style={{ backgroundColor: avatarColor }}>
          {initials}
        </span>
        <span className="board-preview__progress">
          {progress.completed}/{progress.total}
        </span>
      </div>
    </button>
  );
};

const formatMilestoneDate = (date: Date): string => {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  tasks,
  onOpenTask,
  onAcceptInsight,
  onDeclineInsight
}) => {
  const { enabled: aiEnabled } = useAIFeatures();
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(new Set());

  const { ready, inProgress, review } = useMemo(() => {
    const groups = { ready: [] as Task[], inProgress: [] as Task[], review: [] as Task[] };
    for (const task of tasks) {
      const group = getStatusGroup(task.status);
      if (group === "ready") groups.ready.push(task);
      else if (group === "in_progress") groups.inProgress.push(task);
      else if (group === "review") groups.review.push(task);
    }
    // Limit to 3 per column for preview
    return {
      ready: groups.ready.slice(0, 3),
      inProgress: groups.inProgress.slice(0, 3),
      review: groups.review.slice(0, 3)
    };
  }, [tasks]);

  const visibleInsights = useMemo(
    () => MOCK_INSIGHTS.filter((i) => !dismissedInsights.has(i.id)),
    [dismissedInsights]
  );

  const handleAccept = (insightId: string) => {
    onAcceptInsight?.(insightId);
    setDismissedInsights((prev) => new Set(prev).add(insightId));
  };

  const handleDecline = (insightId: string) => {
    onDeclineInsight?.(insightId);
    setDismissedInsights((prev) => new Set(prev).add(insightId));
  };

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) =>
    ["done", "completed", "complete", "closed"].includes(t.status.toLowerCase())
  ).length;

  return (
    <section className="dashboard-view-modern">
      {/* Stats Row */}
      <div className="dashboard-stats">
        <div className="dashboard-stat glass-surface">
          <span className="dashboard-stat__value">{totalTasks}</span>
          <span className="dashboard-stat__label">Total Tasks</span>
        </div>
        <div className="dashboard-stat glass-surface">
          <span className="dashboard-stat__value">{completedTasks}</span>
          <span className="dashboard-stat__label">Completed</span>
        </div>
        <div className="dashboard-stat glass-surface">
          <span className="dashboard-stat__value">{ready.length + inProgress.length + review.length}</span>
          <span className="dashboard-stat__label">In Progress</span>
        </div>
        <div className="dashboard-stat glass-surface">
          <span className="dashboard-stat__value">{Math.round((completedTasks / Math.max(totalTasks, 1)) * 100)}%</span>
          <span className="dashboard-stat__label">Progress</span>
        </div>
      </div>

      <div className="dashboard-layout">
        {/* Left Column - AI Insights */}
        {aiEnabled && visibleInsights.length > 0 && (
          <aside className="dashboard-insights glass-surface">
            <h3 className="dashboard-section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="dashboard-section-icon">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              AI Insights
            </h3>
            <div className="dashboard-insights__list">
              {visibleInsights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  onPrimary={() => handleAccept(insight.id)}
                  onSecondary={() => handleDecline(insight.id)}
                />
              ))}
            </div>
          </aside>
        )}

        {/* Main Content */}
        <div className="dashboard-main">
          {/* Board Preview */}
          <div className="board-preview glass-surface">
            <h3 className="dashboard-section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="dashboard-section-icon">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18M15 3v18" />
              </svg>
              Board Preview
            </h3>
            <p className="board-preview__hint">Drag and drop to update status</p>

            <div className="board-preview__columns">
              <div className="board-preview__column">
                <div className="board-preview__column-header">
                  <span className="board-preview__column-title">Ready</span>
                  <span className="board-preview__column-count">{ready.length}</span>
                </div>
                <div className="board-preview__column-body">
                  {ready.map((task) => (
                    <BoardPreviewCard key={task.task_id} task={task} onClick={() => onOpenTask(task.task_id)} />
                  ))}
                  <div className="board-preview__drop-zone">+ Drop here</div>
                </div>
              </div>

              <div className="board-preview__column">
                <div className="board-preview__column-header">
                  <span className="board-preview__column-title">In Progress</span>
                  <span className="board-preview__column-count">{inProgress.length}</span>
                </div>
                <div className="board-preview__column-body">
                  {inProgress.map((task) => (
                    <BoardPreviewCard key={task.task_id} task={task} onClick={() => onOpenTask(task.task_id)} />
                  ))}
                  <div className="board-preview__drop-zone">+ Drop here</div>
                </div>
              </div>

              <div className="board-preview__column">
                <div className="board-preview__column-header">
                  <span className="board-preview__column-title">Review</span>
                  <span className="board-preview__column-count">{review.length}</span>
                </div>
                <div className="board-preview__column-body">
                  {review.map((task) => (
                    <BoardPreviewCard key={task.task_id} task={task} onClick={() => onOpenTask(task.task_id)} />
                  ))}
                  <div className="board-preview__drop-zone">+ Drop here</div>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="dashboard-timeline glass-surface">
            <h3 className="dashboard-section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="dashboard-section-icon">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" strokeLinecap="round" />
              </svg>
              Timeline
            </h3>
            <p className="dashboard-timeline__hint">This Week • Upcoming milestones and deadlines</p>

            <div className="dashboard-timeline__track">
              {MOCK_MILESTONES.map((milestone, index) => (
                <div key={milestone.id} className="dashboard-timeline__item" style={{ "--item-index": index } as React.CSSProperties}>
                  <div className="dashboard-timeline__date">{formatMilestoneDate(milestone.date)}</div>
                  <div className="dashboard-timeline__marker" />
                  <div className="dashboard-timeline__content">
                    <span className="dashboard-timeline__title">{milestone.title}</span>
                    <span className="dashboard-timeline__time">{milestone.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {tasks.length === 0 && (
        <div className="dashboard-empty glass-surface">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="dashboard-empty__icon">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h3>No tasks yet</h3>
          <p>Create one from the command bar or automation rules</p>
        </div>
      )}
    </section>
  );
};
