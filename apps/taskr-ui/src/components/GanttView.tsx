import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScheduleTimeline } from "@dydact/taskr-api-client";
import {
  AlertTriangle,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Link2,
  Loader2,
  Sparkles,
  ZoomIn,
  ZoomOut
} from "lucide-react";

import { useTheme } from "./ThemeContext";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "./ui/dropdown-menu";
import { cn } from "./ui/utils";
import { useTaskRClient } from "../lib/taskrClient";

type PhaseItem = {
  data: ScheduleTimeline;
  start: Date;
  end: Date;
  startOffsetDays: number;
  durationDays: number;
  progress: number;
  guardrails: string[];
  dependencies: string[];
  sources: string[];
  gradient: string;
};

type Phase = {
  key: string;
  label: string;
  color: string;
  items: PhaseItem[];
  totals: {
    count: number;
    active: number;
    guardrails: number;
  };
  progress: number;
};

const PHASE_HEADER_HEIGHT = 56;
const ROW_HEIGHT = 54;
const MIN_DURATION_DAYS = 0.6;

const STATUS_GRADIENTS: Record<string, string> = {
  scheduled: "from-blue-500/90 to-cyan-500/90",
  worked: "from-emerald-500/90 to-teal-500/90",
  approved: "from-indigo-500/90 to-purple-500/90",
  exported: "from-amber-500/90 to-orange-500/90",
  claimed: "from-rose-500/95 to-pink-500/90",
  paid: "from-slate-500/90 to-slate-600/90",
  default: "from-slate-400/70 to-slate-500/80"
};

const readString = (record: Record<string, unknown> | undefined, key: string): string | null => {
  if (!record) return null;
  const raw = record[key];
  return typeof raw === "string" && raw.trim().length > 0 ? raw : null;
};

const readArray = <T,>(record: Record<string, unknown> | undefined, key: string): T[] =>
  Array.isArray(record?.[key]) ? (record?.[key] as T[]) : [];

const extractGuardrails = (record: Record<string, unknown> | undefined) => {
  const alerts: string[] = [];
  [record?.guardrail_alerts, record?.guardrails, record?.alerts].forEach((candidate) => {
    if (Array.isArray(candidate)) {
      candidate.forEach((entry) => {
        if (typeof entry === "string") alerts.push(entry);
        else if (entry && typeof entry === "object") {
          const label =
            readString(entry as Record<string, unknown>, "label") ??
            readString(entry as Record<string, unknown>, "message");
          if (label) alerts.push(label);
        }
      });
    }
  });
  return Array.from(new Set(alerts));
};

const formatRangeLabel = (start: Date, end: Date) => {
  const formatOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startLabel = start.toLocaleDateString(undefined, formatOpts);
  const endLabel = end.toLocaleDateString(undefined, formatOpts);
  return `${startLabel} → ${endLabel}`;
};

const startOfMonth = (anchor: Date) => new Date(anchor.getFullYear(), anchor.getMonth(), 1);

const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

const dayDiff = (start: Date, end: Date) => Math.max(0, (startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000);

const resolvePhaseKey = (session: ScheduleTimeline) => {
  const metadata = session.metadata_json as Record<string, unknown> | undefined;
  return (
    readString(metadata, "phase") ??
    readString(metadata, "lane") ??
    session.service_type ??
    "Timeline"
  );
};

const resolvePhaseColor = (index: number, isDark: boolean) => {
  const palette = isDark
    ? ["bg-violet-500/20", "bg-blue-500/20", "bg-emerald-500/20", "bg-amber-500/20"]
    : ["bg-violet-100/80", "bg-blue-100/80", "bg-emerald-100/80", "bg-amber-100/80"];
  return palette[index % palette.length];
};

const computeProgress = (session: ScheduleTimeline) => {
  const scheduledStart = new Date(session.scheduled_start);
  const scheduledEnd = new Date(session.scheduled_end);
  const plannedMinutes = Math.max(
    (scheduledEnd.getTime() - scheduledStart.getTime()) / 60000,
    session.duration_minutes ?? 0
  );
  if (!plannedMinutes || plannedMinutes <= 0) return 0;
  const workedMinutes = session.duration_minutes ?? 0;
  return Math.max(0, Math.min(100, Math.round((workedMinutes / plannedMinutes) * 100)));
};

const buildPhases = (sessions: ScheduleTimeline[], rangeStart: Date, isDark: boolean): Phase[] => {
  const map = new Map<string, Phase>();

  sessions.forEach((session) => {
    const phaseKey = resolvePhaseKey(session);
    if (!map.has(phaseKey)) {
      map.set(phaseKey, {
        key: phaseKey,
        label: phaseKey,
        color: resolvePhaseColor(map.size, isDark),
        items: [],
        totals: { count: 0, active: 0, guardrails: 0 },
        progress: 0
      });
    }

    const phase = map.get(phaseKey)!;
    const metadata = session.metadata_json as Record<string, unknown> | undefined;
    const start = new Date(session.scheduled_start);
    const end = new Date(session.scheduled_end);
    const gradient =
      STATUS_GRADIENTS[session.status?.toLowerCase() ?? ""] ?? STATUS_GRADIENTS.default;
    const guardrails = extractGuardrails(metadata);
    const dependencies = readArray<string>(metadata, "dependencies");
    const sources = readArray<string>(metadata, "sources");
    const startOffsetDays = dayDiff(rangeStart, start);
    const rawDuration = dayDiff(start, end) || (session.duration_minutes ?? 0) / 1440;
    const durationDays = Math.max(rawDuration, MIN_DURATION_DAYS);
    const progress = computeProgress(session);

    phase.items.push({
      data: session,
      start,
      end,
      startOffsetDays,
      durationDays,
      progress,
      guardrails,
      dependencies,
      sources,
      gradient
    });

    phase.totals.count += 1;
    if (!["scheduled", "planned"].includes((session.status ?? "").toLowerCase())) {
      phase.totals.active += 1;
    }
    if (guardrails.length > 0) {
      phase.totals.guardrails += guardrails.length;
    }
  });

  return Array.from(map.values())
    .map((phase) => {
      const avgProgress =
        phase.items.length === 0
          ? 0
          : Math.round(
              phase.items.reduce((acc, item) => acc + item.progress, 0) / phase.items.length
            );
      return { ...phase, progress: avgProgress };
    })
    .sort((a, b) => {
      const aStart = Math.min(...a.items.map((item) => item.start.getTime()));
      const bStart = Math.min(...b.items.map((item) => item.start.getTime()));
      return aStart - bStart;
    });
};

export function GanttView() {
  const { colors, theme } = useTheme();
  const client = useTaskRClient();
  const isDark = theme === "dark";

  const [anchorMonth, setAnchorMonth] = useState(startOfMonth(new Date()));
  const [sessions, setSessions] = useState<ScheduleTimeline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [showGuardrails, setShowGuardrails] = useState(true);

  const rangeStart = useMemo(() => startOfMonth(anchorMonth), [anchorMonth]);
  const rangeEnd = useMemo(() => {
    const window = new Date(rangeStart);
    window.setDate(window.getDate() + 56);
    return window;
  }, [rangeStart]);

  const rangeLabel = useMemo(() => formatRangeLabel(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const rangeStartIso = useMemo(() => rangeStart.toISOString(), [rangeStart]);
  const rangeEndIso = useMemo(() => rangeEnd.toISOString(), [rangeEnd]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await client.bridge.schedule.list({
        start: rangeStartIso,
        end: rangeEndIso
      });
      const data = Array.isArray(payload) ? payload : [];
      setSessions(data);
      setExpandedPhases(new Set());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [client, rangeStartIso, rangeEndIso]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ownerOptions = useMemo(() => {
    const owners = new Map<string, string>();
    sessions.forEach((session) => {
      if (!session.staff_id) return;
      if (owners.has(session.staff_id)) return;
      const metadata = session.metadata_json as Record<string, unknown> | undefined;
      const label =
        readString(metadata, "staff_name") ??
        readString(metadata, "owner_name") ??
        session.staff_id.slice(0, 8);
      owners.set(session.staff_id, label);
    });
    return Array.from(owners.entries()).map(([id, label]) => ({ id, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [sessions]);

  const statusOptions = useMemo(() => {
    const statuses = new Set<string>();
    sessions.forEach((session) => {
      statuses.add((session.status ?? "unknown").toString().toLowerCase());
    });
    return Array.from(statuses.values()).sort();
  }, [sessions]);

  useEffect(() => {
    if (selectedOwners.length === 0) return;
    const allowed = new Set(ownerOptions.map((owner) => owner.id));
    setSelectedOwners((prev) => {
      const filtered = prev.filter((id) => allowed.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [ownerOptions, selectedOwners.length]);

  useEffect(() => {
    if (selectedStatuses.length === 0) return;
    const allowed = new Set(statusOptions);
    setSelectedStatuses((prev) => {
      const filtered = prev.filter((status) => allowed.has(status));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [statusOptions, selectedStatuses.length]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      const matchesOwner =
        selectedOwners.length === 0 ||
        (session.staff_id && selectedOwners.includes(session.staff_id));
      const status = (session.status ?? "unknown").toString().toLowerCase();
      const matchesStatus =
        selectedStatuses.length === 0 || selectedStatuses.includes(status);
      return matchesOwner && matchesStatus;
    });
  }, [sessions, selectedOwners, selectedStatuses]);

  const phases = useMemo(
    () => buildPhases(filteredSessions, rangeStart, isDark),
    [filteredSessions, rangeStart, isDark]
  );

  useEffect(() => {
    if (phases.length > 0) {
      setExpandedPhases(new Set(phases.map((phase) => phase.key)));
    }
  }, [phases.length]);

  const totalDays = useMemo(() => Math.max(1, Math.ceil(dayDiff(rangeStart, rangeEnd))), [rangeStart, rangeEnd]);
  const dayWidth = 28 * zoom;
  const timelineWidth = totalDays * dayWidth;

  const axisDays = useMemo(() => {
    const ticks: { key: string; label: string; day: number }[] = [];
    for (let index = 0; index <= totalDays; index += 1) {
      const date = new Date(rangeStart);
      date.setDate(date.getDate() + index);
      ticks.push({
        key: date.toISOString(),
        label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        day: date.getDate()
      });
    }
    return ticks;
  }, [rangeStart, totalDays]);

  const togglePhase = (key: string) =>
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  const onPrev = () =>
    setAnchorMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));

  const onNext = () =>
    setAnchorMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));

  const onZoomOut = () => setZoom((value) => Math.max(0.5, value - 0.25));
  const onZoomIn = () => setZoom((value) => Math.min(2, value + 0.25));

  return (
    <section className={cn("rounded-2xl border shadow-2xl overflow-hidden", colors.cardBackground, colors.cardBorder)}>
      <header className={cn("px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3", colors.cardBorder)}>
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isDark ? "bg-white/10" : "bg-blue-100")}>
            <CalendarRange className={cn("w-5 h-5", colors.text)} />
          </div>
          <div>
            <p className={cn("text-xs uppercase tracking-wide font-semibold", colors.textSecondary)}>Timeline</p>
            <h2 className={cn("text-lg font-semibold", colors.text)}>{rangeLabel}</h2>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPrev}
            className={cn(
              "rounded-xl",
              colors.textSecondary,
              isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
            )}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNext}
            className={cn(
              "rounded-xl",
              colors.textSecondary,
              isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
            )}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <div className="w-px h-6" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)" }} />
          <Button
            variant="ghost"
            size="icon"
            onClick={onZoomOut}
            className={cn(
              "rounded-xl",
              colors.textSecondary,
              isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
            )}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onZoomIn}
            className={cn(
              "rounded-xl",
              colors.textSecondary,
              isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
            )}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <div className="w-px h-6" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)" }} />
          <DropdownMenuWrapper
            label="Owners"
            emptyLabel="No owners detected"
            selectedCount={selectedOwners.length}
            options={ownerOptions.map((owner) => ({
              id: owner.id,
              label: owner.label,
              selected: selectedOwners.includes(owner.id)
            }))}
            onToggle={(id) =>
              setSelectedOwners((prev) =>
                prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
              )
            }
            onClear={() => setSelectedOwners([])}
          />
          <DropdownMenuWrapper
            label="Status"
            emptyLabel="No statuses detected"
            selectedCount={selectedStatuses.length}
            options={statusOptions.map((status) => ({
              id: status,
              label: status.replace(/_/g, " "),
              selected: selectedStatuses.includes(status)
            }))}
            onToggle={(value) =>
              setSelectedStatuses((prev) =>
                prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value]
              )
            }
            onClear={() => setSelectedStatuses([])}
            capitalize
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            className={cn(
              "gap-2 rounded-xl",
              colors.textSecondary,
              isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
            )}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowGuardrails((prev) => !prev)}
            className={cn(
              "gap-2 rounded-xl",
              colors.textSecondary,
              isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
            )}
          >
            {showGuardrails ? "Hide Guardrails" : "Show Guardrails"}
          </Button>
        </div>
      </header>

      {error && (
        <div className="px-6 py-3 border-b border-red-500/30 bg-red-500/5 text-sm text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      <div className="flex" style={{ minHeight: 360 }}>
        <aside className={cn("w-[320px] border-r", colors.cardBorder)}>
          <ScrollArea className="h-full">
            <div className="divide-y divide-white/5">
              {phases.length === 0 && !loading ? (
                <div className="px-6 py-12 text-sm text-center text-slate-400">
                  No schedule timelines within this window.
                </div>
              ) : (
                phases.map((phase) => {
                  const isExpanded = expandedPhases.has(phase.key);
                  return (
                    <div key={phase.key}>
                      <button
                        type="button"
                        onClick={() => togglePhase(phase.key)}
                        className={cn(
                          "w-full px-5 py-4 flex items-center justify-between gap-3 transition-colors",
                          isDark ? "hover:bg-white/5" : "hover:bg-white/70"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold uppercase", phase.color)}>
                            {phase.label.slice(0, 3)}
                          </div>
                          <div className="text-left">
                            <p className={cn("text-sm font-semibold", colors.text)}>{phase.label}</p>
                            <p className={cn("text-xs", colors.textSecondary)}>
                              {phase.totals.count} items · {phase.totals.guardrails} guardrails
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-violet-500/15 text-violet-300 border-0 text-[11px]">
                            {phase.progress}% progress
                          </Badge>
                          <span className={cn("text-[22px] leading-none", colors.textSecondary)}>{isExpanded ? "–" : "+"}</span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-5 pb-4 space-y-3">
                          {phase.items.map((item) => {
                            const metadata = item.data.metadata_json as Record<string, unknown> | undefined;
                            const owner =
                              readString(metadata, "staff_name") ??
                              readString(metadata, "owner_name") ??
                              (item.data.staff_id ? item.data.staff_id.slice(0, 6) : "Unassigned");
                            const timeRange = formatRangeLabel(item.start, item.end);
                            return (
                              <div
                                key={item.data.timeline_id}
                                className={cn(
                                  "rounded-xl border px-4 py-3 text-xs space-y-2",
                                  isDark ? "bg-white/5 border-white/10" : "bg-white/80 border-white"
                                )}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className={cn("text-sm font-semibold leading-tight", colors.text)}>
                                      {item.data.service_type}
                                    </p>
                                    <p className={cn("text-[11px]", colors.textSecondary)}>{timeRange}</p>
                                  </div>
                                  <Badge className="bg-violet-500/15 text-violet-300 border-0 text-[10px] uppercase">
                                    {item.data.status}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge className="bg-slate-500/10 text-[10px] border-0">
                                    Owner · {owner}
                                  </Badge>
                                  {item.guardrails.length > 0 && (
                                    <Badge className="bg-rose-500/20 text-rose-200 border-0 text-[10px] flex items-center gap-1">
                                      <Sparkles className="w-3 h-3" />
                                      {item.guardrails.length} guardrail
                                      {item.guardrails.length === 1 ? "" : "s"}
                                    </Badge>
                                  )}
                                  {item.sources.slice(0, 2).map((source) => (
                                    <Badge key={source} className="bg-emerald-500/15 text-emerald-200 border-0 text-[10px] uppercase">
                                      {source}
                                    </Badge>
                                  ))}
                                  {item.dependencies.length > 0 && (
                                    <Badge className="bg-amber-500/20 text-amber-100 border-0 text-[10px] flex items-center gap-1">
                                      <Link2 className="w-3 h-3" />
                                      {item.dependencies.length} dependency
                                      {item.dependencies.length === 1 ? "" : "ies"}
                                    </Badge>
                                  )}
                                </div>
                                <div className="h-1.5 rounded-full overflow-hidden bg-slate-500/20">
                                  <div
                                    className="h-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-300"
                                    style={{ width: `${item.progress}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </aside>

        <div className="flex-1 overflow-x-auto relative">
          <div className="min-h-full">
            <div
              className={cn(
                "sticky top-0 z-10 flex text-[11px] uppercase tracking-wide",
                isDark ? "bg-slate-950/90" : "bg-white/90",
                "backdrop-blur-md border-b",
                colors.cardBorder
              )}
              style={{ minWidth: timelineWidth }}
            >
              {axisDays.map((tick, index) => (
                <div
                  key={tick.key}
                  className={cn(
                    "flex-1 border-r px-2 py-2 text-center",
                    index % 7 === 0 ? "font-medium" : "opacity-60",
                    colors.cardBorder
                  )}
                  style={{ width: dayWidth, minWidth: dayWidth }}
                >
                  {tick.label}
                </div>
              ))}
            </div>

            {phases.map((phase) => {
              const isExpanded = expandedPhases.has(phase.key);
              const phaseHeight =
                PHASE_HEADER_HEIGHT + (isExpanded ? phase.items.length * ROW_HEIGHT : 0);
              return (
                <div
                  key={`timeline-${phase.key}`}
                  className={cn("border-b", colors.cardBorder)}
                  style={{ minHeight: phaseHeight }}
                >
                  <div
                    className={cn(
                      "flex items-center gap-3 px-4",
                      isDark ? "bg-white/5" : "bg-white/70"
                    )}
                    style={{ height: PHASE_HEADER_HEIGHT }}
                  >
                    <div className="text-xs uppercase tracking-wide">{phase.label}</div>
                    <Badge className="bg-black/10 text-[10px] border-0">
                      {phase.totals.active}/{phase.totals.count} active
                    </Badge>
                  </div>
                  {isExpanded && (
                    <div className="relative" style={{ minWidth: timelineWidth }}>
                      {phase.items.map((item, index) => {
                        const left = item.startOffsetDays * dayWidth;
                        const width = Math.max(item.durationDays * dayWidth, dayWidth * MIN_DURATION_DAYS);
                        return (
                          <div
                            key={`${phase.key}-${item.data.timeline_id}`}
                            className={cn(
                              "border-b border-dashed last:border-b-0",
                              colors.cardBorder
                            )}
                            style={{ height: ROW_HEIGHT }}
                          >
                            <div
                              className="absolute inset-y-2 rounded-xl shadow-sm group cursor-pointer transition-transform hover:-translate-y-0.5"
                              style={{ left, width }}
                            >
                              <div className={cn("h-full w-full rounded-xl border bg-gradient-to-r px-3 py-2 text-white flex flex-col justify-between", item.gradient, "border-white/20")}>
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold truncate">{item.data.service_type}</p>
                                  <Badge className="bg-black/25 text-[10px] border-0 uppercase">
                                    {item.data.status}
                                  </Badge>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-black/25 overflow-hidden">
                                  <div
                                    className="h-full bg-white/70 transition-all duration-300"
                                    style={{ width: `${item.progress}%` }}
                                  />
                                </div>
                      <div className="flex items-center gap-2 text-[10px] opacity-90">
                        <Clock className="w-3 h-3" />
                        <span>
                          {item.data.duration_minutes ?? 0} min •{" "}
                          {item.data.worked_start ? "Worked" : "Scheduled"}
                        </span>
                        {showGuardrails && item.guardrails.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            {item.guardrails.length}
                          </span>
                        )}
                                  {item.dependencies.length > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Link2 className="w-3 h-3" />
                                      {item.dependencies.length}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-white/80">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading timeline…
          </div>
        </div>
      )}
    </section>
  );
}

type DropdownOption = {
  id: string;
  label: string;
  selected: boolean;
};

type DropdownMenuWrapperProps = {
  label: string;
  emptyLabel: string;
  selectedCount: number;
  options: DropdownOption[];
  onToggle: (id: string) => void;
  onClear: () => void;
  capitalize?: boolean;
};

const DropdownMenuWrapper = ({
  label,
  emptyLabel,
  selectedCount,
  options,
  onToggle,
  onClear,
  capitalize = false
}: DropdownMenuWrapperProps) => {
  if (options.length === 0) {
    return (
      <Button variant="ghost" size="sm" className="rounded-xl gap-2 opacity-60" disabled>
        {label}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-xl gap-2 text-xs text-slate-400 hover:text-slate-900 hover:bg-slate-100/60 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/10"
        >
          {label}
          {selectedCount > 0 && (
            <Badge className="bg-violet-500/20 text-violet-200 border-0 text-[10px]">{selectedCount}</Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 ? (
          <DropdownMenuItem disabled>{emptyLabel}</DropdownMenuItem>
        ) : (
          options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.id}
              checked={option.selected}
              onCheckedChange={() => onToggle(option.id)}
              className={capitalize ? "capitalize" : undefined}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))
        )}
        {selectedCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClear} className="text-xs">
              Clear
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
