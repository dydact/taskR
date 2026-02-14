import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock, FileSpreadsheet, Loader2, User } from "lucide-react";
import { useTaskRClient } from "../lib/taskrClient";
import { ApiError } from "@dydact/taskr-api-client";
import { useTheme } from "../components/ThemeContext";
import { Button } from "../components/ui/button";
import { ScrollArea } from "../components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

type TimeclockEntry = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at?: string | null;
};

type Timesheet = {
  id: string;
  user_id: string;
  period_start?: string;
  period_end?: string;
  status?: string;
  total_hours?: number;
};

type PayrollSummary = {
  period_start?: string;
  period_end?: string;
  total_pay?: number;
  pending?: number;
};

type SidebarTab = "overview" | "tracking";

export const HRView: React.FC = () => {
  const client = useTaskRClient();
  const { colors, theme } = useTheme();
  const [openClocks, setOpenClocks] = useState<TimeclockEntry[]>([]);
  const [recentHistory, setRecentHistory] = useState<TimeclockEntry[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [payroll, setPayroll] = useState<PayrollSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<"all" | "running" | "closed">("all");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("overview");

  const loadHrData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [open, history, sheets, payrollSummary] = await Promise.all([
        client.request<{ data?: TimeclockEntry[] }>({ path: "/hr/timeclock/open", method: "GET" }),
        client.request<{ data?: TimeclockEntry[] }>({ path: "/hr/timeclock/history", method: "GET" }),
        client.request<{ data?: Timesheet[] }>({ path: "/hr/timesheets", method: "GET" }),
        client.request<{ data?: PayrollSummary }>({ path: "/hr/payroll", method: "GET" })
      ]);

      const openEntries = Array.isArray(open?.data) ? open.data : [];
      const historyEntries = Array.isArray(history?.data) ? history.data : [];
      const sheetEntries = Array.isArray(sheets?.data) ? sheets.data : [];
      const payrollData = (payrollSummary?.data as PayrollSummary | undefined) ?? null;

      setOpenClocks(openEntries);
      setRecentHistory(historyEntries);
      setTimesheets(sheetEntries.slice(0, 10));
      setPayroll(payrollData);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message || `Failed to load HR data (HTTP ${err.status})`
          : err instanceof Error
          ? err.message
          : String(err);
      setError(message);
      setOpenClocks([]);
      setRecentHistory([]);
      setTimesheets([]);
      setPayroll(null);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadHrData();
  }, [loadHrData]);

  const totalOpen = openClocks.length;
  const activeUsers = useMemo(() => new Set(openClocks.map((entry) => entry.user_id)).size, [openClocks]);
  const totalHours = useMemo(() => timesheets.reduce((acc, sheet) => acc + (sheet.total_hours ?? 0), 0), [timesheets]);
  const filteredHistory = useMemo(() => {
    const base = historyFilter === "all"
      ? recentHistory
      : recentHistory.filter((entry) => {
          const running = !entry.ended_at;
          return historyFilter === "running" ? running : !running;
        });
    return base.slice(0, 15);
  }, [recentHistory, historyFilter]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="lg:col-span-2 space-y-6">
        <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-xl p-6`}> 
          <header className="flex items-center justify-between mb-4">
            <h2 className={`${colors.text} font-semibold`}>Active Timeclock Entries</h2>
            <button
              type="button"
              onClick={() => void loadHrData()}
              className={`text-xs flex items-center gap-2 ${colors.textSecondary} ${theme === "dark" ? "hover:text-white" : "hover:text-slate-900"}`}
            >
              <Loader2 className={`w-3.5 h-3.5 ${loading ? "animate-spin" : "opacity-40"}`} /> Refresh
            </button>
          </header>
          {error ? (
            <div className="text-sm text-red-400 flex items-center gap-2">
              <Clock className="w-4 h-4" /> {error}
            </div>
          ) : totalOpen === 0 ? (
            <div className="text-sm text-slate-400">No one is currently clocked in.</div>
          ) : (
            <ul className="space-y-3">
              {openClocks.map((entry) => (
                <li key={entry.id} className={`${colors.cardBackground} border ${colors.cardBorder} rounded-xl px-4 py-3 flex items-center justify-between`}> 
                  <div>
                    <p className={`${colors.text} font-medium`}>{entry.user_id}</p>
                    <p className={`${colors.textSecondary} text-xs`}>Started {new Date(entry.started_at).toLocaleString()}</p>
                  </div>
                  <BadgePill label="Open" tone="green" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-xl p-6`}>
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className={`${colors.text} font-semibold`}>Recent Time Entries</h2>
              <p className={`${colors.textSecondary} text-xs`}>
                {historyFilter === "all"
                  ? "Full feed"
                  : historyFilter === "running"
                  ? "Active clocks"
                  : "Closed entries"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(["all", "running", "closed"] as const).map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={historyFilter === option ? "default" : "ghost"}
                  className="h-7 px-3 text-xs"
                  onClick={() => setHistoryFilter(option)}
                >
                  {option === "all" ? "All" : option === "running" ? "Running" : "Closed"}
                </Button>
              ))}
            </div>
          </header>
          <ScrollArea className="max-h-72">
            <table className="w-full text-sm">
              <thead className={`${theme === "dark" ? "bg-white/5" : "bg-white/80"} text-left text-xs uppercase tracking-wide`}> 
                <tr>
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">Start</th>
                  <th className="px-4 py-2">End</th>
                  <th className="px-4 py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((entry) => {
                  const isRunning = !entry.ended_at;
                  return (
                    <tr key={`history-${entry.id}`} className="border-t border-white/5">
                      <td className="px-4 py-2 text-xs">{entry.user_id}</td>
                      <td className="px-4 py-2 text-xs">{new Date(entry.started_at).toLocaleString()}</td>
                      <td className="px-4 py-2 text-xs">{entry.ended_at ? new Date(entry.ended_at).toLocaleString() : "—"}</td>
                      <td className="px-4 py-2 text-xs text-right">
                        <BadgePill label={isRunning ? "Running" : "Closed"} tone={isRunning ? "amber" : "green"} />
                      </td>
                    </tr>
                  );
                })}
                {filteredHistory.length === 0 && !loading && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-sm text-slate-400">
                      No history available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      </section>

      <aside>
        <Tabs
          value={sidebarTab}
          onValueChange={(value) => setSidebarTab(value as SidebarTab)}
          className="space-y-4"
        >
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tracking">Time Tracking</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <div className="space-y-6">
              <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-xl p-6 space-y-4`}> 
                <h3 className={`${colors.text} font-semibold flex items-center gap-2`}>
                  <User className="w-4 h-4" /> Workforce Snapshot
                </h3>
                <MetricRow label="Active clocks" value={totalOpen} />
                <MetricRow label="Unique team members" value={activeUsers} />
                <MetricRow label="Hours captured (current sheets)" value={`${totalHours.toFixed(1)} h`} />
              </div>
              <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-xl p-6 space-y-3`}> 
                <h3 className={`${colors.text} font-semibold flex items-center gap-2`}>
                  <CalendarClock className="w-4 h-4" /> Payroll
                </h3>
                {payroll ? (
                  <div className="text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`${colors.textSecondary}`}>Pay period</span>
                      <span className={`${colors.text}`}>
                        {payroll.period_start ? new Date(payroll.period_start).toLocaleDateString() : "—"} – {payroll.period_end ? new Date(payroll.period_end).toLocaleDateString() : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`${colors.textSecondary}`}>Total pay</span>
                      <span className={`${colors.text} font-medium`}>
                        {typeof payroll.total_pay === "number" ? `$${(payroll.total_pay / 100).toFixed(2)}` : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`${colors.textSecondary}`}>Pending payouts</span>
                      <span className={`${colors.text}`}>{payroll.pending ?? 0}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Payroll summary unavailable.</p>
                )}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="tracking">
            <div className="space-y-6">
              <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-xl p-6 space-y-3`}> 
                <div className="flex items-center justify-between">
                  <h3 className={`${colors.text} font-semibold flex items-center gap-2`}>
                    <FileSpreadsheet className="w-4 h-4" /> Time Tracking
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => void loadHrData()}
                  >
                    Refresh
                  </Button>
                </div>
                {timesheets.slice(0, 5).map((sheet) => (
                  <div key={sheet.id} className={`border ${colors.cardBorder} rounded-lg px-4 py-3 text-xs`}> 
                    <div className={`${colors.text} font-medium`}>{sheet.user_id}</div>
                    <div className={`${colors.textSecondary} mt-1`}> 
                      {sheet.period_start ? new Date(sheet.period_start).toLocaleDateString() : "—"} – {sheet.period_end ? new Date(sheet.period_end).toLocaleDateString() : "—"}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`${colors.textSecondary}`}>{sheet.status ?? "unknown"}</span>
                      <span className={`${colors.text}`}>{typeof sheet.total_hours === "number" ? `${sheet.total_hours.toFixed(1)} h` : "—"}</span>
                    </div>
                  </div>
                ))}
                {timesheets.length === 0 && !loading && <p className="text-xs text-slate-400">No recent entries captured.</p>}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </aside>
    </div>
  );
};

const MetricRow: React.FC<{ label: string; value: string | number }> = ({ label, value }) => {
  const { colors } = useTheme();
  return (
    <div className="flex items-center justify-between">
      <span className={`${colors.textSecondary} text-xs`}>{label}</span>
      <span className={`${colors.text} text-sm font-semibold`}>{value}</span>
    </div>
  );
};

const BadgePill: React.FC<{ label: string; tone: "green" | "amber" | "red" }> = ({ label, tone }) => {
  const tones: Record<string, string> = {
    green: "bg-emerald-500/20 text-emerald-200",
    amber: "bg-amber-500/20 text-amber-200",
    red: "bg-red-500/20 text-red-200"
  };
  return <span className={`text-xs px-3 py-1 rounded-full ${tones[tone] ?? tones.green}`}>{label}</span>;
};
