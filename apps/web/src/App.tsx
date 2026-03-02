import React, { useCallback, useMemo, useRef, useState } from "react";
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
import { FilterBar } from "./components/filters/FilterBar";
import { DashboardGrid } from "./components/dashboard/DashboardGrid";
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
import type { DashboardWidget } from "./types/dashboard";
import { CommandPalette, CommandItem } from "./components/command/CommandPalette";
import { MeetingSummaryAuditDrawer } from "./components/meeting/MeetingSummaryAuditDrawer";
import { env } from "./config/env";
import { useTaskRClient } from "./lib/client";
import { useShell } from "./context/ShellContext";
import type { ViewMode } from "./types/shell";
import { useAIFeatures } from "./hooks/useAIFeatures";
import { KairosSuggestionsPanel, DydactDock } from "./components/ai";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Extracted hooks
import { useToast } from "./hooks/useToast";
import { useTaskDetail } from "./hooks/useTaskDetail";
import { useDashboard } from "./hooks/useDashboard";
import { useMeetingNotes } from "./hooks/useMeetingNotes";
import { usePreferenceFeedback } from "./hooks/usePreferenceFeedback";
import { useTaskHierarchy } from "./hooks/useTaskHierarchy";
import { createApiFetch } from "./lib/apiFetch";

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
const USER_ID = env.userId;
const CHAT_ICON = env.chatIconUrl;

type Space = { space_id: string; slug: string; name: string; color: string | null };

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

  // --- apiFetch ---
  const apiFetch = useMemo(() => createApiFetch(client), [client]);

  // --- Toast ---
  const { toasts, showToast, dismissToast } = useToast();

  // --- Task stream ---
  const { event } = useTaskStream(TENANT_ID);

  // --- Task hierarchy ---
  const {
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
    calendarTasks,
    openCount,
    doneStatusMap,
    handleSelectSpace,
    handleSelectList,
    handleFilterChange,
    handleOpenTask,
    handleCloseTaskDrawer: hierarchyCloseTaskDrawer,
    handleDragEnd,
    handleMoveToList
  } = useTaskHierarchy({
    selectedSpaceId,
    spaces,
    apiFetch,
    client,
    showToast,
    event,
    navigation,
    setActiveSpace
  });

  // --- Task detail ---
  const {
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
  } = useTaskDetail({
    activeTaskId,
    isTaskDrawerOpen,
    tasks,
    setTasks,
    apiFetch,
    client,
    showToast
  });

  // --- Meeting notes ---
  const {
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
  } = useMeetingNotes({
    activeTaskId,
    isTaskDrawerOpen,
    client,
    showToast
  });

  // --- Dashboard ---
  const {
    dashboard,
    dashboardWidgets,
    isEditingDashboard,
    isSavingDashboard,
    dashboardError,
    statusSummary,
    workloadSummary,
    velocitySeries,
    burnDownSeries,
    cycleEfficiencyMetrics,
    throughputHistogram,
    overdueSummary,
    analyticsSummaryData,
    analyticsError,
    layoutDirty,
    handleDashboardLayoutChange,
    handleStartDashboardEdit,
    handleCancelDashboardEdit,
    handleResetDashboard,
    handleSaveDashboard,
    refreshAnalytics
  } = useDashboard({
    viewMode,
    selectedSpaceId,
    spaces,
    client,
    showToast
  });

  // --- Preference feedback ---
  const {
    preferenceModelId,
    preferenceError,
    preferenceSummary,
    preferenceSummaryError,
    handlePreferenceFeedback
  } = usePreferenceFeedback({
    viewMode,
    activeTaskId,
    selectedListId,
    setActiveTaskId,
    apiFetch,
    client
  });

  // --- Close task drawer (composite) ---
  const handleCloseTaskDrawer = useCallback(() => {
    hierarchyCloseTaskDrawer();
    abortAllDetailRequests();
    clearActiveTaskMeetingNotes();
  }, [hierarchyCloseTaskDrawer, abortAllDetailRequests, clearActiveTaskMeetingNotes]);

  // --- UI state ---
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>({ ...DEFAULT_COLUMN_VISIBILITY });
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isChatOverlayOpen, setIsChatOverlayOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isTenantSettingsOpen, setIsTenantSettingsOpen] = useState(false);
  const claimSearchInputRef = useRef<HTMLInputElement | null>(null);

  // --- Column settings ---
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

  // Sync column visibility from preferences
  React.useEffect(() => {
    const next = { ...DEFAULT_COLUMN_VISIBILITY };
    Object.entries(preferences.listViewColumns ?? {}).forEach(([key, value]) => {
      next[key as ColumnKey] = Boolean(value);
    });
    setVisibleColumns(next);
  }, [preferences.listViewColumns]);

  const calendarListLabel = selectedList ? selectedList.list.name : "All lists";

  // --- Command palette items ---
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
          setTimeout(() => refreshAnalytics(), 0);
        } else {
          refreshAnalytics();
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
      navigation.root_lists.forEach((list: any) => {
        items.push({
          id: `list-${list.list_id}`,
          label: list.name,
          group: `${spaceName} \u2022 Lists`,
          action: () => handleSelectList(navigation.space_id, list.list_id)
        });
      });

      navigation.folders.forEach((folder: any) => {
        folder.lists.forEach((list: any) => {
          items.push({
            id: `list-${list.list_id}`,
            label: list.name,
            subtitle: folder.name,
            group: `${spaceName} \u2022 Folders`,
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
    refreshAnalytics,
    isChatOverlayOpen,
    isMeetingAuditOpen,
    setIsMeetingAuditOpen
  ]);

  // --- Hotkeys ---
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

  // --- Dashboard widget renderer ---
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
        if (!statusSummary) return <p>Loading analytics\u2026</p>;
        return <StatusDonut summary={statusSummary} colors={CHART_COLORS} />;
      case "workload":
        if (!workloadSummary) return <p>Loading analytics\u2026</p>;
        return <WorkloadBar summary={workloadSummary} colors={[PLANE_COLORS.indigo, PLANE_COLORS.teal]} />;
      case "velocity":
        if (!velocitySeries) return <p>Loading analytics\u2026</p>;
        return <VelocityLine series={velocitySeries} color={PLANE_COLORS.blue} />;
      case "burn_down":
        if (!burnDownSeries) return <p>Loading analytics\u2026</p>;
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
        if (!cycleEfficiencyMetrics) return <p>Loading analytics\u2026</p>;
        return <CycleEfficiency metrics={cycleEfficiencyMetrics} />;
      case "throughput":
        if (!throughputHistogram) return <p>Loading analytics\u2026</p>;
        return <ThroughputHistogramWidget histogram={throughputHistogram} color={PLANE_COLORS.teal} />;
      case "overdue":
        if (!overdueSummary) return <p>Loading analytics\u2026</p>;
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
          return <p>Loading guardrail metrics\u2026</p>;
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
          if (value === null || value === undefined) return "\u2013";
          return `${(value * 100).toFixed(0)}%`;
        };

        const formatDatetime = (value?: string | null) => {
          if (!value) return "\u2013";
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
                <span className="value">{avg_rating !== null ? avg_rating.toFixed(2) : "\u2013"}</span>
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
                      <td>{rollout.stage ?? "\u2013"}</td>
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
      return <p>Loading dashboard\u2026</p>;
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

  // --- Main content routing ---
  let mainContent: React.ReactNode;
  switch (viewMode) {
    case "list":
      mainContent = (
        <ListView
          selectedListId={selectedListId}
          tasksByList={filteredTasksByList}
          activeTaskId={activeTaskId}
          onOpenTask={handleOpenTask}
          onPreferenceFeedback={handlePreferenceFeedback}
          columnVisibility={visibleColumns}
        />
      );
      break;
    case "board":
      mainContent = (
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

  // --- Sidebar counts ---
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
        ...navigation.root_lists.map((list: any) => list.list_id),
        ...navigation.folders.flatMap((folder: any) => folder.lists.map((list: any) => list.list_id))
      ];
      counts[navigation.space_id] = listIds.reduce(
        (total: number, listId: string) => total + (listCounts[listId] ?? 0),
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
                  {isSavingDashboard ? "Saving\u2026" : "Save"}
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
        <ErrorBoundary>
          <div className="workspace-scroll">
            {mainContent}
            {preferenceError && <p className="dashboard-error preference-error">{preferenceError}</p>}
          </div>
        </ErrorBoundary>
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
              {"\u00d7"}
            </button>
          </div>
        ))}
      </div>
    </>
  );
};
