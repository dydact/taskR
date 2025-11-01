import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { TaskCard } from "./TaskCard";

type BoardStatus = {
  status_id: string;
  name: string;
  category: string;
  color?: string | null;
  is_done: boolean;
};

type BoardTask = {
  task_id: string;
  title: string;
  status: string;
  priority: string;
  list_id: string;
};

type ColumnList = {
  list: {
    list_id: string;
    name: string;
    folder_id: string | null;
    color?: string | null;
  };
};

type ColumnProps = {
  status: BoardStatus;
  tasks: BoardTask[];
  lists: ColumnList[];
  onMoveTask(task: BoardTask, newListId: string): void;
  onFeedback?(taskId: string, rating: number): void;
  activeTaskId?: string | null;
  onSelectTask?(taskId: string): void;
};

const FALLBACK_COLORS: Record<string, string> = {
  backlog: "hsl(215deg 70% 60%)",
  active: "hsl(202deg 100% 42%)",
  done: "hsl(140deg 70% 50%)"
};

const EMPTY_MESSAGE = "No tasks yet.";

export function Column({
  status,
  tasks,
  lists,
  onMoveTask,
  onFeedback,
  activeTaskId,
  onSelectTask
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status.status_id
  });

  const statusColor = useMemo(() => {
    if (status.color && status.color.trim().length > 0) {
      return status.color;
    }
    return FALLBACK_COLORS[status.category?.toLowerCase() ?? ""] ?? "hsl(220deg 16% 40%)";
  }, [status.color, status.category]);

  return (
    <section
      ref={setNodeRef}
      className={`board-column${isOver ? " drop-target" : ""}`}
      aria-label={`${status.name} column`}
    >
      <div className="column-header">
        <div className="column-title">
          <span
            className="status-indicator"
            style={{ backgroundColor: statusColor }}
            aria-hidden="true"
          />
          <span>{status.name}</span>
        </div>
        <span className="task-count">{tasks.length}</span>
      </div>

      <div className="column-tasks">
        {tasks.length === 0 ? (
          <p className="empty-column">{EMPTY_MESSAGE}</p>
        ) : (
          tasks.map((task) => {
            const destinationLists = lists.filter(
              (item) => item.list.list_id !== task.list_id
            );

            return (
              <div
                key={task.task_id}
                className={`task-wrapper${activeTaskId === task.task_id ? " active" : ""}`}
              >
                <TaskCard
                  task={task}
                  onFeedback={onFeedback}
                  onSelect={onSelectTask}
                  isActive={activeTaskId === task.task_id}
                />
                {destinationLists.length > 0 && (
                  <div className="task-actions">
                    <select
                      id={`move-${task.task_id}`}
                      className="task-move-select"
                      aria-label="Move task to another list"
                      defaultValue=""
                      onChange={(event) => {
                        const newListId = event.target.value;
                        if (!newListId) return;
                        onMoveTask(task, newListId);
                        event.target.value = "";
                      }}
                    >
                      <option value="" disabled>
                        Move to list…
                      </option>
                      {destinationLists.map((item) => (
                        <option key={item.list.list_id} value={item.list.list_id}>
                          {item.list.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

export type { BoardStatus as ColumnStatus, BoardTask as Task };
