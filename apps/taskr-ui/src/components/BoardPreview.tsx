import { Sparkles, MessageSquare, CheckSquare } from 'lucide-react';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { useTheme } from './ThemeContext';

const boardData = {
  ready: [
    {
      id: 1,
      title: 'Redesign user dashboard',
      assignees: [{ initials: 'SK', color: 'from-pink-500 to-orange-400' }],
      subtasks: { completed: 2, total: 5 },
      hasAI: false,
    },
    {
      id: 2,
      title: 'Create API documentation',
      assignees: [
        { initials: 'MJ', color: 'from-blue-500 to-cyan-400' },
        { initials: 'AT', color: 'from-purple-500 to-violet-400' }
      ],
      subtasks: { completed: 0, total: 3 },
      hasAI: true,
    },
  ],
  inProgress: [
    {
      id: 3,
      title: 'Implement user authentication',
      assignees: [{ initials: 'JD', color: 'from-green-500 to-emerald-400' }],
      subtasks: { completed: 3, total: 4 },
      hasAI: true,
    },
    {
      id: 4,
      title: 'Update landing page copy',
      assignees: [{ initials: 'EC', color: 'from-orange-500 to-red-400' }],
      subtasks: { completed: 1, total: 2 },
      hasAI: false,
    },
  ],
  review: [
    {
      id: 5,
      title: 'Design system components',
      assignees: [{ initials: 'SK', color: 'from-pink-500 to-orange-400' }],
      subtasks: { completed: 5, total: 5 },
      hasAI: false,
    },
  ],
};

export function BoardPreview({ fullView = false }: { fullView?: boolean }) {
  const { colors } = useTheme();
  
  return (
    <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl p-6`}>
      {/* Header */}
      <div className="mb-6">
        <h2 className={colors.text}>{fullView ? 'Board View' : 'Board Preview'}</h2>
        <p className={`${colors.textSecondary} text-[13px] mt-0.5`}>Drag and drop to update status</p>
      </div>

      {/* Board Columns */}
      <div className="grid grid-cols-3 gap-4">
        <BoardColumn 
          title="Ready" 
          count={boardData.ready.length}
          cards={boardData.ready}
          gradient="from-slate-500 to-slate-600"
        />
        <BoardColumn 
          title="In Progress" 
          count={boardData.inProgress.length}
          cards={boardData.inProgress}
          gradient="from-blue-500 to-cyan-500"
        />
        <BoardColumn 
          title="Review" 
          count={boardData.review.length}
          cards={boardData.review}
          gradient="from-purple-500 to-violet-500"
        />
      </div>
    </div>
  );
}

function BoardColumn({ 
  title, 
  count, 
  cards,
  gradient 
}: { 
  title: string; 
  count: number; 
  cards: any[];
  gradient: string;
}) {
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';
  
  return (
    <div className={`${isDark ? 'bg-white/5' : 'bg-white/40'} rounded-xl p-3 border ${colors.cardBorder}`}>
      {/* Column Header with gradient */}
      <div className={`bg-gradient-to-r ${gradient} rounded-lg px-3 py-2 mb-3`}>
        <div className="flex items-center justify-between">
          <h3 className="text-white">{title}</h3>
          <Badge className="bg-white/20 text-white border-0 text-[11px] px-2">
            {count}
          </Badge>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-2">
        {cards.map((card) => (
          <BoardCard key={card.id} card={card} />
        ))}
      </div>

      {/* Drop Zone Indicator */}
      <div className={`mt-2 border-2 border-dashed ${isDark ? 'border-white/10' : 'border-slate-300/60'} rounded-lg p-3 text-center ${colors.textSecondary} text-[12px] ${isDark ? 'hover:border-white/30 hover:text-white/60' : 'hover:border-slate-400/60 hover:text-slate-700'} transition-all cursor-pointer opacity-60`}>
        + Drop here
      </div>
    </div>
  );
}

function BoardCard({ card }: { card: any }) {
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';
  
  return (
    <div className={`${isDark ? 'bg-white/10 hover:bg-white/15' : 'bg-white/60 hover:bg-white/80'} rounded-xl p-3 border ${colors.cardBorder} cursor-move transition-all duration-180 hover:shadow-lg group`}>
      {/* Status Chip */}
      <Badge className="bg-gradient-to-r from-violet-500 to-blue-500 text-white border-0 text-[10px] px-2 mb-2">
        Task
      </Badge>

      {/* Title */}
      <p className={`${colors.text} text-[13px] mb-3 leading-snug`}>{card.title}</p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        {/* Avatars */}
        <div className="flex -space-x-1.5">
          {card.assignees.map((assignee: any, i: number) => (
            <Avatar key={i} className={`w-6 h-6 border-2 ${isDark ? 'border-white/20' : 'border-white'}`}>
              <AvatarFallback className={`bg-gradient-to-br ${assignee.color} text-white text-[10px]`}>
                {assignee.initials}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>

        {/* Subtask Progress */}
        <div className="flex items-center gap-2">
          {card.hasAI && (
            <div className="w-4 h-4 bg-gradient-to-r from-violet-500 to-blue-500 rounded-md flex items-center justify-center">
              <Sparkles className="w-2.5 h-2.5 text-white" />
            </div>
          )}
          <div className={`flex items-center gap-1 ${colors.textSecondary} text-[11px]`}>
            <CheckSquare className="w-3 h-3" />
            {card.subtasks.completed}/{card.subtasks.total}
          </div>
        </div>
      </div>

      {/* Subtask Dots */}
      <div className="flex gap-1 mt-2">
        {Array.from({ length: card.subtasks.total }).map((_, i) => (
          <div 
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${
              i < card.subtasks.completed 
                ? 'bg-green-400' 
                : isDark ? 'bg-white/20' : 'bg-slate-300/60'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
