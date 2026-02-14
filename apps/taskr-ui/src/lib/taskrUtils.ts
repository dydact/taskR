import type { Task } from "@dydact/taskr-api-client";

type TaskLike = Partial<Task> & {
  task_id?: string | null;
  due_at?: string | null;
  due_date?: string | null;
};

export const resolveTaskId = (task?: TaskLike | null): string | null => {
  if (!task) return null;
  const value = task.id ?? task.task_id;
  return typeof value === "string" && value.length > 0 ? value : null;
};

export const resolveDueDate = (task?: TaskLike | null): string | null => {
  if (!task) return null;
  const value = task.due_date ?? task.due_at;
  return typeof value === "string" && value.length > 0 ? value : null;
};

export const isUuid = (value?: string | null): boolean => {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};
