import React, { useMemo, useState } from "react";
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Task } from "../types/task";
import type { HierarchyList } from "../types/hierarchy";
import { Column } from "../components/Column";
import { TaskCardOverlay } from "../components/TaskCardOverlay";

type BoardViewProps = {
  selectedList: HierarchyList | null;
  tasksByList: Record<string, Task[]>;
  availableLists: HierarchyList[];
  onMoveTask(task: Task, newListId: string): void;
  onPreferenceFeedback(taskId: string, rating: number): void;
  activeTaskId: string | null;
  onOpenTask(taskId: string): void;
  onDragEnd(event: DragEndEvent): void;
};

export const BoardView: React.FC<BoardViewProps> = ({
  selectedList,
  tasksByList,
  availableLists,
  onMoveTask,
  onPreferenceFeedback,
  activeTaskId,
  onOpenTask,
  onDragEnd
}) => {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));
  const [activeDragTask, setActiveDragTask] = useState<Task | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const draggedTaskId = event.active.id as string;
    const allTasks = Object.values(tasksByList).flat();
    const task = allTasks.find((t) => t.task_id === draggedTaskId);
    if (task) {
      setActiveDragTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragTask(null);
    onDragEnd(event);
  };

  const tasks = useMemo(() => {
    if (!selectedList) return [];
    return tasksByList[selectedList.list.list_id] ?? [];
  }, [selectedList, tasksByList]);

  const listsForMoves = useMemo(
    () =>
      availableLists.map((entry) => ({
        list: {
          list_id: entry.list.list_id,
          name: entry.list.name,
          folder_id: entry.list.folder_id,
          color: entry.list.color ?? null
        }
      })),
    [availableLists]
  );

  if (!selectedList) {
    return <p className="empty-state">Select a list to view the board.</p>;
  }

  const columnTaskMap = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const status of selectedList.statuses) {
      map[status.name] = [];
    }
    for (const task of tasks) {
      map[task.status] = map[task.status] ? [...map[task.status], task] : [task];
    }
    return map;
  }, [selectedList.statuses, tasks]);

  return (
    <div className="board-view">
      <div className="hotkey-hint">
        Select a task card and use <kbd>[</kbd> or <kbd>]</kbd> to send feedback without leaving the board.
      </div>
      <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
        {selectedList.statuses.map((status) => (
          <SortableContext
            key={status.status_id}
            items={(columnTaskMap[status.name] ?? []).map((task) => task.task_id)}
            strategy={verticalListSortingStrategy}
          >
            <Column
              status={status}
              tasks={columnTaskMap[status.name] ?? []}
              lists={listsForMoves}
              onMoveTask={(task, newListId) => onMoveTask(task as Task, newListId)}
              onFeedback={onPreferenceFeedback}
              activeTaskId={activeTaskId ?? undefined}
              onSelectTask={onOpenTask}
              isDraggingTask={activeDragTask !== null}
            />
          </SortableContext>
        ))}
        <DragOverlay dropAnimation={{ duration: 200, easing: "ease-out" }}>
          {activeDragTask ? <TaskCardOverlay task={activeDragTask} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};
