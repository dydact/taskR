import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskRClient } from "../lib/client";
import type { MeetingNote } from "../types/meeting";
import { resolveErrorMessage } from "../lib/errorUtils";
import { env } from "../config/env";

const API_BASE = env.taskrApiBase;
const TENANT_ID = env.tenantId;

type UseMeetingNotesParams = {
  activeTaskId: string | null;
  isTaskDrawerOpen: boolean;
  client: TaskRClient;
  showToast: (input: { message: string; variant?: "info" | "success" | "error"; detail?: string }) => void;
};

export function useMeetingNotes({
  activeTaskId,
  isTaskDrawerOpen,
  client,
  showToast
}: UseMeetingNotesParams) {
  const [meetingNotes, setMeetingNotes] = useState<MeetingNote[]>([]);
  const [meetingNotesLoading, setMeetingNotesLoading] = useState(false);
  const [meetingNotesError, setMeetingNotesError] = useState<string | null>(null);
  const meetingNotesAbortRef = useRef<AbortController | null>(null);
  const [isMeetingAuditOpen, setIsMeetingAuditOpen] = useState(false);
  const [activeTaskMeetingNotes, setActiveTaskMeetingNotes] = useState<MeetingNote[]>([]);
  const [activeTaskMeetingNotesLoading, setActiveTaskMeetingNotesLoading] = useState(false);
  const [activeTaskMeetingNotesError, setActiveTaskMeetingNotesError] = useState<string | null>(null);
  const activeTaskMeetingNotesAbortRef = useRef<AbortController | null>(null);

  const activeTaskIdRef = useRef<string | null>(null);
  const isMeetingAuditOpenRef = useRef(false);
  const isTaskDrawerOpenRef = useRef(false);

  // Keep refs in sync
  useEffect(() => {
    activeTaskIdRef.current = activeTaskId;
  }, [activeTaskId]);

  useEffect(() => {
    isMeetingAuditOpenRef.current = isMeetingAuditOpen;
  }, [isMeetingAuditOpen]);

  useEffect(() => {
    isTaskDrawerOpenRef.current = isTaskDrawerOpen;
  }, [isTaskDrawerOpen]);

  const loadMeetingNotes = useCallback(async () => {
    meetingNotesAbortRef.current?.abort();
    const controller = new AbortController();
    meetingNotesAbortRef.current = controller;
    setMeetingNotesLoading(true);
    setMeetingNotesError(null);
    try {
      const data = await client.request<MeetingNote[]>({
        path: "/meetings/notes",
        method: "GET",
        signal: controller.signal
      });
      setMeetingNotes(data);
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      console.error("Failed to load meeting notes", err);
      const message = resolveErrorMessage(err, "Failed to load meeting notes");
      setMeetingNotesError(message);
      setMeetingNotes([]);
    } finally {
      if (!controller.signal.aborted) {
        setMeetingNotesLoading(false);
      }
      if (meetingNotesAbortRef.current === controller) {
        meetingNotesAbortRef.current = null;
      }
    }
  }, [client]);

  const loadMeetingNotesForTask = useCallback(
    async (taskId: string) => {
      if (!taskId) return;
      activeTaskMeetingNotesAbortRef.current?.abort();
      const controller = new AbortController();
      activeTaskMeetingNotesAbortRef.current = controller;
      setActiveTaskMeetingNotesLoading(true);
      setActiveTaskMeetingNotesError(null);
      try {
        const data = await client.request<MeetingNote[]>({
          path: "/meetings/notes",
          method: "GET",
          query: { task_id: taskId },
          signal: controller.signal
        });
        setActiveTaskMeetingNotes(data);
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        console.error("Failed to load meeting notes for task", err);
        const message = resolveErrorMessage(err, "Failed to load meeting notes for task");
        setActiveTaskMeetingNotesError(message);
        setActiveTaskMeetingNotes([]);
      } finally {
        if (!controller.signal.aborted) {
          setActiveTaskMeetingNotesLoading(false);
        }
        if (activeTaskMeetingNotesAbortRef.current === controller) {
          activeTaskMeetingNotesAbortRef.current = null;
        }
      }
    },
    [client]
  );

  const regenerateMeetingNote = useCallback(
    async (noteId: string) => {
      try {
        const updated = await client.request<MeetingNote>({
          path: `/meetings/notes/${noteId}/regenerate`,
          method: "POST"
        });
        setMeetingNotes((prev) => prev.map((note) => (note.note_id === updated.note_id ? updated : note)));
        setActiveTaskMeetingNotes((prev) => prev.map((note) => (note.note_id === updated.note_id ? updated : note)));
        return updated;
      } catch (err) {
        console.error("Failed to regenerate meeting summary", err);
        const detail = resolveErrorMessage(err, "Failed to regenerate meeting summary");
        showToast({
          message: "Failed to regenerate meeting summary",
          variant: "error",
          detail
        });
        throw err;
      }
    },
    [client, showToast]
  );

  // Load meeting notes when audit drawer opens
  useEffect(() => {
    if (!isMeetingAuditOpen) {
      return;
    }
    void loadMeetingNotes();
    return () => {
      meetingNotesAbortRef.current?.abort();
    };
  }, [isMeetingAuditOpen, loadMeetingNotes]);

  // Load task meeting notes when task drawer opens
  useEffect(() => {
    if (!isTaskDrawerOpen || !activeTaskId) {
      activeTaskMeetingNotesAbortRef.current?.abort();
      if (!isTaskDrawerOpen) {
        setActiveTaskMeetingNotes([]);
        setActiveTaskMeetingNotesError(null);
        setActiveTaskMeetingNotesLoading(false);
      }
      return;
    }
    void loadMeetingNotesForTask(activeTaskId);
    return () => {
      activeTaskMeetingNotesAbortRef.current?.abort();
    };
  }, [isTaskDrawerOpen, activeTaskId, loadMeetingNotesForTask]);

  // Event stream listener for meeting events
  useEffect(() => {
    const base = (API_BASE || "").replace(/\/$/, "");
    const streamUrl = `${base}/events/stream?tenant=${encodeURIComponent(TENANT_ID)}`;
    const source = new EventSource(streamUrl);

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const type = String(payload?.type || "");
        if (type === "taskr.meeting.summary.regenerated") {
          showToast({ message: "Meeting summary regenerated", variant: "success" });
          if (isMeetingAuditOpenRef.current) {
            void loadMeetingNotes();
          }
          const taskId = typeof payload?.task_id === "string" ? payload.task_id : null;
          if (taskId && isTaskDrawerOpenRef.current && activeTaskIdRef.current === taskId) {
            void loadMeetingNotesForTask(taskId);
          }
        } else if (type === "dydact.summary.meeting.created") {
          showToast({ message: "New meeting summary captured", variant: "info" });
        }
      } catch (err) {
        console.warn("Failed to handle event stream payload", err);
      }
    };

    return () => {
      source.close();
    };
  }, [loadMeetingNotes, loadMeetingNotesForTask, showToast]);

  const clearActiveTaskMeetingNotes = useCallback(() => {
    activeTaskMeetingNotesAbortRef.current?.abort();
    setActiveTaskMeetingNotes([]);
    setActiveTaskMeetingNotesError(null);
    setActiveTaskMeetingNotesLoading(false);
  }, []);

  return {
    meetingNotes,
    meetingNotesLoading,
    meetingNotesError,
    isMeetingAuditOpen,
    setIsMeetingAuditOpen,
    activeTaskMeetingNotes,
    activeTaskMeetingNotesLoading,
    activeTaskMeetingNotesError,
    loadMeetingNotes,
    loadMeetingNotesForTask,
    regenerateMeetingNote,
    clearActiveTaskMeetingNotes
  };
}
