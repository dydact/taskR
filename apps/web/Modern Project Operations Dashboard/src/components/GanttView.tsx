import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Filter, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useTheme } from './ThemeContext';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Progress } from './ui/progress';

const ganttTasks = [
  {
    id: 1,
    title: 'Phase 1: Research & Planning',
    assignee: { initials: 'SK', color: 'from-pink-500 to-orange-400' },
    startDay: 0,
    duration: 7,
    progress: 100,
    color: 'from-violet-500 to-purple-500',
    subtasks: [
      { id: 11, title: 'Market Research', startDay: 0, duration: 3, progress: 100 },
      { id: 12, title: 'Competitor Analysis', startDay: 3, duration: 4, progress: 100 },
    ],
  },
  {
    id: 2,
    title: 'Phase 2: Design',
    assignee: { initials: 'JD', color: 'from-green-500 to-emerald-400' },
    startDay: 7,
    duration: 10,
    progress: 70,
    color: 'from-blue-500 to-cyan-500',
    subtasks: [
      { id: 21, title: 'Wireframes', startDay: 7, duration: 4, progress: 100 },
      { id: 22, title: 'UI Design', startDay: 11, duration: 6, progress: 60 },
    ],
  },
  {
    id: 3,
    title: 'Phase 3: Development',
    assignee: { initials: 'MJ', color: 'from-blue-500 to-cyan-400' },
    startDay: 17,
    duration: 14,
    progress: 45,
    color: 'from-green-500 to-emerald-500',
    subtasks: [
      { id: 31, title: 'Frontend Setup', startDay: 17, duration: 5, progress: 100 },
      { id: 32, title: 'Backend API', startDay: 22, duration: 9, progress: 30 },
    ],
  },
  {
    id: 4,
    title: 'Phase 4: Testing',
    assignee: { initials: 'AT', color: 'from-purple-500 to-violet-400' },
    startDay: 31,
    duration: 7,
    progress: 0,
    color: 'from-orange-500 to-red-500',
    subtasks: [
      { id: 41, title: 'Unit Tests', startDay: 31, duration: 3, progress: 0 },
      { id: 42, title: 'Integration Tests', startDay: 34, duration: 4, progress: 0 },
    ],
  },
  {
    id: 5,
    title: 'Phase 5: Launch',
    assignee: { initials: 'EC', color: 'from-orange-500 to-red-400' },
    startDay: 38,
    duration: 5,
    progress: 0,
    color: 'from-pink-500 to-orange-500',
    subtasks: [
      { id: 51, title: 'Deployment', startDay: 38, duration: 2, progress: 0 },
      { id: 52, title: 'Monitoring', startDay: 40, duration: 3, progress: 0 },
    ],
  },
];

const weekDates = ['Oct 27', 'Nov 3', 'Nov 10', 'Nov 17', 'Nov 24', 'Dec 1'];

export function GanttView() {
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';
  const [expandedTasks, setExpandedTasks] = useState<number[]>([1, 2, 3]);
  const [zoom, setZoom] = useState(1);

  const toggleTask = (id: number) => {
    setExpandedTasks(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const dayWidth = 28 * zoom;
  const totalDays = 43;

  return (
    <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl overflow-hidden`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${colors.cardBorder} flex items-center justify-between`}>
        <div className="flex items-center gap-4">
          <Calendar className={`w-6 h-6 ${colors.text}`} />
          <div>
            <h2 className={colors.text}>Project Timeline - Marketing Campaign Q4</h2>
            <p className={`${colors.textSecondary} text-[13px] mt-0.5`}>43 days · 5 phases</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className={`${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-xl`}
          >
            <Filter className="w-4 h-4 mr-1" />
            Filter
          </Button>
          <div className={`w-px h-6 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
            className={`${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-xl`}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setZoom(Math.min(2, zoom + 0.25))}
            className={`${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-xl`}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <div className={`w-px h-6 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
          <Button
            size="sm"
            variant="ghost"
            className={`${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-xl`}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={`${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-xl`}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Gantt Chart */}
      <div className="flex">
        {/* Left Panel - Task List */}
        <div className={`w-[320px] border-r ${colors.cardBorder}`}>
          <div className={`px-4 py-3 border-b ${colors.cardBorder}`}>
            <h3 className={`${colors.text} text-[13px]`}>Tasks</h3>
          </div>
          <div className="divide-y" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(148,163,184,0.2)' }}>
            {ganttTasks.map(task => {
              const isExpanded = expandedTasks.includes(task.id);
              return (
                <div key={task.id}>
                  <div className={`px-4 py-3 ${isDark ? 'hover:bg-white/5' : 'hover:bg-white/60'} cursor-pointer transition-all`}>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => toggleTask(task.id)}
                        className={`text-[11px] ${colors.textSecondary}`}
                      >
                        {isExpanded ? '▼' : '▶'}
                      </button>
                      <Avatar className="w-6 h-6 border border-white/20">
                        <AvatarFallback className={`bg-gradient-to-br ${task.assignee.color} text-white text-[10px]`}>
                          {task.assignee.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className={`${colors.text} text-[13px] flex-1`}>{task.title}</span>
                    </div>
                    <div className="ml-8">
                      <Progress value={task.progress} className="h-1.5" />
                      <span className={`${colors.textSecondary} text-[11px] mt-1 block`}>
                        {task.progress}% complete
                      </span>
                    </div>
                  </div>
                  {isExpanded && task.subtasks.map(subtask => (
                    <div key={subtask.id} className={`px-4 py-2 pl-16 ${isDark ? 'bg-white/[0.02]' : 'bg-slate-50/60'}`}>
                      <span className={`${colors.textSecondary} text-[12px]`}>{subtask.title}</span>
                      <Progress value={subtask.progress} className="h-1 mt-1" />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel - Timeline */}
        <div className="flex-1 overflow-x-auto">
          {/* Week Headers */}
          <div className={`flex border-b ${colors.cardBorder} sticky top-0 ${isDark ? 'bg-black/20' : 'bg-white/80'} backdrop-blur-sm z-10`}>
            {weekDates.map((week, i) => (
              <div
                key={i}
                className={`px-2 py-3 text-center ${colors.textSecondary} text-[11px] border-r ${colors.cardBorder}`}
                style={{ minWidth: dayWidth * 7 }}
              >
                {week}
              </div>
            ))}
          </div>

          {/* Timeline Bars */}
          <div className="relative" style={{ minWidth: dayWidth * totalDays }}>
            {/* Vertical grid lines for weeks */}
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className={`absolute top-0 bottom-0 border-r ${colors.cardBorder}`}
                style={{ left: dayWidth * 7 * i }}
              />
            ))}

            {/* Current day indicator */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-gradient-to-b from-violet-500 to-blue-500 z-20"
              style={{ left: dayWidth * 14 }}
            >
              <Badge className="absolute -top-1 left-1/2 -translate-x-1/2 bg-gradient-to-r from-violet-500 to-blue-500 text-white border-0 text-[9px] px-1.5 whitespace-nowrap">
                Today
              </Badge>
            </div>

            {/* Task Bars */}
            {ganttTasks.map((task, index) => {
              const isExpanded = expandedTasks.includes(task.id);
              return (
                <div key={task.id}>
                  <div className={`relative h-[73px] border-b ${colors.cardBorder}`}>
                    {/* Main task bar */}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 h-8 bg-gradient-to-r ${task.color} rounded-lg shadow-lg hover:shadow-xl transition-all cursor-pointer group`}
                      style={{
                        left: task.startDay * dayWidth,
                        width: task.duration * dayWidth - 8,
                      }}
                    >
                      <div className="h-full flex items-center px-3 text-white text-[11px] relative overflow-hidden">
                        <span className="truncate relative z-10">{task.title.split(':')[1]?.trim()}</span>
                        {/* Progress overlay */}
                        <div
                          className="absolute inset-0 bg-white/20 rounded-lg"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Subtask bars */}
                  {isExpanded && task.subtasks.map(subtask => (
                    <div key={subtask.id} className={`relative h-[41px] border-b ${colors.cardBorder} ${isDark ? 'bg-white/[0.02]' : 'bg-slate-50/60'}`}>
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 h-5 ${isDark ? 'bg-white/20' : 'bg-slate-300/60'} rounded-md hover:opacity-80 transition-opacity cursor-pointer`}
                        style={{
                          left: subtask.startDay * dayWidth,
                          width: subtask.duration * dayWidth - 8,
                        }}
                      >
                        <div
                          className="h-full bg-gradient-to-r from-violet-400 to-blue-400 rounded-md"
                          style={{ width: `${subtask.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Stats */}
      <div className={`px-6 py-4 border-t ${colors.cardBorder} flex items-center justify-between`}>
        <div className="flex items-center gap-6">
          <div>
            <span className={`${colors.textSecondary} text-[11px]`}>Overall Progress</span>
            <div className="flex items-center gap-2 mt-1">
              <Progress value={43} className="w-32 h-2" />
              <span className={`${colors.text} text-[13px]`}>43%</span>
            </div>
          </div>
          <div className={`w-px h-8 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
          <div className="flex items-center gap-4">
            <div>
              <span className={`${colors.textSecondary} text-[11px]`}>On Track</span>
              <p className={`${colors.text}`}>3</p>
            </div>
            <div>
              <span className={`${colors.textSecondary} text-[11px]`}>At Risk</span>
              <p className="text-yellow-400">1</p>
            </div>
            <div>
              <span className={`${colors.textSecondary} text-[11px]`}>Delayed</span>
              <p className="text-red-400">1</p>
            </div>
          </div>
        </div>
        <Badge className={`${isDark ? 'bg-green-500/20 text-green-300' : 'bg-green-100 text-green-700'} border-0`}>
          Est. Completion: Dec 15, 2025
        </Badge>
      </div>
    </div>
  );
}
