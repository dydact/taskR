import { useEffect, useMemo, useState } from "react";
import type { Task } from "@dydact/taskr-api-client";
import { ThemeProvider } from "./components/ThemeContext";
import { TopBar } from "./components/TopBar";
import { LeftNav } from "./components/LeftNav";
import { RightPanel } from "./components/RightPanel";
import { ListView } from "./components/ListView";
import { BoardPreview } from "./components/BoardPreview";
import { CalendarView } from "./components/CalendarView";
import { GanttView } from "./components/GanttView";
import { DashboardView } from "./components/DashboardView";
import { AIToast } from "./components/AIToast";
import { NotificationCenter } from "./components/NotificationCenter";
import { useShell } from "./context/ShellContext";
import { useTasks } from "./hooks/useTasks";
import { ClaimsView } from "./views/ClaimsView";
import { HRView } from "./views/HRView";
import { env } from "./config/env";
import { useTelemetry } from "./lib/telemetry";
import type { ViewMode, DensityMode } from "./types/shell";
import type { NavigationSpace } from "./types/navigation";

const DEFAULT_VIEW_SEQUENCE: ViewMode[] = ["list", "board", "calendar", "gantt", "dashboard", "claims", "hr"];

export default function App() {
  const {
    ready,
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
    navigationError,
    preferencesLoading
  } = useShell();

  const [currentView, setCurrentView] = useState<ViewMode>(preferences.lastView);
  const [rightPanelOpen, setRightPanelOpen] = useState<boolean>(preferences.rightPanelOpen);
  const [showAIToast, setShowAIToast] = useState<boolean>(true);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const { track } = useTelemetry();

  useEffect(() => {
    setCurrentView(preferences.lastView);
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

  const handleViewChange = (view: ViewMode) => {
    setCurrentView(view);
    setViewMode(view);
    void track({
      name: "shell.view_changed",
      properties: {
        view,
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
  const { tasks, loading: tasksLoading, error: tasksError } = useTasks({ listId: selectedListId });
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

  if (!ready && preferencesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="animate-pulse text-lg tracking-wide">Loading TaskR workspace…</div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col">
        <TopBar
          viewMode={currentView}
          viewOptions={orderedViews}
          onViewModeChange={handleViewChange}
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
            />
          </main>
          {rightPanelOpen && <RightPanel />}
        </div>
        {showAIToast && <AIToast onDismiss={() => setShowAIToast(false)} />}
        <NotificationCenter />
      </div>
    </ThemeProvider>
  );
}

type MainContentProps = {
  currentView: ViewMode;
  navigation: NavigationSpace | null;
  selectedListId: string | null;
  tasks: Task[];
  tasksLoading: boolean;
  tasksError: string | null;
  listName: string | null;
};

const MainContent: React.FC<MainContentProps> = ({ currentView, tasks, tasksLoading, tasksError, listName }) => {
  switch (currentView) {
    case "list":
      return (
        <div className="px-6 py-6 space-y-6">
          <ListView listName={listName} tasks={tasks} loading={tasksLoading} error={tasksError} />
        </div>
      );
    case "board":
      return (
        <div className="px-6 py-6">
          <BoardPreview fullView />
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
          <DashboardView />
        </div>
      );
    case "claims":
      return (
        <div className="px-6 py-6">
          <ClaimsView tenantId={env.tenantId} userId={env.userId} />
        </div>
      );
    case "hr":
      return (
        <div className="px-6 py-6">
          <HRView />
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
