import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useTheme } from './ThemeContext';
import { Avatar, AvatarFallback } from './ui/avatar';

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Sample events for the calendar
const events = [
  { id: 1, date: 30, title: 'Sprint Planning', color: 'from-violet-500 to-purple-500', time: '2:00 PM', assignee: 'SK' },
  { id: 2, date: 31, title: 'Design Review', color: 'from-blue-500 to-cyan-500', time: '10:00 AM', assignee: 'JD' },
  { id: 3, date: 1, title: 'Launch Deadline', color: 'from-pink-500 to-orange-500', time: '5:00 PM', assignee: 'MJ' },
  { id: 4, date: 2, title: 'Client Meeting', color: 'from-green-500 to-emerald-500', time: '3:00 PM', assignee: 'EC' },
  { id: 5, date: 3, title: 'Code Review', color: 'from-blue-500 to-cyan-500', time: '11:00 AM', assignee: 'AT' },
  { id: 6, date: 5, title: 'Retrospective', color: 'from-purple-500 to-violet-500', time: '4:00 PM', assignee: 'SK' },
  { id: 7, date: 8, title: 'Product Demo', color: 'from-orange-500 to-red-500', time: '2:30 PM', assignee: 'JD' },
];

export function CalendarView() {
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';
  const [currentMonth, setCurrentMonth] = useState(10); // November (0-indexed)
  const [currentYear, setCurrentYear] = useState(2025);

  // Calculate calendar grid
  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
  const daysInPrevMonth = getDaysInMonth(currentMonth - 1, currentYear);

  // Generate calendar grid
  const calendarDays = [];
  
  // Previous month days
  for (let i = firstDay - 1; i >= 0; i--) {
    calendarDays.push({
      day: daysInPrevMonth - i,
      isCurrentMonth: false,
      events: [],
    });
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const dayEvents = events.filter(e => e.date === day);
    calendarDays.push({
      day,
      isCurrentMonth: true,
      events: dayEvents,
    });
  }

  // Next month days to fill grid
  const remainingDays = 42 - calendarDays.length; // 6 rows × 7 days
  for (let day = 1; day <= remainingDays; day++) {
    calendarDays.push({
      day,
      isCurrentMonth: false,
      events: [],
    });
  }

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const today = currentMonth === 10 && currentYear === 2025 ? 31 : -1; // Oct 31, 2025

  return (
    <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl overflow-hidden`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${colors.cardBorder} flex items-center justify-between`}>
        <div className="flex items-center gap-4">
          <CalendarIcon className={`w-6 h-6 ${colors.text}`} />
          <div>
            <h2 className={colors.text}>{months[currentMonth]} {currentYear}</h2>
            <p className={`${colors.textSecondary} text-[13px] mt-0.5`}>Team Calendar</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handlePrevMonth}
            className={`${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-xl`}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={`${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-xl px-4`}
          >
            Today
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleNextMonth}
            className={`${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-xl`}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl ml-2"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Event
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="p-6">
        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {daysOfWeek.map(day => (
            <div key={day} className={`text-center py-2 ${colors.textSecondary} text-[13px]`}>
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-2">
          {calendarDays.map((dayData, index) => {
            const isToday = dayData.isCurrentMonth && dayData.day === today;
            
            return (
              <div
                key={index}
                className={`
                  min-h-[100px] p-2 rounded-xl transition-all duration-180
                  ${dayData.isCurrentMonth
                    ? isDark
                      ? 'bg-white/5 hover:bg-white/10'
                      : 'bg-white/40 hover:bg-white/60'
                    : isDark
                      ? 'bg-white/[0.02] opacity-40'
                      : 'bg-slate-50/40 opacity-40'
                  }
                  ${isToday ? 'ring-2 ring-violet-500' : ''}
                  border ${colors.cardBorder}
                  cursor-pointer
                `}
              >
                {/* Day Number */}
                <div className={`flex items-center justify-between mb-1`}>
                  <span className={`
                    text-[13px]
                    ${isToday
                      ? 'w-6 h-6 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-full flex items-center justify-center'
                      : dayData.isCurrentMonth
                        ? colors.text
                        : colors.textSecondary
                    }
                  `}>
                    {dayData.day}
                  </span>
                  {dayData.events.length > 0 && dayData.isCurrentMonth && (
                    <Badge className={`${isDark ? 'bg-violet-500/20 text-violet-300' : 'bg-violet-100 text-violet-700'} border-0 text-[10px] px-1.5 h-4`}>
                      {dayData.events.length}
                    </Badge>
                  )}
                </div>

                {/* Events */}
                {dayData.isCurrentMonth && (
                  <div className="space-y-1">
                    {dayData.events.slice(0, 2).map(event => (
                      <div
                        key={event.id}
                        className={`bg-gradient-to-r ${event.color} rounded-lg p-1.5 text-white text-[10px] truncate leading-tight group hover:scale-105 transition-transform`}
                      >
                        <div className="flex items-center gap-1">
                          <Avatar className="w-3 h-3 border border-white/50">
                            <AvatarFallback className="text-[6px] bg-white/30 text-white">
                              {event.assignee}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">{event.title}</span>
                        </div>
                      </div>
                    ))}
                    {dayData.events.length > 2 && (
                      <div className={`text-[10px] ${colors.textSecondary} pl-1`}>
                        +{dayData.events.length - 2} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className={`px-6 py-4 border-t ${colors.cardBorder} flex items-center gap-6`}>
        <span className={`${colors.textSecondary} text-[13px]`}>Event Types:</span>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-gradient-to-r from-violet-500 to-purple-500 rounded-sm"></div>
          <span className={`${colors.textSecondary} text-[12px]`}>Planning</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-sm"></div>
          <span className={`${colors.textSecondary} text-[12px]`}>Review</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-gradient-to-r from-pink-500 to-orange-500 rounded-sm"></div>
          <span className={`${colors.textSecondary} text-[12px]`}>Deadline</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-gradient-to-r from-green-500 to-emerald-500 rounded-sm"></div>
          <span className={`${colors.textSecondary} text-[12px]`}>Meeting</span>
        </div>
      </div>
    </div>
  );
}
