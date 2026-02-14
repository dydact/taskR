import React, { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useAIFeatures } from "../hooks/useAIFeatures";
import { AgentAssignmentBadge } from "./ai/AgentAssignmentBadge";
import type { Task } from "../types/task";

const AVATAR_COLORS = ["#6c7bff", "#4ad0a7", "#f7b23b", "#ff6b6b", "#38bdf8", "#ec4899"];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

type Props = {
  task: Task;
  onFeedback?(taskId: string, rating: number): void;
  onSelect?(taskId: string): void;
  onAgentAssign?(taskId: string, agentId: string): void;
  isActive?: boolean;
};

export const TaskCard: React.FC<Props> = ({ task, onFeedback, onSelect, onAgentAssign, isActive }) => {
  const { showAgentAssignment } = useAIFeatures();
  const [showTooltip, setShowTooltip] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.task_id
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined
  };

  const cardClasses = [
    "task-card",
    isActive ? "active" : "",
    isDragging ? "is-dragging" : ""
  ].filter(Boolean).join(" ");

  const sendFeedback = (rating: number) => {
    if (onFeedback) {
      onFeedback(task.task_id, rating);
    }
  };

  const assigneeName = task.assignee?.name;
  const assigneeAvatar = task.assignee?.avatar_url;

  return (
    <div
      ref={setNodeRef}
      className={cardClasses}
      style={style}
      {...listeners}
      {...attributes}
      tabIndex={0}
      role="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.(task.task_id);
      }}
      onFocus={() => onSelect?.(task.task_id)}
    >
      <div className="task-card-header">
        <p className="task-title">{task.title}</p>
        {assigneeName && (
          <div
            className="task-card-assignee"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            {assigneeAvatar ? (
              <img
                className="task-card-avatar"
                src={assigneeAvatar}
                alt={assigneeName}
              />
            ) : (
              <span
                className="task-card-avatar task-card-avatar--initials"
                style={{ backgroundColor: getAvatarColor(assigneeName) }}
              >
                {getInitials(assigneeName)}
              </span>
            )}
            {showTooltip && (
              <span className="task-card-tooltip">{assigneeName}</span>
            )}
          </div>
        )}
      </div>
      <p className="task-meta">Priority: {task.priority}</p>
      {showAgentAssignment && (
        <AgentAssignmentBadge taskId={task.task_id} onAssign={onAgentAssign} />
      )}
      {onFeedback && (
        <div className="task-feedback">
          <button
            type="button"
            className="feedback-btn positive"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              sendFeedback(1);
            }}
            title="Positive feedback"
          >
            👍
          </button>
          <button
            type="button"
            className="feedback-btn negative"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              sendFeedback(-1);
            }}
            title="Negative feedback"
          >
            👎
          </button>
        </div>
      )}
    </div>
  );
};
