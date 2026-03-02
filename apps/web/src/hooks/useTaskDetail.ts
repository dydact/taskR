import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Task, TaskComment, ActivityEvent, CustomFieldValue, Subtask } from "../types/task";
import type { Doc } from "../types/doc";
import type { ApiFetchResponse } from "../lib/apiFetch";
import type { TaskRClient } from "../lib/client";
import { env } from "../config/env";

const API_BASE = env.taskrApiBase;
const TENANT_ID = env.tenantId;
const USER_ID = env.userId;

type UseTaskDetailParams = {
  activeTaskId: string | null;
  isTaskDrawerOpen: boolean;
  tasks: Record<string, Task[]>;
  setTasks: React.Dispatch<React.SetStateAction<Record<string, Task[]>>>;
  apiFetch: (url: string, init?: RequestInit & { method?: string }) => Promise<ApiFetchResponse>;
  client: TaskRClient;
  showToast: (input: { message: string; variant?: "info" | "success" | "error"; detail?: string }) => void;
};

export function useTaskDetail({
  activeTaskId,
  isTaskDrawerOpen,
  tasks,
  setTasks,
  apiFetch,
  client,
  showToast
}: UseTaskDetailParams) {
  const [commentsByTask, setCommentsByTask] = useState<Record<string, TaskComment[]>>({});
  const [commentsLoading, setCommentsLoading] = useState(false);
  const commentsAbortRef = useRef<AbortController | null>(null);
  const [activityByTask, setActivityByTask] = useState<Record<string, ActivityEvent[]>>({});
  const [activityLoading, setActivityLoading] = useState(false);
  const activityAbortRef = useRef<AbortController | null>(null);
  const [customFieldsByTask, setCustomFieldsByTask] = useState<Record<string, CustomFieldValue[]>>({});
  const [customFieldsLoading, setCustomFieldsLoading] = useState(false);
  const customFieldsAbortRef = useRef<AbortController | null>(null);
  const [subtasksByTask, setSubtasksByTask] = useState<Record<string, Subtask[]>>({});
  const [subtasksLoading, setSubtasksLoading] = useState(false);
  const subtasksAbortRef = useRef<AbortController | null>(null);
  const [docsByTask, setDocsByTask] = useState<Record<string, Doc[]>>({});
  const [docsLoading, setDocsLoading] = useState(false);
  const docsAbortRef = useRef<AbortController | null>(null);

  const selectedTask = useMemo(() => {
    if (!activeTaskId) return null;
    for (const listTasks of Object.values(tasks)) {
      const match = listTasks.find((task) => task.task_id === activeTaskId);
      if (match) {
        return match;
      }
    }
    return null;
  }, [activeTaskId, tasks]);

  // Seed custom fields from selected task
  useEffect(() => {
    if (!selectedTask || !activeTaskId) {
      return;
    }
    setCustomFieldsByTask((prev) => {
      if (prev[activeTaskId]) {
        return prev;
      }
      return { ...prev, [activeTaskId]: selectedTask.custom_fields ?? [] };
    });
  }, [selectedTask, activeTaskId]);

  const currentCustomFields = useMemo(
    () => (activeTaskId ? customFieldsByTask[activeTaskId] ?? selectedTask?.custom_fields ?? [] : []),
    [activeTaskId, customFieldsByTask, selectedTask]
  );

  const currentSubtasks = useMemo(
    () => (activeTaskId ? subtasksByTask[activeTaskId] ?? [] : []),
    [activeTaskId, subtasksByTask]
  );

  const currentDocs = useMemo(
    () => (activeTaskId ? docsByTask[activeTaskId] ?? [] : []),
    [activeTaskId, docsByTask]
  );

  // Load comments on active task
  useEffect(() => {
    if (!isTaskDrawerOpen || !activeTaskId) {
      return;
    }

    if (commentsByTask[activeTaskId]) {
      return;
    }

    const controller = new AbortController();
    commentsAbortRef.current?.abort();
    commentsAbortRef.current = controller;
    setCommentsLoading(true);

    apiFetch(`${API_BASE}/comments/tasks/${activeTaskId}`, {
      headers: { "x-tenant-id": TENANT_ID, "x-user-id": USER_ID },
      signal: controller.signal
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load comments: ${res.status}`);
        }
        return res.json();
      })
      .then((data: TaskComment[]) => {
        setCommentsByTask((prev) => ({ ...prev, [activeTaskId]: data }));
        setCommentsLoading(false);
        commentsAbortRef.current = null;
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch comments", err);
        setCommentsLoading(false);
      });

    return () => {
      controller.abort();
      commentsAbortRef.current = null;
      setCommentsLoading(false);
    };
  }, [apiFetch, isTaskDrawerOpen, activeTaskId, commentsByTask]);

  // Load activity on active task
  useEffect(() => {
    if (!isTaskDrawerOpen || !activeTaskId) {
      return;
    }

    if (activityByTask[activeTaskId]) {
      return;
    }

    const controller = new AbortController();
    activityAbortRef.current?.abort();
    activityAbortRef.current = controller;
    setActivityLoading(true);

    apiFetch(`${API_BASE}/tasks/${activeTaskId}/activity`, {
      headers: { "x-tenant-id": TENANT_ID, "x-user-id": USER_ID },
      signal: controller.signal
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load activity: ${res.status}`);
        }
        return res.json();
      })
      .then((data: ActivityEvent[]) => {
        setActivityByTask((prev) => ({ ...prev, [activeTaskId]: data }));
        setActivityLoading(false);
        activityAbortRef.current = null;
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch activity", err);
        setActivityLoading(false);
      });

    return () => {
      controller.abort();
      activityAbortRef.current = null;
      setActivityLoading(false);
    };
  }, [apiFetch, isTaskDrawerOpen, activeTaskId, activityByTask]);

  // Load custom fields on active task
  useEffect(() => {
    if (!isTaskDrawerOpen || !activeTaskId) {
      return;
    }
    if (customFieldsByTask[activeTaskId]) {
      return;
    }

    const controller = new AbortController();
    customFieldsAbortRef.current?.abort();
    customFieldsAbortRef.current = controller;
    setCustomFieldsLoading(true);

    apiFetch(`${API_BASE}/custom-fields/tasks/${activeTaskId}`, {
      headers: { "x-tenant-id": TENANT_ID, "x-user-id": USER_ID },
      signal: controller.signal
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load custom fields: ${res.status}`);
        }
        return res.json();
      })
      .then((data: CustomFieldValue[]) => {
        setCustomFieldsByTask((prev) => ({ ...prev, [activeTaskId]: data }));
        setCustomFieldsLoading(false);
        customFieldsAbortRef.current = null;
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch custom fields", err);
        setCustomFieldsLoading(false);
      });

    return () => {
      controller.abort();
      customFieldsAbortRef.current = null;
      setCustomFieldsLoading(false);
    };
  }, [apiFetch, isTaskDrawerOpen, activeTaskId, customFieldsByTask]);

  // Load subtasks on active task
  useEffect(() => {
    if (!isTaskDrawerOpen || !activeTaskId) {
      return;
    }
    if (subtasksByTask[activeTaskId]) {
      return;
    }
    const controller = new AbortController();
    subtasksAbortRef.current?.abort();
    subtasksAbortRef.current = controller;
    setSubtasksLoading(true);

    apiFetch(`${API_BASE}/subtasks/tasks/${activeTaskId}`, {
      headers: { "x-tenant-id": TENANT_ID, "x-user-id": USER_ID },
      signal: controller.signal
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load subtasks: ${res.status}`);
        }
        return res.json();
      })
      .then((data: Subtask[]) => {
        setSubtasksByTask((prev) => ({ ...prev, [activeTaskId]: data }));
        setSubtasksLoading(false);
        subtasksAbortRef.current = null;
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch subtasks", err);
        setSubtasksLoading(false);
      });

    return () => {
      controller.abort();
      subtasksAbortRef.current = null;
      setSubtasksLoading(false);
    };
  }, [apiFetch, isTaskDrawerOpen, activeTaskId, subtasksByTask]);

  // Load docs on active task
  useEffect(() => {
    if (!isTaskDrawerOpen || !activeTaskId) {
      return;
    }
    if (docsByTask[activeTaskId]) {
      return;
    }
    const controller = new AbortController();
    docsAbortRef.current?.abort();
    docsAbortRef.current = controller;
    setDocsLoading(true);

    apiFetch(`${API_BASE}/docs/tasks/${activeTaskId}`, {
      headers: { "x-tenant-id": TENANT_ID, "x-user-id": USER_ID },
      signal: controller.signal
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load docs: ${res.status}`);
        }
        return res.json();
      })
      .then((data: Doc[]) => {
        setDocsByTask((prev) => ({ ...prev, [activeTaskId]: data }));
        setDocsLoading(false);
        docsAbortRef.current = null;
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch docs", err);
        setDocsLoading(false);
      });

    return () => {
      controller.abort();
      docsAbortRef.current = null;
      setDocsLoading(false);
    };
  }, [apiFetch, isTaskDrawerOpen, activeTaskId, docsByTask]);

  const handleUpdateTask = useCallback(
    async (taskId: string, updates: Partial<{ title: string; description: string | null; status: string; priority: string; due_at: string | null }>) => {
      if (!taskId || Object.keys(updates).length === 0) {
        return;
      }

      setTasks((prev) => {
        const next: typeof prev = {};
        for (const [listId, listTasks] of Object.entries(prev)) {
          next[listId] = listTasks.map((task) =>
            task.task_id === taskId
              ? {
                  ...task,
                  ...(updates.title !== undefined ? { title: updates.title } : {}),
                  ...(updates.description !== undefined ? { description: updates.description } : {}),
                  ...(updates.status !== undefined ? { status: updates.status } : {}),
                  ...(updates.priority !== undefined ? { priority: updates.priority } : {}),
                  ...(updates.due_at !== undefined ? { due_at: updates.due_at ?? null } : {})
                }
              : task
          );
        }
        return next;
      });

      try {
        const updatedTask = await client.tasks.update(taskId, updates as any);
        setTasks((prev) => {
          const next: typeof prev = {};
          for (const [listId, listTasks] of Object.entries(prev)) {
            next[listId] = listTasks.map((task) => (task.task_id === taskId ? (updatedTask as unknown as Task) : task));
          }
          return next;
        });
      } catch (err) {
        console.error("Failed to persist task update", err);
      }
    },
    [client, setTasks]
  );

  const handleAddComment = useCallback(
    async (taskId: string, body: string, mentions?: string[]) => {
      try {
        const comment = await client.request<TaskComment>({
          path: "/comments",
          method: "POST",
          body: { task_id: taskId, body, mentions: mentions ?? [] }
        });
        setCommentsByTask((prev) => {
          const next = { ...prev };
          next[taskId] = [...(next[taskId] ?? []), comment];
          return next;
        });
        setActivityByTask((prev) => {
          if (!prev[taskId]) {
            return prev;
          }
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
      } catch (err) {
        console.error("Failed to add comment", err);
      }
    },
    [client]
  );

  const handleCustomFieldChange = useCallback(
    async (taskId: string, fieldId: string, value: unknown) => {
      try {
        const data = await client.request<CustomFieldValue[]>({
          path: `/custom-fields/tasks/${taskId}`,
          method: "PUT" as any,
          body: [
            {
              field_id: fieldId,
              value
            }
          ]
        });
        setCustomFieldsByTask((prev) => ({ ...prev, [taskId]: data }));
        setTasks((prev) => {
          const next: typeof prev = {};
          for (const [listId, listTasks] of Object.entries(prev)) {
            next[listId] = listTasks.map((task) =>
              task.task_id === taskId ? { ...task, custom_fields: data } : task
            );
          }
          return next;
        });
      } catch (err) {
        console.error("Failed to update custom field", err);
      }
    },
    [client, setTasks]
  );

  const handleCreateSubtask = useCallback(
    async (taskId: string, title: string) => {
      try {
        const subtask = await client.request<Subtask>({
          path: `/subtasks/tasks/${taskId}`,
          method: "POST",
          body: { title, status: "pending" }
        });
        setSubtasksByTask((prev) => ({ ...prev, [taskId]: [...(prev[taskId] ?? []), subtask] }));
      } catch (err) {
        console.error("Failed to create subtask", err);
      }
    },
    [client]
  );

  const handleToggleSubtask = useCallback(
    async (taskId: string, subtaskId: string, status: string) => {
      try {
        const updated = await client.request<Subtask>({
          path: `/subtasks/tasks/${taskId}/${subtaskId}`,
          method: "PATCH",
          body: { status }
        });
        setSubtasksByTask((prev) => ({
          ...prev,
          [taskId]: (prev[taskId] ?? []).map((item) => (item.subtask_id === subtaskId ? updated : item))
        }));
      } catch (err) {
        console.error("Failed to update subtask", err);
      }
    },
    [client]
  );

  const handleDeleteSubtask = useCallback(
    async (taskId: string, subtaskId: string) => {
      try {
        await client.request<void>({
          path: `/subtasks/tasks/${taskId}/${subtaskId}`,
          method: "DELETE"
        });
        setSubtasksByTask((prev) => ({
          ...prev,
          [taskId]: (prev[taskId] ?? []).filter((item) => item.subtask_id !== subtaskId)
        }));
      } catch (err) {
        console.error("Failed to delete subtask", err);
      }
    },
    [client]
  );

  const abortAllDetailRequests = useCallback(() => {
    commentsAbortRef.current?.abort();
    customFieldsAbortRef.current?.abort();
    subtasksAbortRef.current?.abort();
    docsAbortRef.current?.abort();
  }, []);

  return {
    commentsByTask,
    commentsLoading,
    activityByTask,
    activityLoading,
    customFieldsByTask,
    customFieldsLoading,
    subtasksByTask,
    subtasksLoading,
    docsByTask,
    docsLoading,
    selectedTask,
    currentCustomFields,
    currentSubtasks,
    currentDocs,
    handleUpdateTask,
    handleAddComment,
    handleCustomFieldChange,
    handleCreateSubtask,
    handleToggleSubtask,
    handleDeleteSubtask,
    abortAllDetailRequests
  };
}
