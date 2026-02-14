import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { InboxView } from "./InboxView";
import type { Task } from "../types/task";

const mockTasks: Task[] = [
  {
    task_id: "task-1",
    title: "Review prior authorization",
    description: "Review PA request for member J. Martinez",
    status: "open",
    priority: "high",
    due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    list_id: "list-1",
  },
  {
    task_id: "task-2",
    title: "Update documentation",
    description: "Update claim documentation for CLM-44521",
    status: "waiting",
    priority: "medium",
    due_at: null,
    list_id: "list-1",
  },
  {
    task_id: "task-3",
    title: "Snoozed task",
    description: "Task that was snoozed",
    status: "snoozed",
    priority: "low",
    due_at: null,
    list_id: "list-2",
  },
];

const mockHandlers = {
  onOpenTask: vi.fn(),
  onCompleteTask: vi.fn(),
  onSnoozeTask: vi.fn(),
  onDelegateTask: vi.fn(),
};

describe("InboxView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<InboxView tasks={[]} {...mockHandlers} />);
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
  });

  it("displays the title and subtitle", () => {
    render(<InboxView tasks={[]} {...mockHandlers} />);
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.getByText(/Tasks assigned to you/)).toBeInTheDocument();
  });

  it("renders task list when tasks are provided", () => {
    render(<InboxView tasks={mockTasks} {...mockHandlers} />);
    expect(screen.getByText("Review prior authorization")).toBeInTheDocument();
  });

  it("shows empty state when no tasks need action", () => {
    render(<InboxView tasks={[]} {...mockHandlers} />);
    expect(screen.getByText(/No tasks need action/)).toBeInTheDocument();
  });

  it("displays summary counts", () => {
    render(<InboxView tasks={mockTasks} {...mockHandlers} />);
    const summaryValues = screen.getAllByClassName
      ? document.querySelectorAll(".inbox-summary__value")
      : [];
    expect(summaryValues.length).toBeGreaterThan(0);
  });

  it("renders filter tabs", () => {
    render(<InboxView tasks={mockTasks} {...mockHandlers} />);
    expect(screen.getByRole("tab", { name: /Needs Action/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Waiting/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Snoozed/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /All/ })).toBeInTheDocument();
  });

  it("changes filter when tab is clicked", () => {
    render(<InboxView tasks={mockTasks} {...mockHandlers} />);
    const waitingTab = screen.getByRole("tab", { name: /Waiting/ });
    fireEvent.click(waitingTab);
    expect(waitingTab).toHaveAttribute("aria-selected", "true");
  });

  it("calls onOpenTask when task card is clicked", () => {
    render(<InboxView tasks={mockTasks} {...mockHandlers} />);
    const taskCard = screen.getByText("Review prior authorization").closest("button");
    if (taskCard) fireEvent.click(taskCard);
    expect(mockHandlers.onOpenTask).toHaveBeenCalledWith("task-1");
  });

  it("calls onCompleteTask when complete button is clicked", () => {
    render(<InboxView tasks={mockTasks} {...mockHandlers} />);
    const completeButtons = screen.getAllByTitle("Mark as complete");
    fireEvent.click(completeButtons[0]);
    expect(mockHandlers.onCompleteTask).toHaveBeenCalled();
  });

  it("shows snooze picker when snooze button is clicked", () => {
    render(<InboxView tasks={mockTasks} {...mockHandlers} />);
    const snoozeButtons = screen.getAllByTitle("Snooze task");
    fireEvent.click(snoozeButtons[0]);
    expect(screen.getByText("1 hour")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
  });

  it("calls onDelegateTask when delegate button is clicked", () => {
    render(<InboxView tasks={mockTasks} {...mockHandlers} />);
    const delegateButtons = screen.getAllByTitle("Delegate task");
    fireEvent.click(delegateButtons[0]);
    expect(mockHandlers.onDelegateTask).toHaveBeenCalled();
  });

  it("displays priority indicators", () => {
    render(<InboxView tasks={mockTasks} {...mockHandlers} />);
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("shows due date information", () => {
    render(<InboxView tasks={mockTasks} {...mockHandlers} />);
    expect(screen.getByText(/Due Tomorrow/)).toBeInTheDocument();
  });

  it("filters tasks by category correctly", () => {
    render(<InboxView tasks={mockTasks} {...mockHandlers} />);

    // Initially showing "Needs Action" tab
    expect(screen.getByText("Review prior authorization")).toBeInTheDocument();

    // Switch to "Waiting" tab
    fireEvent.click(screen.getByRole("tab", { name: /Waiting/ }));
    expect(screen.getByText("Update documentation")).toBeInTheDocument();

    // Switch to "Snoozed" tab
    fireEvent.click(screen.getByRole("tab", { name: /Snoozed/ }));
    expect(screen.getByText("Snoozed task")).toBeInTheDocument();
  });
});
