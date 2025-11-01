import { useCallback, useEffect, useState } from "react";
import type { Task } from "@dydact/taskr-api-client";
import { ApiError } from "@dydact/taskr-api-client";
import { useTaskRClient } from "../lib/taskrClient";

type UseTasksOptions = {
  listId?: string | null;
  status?: string | null;
  search?: string;
};

export const useTasks = ({ listId, status, search }: UseTasksOptions) => {
  const client = useTaskRClient();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setRefreshToken((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();

    const fetchTasks = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!listId) {
          setTasks([]);
          setLoading(false);
          return;
        }

        const response = await client.tasks.list({
          list_id: listId ?? undefined,
          status: status ?? undefined,
          search: search ?? undefined
        });
        let payload: Task[] = [];
        if (Array.isArray((response as any)?.data)) {
          payload = (response as { data: Task[] }).data;
        } else if (Array.isArray(response)) {
          payload = response as Task[];
        }
        if (!cancelled) {
          setTasks(payload);
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.message || `Failed to fetch tasks (HTTP ${err.status})`
            : err instanceof Error
            ? err.message
            : String(err);
        setError(message);
        setTasks([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchTasks();

    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [client, listId, status, search, refreshToken]);

  return { tasks, loading, error, refresh, listId };
};
