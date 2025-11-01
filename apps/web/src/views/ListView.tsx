import React, { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Task } from "../types/task";
import type { ColumnKey } from "../components/list/ColumnSettingsDrawer";

type ListViewProps = {
  selectedListId: string | null;
  tasksByList: Record<string, Task[]>;
  activeTaskId: string | null;
  onOpenTask(taskId: string): void;
  onPreferenceFeedback(taskId: string, rating: number): void;
  columnVisibility: Record<ColumnKey, boolean>;
};

const ColumnHeaders: Array<{ key: ColumnKey; label: string }> = [
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "due_at", label: "Due Date" }
];

export const ListView: React.FC<ListViewProps> = ({
  selectedListId,
  tasksByList,
  activeTaskId,
  onOpenTask,
  onPreferenceFeedback,
  columnVisibility
}) => {
  const tasks = useMemo(() => {
    if (!selectedListId) return [];
    const listTasks = tasksByList[selectedListId] ?? [];
    return [...listTasks].sort((a, b) => a.title.localeCompare(b.title));
  }, [selectedListId, tasksByList]);

  if (!selectedListId) {
    return <p className="empty-state">Select a list to view tasks.</p>;
  }

  if (tasks.length === 0) {
    return <p className="empty-state">No tasks in this list yet.</p>;
  }

  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 52,
    overscan: 6
  });

  return (
    <div className="list-view">
      <div className="hotkey-hint">
        Select a task row and use <kbd>[</kbd> or <kbd>]</kbd> to send negative or positive feedback.
      </div>
      <div className="list-table-wrapper" ref={tableContainerRef}>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              {ColumnHeaders.filter((col) => columnVisibility[col.key]).map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const task = tasks[virtualRow.index];
              const isActive = activeTaskId === task.task_id;
              return (
                <tr
                  key={task.task_id}
                  className={isActive ? "active-task" : undefined}
                onClick={() => onOpenTask(task.task_id)}
                onFocus={() => onOpenTask(task.task_id)}
                tabIndex={0}
                style={{
                  position: "absolute",
                  top: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  height: `${virtualRow.size}px`
                }}
                >
                  <td>{task.title}</td>
                  {columnVisibility.status && <td>{task.status}</td>}
                  {columnVisibility.priority && <td>{task.priority}</td>}
                  {columnVisibility.due_at && (
                    <td>{task.due_at ? new Date(task.due_at).toLocaleDateString() : ""}</td>
                  )}
                  <td className="list-row-actions">
                    <button
                      type="button"
                      className="feedback-btn positive"
                      onClick={(event) => {
                        event.stopPropagation();
                        onPreferenceFeedback(task.task_id, 1);
                      }}
                    >
                      👍
                    </button>
                    <button
                      type="button"
                      className="feedback-btn negative"
                      onClick={(event) => {
                        event.stopPropagation();
                        onPreferenceFeedback(task.task_id, -1);
                      }}
                    >
                      👎
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
