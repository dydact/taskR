import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { Column, type Task } from "./Column";

const status = {
  status_id: "status-1",
  name: "Backlog",
  category: "backlog",
  color: null,
  is_done: false
};

const lists = [
  {
    list: {
      list_id: "list-a",
      name: "Alpha",
      folder_id: null
    }
  },
  {
    list: {
      list_id: "list-b",
      name: "Beta",
      folder_id: null
    }
  }
];

const tasks: Task[] = [
  {
    task_id: "task-1",
    title: "Validate memPODS ingestion",
    status: "Backlog",
    priority: "medium",
    list_id: "list-a"
  }
];

describe("Column", () => {
  it("renders status title, count, and tasks", () => {
    render(
      <DndContext>
        <Column status={status} tasks={tasks} lists={lists} onMoveTask={vi.fn()} />
      </DndContext>
    );

    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText(tasks[0].title)).toBeInTheDocument();
  });

  it("invokes onMoveTask when destination list selected", () => {
    const onMoveTask = vi.fn();

    render(
      <DndContext>
        <Column status={status} tasks={tasks} lists={lists} onMoveTask={onMoveTask} />
      </DndContext>
    );

    const moveSelects = screen.getAllByLabelText("Move task to another list");
    for (const select of moveSelects) {
      fireEvent.change(select, { target: { value: "list-b" } });
      if (onMoveTask.mock.calls.length > 0) {
        break;
      }
    }

    expect(onMoveTask).toHaveBeenCalledWith(tasks[0], "list-b");
  });
});
