import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Assignment, AssignmentEvent } from "@dydact/taskr-api-client";
import { ApiError } from "@dydact/taskr-api-client";

import { env } from "../config/env";
import { useTaskRClient } from "../lib/taskrClient";

type StreamEnvelope = {
  action: string;
  payload?: unknown;
};

type UseDedicatedAssignmentsResult = {
  assignments: Assignment[];
  assignmentsLoading: boolean;
  assignmentsError: string | null;
  refreshAssignments: () => void;
  latestEvent: AssignmentEvent | null;
  isStreaming: boolean;
  streamError: string | null;
  seedDemoAssignment: () => Promise<void>;
};

const buildStreamUrl = () => {
  const base = env.taskrApiBase || "";
  const trimmedBase = base.replace(/\/$/, "");
  const path = `${trimmedBase || ""}/dedicated/assignments/stream`.replace("//dedicated", "/dedicated");
  if (!env.tenantId) {
    return path || "/dedicated/assignments/stream";
  }
  const separator = path.includes("?") ? "&" : "?";
  return `${path || "/dedicated/assignments/stream"}${separator}tenant=${encodeURIComponent(env.tenantId)}`;
};

const coerceAssignment = (input: unknown): Assignment | null => {
  if (!input || typeof input !== "object") {
    return null;
  }
  const record = input as Record<string, unknown>;
  const assignmentId = record.assignment_id;
  if (typeof assignmentId !== "string") {
    return null;
  }
  return record as Assignment;
};

const coerceEvent = (input: unknown): AssignmentEvent | null => {
  if (!input || typeof input !== "object") {
    return null;
  }
  const record = input as Record<string, unknown>;
  const eventId = record.event_id;
  if (typeof eventId !== "string") {
    return null;
  }
  return record as AssignmentEvent;
};

export const useDedicatedAssignments = (): UseDedicatedAssignmentsResult => {
  const client = useTaskRClient();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState<boolean>(false);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [latestEvent, setLatestEvent] = useState<AssignmentEvent | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const [refreshToken, setRefreshToken] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);

  const refreshAssignments = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();

    const load = async () => {
      setAssignmentsLoading(true);
      setAssignmentsError(null);
      try {
        const response = await client.dedicated.list();
        if (!cancelled) {
          setAssignments(response);
        }
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message || `Failed to load dedicated assignments (HTTP ${error.status})`
            : error instanceof Error
            ? error.message
            : "Unknown error fetching assignments";
        setAssignmentsError(message);
        setAssignments([]);
      } finally {
        if (!cancelled) {
          setAssignmentsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [client, refreshToken]);

  const closeStream = useCallback(() => {
    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    closeStream();

    const connect = () => {
      try {
        const url = buildStreamUrl();
        const source = new EventSource(url.toString(), { withCredentials: true });
        eventSourceRef.current = source;
        setIsStreaming(true);
         setStreamError(null);

        source.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as StreamEnvelope & { payload: unknown };
            if (data.action === "assignment_upserted") {
              const record = coerceAssignment(data.payload);
              if (!record) {
                return;
              }
              setAssignments((prev) => {
                const existing = prev.findIndex((item) => item.assignment_id === record.assignment_id);
                if (existing >= 0) {
                  const next = prev.slice();
                  next[existing] = { ...prev[existing], ...record };
                  return next;
                }
                return [record, ...prev];
              });
            } else if (data.action === "assignment_event") {
              const eventRecord = coerceEvent(data.payload);
              if (eventRecord) {
                setLatestEvent(eventRecord);
              }
            }
          } catch {
            // Swallow JSON errors; stream may include keep-alives.
          }
        };

        source.onerror = () => {
          setIsStreaming(false);
          setStreamError("Connection lost");
          closeStream();
          retryTimeoutRef.current = window.setTimeout(connect, 2000);
        };
      } catch {
        setIsStreaming(false);
        setStreamError("Unable to establish stream");
        retryTimeoutRef.current = window.setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      setIsStreaming(false);
      closeStream();
    };
  }, [closeStream]);

  const seedDemoAssignment = useCallback(async () => {
    await client.dedicated.seedStub();
    refreshAssignments();
  }, [client, refreshAssignments]);

  return useMemo(
    () => ({
      assignments,
      assignmentsLoading,
      assignmentsError,
      refreshAssignments,
      latestEvent,
      isStreaming,
      streamError,
      seedDemoAssignment,
    }),
    [
      assignments,
      assignmentsLoading,
      assignmentsError,
      refreshAssignments,
      latestEvent,
      isStreaming,
      streamError,
      seedDemoAssignment,
    ],
  );
};

type UseDedicatedEventsResult = {
  events: AssignmentEvent[];
  eventsLoading: boolean;
  eventsError: string | null;
  refreshEvents: () => void;
};

export const useDedicatedAssignmentEvents = (
  assignmentId: string | null,
  latestEvent: AssignmentEvent | null,
): UseDedicatedEventsResult => {
  const client = useTaskRClient();
  const [events, setEvents] = useState<AssignmentEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState<boolean>(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refreshEvents = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (!assignmentId) {
      setEvents([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setEventsLoading(true);
      setEventsError(null);
      try {
        const response = await client.dedicated.listEvents(assignmentId, 100);
        if (!cancelled) {
          setEvents(response);
        }
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message || `Failed to load assignment events (HTTP ${error.status})`
            : error instanceof Error
            ? error.message
            : "Unknown error fetching assignment events";
        setEventsError(message);
        setEvents([]);
      } finally {
        if (!cancelled) {
          setEventsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [assignmentId, client, refreshToken]);

  useEffect(() => {
    if (!assignmentId || !latestEvent) {
      return;
    }
    if (latestEvent.assignment_id !== assignmentId) {
      return;
    }
    setEvents((prev) => {
      if (prev.some((event) => event.event_id === latestEvent.event_id)) {
        return prev;
      }
      const next = [latestEvent, ...prev];
      next.sort(
        (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
      );
      return next.slice(0, 100);
    });
  }, [assignmentId, latestEvent]);

  return {
    events,
    eventsLoading,
    eventsError,
    refreshEvents,
  };
};
