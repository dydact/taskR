import { useEffect, useMemo, useState } from "react";
import type { Task } from "@dydact/taskr-api-client";
import {
  TrendingUp,
  TrendingDown,
  Users,
  CheckCircle,
  Clock,
  AlertCircle,
  BarChart3,
  RefreshCcw
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from "recharts";

import { useTheme } from "./ThemeContext";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { cn } from "./ui/utils";
import { useAnalytics } from "../hooks/useAnalytics";
import { useShell } from "../context/ShellContext";
import { resolveTaskId } from "../lib/taskrUtils";

const STATUS_COLORS = ["#6366f1", "#22c55e", "#f97316", "#ef4444", "#0ea5e9", "#a855f7"];

const ICON_MAP: Record<string, typeof CheckCircle> = {
  active: Users,
  blocked: AlertCircle,
  completed_7d: CheckCircle,
  overdue: Clock,
  unassigned: Users,
  avg_cycle_hours: BarChart3
};

const trendIcon = {
  up: TrendingUp,
  down: TrendingDown
} as const;

const formatNumber = (value: number) =>
  Number.isFinite(value) ? Intl.NumberFormat().format(value) : "0";

const formatWeekLabel = (isoDate: string) => {
  const date = new Date(isoDate);
  const month = date.toLocaleString(undefined, { month: "short" });
  const day = date.getDate();
  return `${month} ${day}`;
};

const isDone = (status?: string) =>
  typeof status === "string" && ["done", "completed", "complete"].some((token) => status.toLowerCase().includes(token));

const isOverdueTask = (due?: string | null) => {
  if (!due) return false;
  const dueDate = new Date(due);
  if (Number.isNaN(dueDate.getTime())) return false;
  return dueDate.getTime() < Date.now();
};

const formatDueLabel = (due?: string | null) => {
  if (!due) return "No due date";
  const dueDate = new Date(due);
  if (Number.isNaN(dueDate.getTime())) return "No due date";
  const diffDays = Math.round((dueDate.getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} overdue`;
  if (diffDays === 0) return "Due today";
  return `Due in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
};

export type DashboardViewProps = {
  tasks: Task[];
  tasksLoading: boolean;
  tasksError: string | null;
  listId: string | null;
  listName: string | null;
  onRefreshTasks: () => void;
  onSelectTask?: (taskId: string) => void;
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  tasks,
  tasksLoading,
  tasksError,
  listId,
  listName,
  onRefreshTasks,
  onSelectTask
}) => {
  const { colors, theme } = useTheme();
  const { spaces, activeSpaceId } = useShell();
  const activeSpace = useMemo(() => spaces.find((space) => space.spaceId === activeSpaceId) ?? null, [spaces, activeSpaceId]);

  const { data: analytics, loading: analyticsLoading, error: analyticsError, refresh } = useAnalytics(
    activeSpace?.slug,
    listId ?? undefined
  );

  const [velocityWindow, setVelocityWindow] = useState<"7" | "14" | "28">("14");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const loading = tasksLoading || analyticsLoading;
  const error = analyticsError || tasksError;
  const isDark = theme === "dark";

  useEffect(() => {
    if (!loading) {
      setLastRefreshedAt(new Date());
    }
  }, [loading]);

  const stats = useMemo(() => {
    if (!analytics.summary) return [];
    return analytics.summary.cards.map((card) => {
      const Icon = ICON_MAP[card.key] ?? CheckCircle;
      const trend = card.trend === "up" || card.trend === "down" ? card.trend : "flat";
      const change =
        typeof card.delta === "number" && card.delta !== 0
          ? `${card.delta > 0 ? "+" : ""}${card.delta}`
          : card.delta === 0
          ? "0"
          : "—";
      return {
        key: card.key,
        label: card.label,
        value: card.value,
        change,
        trend,
        icon: Icon,
        color: trend === "down" ? "from-rose-500 to-red-500" : trend === "up" ? "from-emerald-500 to-teal-500" : "from-indigo-500 to-purple-500"
      } as StatTile;
    });
  }, [analytics.summary]);

  const weeklyActivity = useMemo(() => {
    if (!analytics.throughput || analytics.throughput.buckets.length === 0) return [];
    return analytics.throughput.buckets.map((bucket) => ({
      week: formatWeekLabel(bucket.week_start),
      created: bucket.created ?? 0,
      completed: bucket.completed ?? 0
    }));
  }, [analytics.throughput]);

  const distribution = useMemo(() => {
    if (!analytics.status) return [];
    return analytics.status.entries.map((entry) => ({
      name: entry.status,
      value: entry.count
    }));
  }, [analytics.status]);

  const velocityPoints = useMemo(() => {
    if (!analytics.velocity || !(analytics.velocity.points ?? []).length) return [];
    return analytics.velocity.points.map((point) => {
      const date = new Date(point.date);
      return {
        iso: point.date,
        label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        completed: point.completed ?? 0
      };
    });
  }, [analytics.velocity]);

  const velocityData = useMemo(() => {
    const windowSize = Number(velocityWindow) as 7 | 14 | 28;
    if (velocityPoints.length <= windowSize) return velocityPoints;
    return velocityPoints.slice(velocityPoints.length - windowSize);
  }, [velocityPoints, velocityWindow]);

  const velocityTrend = useMemo(() => {
    if (velocityData.length < 2) {
      return { trend: "flat" as const, delta: 0 };
    }
    const first = velocityData[0].completed ?? 0;
    const last = velocityData[velocityData.length - 1].completed ?? 0;
    const delta = last - first;
    return {
      trend: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      delta
    };
  }, [velocityData]);

  const peakVelocityPoint = useMemo(() => {
    if (velocityData.length === 0) return null;
    return velocityData.reduce(
      (max, point) => (point.completed > max.completed ? point : max),
      velocityData[0]
    );
  }, [velocityData]);

  const teamSignals = useMemo(() => {
    if (!analytics.workload) return [];
    return [...analytics.workload.entries]
      .sort((a, b) => (b.task_count ?? 0) - (a.task_count ?? 0))
      .slice(0, 5)
      .map((entry) => {
        const initials = (entry.assignee_email ?? "Unknown").slice(0, 2).toUpperCase();
        return {
          id: entry.assignee_id ?? `${entry.assignee_email ?? "unassigned"}`,
          name: entry.assignee_email ?? "Unassigned",
          completed: entry.task_count ?? 0,
          inProgress: Math.max(entry.total_minutes ? Math.round(entry.total_minutes / 60) : 0, 0),
          initials
        };
      });
  }, [analytics.workload]);

  const upcomingDeadlines = useMemo(() => {
    return tasks
      .map((task) => {
        const dueDate = resolveDueDate(task);
        if (!dueDate || isDone(task.status)) return null;
        const id = resolveTaskId(task);
        if (!id) return null;
        return {
          id,
          title: task.title,
          status: task.status ?? "",
          due: dueDate,
          daysRemaining: Math.round((new Date(dueDate).getTime() - Date.now()) / 86400000),
          label: formatDueLabel(dueDate)
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => {
        if (!a.due) return 1;
        if (!b.due) return -1;
        return new Date(a.due).getTime() - new Date(b.due).getTime();
      })
      .slice(0, 5);
  }, [tasks]);

  const overdueSummary = analytics.overdue ?? null;

  const overdueStats = useMemo(() => {
    if (!overdueSummary) return null;
    const severePercent =
      overdueSummary.total_overdue > 0
        ? Math.round((overdueSummary.severe_overdue / overdueSummary.total_overdue) * 100)
        : 0;
    return {
      total: overdueSummary.total_overdue ?? 0,
      severe: overdueSummary.severe_overdue ?? 0,
      severePercent,
      avgDays: typeof overdueSummary.avg_days_overdue === "number" ? overdueSummary.avg_days_overdue : null,
      dueSoon: overdueSummary.due_soon ?? 0
    };
  }, [overdueSummary]);

  const handleRefresh = () => {
    refresh();
    onRefreshTasks();
  };

  const refreshedLabel = lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString() : "—";

  return (
    <div className="space-y-6">
      <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl p-6 flex flex-wrap items-center justify-between gap-4`}>
        <div className="space-y-2">
          <h2 className={cn(colors.text, "text-xl font-semibold")}>Operational Pulse</h2>
          <div className="flex items-center flex-wrap gap-2">
            {activeSpace && (
              <Badge className={`${isDark ? "bg-blue-500/20 text-blue-200" : "bg-blue-100 text-blue-700"} border-0 text-[11px]`}>
                Space · {activeSpace.name}
              </Badge>
            )}
            {listName && (
              <Badge className={`${isDark ? "bg-emerald-500/20 text-emerald-200" : "bg-emerald-100 text-emerald-700"} border-0 text-[11px]`}>
                List · {listName}
              </Badge>
            )}
            <span className={`${colors.textSecondary} text-xs`}>
              {loading ? "Syncing analytics…" : "Metrics are up to date"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="gap-2 rounded-xl">
            <RefreshCcw className="h-4 w-4" /> Refresh
          </Button>
          <Badge className={`${isDark ? "bg-violet-500/20 text-violet-300" : "bg-violet-100 text-violet-700"} border-0 text-[11px]`}>
            Updated {refreshedLabel}
          </Badge>
        </div>
      </div>

      {error ? (
        <div className={`text-sm ${colors.textSecondary} bg-red-500/10 border border-red-500/30 rounded-xl p-4`}>{error}</div>
      ) : (
        <>
          <StatsGrid stats={stats} isDark={isDark} loading={loading} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl p-6`}>
              <ChartHeader title="Weekly Activity" subtitle="Tasks created vs. completed" />
              {weeklyActivity.length === 0 ? (
                <EmptyState message={loading ? "Loading activity…" : "No activity recorded yet."} />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={weeklyActivity}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(148,163,184,0.2)"} />
                    <XAxis dataKey="week" stroke={isDark ? "rgba(255,255,255,0.5)" : "rgba(71,85,105,0.7)"} style={{ fontSize: "12px" }} />
                    <YAxis stroke={isDark ? "rgba(255,255,255,0.5)" : "rgba(71,85,105,0.7)"} style={{ fontSize: "12px" }} />
                    <Tooltip contentStyle={{ backgroundColor: isDark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.95)", borderRadius: 12 }} />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar dataKey="created" fill="#8b5cf6" radius={[8, 8, 0, 0]} name="Created" />
                    <Bar dataKey="completed" fill="#10b981" radius={[8, 8, 0, 0]} name="Completed" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl p-6`}>
              <div className="flex items-center justify-between mb-4">
                <ChartHeader title="Velocity Trend" subtitle={`Completed tasks (last ${Number(velocityWindow)} days)`} />
                <Tabs value={velocityWindow} onValueChange={(value) => setVelocityWindow(value as "7" | "14" | "28")} className="ml-auto">
                  <TabsList className="bg-transparent">
                    <TabsTrigger value="7" className="text-xs">7d</TabsTrigger>
                    <TabsTrigger value="14" className="text-xs">14d</TabsTrigger>
                    <TabsTrigger value="28" className="text-xs">28d</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              {velocityData.length === 0 ? (
                <EmptyState message={loading ? "Loading velocity…" : "Velocity data unavailable."} />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={velocityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(148,163,184,0.2)"} />
                    <XAxis dataKey="label" stroke={isDark ? "rgba(255,255,255,0.5)" : "rgba(71,85,105,0.7)"} style={{ fontSize: "12px" }} />
                    <YAxis allowDecimals={false} stroke={isDark ? "rgba(255,255,255,0.5)" : "rgba(71,85,105,0.7)"} style={{ fontSize: "12px" }} />
                    <Tooltip contentStyle={{ backgroundColor: isDark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.95)", borderRadius: 12 }} />
                    <Line type="monotone" dataKey="completed" stroke="#6366f1" strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
              <div className="flex items-center justify-between mt-4 text-xs">
                <Badge
                  className={`border-0 flex items-center gap-1 ${
                    velocityTrend.trend === "up"
                      ? isDark ? "bg-emerald-500/20 text-emerald-200" : "bg-emerald-100 text-emerald-700"
                      : velocityTrend.trend === "down"
                      ? isDark ? "bg-rose-500/20 text-rose-200" : "bg-rose-100 text-rose-700"
                      : isDark ? "bg-slate-500/20 text-slate-200" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {velocityTrend.trend === "up" ? "▲" : velocityTrend.trend === "down" ? "▼" : "■"} {Math.abs(velocityTrend.delta)}
                </Badge>
                <span className={colors.textSecondary}>
                  Peak day · {peakVelocityPoint ? peakVelocityPoint.label : "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl p-6`}>
              <ChartHeader title="Task Distribution" subtitle="By status" />
              {distribution.length === 0 ? (
                <EmptyState message={loading ? "Loading distribution…" : "No status data available."} />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={distribution} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value" paddingAngle={4}>
                      {distribution.map((item, index) => (
                        <Cell key={item.name} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: isDark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.95)", borderRadius: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="grid grid-cols-2 gap-2 mt-4">
                {distribution.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: STATUS_COLORS[index % STATUS_COLORS.length] }} />
                    <span className={colors.textSecondary}>{item.name} · {item.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl p-6`}>
              <ChartHeader title="Team Signals" subtitle="Top contributors" />
              {teamSignals.length === 0 ? (
                <EmptyState message={loading ? "Loading workload…" : "No workload data available."} />
              ) : (
                <div className="space-y-4">
                  {teamSignals.map((member, index) => (
                    <div key={member.id} className={`flex items-center gap-4 p-4 rounded-xl ${isDark ? "bg-white/5" : "bg-white/50"}`}>
                      <span className={`${colors.textSecondary} text-xs w-4`}>#{index + 1}</span>
                      <Avatar className="w-9 h-9 border-2 border-white/20">
                        <AvatarFallback className="bg-gradient-to-br from-violet-500 to-blue-500 text-white text-[11px]">
                          {member.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className={`${colors.text} text-sm`}>{member.name}</p>
                        <p className={`${colors.textSecondary} text-xs`}>
                          {member.completed} completed · {member.inProgress} active hours
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl p-6`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className={colors.text}>Overdue & Upcoming</h3>
                <p className={`${colors.textSecondary} text-[13px] mt-0.5`}>
                  Guardrails for overdue work and near-term commitments
                </p>
              </div>
              {overdueStats ? (
                <Badge className={`${overdueStats.total > 0 ? "bg-rose-500/20 text-rose-200" : "bg-emerald-500/20 text-emerald-200"} border-0 text-[11px]`}>
                  {overdueStats.total} overdue
                </Badge>
              ) : null}
            </div>

            {overdueStats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <OverdueMetric label="Total overdue" value={formatNumber(overdueStats.total)} tone="critical" />
                <OverdueMetric
                  label="Severe"
                  value={`${formatNumber(overdueStats.severe)} (${overdueStats.severePercent}%)`}
                  tone="warning"
                />
                <OverdueMetric
                  label="Avg days overdue"
                  value={overdueStats.avgDays !== null ? overdueStats.avgDays.toFixed(1) : "—"}
                  tone="neutral"
                />
                <OverdueMetric label="Due soon" value={formatNumber(overdueStats.dueSoon)} tone="info" />
              </div>
            ) : (
              <EmptyState message={loading ? "Fetching overdue summary…" : "No overdue summary available."} />
            )}

            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className={cn(colors.text, "text-sm font-semibold")}>Upcoming deadlines</h4>
                <span className={cn(colors.textSecondary, "text-xs")}>{upcomingDeadlines.length} surfaced</span>
              </div>
              <ScrollArea className="h-64 pr-2">
                <ul className="space-y-3 text-sm">
                  {upcomingDeadlines.length > 0 ? (
                    upcomingDeadlines.map((item) => (
                      <li key={item.id} className={`flex items-center justify-between p-3 rounded-xl ${isDark ? "bg-white/5" : "bg-white/60"}`}>
                        <div>
                          <p className={`${colors.text} text-sm`}>{item.title}</p>
                          <p className={`${colors.textSecondary} text-xs capitalize`}>{item.status || "Unknown"}</p>
                        </div>
                        <Badge className={`${badgeTone(item.daysRemaining)} border-0 text-[11px]`}>{item.label}</Badge>
                      </li>
                    ))
                  ) : (
                    <li className={`${colors.textSecondary} text-xs`}>No upcoming deadlines.</li>
                  )}
                </ul>
              </ScrollArea>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

type StatTile = {
  key: string;
  label: string;
  value: number;
  change: string;
  trend: "up" | "down" | "flat";
  icon: typeof CheckCircle;
  color: string;
};

const StatsGrid: React.FC<{ stats: StatTile[]; isDark: boolean; loading: boolean }> = ({ stats, isDark, loading }) => {
  const { colors } = useTheme();
  if (loading && stats.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, index) => (
          <div key={index} className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-xl p-6 animate-pulse`}>
            <div className="h-4 bg-slate-500/20 rounded w-16" />
            <div className="h-8 bg-slate-500/10 rounded mt-4" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        const TrendIcon = trendIcon[stat.trend as "up" | "down"] ?? null;
        return (
          <div key={stat.label} className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-xl p-6 hover:shadow-2xl transition-all`}>
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <Badge
                className={`border-0 text-[11px] flex items-center gap-1 ${
                  stat.trend === "up"
                    ? isDark ? "bg-green-500/20 text-green-300" : "bg-green-100 text-green-600"
                    : stat.trend === "down"
                    ? isDark ? "bg-red-500/20 text-red-300" : "bg-red-100 text-red-600"
                    : isDark ? "bg-slate-500/20 text-slate-200" : "bg-slate-200 text-slate-600"
                }`}
              >
                {TrendIcon ? <TrendIcon className="w-3 h-3" /> : null}
                {stat.change}
              </Badge>
            </div>
            <h3 className={`${colors.text} text-2xl font-semibold`}>{formatNumber(stat.value)}</h3>
            <p className={`${colors.textSecondary} text-[13px] mt-1`}>{stat.label}</p>
          </div>
        );
      })}
    </div>
  );
};

const ChartHeader: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  const { colors } = useTheme();
  return (
    <div className="mb-6">
      <h3 className={colors.text}>{title}</h3>
      <p className={`${colors.textSecondary} text-[13px] mt-0.5`}>{subtitle}</p>
    </div>
  );
};

const EmptyState: React.FC<{ message: string }> = ({ message }) => {
  const { colors } = useTheme();
  return <div className={`${colors.textSecondary} text-sm bg-slate-500/10 border border-slate-500/20 rounded-xl p-4`}>{message}</div>;
};

const overdueToneStyles: Record<string, string> = {
  critical: "border-rose-400/40 bg-rose-500/10 text-rose-100",
  warning: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  info: "border-blue-400/40 bg-blue-500/10 text-blue-100",
  neutral: "border-slate-400/30 bg-slate-500/10 text-slate-100"
};

const OverdueMetric: React.FC<{ label: string; value: string; tone: "critical" | "warning" | "neutral" | "info" }> = ({
  label,
  value,
  tone
}) => {
  const { colors } = useTheme();
  return (
    <div className={cn("rounded-xl border px-4 py-3", overdueToneStyles[tone] ?? overdueToneStyles.neutral)}>
      <p className={cn("text-xs uppercase tracking-wide opacity-70", colors.text)}>{label}</p>
      <p className="text-lg font-semibold text-white mt-1">{value}</p>
    </div>
  );
};

const badgeTone = (daysRemaining: number | null) => {
  if (daysRemaining === null) return "bg-slate-200 text-slate-700";
  if (daysRemaining < 0) return "bg-rose-500/20 text-rose-600";
  if (daysRemaining <= 2) return "bg-orange-500/20 text-orange-600";
  if (daysRemaining <= 7) return "bg-amber-500/20 text-amber-600";
  return "bg-emerald-500/20 text-emerald-600";
};
