import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "@dydact/taskr-api-client";
import { ThemeProvider, useTheme } from "./components/ThemeContext";
import { TopBar } from "./components/TopBar";
import { LeftNav } from "./components/LeftNav";
import { RightPanel } from "./components/RightPanel";
import { ListView } from "./components/ListView";
import { BoardView } from "./components/BoardView";
import { CalendarView } from "./components/CalendarView";
import { GanttView } from "./components/GanttView";
import { DashboardView } from "./components/DashboardView";
import { AIToast } from "./components/AIToast";
import { useShell } from "./context/ShellContext";
import { useTasks } from "./hooks/useTasks";
import { DedicatedView } from "./views/DedicatedView";
import { HRView } from "./views/HRView";
import { PlaceholderView } from "./views/PlaceholderView";
import { XoXoView } from "./views/XoXoView";
import { env } from "./config/env";
import { useTelemetry } from "./lib/telemetry";
import type { ViewMode, DensityMode } from "./types/shell";
import type { NavigationSpace } from "./types/navigation";
import { ClaimsServicesView } from "./views/ClaimsServicesView";
import { DydactDock } from "./components/DydactDock";

const DEFAULT_VIEW_SEQUENCE: ViewMode[] = [
  "dashboard",
  "list",
  "board",
  "calendar",
  "gantt",
  "claims",
  "hr",
  "dedicated",
  "xoxo"
];

export default function App() {
  const shell = useShell();
  const { preferencesLoading, ready } = shell;

  if (import.meta.env.DEV) {
    console.debug("[taskR] shell status", {
      ready: shell.ready,
      preferencesLoading: shell.preferencesLoading,
      spacesLoading: shell.spacesLoading,
      preferencesError: shell.preferencesError,
      spacesError: shell.spacesError
    });
  }

  if (!ready && preferencesLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 45%, #020617 100%)",
          color: "#f8fafc",
          fontFamily: "'Inter', 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          letterSpacing: "0.08em",
          textTransform: "uppercase"
        }}
      >
        <div style={{ opacity: 0.85, animation: "pulse 2s ease-in-out infinite" }}>
          Loading Task<span style={{ color: "#ef4444" }}>R</span> workspace…
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <AppLayout shell={shell} />
    </ThemeProvider>
  );
}

type AppLayoutProps = {
  shell: ReturnType<typeof useShell>;
};

const AppLayout: React.FC<AppLayoutProps> = ({ shell }) => {
  const {
    preferences,
    setViewMode,
    toggleRightPanel,
    setDensity,
    toggleFavorite,
    spaces,
    activeSpaceId,
    setActiveSpace,
    navigation,
    navigationLoading,
    navigationError
  } = shell;

  const { colors } = useTheme();
  const { track } = useTelemetry();

  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as any).__taskrShell = {
        ready: shell.ready,
        preferencesLoading: shell.preferencesLoading,
        spacesLoading: shell.spacesLoading,
        preferencesError: shell.preferencesError,
        spacesError: shell.spacesError,
        spaces: shell.spaces
      };
    }
  }, [
    shell.ready,
    shell.preferencesLoading,
    shell.spacesLoading,
    shell.preferencesError,
    shell.spacesError,
    shell.spaces
  ]);

  const normalizeView = (view: ViewMode): ViewMode => (view === "docs" ? "claims" : view);

  const [currentView, setCurrentView] = useState<ViewMode>(normalizeView(preferences.lastView));
  const [rightPanelOpen, setRightPanelOpen] = useState<boolean>(preferences.rightPanelOpen);
  const [showAIToast, setShowAIToast] = useState<boolean>(true);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const dockHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dockOpen, setDockOpen] = useState(false);

  useEffect(() => {
    setCurrentView(normalizeView(preferences.lastView));
  }, [preferences.lastView]);

  useEffect(() => {
    setRightPanelOpen(preferences.rightPanelOpen);
  }, [preferences.rightPanelOpen]);

  useEffect(() => {
    if (!navigation) {
      setSelectedListId(null);
      return;
    }
    if (selectedListId && navigationContainsList(navigation, selectedListId)) {
      return;
    }
    const fallback = firstListId(navigation);
    setSelectedListId(fallback);
  }, [navigation, selectedListId]);

  const clearDockTimer = useCallback(() => {
    if (dockHoverTimer.current) {
      clearTimeout(dockHoverTimer.current);
      dockHoverTimer.current = null;
    }
  }, []);

  const openDock = useCallback(() => {
    clearDockTimer();
    setDockOpen(true);
  }, [clearDockTimer]);

  const closeDock = useCallback(
    (immediate = false) => {
      clearDockTimer();
      if (immediate) {
        setDockOpen(false);
        return;
      }
      dockHoverTimer.current = setTimeout(() => {
        setDockOpen(false);
        dockHoverTimer.current = null;
      }, 160);
    },
    [clearDockTimer]
  );

  const handleDockHoverStart = useCallback(() => {
    openDock();
  }, [openDock]);

  const handleDockHoverEnd = useCallback(() => {
    closeDock(false);
  }, [closeDock]);

  const handleDockToggle = useCallback(() => {
    setDockOpen((prev) => {
      if (prev) {
        clearDockTimer();
      }
      return !prev;
    });
  }, [clearDockTimer]);

  useEffect(() => {
    return () => {
      clearDockTimer();
    };
  }, [clearDockTimer]);

  const handleViewChange = (view: ViewMode) => {
    const nextView = normalizeView(view);
    setCurrentView(nextView);
    setViewMode(nextView);
    void track({
      name: "shell.view_changed",
      properties: {
        view: nextView,
        previous_view: currentView
      }
    });
  };

  const handleToggleRightPanel = () => {
    setRightPanelOpen((prev) => {
      const next = !prev;
      toggleRightPanel(next);
      void track({
        name: "shell.right_panel_toggled",
        properties: {
          open: next
        }
      });
      return next;
    });
  };

  const orderedViews = useMemo(() => DEFAULT_VIEW_SEQUENCE, []);

  const derivedNavigation: NavigationSpace | null = navigation ?? null;
  const { tasks, loading: tasksLoading, error: tasksError, refresh: refreshTasks } = useTasks({ listId: selectedListId });
  const selectedListName = useMemo(() => {
    if (!derivedNavigation || !selectedListId) return null;
    return resolveListName(derivedNavigation, selectedListId);
  }, [derivedNavigation, selectedListId]);

  const handleSelectList = (spaceId: string, listId: string) => {
    setActiveSpace(spaceId);
    setSelectedListId(listId);
    if (currentView === "board" || currentView === "dashboard") {
      return;
    }
    if (currentView !== "list") {
      handleViewChange("list");
    }
    void track({
      name: "navigation.list_selected",
      properties: {
        space_id: spaceId,
        list_id: listId
      }
    });
  };

  return (
    <div className={`min-h-screen flex flex-col ${colors.background} ${colors.text}`}>
      <TopBar
        onToggleRightPanel={handleToggleRightPanel}
        density={preferences.viewDensity}
        onCycleDensity={() => {
          const order: DensityMode[] = ["comfortable", "compact", "table"];
          const index = order.indexOf(preferences.viewDensity);
          const next = order[(index + 1) % order.length];
          setDensity(next);
          void track({
            name: "preferences.density_cycled",
            properties: {
              next_density: next
            }
          });
        }}
        onDockToggle={handleDockToggle}
        onDockHoverStart={handleDockHoverStart}
        onDockHoverEnd={handleDockHoverEnd}
        dockOpen={dockOpen}
      />
      <div className="flex flex-1 overflow-hidden">
        <LeftNav
          spaces={spaces}
          activeSpaceId={activeSpaceId}
          navigation={derivedNavigation}
          navigationLoading={navigationLoading}
          navigationError={navigationError}
          selectedListId={selectedListId}
          onSelectSpace={setActiveSpace}
          onSelectList={handleSelectList}
          onToggleFavorite={toggleFavorite}
          viewMode={currentView}
          viewOptions={orderedViews}
          onViewModeChange={handleViewChange}
        />
        <main className="flex-1 overflow-y-auto">
          <MainContent
            currentView={currentView}
            navigation={derivedNavigation}
            selectedListId={selectedListId}
            tasks={tasks}
            tasksLoading={tasksLoading}
            tasksError={tasksError}
            listName={selectedListName}
            onRefreshTasks={refreshTasks}
          />
        </main>
        {rightPanelOpen && <RightPanel />}
      </div>
      {showAIToast && <AIToast onDismiss={() => setShowAIToast(false)} />}
      <DydactDock
        open={dockOpen}
        onRequestClose={() => closeDock(true)}
        onIntentOpen={handleDockHoverStart}
        onIntentClose={handleDockHoverEnd}
        spaces={spaces}
        activeSpaceId={activeSpaceId}
        onSelectSpace={setActiveSpace}
        currentView={currentView}
        onViewChange={handleViewChange}
        rightPanelOpen={rightPanelOpen}
        onToggleRightPanel={handleToggleRightPanel}
        trackEvent={track}
        viewOptions={orderedViews}
      />
    </div>
  );
};

type MainContentProps = {
  currentView: ViewMode;
  navigation: NavigationSpace | null;
  selectedListId: string | null;
  tasks: Task[];
  tasksLoading: boolean;
  tasksError: string | null;
  listName: string | null;
  onRefreshTasks: () => void;
};

const MainContent: React.FC<MainContentProps> = ({
  currentView,
  tasks,
  tasksLoading,
  tasksError,
  listName,
  selectedListId,
  onRefreshTasks
}) => {
  switch (currentView) {
    case "inbox":
      return (
        <PlaceholderView
          title="Inbox is on the roadmap"
          description="We’re wiring the notification feed and triage workflows here. For now, keep using the main Dashboard or Claims view to stay on top of your work."
        />
      );
    case "goals":
      return (
        <PlaceholderView
          title="Goals workspace coming soon"
          description="We’re designing a dedicated hub for OKRs, quarterly targets, and agent accountability. Stay tuned!"
        />
      );
    case "list":
      return (
        <div className="px-6 py-6 space-y-6">
          <ListView listName={listName} tasks={tasks} loading={tasksLoading} error={tasksError} />
        </div>
      );
    case "board":
      return (
        <div className="px-6 py-6">
          <BoardView tasks={tasks} loading={tasksLoading} error={tasksError} onRefresh={onRefreshTasks} />
        </div>
      );
    case "calendar":
      return (
        <div className="px-6 py-6">
          <CalendarView />
        </div>
      );
    case "gantt":
      return (
        <div className="px-6 py-6">
          <GanttView />
        </div>
      );
    case "dashboard":
      return (
        <div className="px-6 py-6">
          <DashboardView
            tasks={tasks}
            tasksLoading={tasksLoading}
            tasksError={tasksError}
            listId={selectedListId}
            listName={listName}
            onRefreshTasks={onRefreshTasks}
          />
        </div>
      );
    case "claims":
      return (
        <div className="px-6 py-6">
          <ClaimsServicesView tenantId={env.tenantId} userId={env.userId} defaultTab="claims" />
        </div>
      );
    case "hr":
      return (
        <div className="px-6 py-6">
          <HRView />
        </div>
      );
    case "docs":
      return (
        <div className="px-6 py-6">
          <ClaimsServicesView tenantId={env.tenantId} userId={env.userId} defaultTab="services" />
        </div>
      );
    case "dedicated":
      return (
        <div className="px-6 py-6">
          <DedicatedView />
        </div>
      );
    case "xoxo":
      return (
        <div className="px-6 py-6">
          <XoXoView />
        </div>
      );
    default:
      return null;
  }
};

const navigationContainsList = (navigation: NavigationSpace, listId: string) => {
  if (navigation.root_lists.some((list) => list.list_id === listId)) {
    return true;
  }
  return navigation.folders.some((folder) => folder.lists.some((list) => list.list_id === listId));
};

const firstListId = (navigation: NavigationSpace): string | null => {
  const primary = navigation.root_lists[0];
  if (primary) return primary.list_id;
  for (const folder of navigation.folders) {
    if (folder.lists.length > 0) {
      return folder.lists[0].list_id;
    }
  }
  return null;
};

const resolveListName = (navigation: NavigationSpace, listId: string): string | null => {
  const direct = navigation.root_lists.find((list) => list.list_id === listId);
  if (direct) return direct.name;
  for (const folder of navigation.folders) {
    const match = folder.lists.find((list) => list.list_id === listId);
    if (match) return match.name;
  }
  return null;
};
