import { DragEndEvent } from "@dnd-kit/core";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import { useTaskStream } from "./hooks/useTaskStream";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement
} from "chart.js";
import { WorkspaceShell } from "./layout/WorkspaceShell";
import { Sidebar } from "./components/navigation/Sidebar";
import { CommandBar } from "./components/navigation/CommandBar";
import { PreferencesPanel } from "./components/preferences/PreferencesPanel";
import { TenantSettingsDrawer } from "./components/settings/TenantSettingsDrawer";
import { useHotkeys } from "./hooks/useHotkeys";
import { ColumnSettingsDrawer, DEFAULT_COLUMNS, ColumnKey } from "./components/list/ColumnSettingsDrawer";
import { ListView } from "./views/ListView";
import { BoardView } from "./views/BoardView";
import { CalendarView } from "./views/CalendarView";
import { ClaimsView } from "./views/ClaimsView";
import { XoXoView } from "./views/XoXoView";
import { HRView } from "./views/HRView";
import { GanttView } from "./views/GanttView";
import { InboxView } from "./views/InboxView";
import { GoalsView } from "./views/GoalsView";
import { DocsView } from "./views/DocsView";
import { DedicatedView } from "./views/DedicatedView";
import { DashboardView } from "./views/DashboardView";
import { ChatOverlay } from "./components/chat/ChatOverlay";
import { TaskDrawer } from "./components/task/TaskDrawer";
import { FilterBar, TaskFilters } from "./components/filters/FilterBar";
import { DashboardGrid, packDashboardWidgets } from "./components/dashboard/DashboardGrid";
import {
  StatusDonut,
  WorkloadBar,
  VelocityLine,
  BurnDown,
  CycleEfficiency,
  OverdueGauge,
  ThroughputHistogram as ThroughputHistogramWidget,
  MetricCards
} from "./components/dashboard/widgets";
import type { HierarchyList, HierarchySpace, SpaceSummary } from "./types/hierarchy";
import type { ActivityEvent, Task, TaskComment, Subtask, CustomFieldValue } from "./types/task";
import type { Doc } from "./types/doc";
import type {
  AnalyticsSummary,
  BurnDownSeries,
  CycleEfficiencyMetrics,
  DashboardWidget,
  DashboardWidgetType,
  StatusSummary,
  ThroughputHistogram as ThroughputHistogramData,
  VelocitySeries,
  WorkloadSummary,
  OverdueSummary
} from "./types/dashboard";
import { CommandPalette, CommandItem } from "./components/command/CommandPalette";
import { MeetingSummaryAuditDrawer } from "./components/meeting/MeetingSummaryAuditDrawer";
import type { MeetingNote } from "./types/meeting";
import { env } from "./config/env";
import { useTaskRClient } from "./lib/client";
import { useShell } from "./context/ShellContext";
import type { ViewMode } from "./types/shell";
import { ApiError } from "@dydact/taskr-api-client";
import { useAIFeatures } from "./hooks/useAIFeatures";
import { KairosSuggestionsPanel, DydactDock } from "./components/ai";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement
);

const TENANT_ID = env.tenantId;
const API_BASE = env.taskrApiBase;
const CLAIMS_API_BASE = env.claimsApiBase;
const PREFERENCE_MODEL_SLUG = env.preferenceModelSlug;
const USER_ID = env.userId;
const TASK_PAGE_SIZE_DEFAULT = env.taskPageSize;
const CHAT_ICON = env.chatIconUrl;

type Space = SpaceSummary;

type Dashboard = {
  dashboard_id: string;
  space_id: string;
  slug: string;
  name: string;
  layout: DashboardWidget[];
  metadata_json?: Record<string, unknown>;
};

type PreferenceModel = {
  model_id: string;
  slug: string;
  name: string;
  status: string;
};

type PreferenceRolloutSnapshot = {
  rollout_id: string;
  variant_id: string | null;
  variant_key: string | null;
  stage: string | null;
  current_rate: number | null;
  target_rate: number | null;
  safety_status: string;
  total_feedback: number;
  positive: number;
  negative: number;
  negative_ratio: number;
  guardrail_evaluated_at?: string | null;
  last_feedback_at?: string | null;
};

type PreferenceSummary = {
  model_id: string;
  variant_id: string | null;
  total_feedback: number;
  positive: number;
  negative: number;
  avg_rating: number | null;
  negative_ratio: number;
  safety_status: string;
  guardrail_evaluated_at?: string | null;
  last_feedback_at?: string | null;
  rollouts: PreferenceRolloutSnapshot[];
};

type ToastVariant = "info" | "success" | "error";

type ToastMessage = {
  id: number;
  message: string;
  variant: ToastVariant;
  detail?: string;
};


const PLANE_COLORS = {
  indigo: "#6C5DD3",
  teal: "#2EC5CE",
  amber: "#F7B23B",
  coral: "#F76B8A",
  blue: "#4361EE",
  violet: "#9B6DFF",
  green: "#4CBF99",
  slate: "#1F2A41",
  surfaceMuted: "#2B3648",
  danger: "#F8615A",
  neutral: "#9AA5B1"
} as const;

const CHART_COLORS = [
  PLANE_COLORS.indigo,
  PLANE_COLORS.teal,
  PLANE_COLORS.amber,
  PLANE_COLORS.coral,
  PLANE_COLORS.violet,
  PLANE_COLORS.green
];

const VIEW_LABELS: Record<ViewMode, string> = {
  list: "List",
  board: "Board",
  calendar: "Calendar",
  dashboard: "Dashboard",
  gantt: "Gantt",
  inbox: "Inbox",
  goals: "Goals",
  claims: "Claims",
  hr: "HR",
  docs: "Docs",
  dedicated: "Dedicated",
  xoxo: "xOxO"
};

const DEFAULT_COLUMN_VISIBILITY: Record<ColumnKey, boolean> = {
  status: true,
  priority: true,
  due_at: true
};
const LIST_COLUMNS_PREF_KEY = "list_columns";
const DEFAULT_TASK_FILTERS: TaskFilters = {
  status: null,
  search: ""
};

export const App: React.FC = () => {
  const client = useTaskRClient();
  const {
    preferences,
    setViewMode: setShellViewMode,
    spaces: shellSpaces,
    activeSpaceId,
    setActiveSpace,
    navigation,
    navigationLoading,
    spacesLoading,
    updateListViewColumns,
    setAiPersona
  } = useShell();

  const viewMode = preferences.lastView;
  const { showKairosSuggestions, showDydactDock } = useAIFeatures();
  const spaces = useMemo<Space[]>(
    () =>
      shellSpaces.map((space) => ({
        space_id: space.space_id,
        slug: space.slug,
        name: space.name,
        color: space.color ?? null
      })),
    [shellSpaces]
  );
  const selectedSpaceId = activeSpaceId;
  const setViewMode = setShellViewMode;
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(undefined);

  const handleSelectAgent = useCallback((agentSlug: string) => {
    setSelectedAgent(agentSlug);
    setViewMode("dedicated");
  }, [setViewMode]);

  const resolveErrorMessage = useCallback((err: unknown, fallback: string) => {
    if (err instanceof ApiError) {
      return err.message ? err.message : `${fallback} (HTTP ${err.status})`;
    }
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
  }, []);

  const apiFetch = useCallback(
    async (
      url: string,
      init: RequestInit & { method?: string } = {}
    ): Promise<{
      ok: boolean;
      status: number;
      json: () => Promise<any>;
      text: () => Promise<string>;
    }> => {
      const normalizedBase = API_BASE?.replace(/\/$/, "") ?? "";
      const trimmedUrl = url.startsWith(normalizedBase) ? url.slice(normalizedBase.length) : url;
      const path = trimmedUrl.startsWith("/") ? trimmedUrl : `/${trimmedUrl}`;
      const method = (init.method ?? (init.body ? "POST" : "GET")).toUpperCase() as
        | "GET"
        | "POST"
        | "PATCH"
        | "DELETE";

      let body: unknown = init.body;
      if (body && typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          body = init.body;
        }
      }

      let headers = init.headers as Record<string, string> | undefined;
      if (headers) {
        headers = Object.fromEntries(
          Object.entries(headers).filter(([key]) => {
            const lower = key.toLowerCase();
            return lower !== "x-tenant-id" && lower !== "x-user-id";
          })
        );
      }

      try {
        const data = await client.request<any>({
          path,
          method,
          body,
          signal: init.signal,
          headers
        });
        const toText =
          typeof data === "string" ? data : JSON.stringify(data ?? null, null, 2);
        return {
          ok: true,
          status: 200,
          json: async () => data,
          text: async () => toText
        };
      } catch (err) {
        if (err instanceof ApiError) {
          const toText =
            typeof err.body === "string" ? err.body : JSON.stringify(err.body ?? null, null, 2);
          return {
            ok: false,
            status: err.status,
            json: async () => err.body,
            text: async () => toText
          };
        }
        throw err;
      }
    },
    [client]
  );
  const [hierarchy, setHierarchy] = useState<HierarchySpace | null>(null);
  const [tasks, setTasks] = useState<Record<string, Task[]>>({});
  const [claimSearchTerm, setClaimSearchTerm] = useState("");
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const { event } = useTaskStream(TENANT_ID);
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>({ ...DEFAULT_COLUMN_VISIBILITY });
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const [isChatOverlayOpen, setIsChatOverlayOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isTenantSettingsOpen, setIsTenantSettingsOpen] = useState(false);
  const [commentsByTask, setCommentsByTask] = useState<Record<string, TaskComment[]>>({});
  const [commentsLoading, setCommentsLoading] = useState(false);
  const commentsAbortRef = useRef<AbortController | null>(null);
  const [activityByTask, setActivityByTask] = useState<Record<string, ActivityEvent[]>>({});
  const [activityLoading, setActivityLoading] = useState(false);
  const activityAbortRef = useRef<AbortController | null>(null);
  const [taskFilters, setTaskFilters] = useState<TaskFilters>({ ...DEFAULT_TASK_FILTERS });
  const [customFieldsByTask, setCustomFieldsByTask] = useState<Record<string, CustomFieldValue[]>>({});
  const [customFieldsLoading, setCustomFieldsLoading] = useState(false);
  const customFieldsAbortRef = useRef<AbortController | null>(null);
  const [subtasksByTask, setSubtasksByTask] = useState<Record<string, Subtask[]>>({});
  const [subtasksLoading, setSubtasksLoading] = useState(false);
  const subtasksAbortRef = useRef<AbortController | null>(null);
  const [docsByTask, setDocsByTask] = useState<Record<string, Doc[]>>({});
  const [docsLoading, setDocsLoading] = useState(false);
  const docsAbortRef = useRef<AbortController | null>(null);
  const [isMeetingAuditOpen, setIsMeetingAuditOpen] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState<MeetingNote[]>([]);
  const [meetingNotesLoading, setMeetingNotesLoading] = useState(false);
  const [meetingNotesError, setMeetingNotesError] = useState<string | null>(null);
  const meetingNotesAbortRef = useRef<AbortController | null>(null);
  const [activeTaskMeetingNotes, setActiveTaskMeetingNotes] = useState<MeetingNote[]>([]);
  const [activeTaskMeetingNotesLoading, setActiveTaskMeetingNotesLoading] = useState(false);
  const [activeTaskMeetingNotesError, setActiveTaskMeetingNotesError] = useState<string | null>(null);
  const activeTaskMeetingNotesAbortRef = useRef<AbortController | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);
  const toastTimeoutsRef = useRef<Record<number, number>>({});
  const activeTaskIdRef = useRef<string | null>(null);
  const isMeetingAuditOpenRef = useRef(false);
  const claimSearchInputRef = useRef<HTMLInputElement | null>(null);
  const isTaskDrawerOpenRef = useRef(false);

  const dismissToast = useCallback((id: number) => {
    const handle = toastTimeoutsRef.current[id];
    if (handle) {
      window.clearTimeout(handle);
      delete toastTimeoutsRef.current[id];
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (input: { message: string; variant?: ToastVariant; detail?: string }) => {
      const id = ++toastIdRef.current;
      const toast: ToastMessage = {
        id,
        message: input.message,
        variant: input.variant ?? "info",
        detail: input.detail
      };
      setToasts((prev) => [...prev, toast]);
      const timeout = window.setTimeout(() => dismissToast(id), 5000);
      toastTimeoutsRef.current[id] = timeout;
    },
    [dismissToast]
  );
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
  }, [client, resolveErrorMessage]);

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
    [client, resolveErrorMessage]
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
    [client, resolveErrorMessage, showToast]
  );
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dashboardWidgets, setDashboardWidgets] = useState<DashboardWidget[]>([]);
  const [statusSummary, setStatusSummary] = useState<StatusSummary | null>(null);
  const [workloadSummary, setWorkloadSummary] = useState<WorkloadSummary | null>(null);
  const [velocitySeries, setVelocitySeries] = useState<VelocitySeries | null>(null);
  const [burnDownSeries, setBurnDownSeries] = useState<BurnDownSeries | null>(null);
  const [cycleEfficiencyMetrics, setCycleEfficiencyMetrics] = useState<CycleEfficiencyMetrics | null>(null);
  const [throughputHistogram, setThroughputHistogram] = useState<ThroughputHistogramData | null>(null);
  const [overdueSummary, setOverdueSummary] = useState<OverdueSummary | null>(null);
  const [analyticsSummaryData, setAnalyticsSummaryData] = useState<AnalyticsSummary | null>(null);
  const [isEditingDashboard, setIsEditingDashboard] = useState(false);
  const [isSavingDashboard, setIsSavingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsReloadKey, setAnalyticsReloadKey] = useState(0);
  const dashboardCacheRef = useRef<Map<string, { ts: number; data: unknown }>>(new Map());
  const [preferenceModelId, setPreferenceModelId] = useState<string | null>(null);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [preferenceSummary, setPreferenceSummary] = useState<PreferenceSummary | null>(null);
  const [preferenceSummaryError, setPreferenceSummaryError] = useState<string | null>(null);
  const isEditingRef = useRef(false);

  const sortWidgets = useCallback(
    (widgets: DashboardWidget[]) =>
      [...widgets].sort((a, b) => {
        if (a.position.y === b.position.y) {
          return a.position.x - b.position.x;
        }
        return a.position.y - b.position.y;
      }),
    []
  );

  useEffect(() => {
    return () => {
      Object.values(toastTimeoutsRef.current).forEach((handle) => window.clearTimeout(handle));
      toastTimeoutsRef.current = {};
    };
  }, []);

  useEffect(() => {
    activeTaskIdRef.current = activeTaskId;
  }, [activeTaskId]);

  useEffect(() => {
    isMeetingAuditOpenRef.current = isMeetingAuditOpen;
  }, [isMeetingAuditOpen]);

  useEffect(() => {
    isTaskDrawerOpenRef.current = isTaskDrawerOpen;
  }, [isTaskDrawerOpen]);

  useEffect(() => {
    if (!isMeetingAuditOpen) {
      return;
    }
    void loadMeetingNotes();
    return () => {
      meetingNotesAbortRef.current?.abort();
    };
  }, [isMeetingAuditOpen, loadMeetingNotes]);

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

  useEffect(() => {
    if (!dashboard) {
      setDashboardWidgets([]);
      return;
    }
    if (isEditingDashboard) {
      return;
    }
    setDashboardWidgets(sortWidgets(dashboard.layout));
  }, [dashboard, isEditingDashboard, sortWidgets]);

  useEffect(() => {
    if (viewMode !== "dashboard" && isEditingDashboard) {
      setIsEditingDashboard(false);
    }
  }, [viewMode, isEditingDashboard]);

  useEffect(() => {
    if (!PREFERENCE_MODEL_SLUG) {
      return;
    }
    const controller = new AbortController();
    const loadPreferenceModels = async () => {
      try {
        const models = await client.request<PreferenceModel[]>({
          path: "/preferences/models",
          method: "GET",
          signal: controller.signal
        });
        const match = models.find((model) => model.slug.toLowerCase() === PREFERENCE_MODEL_SLUG);
        if (match) {
          setPreferenceModelId(match.model_id);
          setPreferenceError(null);
        } else if (models.length > 0) {
          setPreferenceModelId(models[0].model_id);
          setPreferenceError(
            `Preference model '${PREFERENCE_MODEL_SLUG}' not found; defaulting to ${models[0].slug}`
          );
        } else {
          setPreferenceModelId(null);
          setPreferenceError("No preference models available. Feedback will be disabled.");
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to load preference models", err);
        setPreferenceError(resolveErrorMessage(err, "Unable to load preference models"));
      }
    };

    void loadPreferenceModels();

    return () => {
      controller.abort();
    };
  }, [client, resolveErrorMessage]);

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

  useEffect(() => {
    if (!preferenceModelId || viewMode !== "dashboard") {
      if (viewMode !== "dashboard") {
        setPreferenceSummary(null);
      }
      return;
    }
    const controller = new AbortController();
    setPreferenceSummaryError(null);
    apiFetch(`${API_BASE}/preferences/models/${preferenceModelId}/summary`, {
      headers: { "x-tenant-id": TENANT_ID },
      signal: controller.signal
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load preference summary: ${res.status}`);
        }
        return res.json();
      })
      .then((data: PreferenceSummary) => {
        setPreferenceSummary({ ...data, rollouts: data.rollouts ?? [] });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load preference summary", err);
        setPreferenceSummaryError("Unable to load preference guardrail metrics");
        setPreferenceSummary(null);
      });

    return () => {
      controller.abort();
    };
  }, [apiFetch, preferenceModelId, viewMode]);

  useEffect(() => {
    isEditingRef.current = isEditingDashboard;
  }, [isEditingDashboard]);

  useEffect(() => {
    if (!activeTaskId) return;
    const exists = Object.values(tasks).some((listTasks) =>
      (listTasks ?? []).some((task) => task.task_id === activeTaskId)
    );
    if (!exists) {
      setActiveTaskId(null);
    }
  }, [tasks, activeTaskId]);

  const handlePreferenceFeedback = useCallback(
    (taskId: string, rating: number) => {
      setActiveTaskId(taskId);
      if (!preferenceModelId) {
        if (preferenceError) {
          console.warn(preferenceError);
        }
        return;
      }
      const payload = {
        model_id: preferenceModelId,
        variant_id: null,
        task_id: taskId,
        user_id: null,
        source: "web",
        signal_type: "thumbs",
        rating,
        metadata_json: {
          list_id: selectedListId,
          view_mode: viewMode
        }
      };
      apiFetch(`${API_BASE}/preferences/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": TENANT_ID
        },
        body: JSON.stringify(payload)
      }).catch((err) => console.error("Failed to record preference feedback", err));
    },
    [apiFetch, preferenceModelId, preferenceError, selectedListId, viewMode, setActiveTaskId]
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!activeTaskId) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select") {
          return;
        }
      }
      if (event.key === "]") {
        event.preventDefault();
        handlePreferenceFeedback(activeTaskId, 1);
      } else if (event.key === "[") {
        event.preventDefault();
        handlePreferenceFeedback(activeTaskId, -1);
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [activeTaskId, handlePreferenceFeedback]);

  const doneStatusMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!hierarchy) return map;
    const allLists = [
      ...hierarchy.root_lists,
      ...hierarchy.folders.flatMap((f) => f.lists)
    ];
    for (const entry of allLists) {
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

  const layoutDirty = useMemo(() => {
    if (!dashboard) return false;
    const saved = sortWidgets(dashboard.layout);
    if (saved.length !== dashboardWidgets.length) {
      return true;
    }
    for (let i = 0; i < saved.length; i += 1) {
      const a = saved[i];
      const b = dashboardWidgets[i];
      if (a.widget_id !== b.widget_id) {
        return true;
      }
      if (JSON.stringify(a.position) !== JSON.stringify(b.position)) {
        return true;
      }
    }
    return false;
  }, [dashboard, dashboardWidgets, sortWidgets]);

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

  useEffect(() => {
    if (viewMode !== "dashboard" || !selectedSpaceId) {
      return;
    }
    const space = spaces.find((s) => s.space_id === selectedSpaceId);
    if (!space) return;
    const identifier = space.slug ?? selectedSpaceId;
    let cancelled = false;
    setAnalyticsError(null);
    setDashboardError(null);
    setStatusSummary(null);
    setWorkloadSummary(null);
    setVelocitySeries(null);
    setBurnDownSeries(null);
    setCycleEfficiencyMetrics(null);
    setThroughputHistogram(null);
    setOverdueSummary(null);
    setAnalyticsSummaryData(null);

    const fetchDashboardData = async () => {
      try {
        const data = await client.request<Dashboard>({
          path: `/dashboards/spaces/${identifier}`,
          method: "GET"
        });
        if (cancelled) return;
        const normalized = sortWidgets(data.layout);
        setDashboard({ ...data, layout: normalized });
        if (!isEditingRef.current) {
          setDashboardWidgets(normalized);
        }
      } catch (err) {
        console.error("Failed to load dashboard", err);
        if (!cancelled) {
          setDashboard(null);
          setDashboardWidgets([]);
          setDashboardError("Unable to load dashboard layout");
        }
      }
    };

    const fetchJsonCached = async (path: string, ttlMs = 30000) => {
      const now = Date.now();
      const cached = dashboardCacheRef.current.get(path);
      if (cached && now - cached.ts < ttlMs) {
        return cached.data;
      }
      const data = await client.request<any>({ path, method: "GET" });
      dashboardCacheRef.current.set(path, { ts: now, data });
      return data;
    };

    const fetchAnalytics = async () => {
      const layoutSource = dashboardWidgets.length > 0 ? dashboardWidgets : dashboard?.layout ?? [];
      const configFor = (type: DashboardWidgetType): Record<string, unknown> => {
        const widget = layoutSource.find((item) => item.widget_type === type);
        return widget?.config ?? {};
      };

      const velocityConfig = configFor("velocity");
      const burnConfig = configFor("burn_down");
      const cycleConfig = configFor("cycle_efficiency");
      const throughputConfig = configFor("throughput");

      const velocityDays = Number(velocityConfig.window_days) || 30;
      const burnDays = Number(burnConfig.days) || 14;
      const cycleDays = Number(cycleConfig.days) || 30;
      const throughputWeeks = Number(throughputConfig.weeks) || 12;

      try {
        const [statusData, workloadData, velocityData, burnData, cycleData, throughputData, overdueData, summaryData] =
          await Promise.all([
            fetchJsonCached(`/analytics/spaces/${identifier}/status-summary`),
            fetchJsonCached(`/analytics/spaces/${identifier}/workload`),
            fetchJsonCached(`/analytics/spaces/${identifier}/velocity?days=${velocityDays}`),
            fetchJsonCached(`/analytics/spaces/${identifier}/burn-down?days=${burnDays}`),
            fetchJsonCached(`/analytics/spaces/${identifier}/cycle-efficiency?days=${cycleDays}`),
            fetchJsonCached(`/analytics/spaces/${identifier}/throughput?weeks=${throughputWeeks}`),
            fetchJsonCached(`/analytics/spaces/${identifier}/overdue`),
            fetchJsonCached(`/analytics/spaces/${identifier}/summary`)
          ]);

        if (cancelled) return;
        setStatusSummary(statusData);
        setWorkloadSummary(workloadData);
        setVelocitySeries(velocityData);
        setBurnDownSeries(burnData);
        setCycleEfficiencyMetrics(cycleData);
        setThroughputHistogram(throughputData);
        setOverdueSummary(overdueData);
        setAnalyticsSummaryData(summaryData);
      } catch (err) {
        console.error("Failed to load analytics", err);
        if (!cancelled) {
          setStatusSummary(null);
          setWorkloadSummary(null);
          setVelocitySeries(null);
          setBurnDownSeries(null);
          setCycleEfficiencyMetrics(null);
          setThroughputHistogram(null);
          setOverdueSummary(null);
          setAnalyticsSummaryData(null);
          setAnalyticsError("Unable to load analytics");
        }
      }
    };

    fetchDashboardData();
    fetchAnalytics();

    return () => {
      cancelled = true;
    };
  }, [client, viewMode, selectedSpaceId, spaces, sortWidgets, analyticsReloadKey]);

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

  const calendarListLabel = selectedList ? selectedList.list.name : "All lists";

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

  useEffect(() => {
    if (isTaskDrawerOpen && activeTaskId && !selectedTask) {
      setIsTaskDrawerOpen(false);
    }
  }, [isTaskDrawerOpen, activeTaskId, selectedTask]);

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

  const handleCustomFieldChange = useCallback(
    async (taskId: string, fieldId: string, value: unknown) => {
      try {
        const data = await client.request<CustomFieldValue[]>({
          path: `/custom-fields/tasks/${taskId}`,
          method: "PUT",
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
    [client]
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

  const handleOpenTask = useCallback((taskId: string) => {
    setActiveTaskId(taskId);
    setIsTaskDrawerOpen(true);
  }, []);

  const handleCloseTaskDrawer = useCallback(() => {
    setIsTaskDrawerOpen(false);
    commentsAbortRef.current?.abort();
    customFieldsAbortRef.current?.abort();
    subtasksAbortRef.current?.abort();
    docsAbortRef.current?.abort();
    activeTaskMeetingNotesAbortRef.current?.abort();
    setActiveTaskMeetingNotes([]);
    setActiveTaskMeetingNotesError(null);
    setActiveTaskMeetingNotesLoading(false);
  }, []);

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
        const updatedTask = await client.tasks.update(taskId, updates);
        setTasks((prev) => {
          const next: typeof prev = {};
          for (const [listId, listTasks] of Object.entries(prev)) {
            next[listId] = listTasks.map((task) => (task.task_id === taskId ? updatedTask : task));
          }
          return next;
        });
      } catch (err) {
        console.error("Failed to persist task update", err);
      }
    },
    [client]
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

  useEffect(() => {
    if (!navigation || !selectedSpaceId) {
      return;
    }
    const listsInSpace = [
      ...navigation.root_lists,
      ...navigation.folders.flatMap((folder) => folder.lists)
    ];
    if (listsInSpace.length === 0) {
      setSelectedListId(null);
      return;
    }
    const listIds = new Set(listsInSpace.map((list) => list.list_id));
    setSelectedListId((prev) => {
      if (prev && listIds.has(prev)) {
        return prev;
      }
      return listsInSpace[0]?.list_id ?? null;
    });
  }, [navigation, selectedSpaceId]);

  const toggleColumn = useCallback(
    (key: ColumnKey) => {
      setVisibleColumns((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        const selected = (Object.keys(next) as ColumnKey[]).filter((column) => next[column]);
        updateListViewColumns(
          selected.reduce<Record<string, boolean>>((acc, columnKey) => {
            acc[columnKey] = true;
            return acc;
          }, {})
        );
        return next;
      });
    },
    [updateListViewColumns]
  );

  const selectedColumns = useMemo(
    () => (Object.keys(visibleColumns) as ColumnKey[]).filter((key) => visibleColumns[key]),
    [visibleColumns]
  );

  useEffect(() => {
    const next = { ...DEFAULT_COLUMN_VISIBILITY };
    Object.entries(preferences.listViewColumns ?? {}).forEach(([key, value]) => {
      next[key as ColumnKey] = Boolean(value);
    });
    setVisibleColumns(next);
  }, [preferences.listViewColumns]);

  // Dashboard edit handlers (hoisted above Command Palette to avoid TDZ)
  const handleDashboardLayoutChange = useCallback((nextWidgets: DashboardWidget[]) => {
    setDashboardWidgets(nextWidgets);
  }, []);

  const handleStartDashboardEdit = useCallback(() => {
    if (dashboard) {
      const normalized = packDashboardWidgets(sortWidgets(dashboard.layout));
      setDashboardWidgets(normalized);
    }
    setIsEditingDashboard(true);
  }, [dashboard, sortWidgets]);

  const handleCancelDashboardEdit = useCallback(() => {
    if (dashboard) {
      setDashboardWidgets(sortWidgets(dashboard.layout));
    }
    setIsEditingDashboard(false);
  }, [dashboard, sortWidgets]);

  const handleResetDashboard = useCallback(() => {
    if (dashboard) {
      const normalized = isEditingDashboard
        ? packDashboardWidgets(sortWidgets(dashboard.layout))
        : sortWidgets(dashboard.layout);
      setDashboardWidgets(normalized);
    }
  }, [dashboard, isEditingDashboard, sortWidgets]);

  const handleSaveDashboard = useCallback(async () => {
    if (!dashboard || !selectedSpaceId) return;
    const space = spaces.find((s) => s.space_id === selectedSpaceId);
    if (!space) return;
    const identifier = space.slug ?? selectedSpaceId;
    setIsSavingDashboard(true);
    try {
      const payload = {
        name: dashboard.name,
        layout: dashboardWidgets.map((widget) => ({
          ...widget,
          position: { ...widget.position }
        })),
        metadata_json: dashboard.metadata_json ?? {}
      };
      const saved = await client.request<Dashboard>({
        path: `/dashboards/spaces/${identifier}`,
        method: "PUT",
        body: payload
      });
      const normalized = sortWidgets(saved.layout);
      setDashboard({ ...saved, layout: normalized });
      setDashboardWidgets(normalized);
      setIsEditingDashboard(false);
    } catch (err) {
      console.error("Failed to save dashboard", err);
      setDashboardError("Unable to save dashboard");
    } finally {
      setIsSavingDashboard(false);
    }
  }, [client, dashboard, selectedSpaceId, spaces, dashboardWidgets, sortWidgets]);
  

  const commandItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    (Object.keys(VIEW_LABELS) as ViewMode[]).forEach((mode, index) => {
      items.push({
        id: `view-${mode}`,
        label: `${mode === viewMode ? "Stay in" : "Switch to"} ${VIEW_LABELS[mode]} view`,
        group: "Views",
        action: () => setViewMode(mode),
        shortcut: `${index + 1}`
      });
    });

    items.push({
      id: "action-columns",
      label: "Open Column Settings",
      group: "Quick Actions",
      subtitle: viewMode !== "list" ? "Switches to List view" : undefined,
      shortcut: "C",
      action: () => {
        if (viewMode !== "list") {
          setViewMode("list");
          setTimeout(() => setIsColumnSettingsOpen(true), 0);
        } else {
          setIsColumnSettingsOpen(true);
        }
      }
    });

    items.push({
      id: "dashboard-refresh",
      label: "Refresh dashboard analytics",
      group: "Dashboard",
      shortcut: "R",
      action: () => {
        if (viewMode !== "dashboard") {
          setViewMode("dashboard");
          setTimeout(() => setAnalyticsReloadKey((key) => key + 1), 0);
        } else {
          setAnalyticsReloadKey((key) => key + 1);
        }
      }
    });

    if (viewMode === "dashboard") {
      items.push({
        id: "dashboard-edit",
        label: isEditingDashboard ? "Exit dashboard edit mode" : "Edit dashboard layout",
        group: "Dashboard",
        shortcut: "E",
        action: () => {
          if (isEditingDashboard) {
            handleCancelDashboardEdit();
          } else {
            handleStartDashboardEdit();
          }
        }
      });

      if (isEditingDashboard) {
        items.push({
          id: "dashboard-save",
          label: "Save dashboard layout",
          group: "Dashboard",
          shortcut: "S",
          action: () => {
            void handleSaveDashboard();
          }
        });
        items.push({
          id: "dashboard-reset",
          label: "Reset dashboard layout",
          group: "Dashboard",
          action: handleResetDashboard
        });
      }
    }

    // Chat overlay
    items.push({
      id: "chat-overlay-open",
      label: isChatOverlayOpen ? "Hide Dydact Chat" : "Open Dydact Chat",
      group: "Chat",
      shortcut: "5",
      action: () => setIsChatOverlayOpen((open) => !open)
    });

    items.push({
      id: "tenant-settings",
      label: "Open Tenant Settings",
      group: "Admin",
      action: () => setIsTenantSettingsOpen(true)
    });

    items.push({
      id: "hr-open",
      label: viewMode === "hr" ? "Stay in HR view" : "Open HR view",
      group: "HR",
      shortcut: "6",
      action: () => setViewMode("hr")
    });

    items.push({
      id: "meeting-audit",
      label: isMeetingAuditOpen ? "Close Meeting Summary Audit" : "Open Meeting Summary Audit",
      group: "Meetings",
      shortcut: "7",
      action: () => setIsMeetingAuditOpen((open) => !open)
    });

    shellSpaces.forEach((space) => {
      items.push({
        id: `space-${space.spaceId}`,
        label: space.name,
        group: "Spaces",
        subtitle: space.slug,
        action: () => handleSelectSpace(space.spaceId)
      });
    });

    if (navigation && activeSpaceId) {
      const activeSpace =
        shellSpaces.find(
          (space) => space.spaceId === activeSpaceId || space.slug === navigation.slug
        ) ?? null;
      const spaceName = activeSpace?.name ?? navigation.name;
      navigation.root_lists.forEach((list) => {
        items.push({
          id: `list-${list.list_id}`,
          label: list.name,
          group: `${spaceName} • Lists`,
          action: () => handleSelectList(navigation.space_id, list.list_id)
        });
      });

      navigation.folders.forEach((folder) => {
        folder.lists.forEach((list) => {
          items.push({
            id: `list-${list.list_id}`,
            label: list.name,
            subtitle: folder.name,
            group: `${spaceName} • Folders`,
            action: () => handleSelectList(navigation.space_id, list.list_id)
          });
        });
      });
    }

    return items;
  }, [
    shellSpaces,
    navigation,
    activeSpaceId,
    viewMode,
    handleSelectSpace,
    handleSelectList,
    isEditingDashboard,
    handleCancelDashboardEdit,
    handleStartDashboardEdit,
    handleSaveDashboard,
    handleResetDashboard,
    isChatOverlayOpen,
    isMeetingAuditOpen
  ]);

  const handleFilterChange = useCallback(
    (nextFilters: TaskFilters) => {
      setTaskFilters(nextFilters);
    },
    []
  );



  const renderListView = () => (
    <ListView
      selectedListId={selectedListId}
      tasksByList={filteredTasksByList}
      activeTaskId={activeTaskId}
      onOpenTask={handleOpenTask}
      onPreferenceFeedback={handlePreferenceFeedback}
      columnVisibility={visibleColumns}
    />
  );

  const renderBoardView = () => (
    <BoardView
      selectedList={selectedList}
      tasksByList={filteredTasksByList}
      availableLists={allLists}
      onMoveTask={handleMoveToList}
      onPreferenceFeedback={handlePreferenceFeedback}
      activeTaskId={activeTaskId}
      onOpenTask={handleOpenTask}
      onDragEnd={handleDragEnd}
    />
  );

  useHotkeys({
    "meta+k": (event) => {
      event.preventDefault();
      if (viewMode === "claims") {
        claimSearchInputRef.current?.focus();
        claimSearchInputRef.current?.select();
      } else {
        setIsCommandPaletteOpen(true);
      }
    },
    "ctrl+k": (event) => {
      event.preventDefault();
      if (viewMode === "claims") {
        claimSearchInputRef.current?.focus();
        claimSearchInputRef.current?.select();
      } else {
        setIsCommandPaletteOpen(true);
      }
    },
    "shift+?": (event) => {
      event.preventDefault();
      setIsCommandPaletteOpen(true);
    },
    "1": () => setViewMode("claims"),
    "2": () => setViewMode("list"),
    "3": () => setViewMode("board"),
    "4": () => setViewMode("calendar"),
    "5": () => setViewMode("dashboard"),
    "6": () => setViewMode("hr"),
    "g c": (event) => {
      event.preventDefault();
      setViewMode("claims");
      requestAnimationFrame(() => {
        claimSearchInputRef.current?.focus();
        claimSearchInputRef.current?.select();
      });
    },
    "/": (event) => {
      event.preventDefault();
      if (viewMode === "claims") {
        claimSearchInputRef.current?.focus();
        claimSearchInputRef.current?.select();
      } else {
        setIsCommandPaletteOpen(true);
      }
    },
    escape: () => {
      setIsCommandPaletteOpen(false);
      setIsColumnSettingsOpen(false);
    }
  });

  const renderDashboardWidget = (widget: DashboardWidget) => {
    if (
      widget.widget_type !== "open_count" &&
      widget.widget_type !== "preference_guardrail" &&
      analyticsError
    ) {
      return <p className="dashboard-error">{analyticsError}</p>;
    }

    switch (widget.widget_type) {
      case "status_summary":
        if (!statusSummary) return <p>Loading analytics…</p>;
        return <StatusDonut summary={statusSummary} colors={CHART_COLORS} />;
      case "workload":
        if (!workloadSummary) return <p>Loading analytics…</p>;
        return <WorkloadBar summary={workloadSummary} colors={[PLANE_COLORS.indigo, PLANE_COLORS.teal]} />;
      case "velocity":
        if (!velocitySeries) return <p>Loading analytics…</p>;
        return <VelocityLine series={velocitySeries} color={PLANE_COLORS.blue} />;
      case "burn_down":
        if (!burnDownSeries) return <p>Loading analytics…</p>;
        return (
          <BurnDown
            series={burnDownSeries}
            colors={{
              planned: PLANE_COLORS.neutral,
              completed: PLANE_COLORS.indigo,
              remaining: "rgba(108, 93, 211, 0.2)"
            }}
          />
        );
      case "cycle_efficiency":
        if (!cycleEfficiencyMetrics) return <p>Loading analytics…</p>;
        return <CycleEfficiency metrics={cycleEfficiencyMetrics} />;
      case "throughput":
        if (!throughputHistogram) return <p>Loading analytics…</p>;
        return <ThroughputHistogramWidget histogram={throughputHistogram} color={PLANE_COLORS.teal} />;
      case "overdue":
        if (!overdueSummary) return <p>Loading analytics…</p>;
        return <OverdueGauge summary={overdueSummary} />;
      case "metric_cards": {
        const cards = analyticsSummaryData?.cards ?? [];
        return <MetricCards cards={cards} />;
      }
      case "open_count":
        return (
          <div className="metric-widget">
            <p className="metric-value">{openCount}</p>
            <p className="metric-caption">Open tasks</p>
          </div>
        );
      case "preference_guardrail": {
        if (!preferenceModelId) {
          return <p>{preferenceError ?? "Preference model not configured."}</p>;
        }
        if (preferenceSummaryError) {
          return <p className="dashboard-error">{preferenceSummaryError}</p>;
      }
      if (!preferenceSummary) {
        return <p>Loading guardrail metrics…</p>;
      }

      const {
        total_feedback,
        positive,
        negative,
        avg_rating,
        negative_ratio,
        safety_status,
        guardrail_evaluated_at,
        rollouts
      } = preferenceSummary;

      const formatPercent = (value: number | null | undefined) => {
        if (value === null || value === undefined) return "–";
        return `${(value * 100).toFixed(0)}%`;
      };

      const formatDatetime = (value?: string | null) => {
        if (!value) return "–";
        return new Date(value).toLocaleString();
      };

      return (
        <div className="guardrail-widget">
          <div className={`guardrail-status status-${safety_status.toLowerCase()}`}>
            <span className="label">Status</span>
            <span className="value">{safety_status.toUpperCase()}</span>
          </div>
          <div className="guardrail-grid">
            <div>
              <span className="label">Signals</span>
              <span className="value">{total_feedback}</span>
            </div>
            <div>
              <span className="label">Positive</span>
              <span className="value">{positive}</span>
            </div>
            <div>
              <span className="label">Negative</span>
              <span className="value">{negative}</span>
            </div>
            <div>
              <span className="label">Avg Rating</span>
              <span className="value">{avg_rating !== null ? avg_rating.toFixed(2) : "–"}</span>
            </div>
            <div>
              <span className="label">Neg Ratio</span>
              <span className="value">{(negative_ratio * 100).toFixed(1)}%</span>
            </div>
            <div>
              <span className="label">Evaluated</span>
              <span className="value">{formatDatetime(guardrail_evaluated_at)}</span>
            </div>
          </div>
          {rollouts.length > 0 ? (
            <table className="guardrail-rollouts">
              <thead>
                <tr>
                  <th>Variant</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th>Signals</th>
                  <th>Neg Ratio</th>
                  <th>Current</th>
                  <th>Target</th>
                  <th>Last Eval</th>
                </tr>
              </thead>
              <tbody>
                {rollouts.map((rollout) => (
                  <tr key={rollout.rollout_id}>
                    <td>{rollout.variant_key ?? "global"}</td>
                    <td>{rollout.stage ?? "–"}</td>
                    <td>
                      <span className={`status-chip status-${rollout.safety_status.toLowerCase()}`}>
                        {rollout.safety_status.toUpperCase()}
                      </span>
                    </td>
                    <td>{rollout.total_feedback}</td>
                    <td>{(rollout.negative_ratio * 100).toFixed(1)}%</td>
                    <td>{formatPercent(rollout.current_rate)}</td>
                    <td>{formatPercent(rollout.target_rate)}</td>
                    <td>{formatDatetime(rollout.guardrail_evaluated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="guardrail-empty">No rollout guardrails configured.</p>
          )}
        </div>
      );
      }
      default:
        return <p>Unsupported widget.</p>;
    }
  };

  const renderDashboardView = () => {
    if (dashboardError) {
      return <p className="dashboard-error">{dashboardError}</p>;
    }
    if (!dashboard) {
      return <p>Loading dashboard…</p>;
    }
    if (dashboardWidgets.length === 0) {
      return <p>No widgets configured.</p>;
    }
    return (
      <div className="dashboard-view">
        {showKairosSuggestions && (
          <KairosSuggestionsPanel className="dashboard-kairos" />
        )}
        <DashboardGrid
          widgets={dashboardWidgets}
          isEditing={isEditingDashboard}
          onLayoutChange={handleDashboardLayoutChange}
          renderWidget={renderDashboardWidget}
        />
      </div>
    );
  };

  let mainContent: React.ReactNode;
  switch (viewMode) {
    case "list":
      mainContent = renderListView();
      break;
    case "board":
      mainContent = renderBoardView();
      break;
    case "calendar":
      mainContent = (
        <CalendarView
          hasSelection={!!selectedListId}
          listLabel={calendarListLabel}
          tasks={calendarTasks}
        />
      );
      break;
    case "dashboard":
      mainContent = (
        <DashboardView
          tasks={calendarTasks}
          onOpenTask={handleOpenTask}
          onAcceptInsight={(id) => showToast({ message: `Insight "${id}" accepted`, variant: "success" })}
          onDeclineInsight={(id) => showToast({ message: `Insight "${id}" dismissed`, variant: "info" })}
        />
      );
      break;
    case "xoxo":
      mainContent = <XoXoView />;
      break;
    case "gantt":
      mainContent = <GanttView />;
      break;
    case "inbox":
      mainContent = (
        <InboxView
          tasks={calendarTasks}
          onOpenTask={handleOpenTask}
          onCompleteTask={(taskId) => {
            void handleUpdateTask(taskId, { status: "done" });
            showToast({ message: "Task marked complete", variant: "success" });
          }}
          onSnoozeTask={(taskId, until) => {
            void handleUpdateTask(taskId, { status: "snoozed" });
            showToast({ message: `Task snoozed until ${new Date(until).toLocaleString()}`, variant: "info" });
          }}
          onDelegateTask={(taskId) => {
            handleOpenTask(taskId);
            showToast({ message: "Open task to delegate to a team member", variant: "info" });
          }}
        />
      );
      break;
    case "goals":
      mainContent = (
        <GoalsView
          tasks={calendarTasks}
          onOpenTask={handleOpenTask}
        />
      );
      break;
    case "docs":
      mainContent = <DocsView />;
      break;
    case "dedicated":
      mainContent = <DedicatedView initialAgent={selectedAgent} />;
      break;
    case "claims":
      mainContent = (
        <ClaimsView
          apiBase={CLAIMS_API_BASE}
          tenantId={TENANT_ID}
          userId={USER_ID}
          searchTerm={claimSearchTerm}
          onToast={showToast}
        />
      );
      break;
    case "hr":
    default:
      mainContent = <HRView tenantId={TENANT_ID} />;
      break;
  }

  const listCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [listId, items] of Object.entries(tasks)) {
      counts[listId] = items.length;
    }
    return counts;
  }, [tasks]);

  const spaceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (navigation) {
      const listIds = [
        ...navigation.root_lists.map((list) => list.list_id),
        ...navigation.folders.flatMap((folder) => folder.lists.map((list) => list.list_id))
      ];
      counts[navigation.space_id] = listIds.reduce(
        (total, listId) => total + (listCounts[listId] ?? 0),
        0
      );
    }
    return counts;
  }, [navigation, listCounts]);

  const sidebarNode = (
    <Sidebar
      selectedListId={selectedListId}
      onSelectSpace={handleSelectSpace}
      onSelectList={handleSelectList}
      listCounts={listCounts}
      spaceCounts={spaceCounts}
      selectedAgent={selectedAgent}
      onSelectAgent={handleSelectAgent}
    />
  );

  const commandBarNode = (
    <div className="command-bar-container">
      <CommandBar
        viewMode={viewMode}
        onViewModeChange={(mode) => setViewMode(mode)}
        onOpenColumnSettings={() => setIsColumnSettingsOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenPreferences={() => setIsPreferencesOpen(true)}
        onOpenTenantSettings={() => setIsTenantSettingsOpen(true)}
        claimSearchTerm={claimSearchTerm}
        onClaimSearchTermChange={setClaimSearchTerm}
        claimSearchRef={claimSearchInputRef}
        aiPersona={preferences.aiPersona}
        onAiPersonaChange={setAiPersona}
      />
      {viewMode === "dashboard" ? (
        <div className="dashboard-header">
          <h2>{dashboard?.name ?? "Dashboard"}</h2>
          <div className="dashboard-actions">
            {!isEditingDashboard ? (
              <button
                type="button"
                onClick={handleStartDashboardEdit}
                disabled={!!dashboardError || dashboardWidgets.length === 0}
              >
                Edit Layout
              </button>
            ) : (
              <>
                <button type="button" onClick={handleResetDashboard} disabled={!layoutDirty}>
                  Reset
                </button>
                <button type="button" onClick={handleCancelDashboardEdit}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveDashboard}
                  disabled={!layoutDirty || isSavingDashboard}
                >
                  {isSavingDashboard ? "Saving…" : "Save"}
                </button>
              </>
            )}
          </div>
        </div>
      ) : viewMode === "claims" ? (
        <div className="view-header">
          <h2>Claims Activity</h2>
          <p className="view-subheader">Track submissions, acknowledgements, and clearinghouse events.</p>
        </div>
      ) : (
        <div className="view-header">
          <h2>{selectedList ? selectedList.list.name : "Select a list"}</h2>
        </div>
      )}
      {(viewMode === "list" || viewMode === "board") && (
        <FilterBar
          filters={taskFilters}
          onChange={handleFilterChange}
          availableStatuses={selectedList?.statuses ?? []}
          disabled={!selectedListId}
        />
      )}
    </div>
  );

  return (
    <>
      <WorkspaceShell sidebar={sidebarNode} commandBar={commandBarNode}>
        <div className="workspace-scroll">
          {mainContent}
          {preferenceError && <p className="dashboard-error preference-error">{preferenceError}</p>}
        </div>
      </WorkspaceShell>
      <button
        type="button"
        className="chat-trigger"
        onClick={() => setIsChatOverlayOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isChatOverlayOpen}
      >
        <img src={CHAT_ICON} alt="Open Dydact Chat" />
      </button>
      <ChatOverlay
        tenantId={TENANT_ID}
        userId={USER_ID}
        open={isChatOverlayOpen}
        onClose={() => setIsChatOverlayOpen(false)}
      />
      {showDydactDock && (
        <DydactDock
          onOpenChat={() => setIsChatOverlayOpen(true)}
          onOpenInsights={() => {
            setViewMode("dashboard");
          }}
          onOpenAgents={() => {
            // Future: Open agent management panel
          }}
        />
      )}
      <ColumnSettingsDrawer
        isOpen={isColumnSettingsOpen}
        options={DEFAULT_COLUMNS}
        selected={selectedColumns}
        onToggle={toggleColumn}
        onClose={() => setIsColumnSettingsOpen(false)}
      />
      <TaskDrawer
        open={isTaskDrawerOpen && !!selectedTask}
        task={selectedTask}
        statuses={selectedList?.statuses ?? []}
        onClose={handleCloseTaskDrawer}
        onUpdate={handleUpdateTask}
        comments={activeTaskId ? commentsByTask[activeTaskId] ?? [] : []}
        commentsLoading={commentsLoading}
        activityEvents={activeTaskId ? activityByTask[activeTaskId] ?? [] : []}
        activityLoading={activityLoading}
        onAddComment={handleAddComment}
        customFields={currentCustomFields}
        customFieldsLoading={customFieldsLoading}
        onCustomFieldChange={(fieldId, value) =>
          activeTaskId ? handleCustomFieldChange(activeTaskId, fieldId, value) : Promise.resolve()
        }
        subtasks={currentSubtasks}
        subtasksLoading={subtasksLoading}
        onCreateSubtask={(title) => (activeTaskId ? handleCreateSubtask(activeTaskId, title) : Promise.resolve())}
        onToggleSubtask={(subtaskId, status) =>
          activeTaskId ? handleToggleSubtask(activeTaskId, subtaskId, status) : Promise.resolve()
        }
        onDeleteSubtask={(subtaskId) =>
          activeTaskId ? handleDeleteSubtask(activeTaskId, subtaskId) : Promise.resolve()
        }
        docs={currentDocs}
        docsLoading={docsLoading}
        meetingNotes={activeTaskMeetingNotes}
        meetingNotesLoading={activeTaskMeetingNotesLoading}
        meetingNotesError={activeTaskMeetingNotesError}
        onRefreshMeetingNotes={
          activeTaskId ? () => void loadMeetingNotesForTask(activeTaskId) : undefined
        }
        onRegenerateMeetingNote={regenerateMeetingNote}
      />
      <MeetingSummaryAuditDrawer
        open={isMeetingAuditOpen}
        notes={meetingNotes}
        loading={meetingNotesLoading}
        error={meetingNotesError}
        onClose={() => setIsMeetingAuditOpen(false)}
        onRefresh={() => void loadMeetingNotes()}
        onRegenerate={regenerateMeetingNote}
      />
      <PreferencesPanel isOpen={isPreferencesOpen} onClose={() => setIsPreferencesOpen(false)} />
      <TenantSettingsDrawer
        isOpen={isTenantSettingsOpen}
        onClose={() => setIsTenantSettingsOpen(false)}
        apiBase={API_BASE || window.location.origin}
        tenantId={TENANT_ID}
      />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        commands={commandItems}
      />
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item toast-${toast.variant}`}>
            <div className="toast-body">
              <span className="toast-message">{toast.message}</span>
              {toast.detail && <span className="toast-detail">{toast.detail}</span>}
            </div>
            <button
              type="button"
              className="toast-dismiss"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
};
