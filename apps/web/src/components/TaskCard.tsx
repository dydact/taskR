import React from "react";
import { useDraggable } from "@dnd-kit/core";

type Task = {
  task_id: string;
  title: string;
  status: string;
  priority: string;
};

type Props = {
  task: Task;
  onFeedback?(taskId: string, rating: number): void;
  onSelect?(taskId: string): void;
  isActive?: boolean;
};

export const TaskCard: React.FC<Props> = ({ task, onFeedback, onSelect, isActive }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.task_id
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1
  };

  const sendFeedback = (rating: number) => {
    if (onFeedback) {
      onFeedback(task.task_id, rating);
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={`task-card${isActive ? " active" : ""}`}
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
      <p className="task-title">{task.title}</p>
      <p className="task-meta">Priority: {task.priority}</p>
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
