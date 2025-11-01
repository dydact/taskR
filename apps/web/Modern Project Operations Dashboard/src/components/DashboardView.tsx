import { TrendingUp, TrendingDown, Users, CheckCircle, Clock, AlertCircle, Zap, Target } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { useTheme } from './ThemeContext';
import { Avatar, AvatarFallback } from './ui/avatar';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const statsData = [
  { label: 'Total Tasks', value: '247', change: '+12%', trend: 'up', icon: CheckCircle, color: 'from-violet-500 to-purple-500' },
  { label: 'Completed', value: '189', change: '+8%', trend: 'up', icon: CheckCircle, color: 'from-green-500 to-emerald-500' },
  { label: 'In Progress', value: '42', change: '-3%', trend: 'down', icon: Clock, color: 'from-blue-500 to-cyan-500' },
  { label: 'Overdue', value: '16', change: '+2%', trend: 'up', icon: AlertCircle, color: 'from-red-500 to-orange-500' },
];

const teamPerformance = [
  { name: 'Sarah K.', completed: 45, inProgress: 5, avatar: 'SK', color: 'from-pink-500 to-orange-400' },
  { name: 'John D.', completed: 38, inProgress: 7, avatar: 'JD', color: 'from-green-500 to-emerald-400' },
  { name: 'Mike J.', completed: 42, inProgress: 3, avatar: 'MJ', color: 'from-blue-500 to-cyan-400' },
  { name: 'Emily C.', completed: 35, inProgress: 6, avatar: 'EC', color: 'from-orange-500 to-red-400' },
  { name: 'Anna T.', completed: 29, inProgress: 8, avatar: 'AT', color: 'from-purple-500 to-violet-400' },
];

const weeklyActivity = [
  { day: 'Mon', tasks: 32, completed: 28 },
  { day: 'Tue', tasks: 45, completed: 38 },
  { day: 'Wed', tasks: 38, completed: 35 },
  { day: 'Thu', tasks: 52, completed: 45 },
  { day: 'Fri', tasks: 41, completed: 39 },
  { day: 'Sat', tasks: 15, completed: 15 },
  { day: 'Sun', tasks: 8, completed: 8 },
];

const taskDistribution = [
  { name: 'Marketing', value: 45, color: '#ec4899' },
  { name: 'Engineering', value: 85, color: '#3b82f6' },
  { name: 'Finance', value: 28, color: '#10b981' },
  { name: 'HR', value: 22, color: '#8b5cf6' },
];

const projectHealth = [
  { name: 'Marketing Campaign', progress: 78, status: 'on-track', dueDate: 'Nov 15' },
  { name: 'Product Launch', progress: 45, status: 'at-risk', dueDate: 'Dec 1' },
  { name: 'Website Redesign', progress: 92, status: 'on-track', dueDate: 'Nov 8' },
  { name: 'Mobile App', progress: 23, status: 'delayed', dueDate: 'Jan 10' },
];

export function DashboardView() {
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl p-6`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={colors.text}>Dashboard Overview</h2>
            <p className={`${colors.textSecondary} text-[13px] mt-0.5`}>Real-time insights and analytics</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`${isDark ? 'bg-violet-500/20 text-violet-300' : 'bg-violet-100 text-violet-700'} border-0`}>
              Last updated: 2 min ago
            </Badge>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        {statsData.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-xl p-6 hover:shadow-2xl transition-all`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <Badge className={`
                  ${stat.trend === 'up'
                    ? isDark ? 'bg-green-500/20 text-green-300' : 'bg-green-100 text-green-700'
                    : isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-700'
                  } border-0 text-[11px]
                `}>
                  {stat.trend === 'up' ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                  {stat.change}
                </Badge>
              </div>
              <h3 className={colors.text}>{stat.value}</h3>
              <p className={`${colors.textSecondary} text-[13px] mt-1`}>{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-6">
        {/* Weekly Activity Chart */}
        <div className={`col-span-2 ${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl p-6`}>
          <div className="mb-6">
            <h3 className={colors.text}>Weekly Activity</h3>
            <p className={`${colors.textSecondary} text-[13px] mt-0.5`}>Tasks created vs completed</p>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weeklyActivity}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(148,163,184,0.2)'} />
              <XAxis dataKey="day" stroke={isDark ? 'rgba(255,255,255,0.5)' : 'rgba(71,85,105,0.7)'} style={{ fontSize: '12px' }} />
              <YAxis stroke={isDark ? 'rgba(255,255,255,0.5)' : 'rgba(71,85,105,0.7)'} style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.95)',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(148,163,184,0.3)'}`,
                  borderRadius: '12px',
                  color: isDark ? '#fff' : '#1e293b',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="tasks" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              <Bar dataKey="completed" fill="#10b981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Task Distribution Pie Chart */}
        <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl p-6`}>
          <div className="mb-6">
            <h3 className={colors.text}>Task Distribution</h3>
            <p className={`${colors.textSecondary} text-[13px] mt-0.5`}>By department</p>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={taskDistribution}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {taskDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.95)',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(148,163,184,0.3)'}`,
                  borderRadius: '12px',
                  color: isDark ? '#fff' : '#1e293b',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {taskDistribution.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                <span className={`${colors.textSecondary} text-[11px]`}>{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-2 gap-6">
        {/* Team Performance */}
        <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl p-6`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className={colors.text}>Team Performance</h3>
              <p className={`${colors.textSecondary} text-[13px] mt-0.5`}>Top performers this week</p>
            </div>
            <Users className={`w-5 h-5 ${colors.textSecondary}`} />
          </div>
          <div className="space-y-4">
            {teamPerformance.map((member, index) => (
              <div key={member.name} className={`flex items-center gap-4 p-3 rounded-xl ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-white/40 hover:bg-white/60'} transition-all`}>
                <div className="flex items-center gap-2 flex-1">
                  <span className={`${colors.textSecondary} text-[13px] w-4`}>#{index + 1}</span>
                  <Avatar className="w-9 h-9 border-2 border-white/20">
                    <AvatarFallback className={`bg-gradient-to-br ${member.color} text-white text-[11px]`}>
                      {member.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <span className={`${colors.text} text-[13px]`}>{member.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-green-400 text-[13px]">{member.completed}</p>
                    <p className={`${colors.textSecondary} text-[10px]`}>completed</p>
                  </div>
                  <div className="text-right">
                    <p className="text-blue-400 text-[13px]">{member.inProgress}</p>
                    <p className={`${colors.textSecondary} text-[10px]`}>in progress</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Project Health */}
        <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl p-6`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className={colors.text}>Project Health</h3>
              <p className={`${colors.textSecondary} text-[13px] mt-0.5`}>Active projects status</p>
            </div>
            <Target className={`w-5 h-5 ${colors.textSecondary}`} />
          </div>
          <div className="space-y-4">
            {projectHealth.map((project) => {
              const statusColors = {
                'on-track': isDark ? 'bg-green-500/20 text-green-300' : 'bg-green-100 text-green-700',
                'at-risk': isDark ? 'bg-yellow-500/20 text-yellow-300' : 'bg-yellow-100 text-yellow-700',
                'delayed': isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-700',
              };

              return (
                <div key={project.name} className={`p-4 rounded-xl ${isDark ? 'bg-white/5' : 'bg-white/40'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`${colors.text} text-[13px]`}>{project.name}</span>
                    <Badge className={`${statusColors[project.status as keyof typeof statusColors]} border-0 text-[10px]`}>
                      {project.status}
                    </Badge>
                  </div>
                  <Progress value={project.progress} className="h-2 mb-2" />
                  <div className="flex items-center justify-between">
                    <span className={`${colors.textSecondary} text-[11px]`}>{project.progress}% complete</span>
                    <span className={`${colors.textSecondary} text-[11px]`}>Due: {project.dueDate}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI Insights Banner */}
      <div className="bg-gradient-to-r from-violet-600/20 to-blue-600/20 backdrop-blur-xl rounded-2xl border border-violet-500/30 shadow-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-blue-500 rounded-xl flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className={colors.text}>AI Recommendation</h3>
            <p className={`${colors.textSecondary} text-[13px] mt-1`}>
              Based on current velocity, you're trending 15% ahead of schedule. Consider pulling in 3-4 tasks from next sprint's backlog to maintain team momentum.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 text-white rounded-xl text-[13px] transition-all">
              Apply Suggestion
            </button>
            <button className={`px-4 py-2 ${isDark ? 'bg-white/10 hover:bg-white/20 text-white/70' : 'bg-slate-200/60 hover:bg-slate-300/60 text-slate-700'} rounded-xl text-[13px] transition-all`}>
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
