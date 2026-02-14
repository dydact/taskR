import React, { useMemo, useState } from "react";
import type { Task } from "../types/task";

const GOAL_COLORS = [
  "#6C5DD3",
  "#2EC5CE",
  "#F7B23B",
  "#F76B8A",
  "#4361EE",
  "#9B6DFF",
  "#4CBF99"
];

type GoalsViewProps = {
  tasks: Task[];
  onOpenTask: (taskId: string) => void;
};

type Goal = {
  name: string;
  color: string;
  tasks: Task[];
  completedCount: number;
  totalCount: number;
  progress: number;
};

/**
 * Extract goal name from a task. Checks:
 * 1. custom_fields with field_slug or field_name containing "goal"
 * 2. metadata_json.goal or metadata_json.goalName
 * 3. Title tags like [Goal Name] at the start of title
 */
function extractGoalFromTask(task: Task): string | null {
  // Check custom_fields
  if (task.custom_fields && task.custom_fields.length > 0) {
    for (const field of task.custom_fields) {
      const slugLower = field.field_slug?.toLowerCase() ?? "";
      const nameLower = field.field_name?.toLowerCase() ?? "";
      if (
        (slugLower.includes("goal") || nameLower.includes("goal")) &&
        field.value != null &&
        field.value !== ""
      ) {
        return String(field.value);
      }
    }
  }

  // Check metadata_json
  if (task.metadata_json) {
    const meta = task.metadata_json;
    if (typeof meta.goal === "string" && meta.goal.trim()) {
      return meta.goal.trim();
    }
    if (typeof meta.goalName === "string" && meta.goalName.trim()) {
      return meta.goalName.trim();
    }
    if (typeof meta.Goal === "string" && meta.Goal.trim()) {
      return meta.Goal.trim();
    }
  }

  // Check title for [Goal Name] pattern
  const titleMatch = task.title.match(/^\[([^\]]+)\]/);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  return null;
}

function isTaskCompleted(task: Task): boolean {
  const status = task.status.toLowerCase();
  return (
    status === "done" ||
    status === "completed" ||
    status === "complete" ||
    status === "closed" ||
    status === "resolved"
  );
}

const GoalCard: React.FC<{
  goal: Goal;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenTask: (taskId: string) => void;
}> = ({ goal, isExpanded, onToggle, onOpenTask }) => {
  return (
    <div className="goal-card" style={{ "--goal-color": goal.color } as React.CSSProperties}>
      <button
        type="button"
        className="goal-card__header"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div
          className="goal-card__indicator"
          style={{ backgroundColor: goal.color }}
        />
        <div className="goal-card__info">
          <h3 className="goal-card__name">{goal.name}</h3>
          <p className="goal-card__meta">
            {goal.completedCount} of {goal.totalCount} task{goal.totalCount !== 1 ? "s" : ""} complete
          </p>
        </div>
        <div className="goal-card__progress-wrap">
          <div className="goal-card__progress-bar">
            <div
              className="goal-card__progress-fill"
              style={{
                width: `${goal.progress}%`,
                backgroundColor: goal.color
              }}
            />
          </div>
          <span className="goal-card__progress-value">{Math.round(goal.progress)}%</span>
        </div>
        <span className="goal-card__chevron" aria-hidden="true">
          {isExpanded ? "\u25B2" : "\u25BC"}
        </span>
      </button>

      {isExpanded && (
        <ul className="goal-card__tasks">
          {goal.tasks.map((task) => {
            const completed = isTaskCompleted(task);
            return (
              <li key={task.task_id} className="goal-task">
                <button
                  type="button"
                  className="goal-task__button"
                  onClick={() => onOpenTask(task.task_id)}
                >
                  <span
                    className={`goal-task__checkbox ${completed ? "goal-task__checkbox--done" : ""}`}
                    style={{ borderColor: completed ? goal.color : undefined, backgroundColor: completed ? goal.color : undefined }}
                  >
                    {completed && (
                      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </span>
                  <span className={`goal-task__title ${completed ? "goal-task__title--done" : ""}`}>
                    {task.title.replace(/^\[[^\]]+\]\s*/, "")}
                  </span>
                  <span className="goal-task__status">{task.status}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export const GoalsView: React.FC<GoalsViewProps> = ({ tasks, onOpenTask }) => {
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());

  const { goals, unassignedTasks } = useMemo(() => {
    const goalMap = new Map<string, Task[]>();
    const unassigned: Task[] = [];

    for (const task of tasks) {
      const goalName = extractGoalFromTask(task);
      if (goalName) {
        const existing = goalMap.get(goalName) || [];
        existing.push(task);
        goalMap.set(goalName, existing);
      } else {
        unassigned.push(task);
      }
    }

    const goalsArray: Goal[] = [];
    let colorIndex = 0;
    for (const [name, goalTasks] of goalMap.entries()) {
      const completedCount = goalTasks.filter(isTaskCompleted).length;
      const totalCount = goalTasks.length;
      const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
      goalsArray.push({
        name,
        color: GOAL_COLORS[colorIndex % GOAL_COLORS.length],
        tasks: goalTasks,
        completedCount,
        totalCount,
        progress
      });
      colorIndex++;
    }

    // Sort goals by progress (lowest first to highlight what needs attention)
    goalsArray.sort((a, b) => a.progress - b.progress);

    return { goals: goalsArray, unassignedTasks: unassigned };
  }, [tasks]);

  const toggleGoal = (goalName: string) => {
    setExpandedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(goalName)) {
        next.delete(goalName);
      } else {
        next.add(goalName);
      }
      return next;
    });
  };

  const totalTasks = tasks.length;
  const totalGoals = goals.length;
  const overallCompleted = tasks.filter(isTaskCompleted).length;
  const overallProgress = totalTasks > 0 ? (overallCompleted / totalTasks) * 100 : 0;

  if (tasks.length === 0) {
    return (
      <section className="goals-view goals-view--empty">
        <div className="goals-view__empty-state">
          <svg
            className="goals-view__empty-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
            <path strokeLinecap="round" d="M12 3v2M12 19v2M3 12h2M19 12h2" />
          </svg>
          <h2>No Tasks Available</h2>
          <p>Select a list or add tasks to start tracking goals.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="goals-view">
      {/* Summary Stats */}
      <div className="goals-summary glass-surface">
        <div className="goals-summary__item">
          <span className="goals-summary__value">{totalGoals}</span>
          <span className="goals-summary__label">Goals</span>
        </div>
        <div className="goals-summary__item">
          <span className="goals-summary__value">{totalTasks}</span>
          <span className="goals-summary__label">Total Tasks</span>
        </div>
        <div className="goals-summary__item">
          <span className="goals-summary__value">{unassignedTasks.length}</span>
          <span className="goals-summary__label">Unassigned</span>
        </div>
        <div className="goals-summary__item goals-summary__item--progress">
          <div className="goals-summary__progress-ring">
            <svg viewBox="0 0 36 36">
              <circle
                className="goals-summary__progress-bg"
                cx="18"
                cy="18"
                r="15.9"
              />
              <circle
                className="goals-summary__progress-fill"
                cx="18"
                cy="18"
                r="15.9"
                style={{
                  strokeDasharray: `${overallProgress} 100`
                }}
              />
            </svg>
            <span className="goals-summary__progress-text">{Math.round(overallProgress)}%</span>
          </div>
          <span className="goals-summary__label">Complete</span>
        </div>
      </div>

      {/* Goals List */}
      <div className="goals-list">
        {goals.map((goal) => (
          <GoalCard
            key={goal.name}
            goal={goal}
            isExpanded={expandedGoals.has(goal.name)}
            onToggle={() => toggleGoal(goal.name)}
            onOpenTask={onOpenTask}
          />
        ))}

        {/* Unassigned Tasks Section */}
        {unassignedTasks.length > 0 && (
          <div className="goal-card goal-card--unassigned">
            <button
              type="button"
              className="goal-card__header"
              onClick={() => toggleGoal("__unassigned__")}
              aria-expanded={expandedGoals.has("__unassigned__")}
            >
              <div
                className="goal-card__indicator"
                style={{ backgroundColor: "var(--plane-muted)" }}
              />
              <div className="goal-card__info">
                <h3 className="goal-card__name">Unassigned Tasks</h3>
                <p className="goal-card__meta">
                  {unassignedTasks.filter(isTaskCompleted).length} of {unassignedTasks.length} task{unassignedTasks.length !== 1 ? "s" : ""} complete
                </p>
              </div>
              <div className="goal-card__progress-wrap">
                <div className="goal-card__progress-bar">
                  <div
                    className="goal-card__progress-fill"
                    style={{
                      width: `${unassignedTasks.length > 0 ? (unassignedTasks.filter(isTaskCompleted).length / unassignedTasks.length) * 100 : 0}%`,
                      backgroundColor: "var(--plane-muted)"
                    }}
                  />
                </div>
                <span className="goal-card__progress-value">
                  {unassignedTasks.length > 0
                    ? Math.round((unassignedTasks.filter(isTaskCompleted).length / unassignedTasks.length) * 100)
                    : 0}%
                </span>
              </div>
              <span className="goal-card__chevron" aria-hidden="true">
                {expandedGoals.has("__unassigned__") ? "\u25B2" : "\u25BC"}
              </span>
            </button>

            {expandedGoals.has("__unassigned__") && (
              <ul className="goal-card__tasks">
                {unassignedTasks.map((task) => {
                  const completed = isTaskCompleted(task);
                  return (
                    <li key={task.task_id} className="goal-task">
                      <button
                        type="button"
                        className="goal-task__button"
                        onClick={() => onOpenTask(task.task_id)}
                      >
                        <span
                          className={`goal-task__checkbox ${completed ? "goal-task__checkbox--done" : ""}`}
                        >
                          {completed && (
                            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M2 6l3 3 5-5" />
                            </svg>
                          )}
                        </span>
                        <span className={`goal-task__title ${completed ? "goal-task__title--done" : ""}`}>
                          {task.title}
                        </span>
                        <span className="goal-task__status">{task.status}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
