import React from "react";

type Task = {
  task_id: string;
  title: string;
  status: string;
  priority: string;
};

type Props = {
  task: Task;
};

export const TaskCardOverlay: React.FC<Props> = ({ task }) => {
  return (
    <div className="task-card drag-overlay">
      <p className="task-title">{task.title}</p>
      <p className="task-meta">Priority: {task.priority}</p>
    </div>
  );
};
