import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_TASKR_API ?? "";

interface TaskEvent {
  type: string;
  tenant_id: string;
  task_id?: string;
  list_id?: string;
  payload?: any;
}

export const useTaskStream = (tenantId: string) => {
  const [event, setEvent] = useState<TaskEvent | null>(null);

  useEffect(() => {
    const source = new EventSource(`${API_BASE}/events/tasks/stream?tenant=${tenantId}`);
    source.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as TaskEvent;
        setEvent(data);
      } catch (err) {
        console.error("Failed to parse SSE message", err);
      }
    };
    source.onerror = (err) => {
      console.error("Task stream error", err);
      source.close();
    };
    return () => {
      source.close();
    };
  }, [tenantId]);

  return { event };
};
