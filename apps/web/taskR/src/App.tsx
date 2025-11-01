import { useState } from 'react';
import { ThemeProvider, useTheme } from './components/ThemeContext';
import { TopBar } from './components/TopBar';
import { LeftNav } from './components/LeftNav';
import { RightPanel } from './components/RightPanel';
import { ListView } from './components/ListView';
import { BoardPreview } from './components/BoardPreview';
import { CalendarView } from './components/CalendarView';
import { GanttView } from './components/GanttView';
import { DashboardView } from './components/DashboardView';
import { TimelineRibbon } from './components/TimelineRibbon';
import { AIToast } from './components/AIToast';
import { NotificationCenter } from './components/NotificationCenter';

function AppContent() {
  const [currentView, setCurrentView] = useState<'list' | 'board' | 'calendar' | 'gantt' | 'dashboard'>('list');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [showAIToast, setShowAIToast] = useState(true);
  const { colors } = useTheme();

  return (
    <div className={`min-h-screen ${colors.background} overflow-hidden`}>
      {/* Main container with glassmorphic shell */}
      <div className="min-h-screen flex flex-col">
        {/* Top Bar */}
        <TopBar 
          currentView={currentView} 
          onViewChange={setCurrentView}
          onToggleRightPanel={() => setRightPanelOpen(!rightPanelOpen)}
        />

        {/* Main content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Navigation Rail */}
          <LeftNav />

          {/* Main Workspace */}
          <main className="flex-1 overflow-y-auto p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {currentView === 'list' && (
                <>
                  <ListView />
                  <BoardPreview />
                  <TimelineRibbon />
                </>
              )}
              {currentView === 'board' && <BoardPreview fullView />}
              {currentView === 'calendar' && <CalendarView />}
              {currentView === 'gantt' && <GanttView />}
              {currentView === 'dashboard' && <DashboardView />}
            </div>
          </main>

          {/* Right Insight Panel */}
          {rightPanelOpen && <RightPanel />}
        </div>
      </div>

      {/* AI Toast Notification */}
      {showAIToast && <AIToast onDismiss={() => setShowAIToast(false)} />}

      {/* Notification Center */}
      <NotificationCenter />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
