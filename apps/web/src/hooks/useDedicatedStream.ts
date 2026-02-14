import { useEffect, useMemo, useRef, useState } from "react";
import { env } from "../config/env";

export type DedicatedStreamEvent = {
  tenant_id: string;
  topic: string;
  action: string;
  payload: Record<string, unknown>;
};

type UseDedicatedStreamOptions = {
  enabled?: boolean;
  userId?: string | null;
};

const buildStreamUrl = (tenantId: string, userId?: string) => {
  const base = env.taskrApiBase;
  if (!base) {
    const query = new URLSearchParams({ tenant: tenantId });
    if (userId) {
      query.set("user", userId);
    }
    return `/dedicated/assignments/stream?${query.toString()}`;
  }
  const url = new URL("/dedicated/assignments/stream", base);
  url.searchParams.set("tenant", tenantId);
  if (userId) {
    url.searchParams.set("user", userId);
  }
  return url.toString();
};

export const useDedicatedStream = (
  tenantId: string | null | undefined,
  options: UseDedicatedStreamOptions = {}
) => {
  const { enabled = true, userId } = options;
  const [event, setEvent] = useState<DedicatedStreamEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const url = useMemo(
    () => (tenantId ? buildStreamUrl(tenantId, userId ?? undefined) : null),
    [tenantId, userId]
  );

  useEffect(() => {
    if (!url || !enabled) {
      return () => {};
    }

    const source = new EventSource(url);
    eventSourceRef.current = source;

    source.onmessage = (messageEvent) => {
      try {
        const data = JSON.parse(messageEvent.data) as DedicatedStreamEvent;
        setEvent(data);
        setError(null);
      } catch (parseError) {
        console.error("Failed to parse dedicated SSE payload", parseError);
        setError("parse_error");
      }
    };

    source.onerror = (err) => {
      console.error("Dedicated SSE error", err);
      setError("connection_error");
      source.close();
    };

    return () => {
      source.close();
      eventSourceRef.current = null;
    };
  }, [url, enabled]);

  return {
    event,
    error,
    close: () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    }
  };
};
