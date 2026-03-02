import { useCallback, useEffect, useMemo, useState } from "react";
import { DragEndEvent } from "@dnd-kit/core";
import type { HierarchyList, HierarchySpace, SpaceSummary } from "../types/hierarchy";
import type { Task } from "../types/task";
import type { TaskFilters } from "../components/filters/FilterBar";
import type { ApiFetchResponse } from "../lib/apiFetch";
import type { TaskRClient } from "../lib/client";
import { env } from "../config/env";

const API_BASE = env.taskrApiBase;
const TENANT_ID = env.tenantId;
const USER_ID = env.userId;
const TASK_PAGE_SIZE_DEFAULT = env.taskPageSize;
// Note: TASK_PAGE_SIZE_FALLBACK is referenced but not defined in the original codebase.
// Keeping the same reference for behavioral parity.
declare const TASK_PAGE_SIZE_FALLBACK: number;

type Space = SpaceSummary;

const DEFAULT_TASK_FILTERS: TaskFilters = {
  status: null,
  search: ""
};

type TaskStreamEvent = {
  type: string;
  tenant_id: string;
  task_id?: string;
  list_id?: string;
  payload?: any;
} | null;

type UseTaskHierarchyParams = {
  selectedSpaceId: string | null;
  spaces: Space[];
  apiFetch: (url: string, init?: RequestInit & { method?: string }) => Promise<ApiFetchResponse>;
  client: TaskRClient;
  showToast: (input: { message: string; variant?: "info" | "success" | "error"; detail?: string }) => void;
  event: TaskStreamEvent;
  navigation: any;
  setActiveSpace: (spaceId: string) => void;
};

export function useTaskHierarchy({
  selectedSpaceId,
  spaces,
  apiFetch,
  client,
  showToast,
  event,
  navigation,
  setActiveSpace
}: UseTaskHierarchyParams) {
  const [hierarchy, setHierarchy] = useState<HierarchySpace | null>(null);
  const [tasks, setTasks] = useState<Record<string, Task[]>>({});
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskFilters, setTaskFilters] = useState<TaskFilters>({ ...DEFAULT_TASK_FILTERS });
  const [claimSearchTerm, setClaimSearchTerm] = useState("");
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);

  const allLists = useMemo(() => {
    if (!hierarchy) return [] as HierarchyList[];
    return [...hierarchy.root_lists, ...hierarchy.folders.flatMap((f) => f.lists)];
  }, [hierarchy]);

  const filteredTasksByList = useMemo(() => {
    if (!taskFilters.search.trim()) {
      return tasks;
    }
    const query = taskFilters.search.toLowerCase();
    const filtered: typeof tasks = {};
    for (const [listId, listTasks] of Object.entries(tasks)) {
      filtered[listId] = listTasks.filter((task) => {
        const haystack = `${task.title} ${task.description ?? ""}`.toLowerCase();
        return haystack.includes(query);
      });
    }
    return filtered;
  }, [tasks, taskFilters.search]);

  const selectedList = useMemo(() => {
    if (!selectedListId) return null;
    return allLists.find((l) => l.list.list_id === selectedListId) ?? null;
  }, [allLists, selectedListId]);

  const calendarTasks = useMemo(() => {
    if (selectedListId) {
      return filteredTasksByList[selectedListId] ?? [];
    }
    return Object.values(filteredTasksByList).flat();
  }, [filteredTasksByList, selectedListId]);

  const doneStatusMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!hierarchy) return map;
    const allListEntries = [
      ...hierarchy.root_lists,
      ...hierarchy.folders.flatMap((f) => f.lists)
    ];
    for (const entry of allListEntries) {
      const doneSet = new Set(
        entry.statuses
          .filter((status) => status.is_done)
          .map((status) => status.name.toLowerCase())
      );
      map.set(entry.list.list_id, doneSet);
    }
    return map;
  }, [hierarchy]);

  const openCount = useMemo(() => {
    if (!hierarchy) return 0;
    const listsInSpace = new Set<string>([
      ...hierarchy.root_lists.map((entry) => entry.list.list_id),
      ...hierarchy.folders.flatMap((f) => f.lists.map((entry) => entry.list.list_id))
    ]);
    let count = 0;
    for (const [listId, items] of Object.entries(tasks)) {
      if (!listsInSpace.has(listId)) continue;
      const doneSet = doneStatusMap.get(listId);
      count += items.filter((task) => {
        const statusName = task.status.toLowerCase();
        if (doneSet && doneSet.size > 0) {
          return !doneSet.has(statusName);
        }
        return statusName !== "done" && statusName !== "completed";
      }).length;
    }
    return count;
  }, [doneStatusMap, hierarchy, tasks]);

  // Fetch hierarchy and tasks when space changes
  useEffect(() => {
    if (!selectedSpaceId) {
      setHierarchy(null);
      return;
    }
    const space = spaces.find((s) => s.space_id === selectedSpaceId);
    const identifier = space?.slug ?? selectedSpaceId;
    const controller = new AbortController();
    const headers = { "x-tenant-id": TENANT_ID, "x-user-id": USER_ID };

    apiFetch(`${API_BASE}/spaces/${identifier}/hierarchy`, {
      headers,
      signal: controller.signal
    })
      .then((res) => res.json())
      .then((data: HierarchySpace) => {
        setHierarchy(data);
        const lists = [...data.root_lists, ...data.folders.flatMap((folder) => folder.lists)];
        setSelectedListId((prev) => {
          if (prev && lists.some((entry) => entry.list.list_id === prev)) {
            return prev;
          }
          const first = lists[0];
          return first ? first.list.list_id : null;
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch hierarchy", err);
      });

    const applyTasks = (data: Task[]) => {
      const grouped: Record<string, Task[]> = {};
      for (const task of data) {
        if (!grouped[task.list_id]) grouped[task.list_id] = [];
        grouped[task.list_id].push(task);
      }
      setTasks(grouped);
    };

    const requestTasks = async (pageSize: number): Promise<Task[]> => {
      const params = new URLSearchParams({
        space_identifier: identifier,
        page_size: String(pageSize)
      });
      if (taskFilters.status) {
        params.set("status", taskFilters.status);
      }
      const res = await apiFetch(`${API_BASE}/tasks?${params.toString()}`, {
        headers,
        signal: controller.signal
      });
      if (!res.ok) {
        let message: string | null = null;
        try {
          const body = await res.json();
          message = typeof body?.detail === "string" ? body.detail : JSON.stringify(body);
        } catch {
          try {
            message = await res.text();
          } catch {
            message = null;
          }
        }
        throw new Error(message ? `HTTP ${res.status}: ${message}` : `HTTP ${res.status}`);
      }
      const payload = await res.json();
      if (!Array.isArray(payload)) {
        throw new Error("Unexpected response payload when fetching tasks");
      }
      return payload as Task[];
    };

    (async () => {
      try {
        const data = await requestTasks(TASK_PAGE_SIZE_DEFAULT);
        if (!controller.signal.aborted) {
          applyTasks(data);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        const retryable = /page_size|less_than_equal/i.test(message);
        if (retryable && TASK_PAGE_SIZE_DEFAULT !== TASK_PAGE_SIZE_FALLBACK) {
          console.warn(
            `Retrying task fetch with fallback page size ${TASK_PAGE_SIZE_FALLBACK} after error:`,
            message
          );
          try {
            const fallbackData = await requestTasks(TASK_PAGE_SIZE_FALLBACK);
            if (!controller.signal.aborted) {
              applyTasks(fallbackData);
              return;
            }
          } catch (fallbackErr) {
            if (!controller.signal.aborted) {
              console.error("Failed to fetch tasks with fallback page size", fallbackErr);
              setTasks({});
            }
            return;
          }
        }
        console.error("Failed to fetch tasks", err);
        setTasks({});
      }
    })();

    return () => {
      controller.abort();
    };
  }, [apiFetch, selectedSpaceId, spaces, taskFilters.status]);

  // React to SSE task events
  useEffect(() => {
    if (!event) return;
    setTasks((prev) => {
      const next = { ...prev };
      switch (event.type) {
        case "task.created": {
          const listId = event.payload.list_id;
          const tasksForList = next[listId] ? [...next[listId]] : [];
          tasksForList.push(event.payload as Task);
          next[listId] = tasksForList;
          break;
        }
        case "task.updated": {
          const updatedTask = event.payload as Task;
          for (const key of Object.keys(next)) {
            next[key] = next[key].filter((t) => t.task_id !== updatedTask.task_id);
          }
          const listTasks = next[updatedTask.list_id] ? [...next[updatedTask.list_id]] : [];
          listTasks.push(updatedTask);
          next[updatedTask.list_id] = listTasks;
          break;
        }
        case "task.deleted": {
          for (const key of Object.keys(next)) {
            next[key] = next[key].filter((t) => t.task_id !== event.task_id);
          }
          break;
        }
        default:
          break;
      }
      return next;
    });
  }, [event]);

  // Validate active task still exists
  useEffect(() => {
    if (!activeTaskId) return;
    const exists = Object.values(tasks).some((listTasks) =>
      (listTasks ?? []).some((task) => task.task_id === activeTaskId)
    );
    if (!exists) {
      setActiveTaskId(null);
    }
  }, [tasks, activeTaskId]);

  // Auto-select list from navigation
  useEffect(() => {
    if (!navigation || !selectedSpaceId) {
      return;
    }
    const listsInSpace = [
      ...navigation.root_lists,
      ...navigation.folders.flatMap((folder: any) => folder.lists)
    ];
    if (listsInSpace.length === 0) {
      setSelectedListId(null);
      return;
    }
    const listIds = new Set(listsInSpace.map((list: any) => list.list_id));
    setSelectedListId((prev) => {
      if (prev && listIds.has(prev)) {
        return prev;
      }
      return listsInSpace[0]?.list_id ?? null;
    });
  }, [navigation, selectedSpaceId]);

  // Close task drawer if active task no longer exists
  useEffect(() => {
    if (isTaskDrawerOpen && activeTaskId) {
      const exists = Object.values(tasks).some((listTasks) =>
        (listTasks ?? []).some((task) => task.task_id === activeTaskId)
      );
      if (!exists) {
        setIsTaskDrawerOpen(false);
      }
    }
  }, [isTaskDrawerOpen, activeTaskId, tasks]);

  const handleSelectSpace = useCallback(
    (spaceId: string) => {
      setActiveSpace(spaceId);
    },
    [setActiveSpace]
  );

  const handleSelectList = useCallback(
    (spaceId: string, listId: string) => {
      setActiveSpace(spaceId);
      setSelectedListId(listId);
    },
    [setActiveSpace]
  );

  const handleFilterChange = useCallback(
    (nextFilters: TaskFilters) => {
      setTaskFilters(nextFilters);
    },
    []
  );

  const handleOpenTask = useCallback((taskId: string) => {
    setActiveTaskId(taskId);
    setIsTaskDrawerOpen(true);
  }, []);

  const handleCloseTaskDrawer = useCallback(() => {
    setIsTaskDrawerOpen(false);
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !selectedListId || !selectedList) return;
    const taskId = active.id as string;
    const statusId = over.id as string;
    const status = selectedList.statuses.find((s) => s.status_id === statusId);
    if (!status) return;

    setTasks((prev) => {
      const next = { ...prev };
      const current = (next[selectedListId] ?? []).filter((t) => t.task_id !== taskId);
      const moved = (prev[selectedListId] ?? []).find((t) => t.task_id === taskId);
      if (!moved) return prev;
      moved.status = status.name;
      const updatedList = [...current, moved];
      next[selectedListId] = updatedList;
      return next;
    });

    try {
      await client.tasks.update(taskId, { status: status.name });
    } catch (err) {
      console.error("Failed to update task", err);
    }
  };

  const handleMoveToList = async (task: Task, newListId: string) => {
    setTasks((prev) => {
      const next = { ...prev };
      next[task.list_id] = (next[task.list_id] ?? []).filter((t) => t.task_id !== task.task_id);
      const nextArray = next[newListId] ? [...next[newListId]] : [];
      nextArray.push({ ...task, list_id: newListId });
      next[newListId] = nextArray;
      return next;
    });

    try {
      await client.tasks.update(task.task_id, { list_id: newListId });
    } catch (err) {
      console.error("Failed to move task", err);
    }
  };

  return {
    hierarchy,
    tasks,
    setTasks,
    selectedListId,
    activeTaskId,
    setActiveTaskId,
    taskFilters,
    claimSearchTerm,
    setClaimSearchTerm,
    isTaskDrawerOpen,
    setIsTaskDrawerOpen,
    allLists,
    filteredTasksByList,
    selectedList,
    selectedTask: null, // selectedTask is computed in useTaskDetail
    calendarTasks,
    openCount,
    doneStatusMap,
    handleSelectSpace,
    handleSelectList,
    handleFilterChange,
    handleOpenTask,
    handleCloseTaskDrawer,
    handleDragEnd,
    handleMoveToList
  };
}
