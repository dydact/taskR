import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, Zap, Bell, Check, X, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { useTheme } from "./ThemeContext";
import { useTaskRClient } from "../lib/taskrClient";
import { ApiError } from "@dydact/taskr-api-client";

type InsightRecord = {
  id?: string;
  title?: string;
  summary?: string;
  severity?: string;
  created_at?: string;
};

type NotificationRecord = {
  id: string;
  message?: string;
  title?: string;
  body?: string;
  created_at?: string;
  type?: string;
  cta_path?: string | null;
};

type AutomationJob = {
  id: string;
  prompt_id?: string;
  status?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
};

export const RightPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState("ai");
  return (
    <PanelChrome activeTab={activeTab} onTabChange={setActiveTab} />
  );
};

const PanelChrome: React.FC<{
  activeTab: string;
  onTabChange: (value: string) => void;
}> = ({ activeTab, onTabChange }) => {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";
  const client = useTaskRClient();

  const [insights, setInsights] = useState<InsightRecord[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const featureUnavailable = (err: unknown) => err instanceof ApiError && err.status === 404;

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const response = await client.request<{ data?: InsightRecord[] }>({ path: "/insights/feed", method: "GET" });
      setInsights(Array.isArray(response?.data) ? response.data : []);
    } catch (err) {
      if (featureUnavailable(err)) {
        setInsights([]);
      } else {
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
        setError((prev) => prev ?? message);
        setInsights([]);
      }
    } finally {
      setInsightsLoading(false);
    }
  }, [client]);

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const response = await client.notifications.list();
      const raw = Array.isArray((response as any)?.data)
        ? (response as { data: NotificationRecord[] }).data
        : response;
      const payload = Array.isArray(raw)
        ? raw.map((item: any) => {
            if (item && typeof item === "object" && "message" in item) {
              return {
                id: String(item.id ?? ""),
                message: item.message,
                created_at: item.created_at,
                type: item.type,
                cta_path: item.cta_path ?? null
              } satisfies NotificationRecord;
            }
            return {
              id: String(item.notification_id ?? item.id ?? ""),
              title: item.title ?? undefined,
              body: item.body ?? undefined,
              message: item.title && item.body ? `${item.title} — ${item.body}` : item.title ?? item.body,
              created_at: item.created_at,
              type: item.event_type ?? item.type,
              cta_path: item.cta_path ?? null
            } satisfies NotificationRecord;
          })
        : [];
      setNotifications(payload);
    } catch (err) {
      if (featureUnavailable(err)) {
        setNotifications([]);
      } else {
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
        setError((prev) => prev ?? message);
        setNotifications([]);
      }
    } finally {
      setNotificationsLoading(false);
    }
  }, [client]);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const response = await client.ai.listJobs();
      const payload = Array.isArray((response as any)?.data)
        ? (response as { data: AutomationJob[] }).data
        : [];
      setJobs(payload.slice(0, 10));
    } catch (err) {
      if (featureUnavailable(err)) {
        setJobs([]);
      } else {
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
        setError((prev) => prev ?? message);
        setJobs([]);
      }
    } finally {
      setJobsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadInsights();
    void loadNotifications();
    void loadJobs();
  }, [loadInsights, loadNotifications, loadJobs]);

  const hasAnyData = insights.length + notifications.length + jobs.length > 0;

  return (
    <aside className={`w-[320px] ${colors.navBackground} border-l ${colors.navBorder} flex flex-col`}>
      <div className={`p-4 border-b ${colors.navBorder}`}>
        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList className={`w-full ${isDark ? "bg-black/20 border border-white/10" : "bg-slate-200/50 border border-slate-200"}`}>
            <TabsTrigger value="notifications" className={`flex-1 ${isDark ? "data-[state=active]:bg-white/20" : "data-[state=active]:bg-white/80"}`}>
              <Bell className="w-4 h-4 mr-1" />
              Notifs
            </TabsTrigger>
            <TabsTrigger value="ai" className={`flex-1 ${isDark ? "data-[state=active]:bg-white/20" : "data-[state=active]:bg-white/80"}`}>
              <Sparkles className="w-4 h-4 mr-1" />
              AI
            </TabsTrigger>
            <TabsTrigger value="automations" className={`flex-1 ${isDark ? "data-[state=active]:bg-white/20" : "data-[state=active]:bg-white/80"}`}>
              <Zap className="w-4 h-4 mr-1" />
              Auto
            </TabsTrigger>
          </TabsList>
          <ScrollArea className="flex-1 p-4">
            {!hasAnyData && !insightsLoading && !notificationsLoading && !jobsLoading && (
              <div className={`text-xs ${colors.textSecondary}`}>
                {error ?? "AI insights, notifications, and automations will appear here once configured."}
              </div>
            )}
            <TabsContent value="ai" className="mt-0">
              <AIInsights insights={insights} loading={insightsLoading} />
            </TabsContent>
            <TabsContent value="notifications" className="mt-0">
              <Notifications notifications={notifications} loading={notificationsLoading} />
            </TabsContent>
            <TabsContent value="automations" className="mt-0">
              <Automations jobs={jobs} loading={jobsLoading} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </div>

      {/* Fallback in case the Tabs context fails to mount */}
      {!Tabs ? null : null}
    </aside>
  );
};

const AIInsights: React.FC<{ insights: InsightRecord[]; loading: boolean }> = ({ insights, loading }) => {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Syncing AI insights…
      </div>
    );
  }

  if (insights.length === 0) {
    return <p className={`${colors.textSecondary} text-xs`}>No AI insights available yet.</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className={`${colors.textSecondary} text-[13px] mb-2`}>AI Insights</h3>
      {insights.map((insight, index) => {
        const icon = index % 2 === 0 ? <TrendingUp className="w-4 h-4 text-white" /> : <Sparkles className="w-4 h-4 text-white" />;
        const accent = index % 2 === 0 ? "from-violet-500 to-blue-500" : "from-green-500 to-emerald-400";
        return (
          <div key={insight.id ?? index} className={`${isDark ? "bg-gradient-to-br from-white/10 to-white/5" : "bg-white/80"} relative backdrop-blur-sm rounded-2xl p-4 border ${isDark ? "border-white/10" : "border-slate-200/60"} shadow-lg transition-all duration-180`}>
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${accent} rounded-t-2xl`} />
            <div className="flex items-start gap-3 mb-3">
              <div className={`w-8 h-8 bg-gradient-to-br ${accent} rounded-xl flex items-center justify-center flex-shrink-0`}>{icon}</div>
              <div className="flex-1">
                <h4 className={`${colors.text} text-[13px] mb-1`}>{insight.title ?? "Insight"}</h4>
                <p className={`${colors.textSecondary} text-[12px] leading-relaxed`}>{insight.summary ?? "No summary provided."}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 text-white rounded-xl h-8">
                <Check className="w-3.5 h-3.5 mr-1" /> Accept
              </Button>
              <Button size="sm" variant="ghost" className={`flex-1 ${colors.textSecondary} ${isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"} rounded-xl h-8`}>
                <X className="w-3.5 h-3.5 mr-1" /> Dismiss
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Notifications: React.FC<{ notifications: NotificationRecord[]; loading: boolean }> = ({ notifications, loading }) => {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading notifications…
      </div>
    );
  }

  if (notifications.length === 0) {
    return <p className={`${colors.textSecondary} text-xs`}>You are all caught up.</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className={`${colors.textSecondary} text-[13px] mb-2`}>Notifications</h3>
      {notifications.map((notification) => (
        <div key={notification.id} className={`${isDark ? "bg-white/5" : "bg-white/60"} rounded-xl p-3 border ${isDark ? "border-white/10" : "border-slate-200/60"}`}>
          {notification.title ? (
            <p className={`${colors.text} text-[13px] font-medium`}>{notification.title}</p>
          ) : null}
          {notification.body ? (
            <p className={`${colors.textSecondary} text-[12px] mt-1`}>{notification.body}</p>
          ) : notification.message ? (
            <p className={`${colors.text} text-[13px]`}>{notification.message}</p>
          ) : null}
          <p className={`${colors.textSecondary} text-[11px] mt-1 opacity-70`}>
            {notification.created_at ? new Date(notification.created_at).toLocaleString() : "Just now"}
          </p>
        </div>
      ))}
    </div>
  );
};

const Automations: React.FC<{ jobs: AutomationJob[]; loading: boolean }> = ({ jobs, loading }) => {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking automations…
      </div>
    );
  }

  if (jobs.length === 0) {
    return <p className={`${colors.textSecondary} text-xs`}>No recent automation activity.</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className={`${colors.textSecondary} text-[13px] mb-2`}>Automation Runs</h3>
      {jobs.map((job) => (
        <div key={job.id} className={`${isDark ? "bg-white/5" : "bg-white/60"} rounded-xl p-3 border ${isDark ? "border-white/10" : "border-slate-200/60"}`}>
          <p className={`${colors.text} text-[13px] font-medium`}>{job.prompt_id ?? "AI action"}</p>
          <p className={`${colors.textSecondary} text-[11px] mt-1`}>Status: {job.status ?? "unknown"}</p>
          <p className={`${colors.textSecondary} text-[11px] mt-1`}>
            {job.created_at ? new Date(job.created_at).toLocaleString() : "—"}
          </p>
          {job.metadata && Object.keys(job.metadata).length > 0 && (
            <Badge className="mt-2 bg-green-500/20 text-green-200 border-green-500/30 border px-2 py-0.5 text-[10px]">
              {Object.keys(job.metadata)[0]}
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
};
