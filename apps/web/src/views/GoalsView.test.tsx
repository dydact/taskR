import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoalsView } from "./GoalsView";
import type { Task } from "../types/task";

const mockOnOpenTask = vi.fn();

const createTask = (overrides: Partial<Task> = {}): Task => ({
  task_id: "task-1",
  title: "Test Task",
  status: "open",
  priority: "medium",
  list_id: "list-1",
  ...overrides
});

describe("GoalsView", () => {
  beforeEach(() => {
    mockOnOpenTask.mockClear();
  });

  it("renders empty state when no tasks", () => {
    render(<GoalsView tasks={[]} onOpenTask={mockOnOpenTask} />);
    expect(screen.getByText("No Tasks Available")).toBeInTheDocument();
    expect(screen.getByText(/Select a list or add tasks/)).toBeInTheDocument();
  });

  it("renders summary stats with tasks", () => {
    const tasks: Task[] = [
      createTask({ task_id: "1", title: "[Q1 Revenue] Task 1", status: "done" }),
      createTask({ task_id: "2", title: "[Q1 Revenue] Task 2", status: "open" }),
      createTask({ task_id: "3", title: "Unassigned task", status: "open" })
    ];
    render(<GoalsView tasks={tasks} onOpenTask={mockOnOpenTask} />);

    expect(screen.getByText("1")).toBeInTheDocument(); // 1 goal
    expect(screen.getByText("3")).toBeInTheDocument(); // 3 total tasks
    expect(screen.getByText("Goals")).toBeInTheDocument();
    expect(screen.getByText("Total Tasks")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("extracts goals from title tags", () => {
    const tasks: Task[] = [
      createTask({ task_id: "1", title: "[Q1 Revenue] Increase sales", status: "open" }),
      createTask({ task_id: "2", title: "[Q1 Revenue] Call clients", status: "done" }),
      createTask({ task_id: "3", title: "[Bug Fixes] Fix login issue", status: "open" })
    ];
    render(<GoalsView tasks={tasks} onOpenTask={mockOnOpenTask} />);

    expect(screen.getByText("Q1 Revenue")).toBeInTheDocument();
    expect(screen.getByText("Bug Fixes")).toBeInTheDocument();
  });

  it("extracts goals from metadata_json", () => {
    const tasks: Task[] = [
      createTask({
        task_id: "1",
        title: "Task with metadata goal",
        metadata_json: { goal: "Sprint Goal" }
      })
    ];
    render(<GoalsView tasks={tasks} onOpenTask={mockOnOpenTask} />);

    expect(screen.getByText("Sprint Goal")).toBeInTheDocument();
  });

  it("extracts goals from custom_fields", () => {
    const tasks: Task[] = [
      createTask({
        task_id: "1",
        title: "Task with custom field goal",
        custom_fields: [
          {
            field_id: "cf-1",
            field_slug: "goal_name",
            field_name: "Goal Name",
            field_type: "text",
            value: "Custom Goal"
          }
        ]
      })
    ];
    render(<GoalsView tasks={tasks} onOpenTask={mockOnOpenTask} />);

    expect(screen.getByText("Custom Goal")).toBeInTheDocument();
  });

  it("shows unassigned tasks section", () => {
    const tasks: Task[] = [
      createTask({ task_id: "1", title: "Unassigned task 1", status: "open" }),
      createTask({ task_id: "2", title: "Unassigned task 2", status: "open" })
    ];
    render(<GoalsView tasks={tasks} onOpenTask={mockOnOpenTask} />);

    expect(screen.getByText("Unassigned Tasks")).toBeInTheDocument();
    expect(screen.getByText("0 of 2 tasks complete")).toBeInTheDocument();
  });

  it("calculates progress correctly", () => {
    const tasks: Task[] = [
      createTask({ task_id: "1", title: "[Test Goal] Task 1", status: "done" }),
      createTask({ task_id: "2", title: "[Test Goal] Task 2", status: "done" }),
      createTask({ task_id: "3", title: "[Test Goal] Task 3", status: "open" }),
      createTask({ task_id: "4", title: "[Test Goal] Task 4", status: "open" })
    ];
    render(<GoalsView tasks={tasks} onOpenTask={mockOnOpenTask} />);

    expect(screen.getByText("2 of 4 tasks complete")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("expands and collapses goal card on click", () => {
    const tasks: Task[] = [
      createTask({ task_id: "1", title: "[Test Goal] Task 1", status: "open" })
    ];
    render(<GoalsView tasks={tasks} onOpenTask={mockOnOpenTask} />);

    const goalHeader = screen.getByRole("button", { name: /Test Goal/i });

    // Initially collapsed - tasks not visible
    expect(screen.queryByText("Task 1")).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(goalHeader);
    expect(screen.getByText("Task 1")).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(goalHeader);
    expect(screen.queryByText("Task 1")).not.toBeInTheDocument();
  });

  it("calls onOpenTask when clicking a task", () => {
    const tasks: Task[] = [
      createTask({ task_id: "task-123", title: "[Test Goal] Clickable Task", status: "open" })
    ];
    render(<GoalsView tasks={tasks} onOpenTask={mockOnOpenTask} />);

    // Expand the goal first
    const goalHeader = screen.getByRole("button", { name: /Test Goal/i });
    fireEvent.click(goalHeader);

    // Click the task
    const taskButton = screen.getByRole("button", { name: /Clickable Task/i });
    fireEvent.click(taskButton);

    expect(mockOnOpenTask).toHaveBeenCalledWith("task-123");
  });

  it("shows completed tasks with strikethrough", () => {
    const tasks: Task[] = [
      createTask({ task_id: "1", title: "[Test Goal] Completed Task", status: "done" })
    ];
    render(<GoalsView tasks={tasks} onOpenTask={mockOnOpenTask} />);

    // Expand the goal
    const goalHeader = screen.getByRole("button", { name: /Test Goal/i });
    fireEvent.click(goalHeader);

    const taskTitle = screen.getByText("Completed Task");
    expect(taskTitle).toHaveClass("goal-task__title--done");
  });

  it("recognizes various completion statuses", () => {
    const tasks: Task[] = [
      createTask({ task_id: "1", title: "[Goal] Done task", status: "done" }),
      createTask({ task_id: "2", title: "[Goal] Completed task", status: "completed" }),
      createTask({ task_id: "3", title: "[Goal] Closed task", status: "closed" }),
      createTask({ task_id: "4", title: "[Goal] Resolved task", status: "resolved" }),
      createTask({ task_id: "5", title: "[Goal] Open task", status: "open" })
    ];
    render(<GoalsView tasks={tasks} onOpenTask={mockOnOpenTask} />);

    expect(screen.getByText("4 of 5 tasks complete")).toBeInTheDocument();
  });

  it("strips goal tag from task title in expanded view", () => {
    const tasks: Task[] = [
      createTask({ task_id: "1", title: "[Remove This] Display Title", status: "open" })
    ];
    render(<GoalsView tasks={tasks} onOpenTask={mockOnOpenTask} />);

    const goalHeader = screen.getByRole("button", { name: /Remove This/i });
    fireEvent.click(goalHeader);

    expect(screen.getByText("Display Title")).toBeInTheDocument();
    // The full title with tag should not appear in the task list
    expect(screen.queryByText("[Remove This] Display Title")).not.toBeInTheDocument();
  });
});
