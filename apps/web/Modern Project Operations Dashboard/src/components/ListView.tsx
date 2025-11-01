import { MoreHorizontal, MessageSquare, Sparkles, Flag, Calendar } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { useTheme } from './ThemeContext';

const tasks = {
  ready: [
    {
      id: 1,
      title: 'Redesign user dashboard',
      status: 'Ready',
      assignees: [{ name: 'Sarah', initials: 'SK', color: 'from-pink-500 to-orange-400' }],
      dueDate: 'Nov 2',
      priority: 'high',
      comments: 3,
    },
    {
      id: 2,
      title: 'Create API documentation',
      status: 'Ready',
      assignees: [
        { name: 'Mike', initials: 'MJ', color: 'from-blue-500 to-cyan-400' },
        { name: 'Anna', initials: 'AT', color: 'from-purple-500 to-violet-400' }
      ],
      dueDate: 'Nov 3',
      priority: 'medium',
      comments: 1,
      hasAutomation: true,
    },
  ],
  inProgress: [
    {
      id: 3,
      title: 'Implement user authentication',
      status: 'In Progress',
      assignees: [{ name: 'John', initials: 'JD', color: 'from-green-500 to-emerald-400' }],
      dueDate: 'Nov 1',
      priority: 'high',
      comments: 5,
      aiSuggestion: 'Summarize blockers',
    },
    {
      id: 4,
      title: 'Update landing page copy',
      status: 'In Progress',
      assignees: [{ name: 'Emily', initials: 'EC', color: 'from-orange-500 to-red-400' }],
      dueDate: 'Nov 2',
      priority: 'low',
      comments: 2,
    },
  ],
  review: [
    {
      id: 5,
      title: 'Design system components',
      status: 'Review',
      assignees: [{ name: 'Sarah', initials: 'SK', color: 'from-pink-500 to-orange-400' }],
      dueDate: 'Oct 30',
      priority: 'medium',
      comments: 8,
    },
  ],
};

export function ListView() {
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';
  
  return (
    <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl overflow-hidden`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${colors.cardBorder}`}>
        <h2 className={colors.text}>Marketing Campaign Q4</h2>
        <p className={`${colors.textSecondary} text-[13px] mt-0.5`}>24 tasks · 6 team members</p>
      </div>

      {/* Task Groups */}
      <div className={`divide-y ${colors.cardBorder}`}>
        {/* Ready Group */}
        <TaskGroup title="Ready" count={tasks.ready.length} tasks={tasks.ready} />
        
        {/* In Progress Group */}
        <TaskGroup title="In Progress" count={tasks.inProgress.length} tasks={tasks.inProgress} />
        
        {/* Review Group */}
        <TaskGroup title="Review" count={tasks.review.length} tasks={tasks.review} />
      </div>
    </div>
  );
}

function TaskGroup({ title, count, tasks }: { title: string; count: number; tasks: any[] }) {
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';
  
  return (
    <div className="p-4">
      {/* Group Header */}
      <div className="flex items-center gap-2 mb-3 px-2">
        <h3 className={`${colors.text} opacity-80`}>{title}</h3>
        <Badge 
          variant="secondary" 
          className={`${isDark ? 'bg-white/10 text-white/70' : 'bg-slate-200/60 text-slate-600'} border-0 text-[11px] px-2 rounded-full`}
        >
          {count}
        </Badge>
      </div>

      {/* Task Rows */}
      <div className="space-y-2">
        {tasks.map((task, index) => (
          <TaskRow key={task.id} task={task} isAIHighlighted={index === 0 && title === 'In Progress'} />
        ))}
      </div>
    </div>
  );
}

function TaskRow({ task, isAIHighlighted }: { task: any; isAIHighlighted?: boolean }) {
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';
  
  const statusColors = {
    'Ready': isDark 
      ? 'bg-slate-500/20 text-slate-300 border-slate-500/30'
      : 'bg-slate-200/60 text-slate-700 border-slate-300/60',
    'In Progress': isDark 
      ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
      : 'bg-blue-100/80 text-blue-700 border-blue-300/60',
    'Review': isDark 
      ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
      : 'bg-purple-100/80 text-purple-700 border-purple-300/60',
  };

  const priorityColors = {
    high: 'text-red-400',
    medium: 'text-yellow-400',
    low: 'text-green-400',
  };

  return (
    <div className="group relative">
      <div 
        className={`
          flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-180 cursor-pointer
          ${isAIHighlighted 
            ? isDark 
              ? 'bg-gradient-to-r from-violet-500/10 to-blue-500/10 border border-violet-500/30 shadow-lg'
              : 'bg-gradient-to-r from-violet-100/60 to-blue-100/60 border border-violet-300/60 shadow-lg'
            : isDark
              ? 'bg-white/5 hover:bg-white/10 border border-transparent'
              : 'bg-white/40 hover:bg-white/60 border border-transparent'
          }
        `}
      >
        {/* Status Pill */}
        <Badge 
          className={`${statusColors[task.status as keyof typeof statusColors]} border px-2.5 py-0.5 shrink-0`}
        >
          {task.status}
        </Badge>

        {/* Task Title */}
        <div className="flex-1 min-w-0">
          <p className={`${colors.text} truncate`}>{task.title}</p>
        </div>

        {/* Assignee Avatars */}
        <div className="flex -space-x-2">
          {task.assignees.map((assignee: any, i: number) => (
            <Avatar key={i} className={`w-7 h-7 border-2 ${isDark ? 'border-white/20' : 'border-white'}`}>
              <AvatarFallback className={`bg-gradient-to-br ${assignee.color} text-white text-[11px]`}>
                {assignee.initials}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>

        {/* Due Date */}
        <div className={`flex items-center gap-1.5 ${colors.textSecondary} text-[13px] shrink-0`}>
          <Calendar className="w-3.5 h-3.5" />
          {task.dueDate}
        </div>

        {/* Priority Flag */}
        <Flag className={`w-4 h-4 ${priorityColors[task.priority as keyof typeof priorityColors]} shrink-0`} />

        {/* Comments */}
        <div className={`flex items-center gap-1 ${colors.textSecondary} text-[13px] shrink-0`}>
          <MessageSquare className="w-4 h-4" />
          {task.comments}
        </div>

        {/* Automation Badge */}
        {task.hasAutomation && (
          <div className="shrink-0">
            <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 border px-2 py-0.5 text-[10px]">
              Auto
            </Badge>
          </div>
        )}

        {/* Quick Actions (visible on hover) */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button size="icon" variant="ghost" className={`w-7 h-7 ${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-lg`}>
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* AI Suggestion Chip - Annotated */}
      {task.aiSuggestion && (
        <div className="relative group/ai">
          <div className="absolute right-4 -bottom-2 translate-y-full mt-1 z-10">
            <Button 
              size="sm" 
              className="bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 text-white rounded-xl shadow-lg h-7 text-[11px] px-3"
            >
              <Sparkles className="w-3 h-3 mr-1" />
              {task.aiSuggestion}
            </Button>
          </div>
          
          {/* Annotation */}
          <div className="absolute right-4 -bottom-14 text-[9px] text-violet-300 whitespace-nowrap opacity-0 group/ai-hover:opacity-100 transition-opacity pointer-events-none">
            AI suggestion chip
          </div>
        </div>
      )}
    </div>
  );
}
