import { Calendar, Clock } from 'lucide-react';
import { Badge } from './ui/badge';
import { useTheme } from './ThemeContext';

const timelineEvents = [
  {
    id: 1,
    date: 'Oct 30',
    title: 'Sprint Planning',
    color: 'from-violet-500 to-purple-500',
    time: '2:00 PM',
  },
  {
    id: 2,
    date: 'Nov 1',
    title: 'Design Review',
    color: 'from-blue-500 to-cyan-500',
    time: '10:00 AM',
  },
  {
    id: 3,
    date: 'Nov 3',
    title: 'Launch Deadline',
    color: 'from-pink-500 to-orange-500',
    time: '5:00 PM',
  },
  {
    id: 4,
    date: 'Nov 5',
    title: 'Retrospective',
    color: 'from-green-500 to-emerald-500',
    time: '3:00 PM',
  },
];

export function TimelineRibbon() {
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';
  
  return (
    <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl p-6`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className={colors.text}>Timeline</h2>
          <p className={`${colors.textSecondary} text-[13px] mt-0.5`}>Upcoming milestones and deadlines</p>
        </div>
        <Badge className={`${isDark ? 'bg-white/10 text-white/70 border-white/20' : 'bg-slate-200/60 text-slate-600 border-slate-200'}`}>
          <Calendar className="w-3 h-3 mr-1" />
          This Week
        </Badge>
      </div>

      {/* Timeline Ribbon */}
      <div className="relative">
        {/* Timeline Line */}
        <div className="absolute top-6 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-500 via-blue-500 to-pink-500 opacity-30" />

        {/* Timeline Events */}
        <div className="grid grid-cols-4 gap-4">
          {timelineEvents.map((event, index) => (
            <div 
              key={event.id}
              className="relative group cursor-pointer"
            >
              {/* Gradient Node */}
              <div className="flex justify-center mb-3">
                <div className={`w-12 h-12 bg-gradient-to-br ${event.color} rounded-full flex items-center justify-center shadow-lg border-4 ${isDark ? 'border-white/10' : 'border-white'} group-hover:scale-110 transition-transform duration-180 relative z-10`}>
                  <Calendar className="w-5 h-5 text-white" />
                </div>
              </div>

              {/* Event Card */}
              <div className={`${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-white/60 hover:bg-white/80'} rounded-xl p-3 border ${colors.cardBorder} transition-all duration-180 group-hover:shadow-lg`}>
                <Badge className={`${isDark ? 'bg-white/10 text-white/70' : 'bg-slate-200/60 text-slate-600'} border-0 text-[10px] mb-2`}>
                  {event.date}
                </Badge>
                <p className={`${colors.text} text-[13px] mb-1`}>{event.title}</p>
                <div className={`flex items-center gap-1 ${colors.textSecondary} text-[11px] opacity-70`}>
                  <Clock className="w-3 h-3" />
                  {event.time}
                </div>
              </div>

              {/* Connector Line to Next Event */}
              {index < timelineEvents.length - 1 && (
                <div className={`absolute top-6 left-1/2 w-full h-0.5 bg-gradient-to-r from-transparent ${isDark ? 'via-white/20' : 'via-slate-300/60'} to-transparent`} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
