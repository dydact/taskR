import { useCallback, useEffect, useMemo, useState } from "react";
import type { CalendarEvent, FreeBusyWindow, ScheduleTimeline } from "@dydact/taskr-api-client";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCcw,
  Sparkles,
  Users
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

type CalendarCell = {
  date: Date;
  key: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
  sessions: ScheduleTimeline[];
  busyWindows: FreeBusyWindow[];
};

type OwnerOption = { id: string; label: string };

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_GRADIENTS: Record<string, string> = {
  scheduled: "from-blue-500/80 to-cyan-500/80",
  worked: "from-emerald-500/80 to-teal-500/80",
  approved: "from-violet-500/80 to-purple-500/80",
  exported: "from-amber-500/80 to-orange-500/80",
  claimed: "from-fuchsia-500/80 to-rose-500/80",
  paid: "from-slate-500/80 to-slate-600/80",
  default: "from-slate-400/70 to-slate-500/70"
};

const BUSY_BADGE_COLORS: Record<string, string> = {
  busy: "bg-rose-500/20 text-rose-200",
  blocked: "bg-orange-500/20 text-orange-200",
  tentative: "bg-amber-500/20 text-amber-200",
  free: "bg-emerald-500/15 text-emerald-200"
};

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const zeroPad = (value: number) => value.toString().padStart(2, "0");

const dayKey = (date: Date) => `${date.getFullYear()}-${zeroPad(date.getMonth() + 1)}-${zeroPad(date.getDate())}`;

const startOfMonth = (anchor: Date) => new Date(anchor.getFullYear(), anchor.getMonth(), 1);

const endOfMonth = (anchor: Date) => new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);

const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

const datesOverlap = (start: Date, end: Date, day: Date) =>
  start <= new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999) &&
  end >= new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);

const readString = (record: Record<string, unknown> | undefined, key: string): string | null => {
  if (!record) return null;
  const raw = record[key];
  return typeof raw === "string" && raw.trim().length > 0 ? raw : null;
};

const readArray = <T,>(record: Record<string, unknown> | undefined, key: string): T[] =>
  Array.isArray(record?.[key]) ? (record?.[key] as T[]) : [];

const formatTimeRange = (startIso?: string | null, endIso?: string | null) => {
  if (!startIso) return null;
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (!Number.isFinite(start.getTime())) return null;
  const startLabel = start.toLocaleTimeString(undefined, opts);
  if (end && Number.isFinite(end.getTime())) {
    return `${startLabel} – ${end.toLocaleTimeString(undefined, opts)}`;
  }
  return startLabel;
};

const extractGuardrailBadges = (metadata: Record<string, unknown> | undefined) => {
  const guardrails: string[] = [];
  const candidates: unknown[] = [
    ...(Array.isArray(metadata?.guardrail_alerts) ? (metadata?.guardrail_alerts as unknown[]) : []),
    ...(Array.isArray(metadata?.guardrails) ? (metadata?.guardrails as unknown[]) : []),
    ...(Array.isArray(metadata?.alerts) ? (metadata?.alerts as unknown[]) : [])
  ];

  candidates.forEach((entry) => {
    if (typeof entry === "string") {
      guardrails.push(entry);
    } else if (entry && typeof entry === "object") {
      const label = readString(entry as Record<string, unknown>, "label") ?? readString(entry as Record<string, unknown>, "message");
      if (label) guardrails.push(label);
    }
  });

  return Array.from(new Set(guardrails));
};

const resolveOwnerLabel = (timeline: ScheduleTimeline) => {
  const metadata = timeline.metadata_json as Record<string, unknown> | undefined;
  return (
    readString(metadata, "staff_name") ??
    readString(metadata, "owner_name") ??
    (timeline.staff_id ? `Owner ${timeline.staff_id.slice(0, 6)}` : "Unassigned")
  );
};

const busyStatusSummary = (windows: FreeBusyWindow[]) => {
  const counts = new Map<string, number>();
  windows.forEach((window) => {
    const key = window.status || "busy";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2);
};

export function CalendarView() {
  const { theme, colors } = useTheme();
  const client = useTaskRClient();
  const [activeMonth, setActiveMonth] = useState(startOfMonth(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [sessions, setSessions] = useState<ScheduleTimeline[]>([]);
  const [busy, setBusy] = useState<FreeBusyWindow[]>([]);
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [showBusyLayers, setShowBusyLayers] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyLoading, setBusyLoading] = useState(false);
  const [busyError, setBusyError] = useState<string | null>(null);

  const isDark = theme === "dark";
  const monthLabel = `${monthNames[activeMonth.getMonth()]} ${activeMonth.getFullYear()}`;

  const rangeStart = useMemo(() => startOfMonth(activeMonth), [activeMonth]);
  const rangeEnd = useMemo(() => endOfMonth(activeMonth), [activeMonth]);
  const rangeStartIso = useMemo(() => rangeStart.toISOString(), [rangeStart]);
  const rangeEndIso = useMemo(() => rangeEnd.toISOString(), [rangeEnd]);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eventPayload, schedulePayload] = await Promise.all([
        client.calendar.events.list(),
        client.bridge.schedule.list({ start: rangeStartIso, end: rangeEndIso })
      ]);
      setEvents(Array.isArray(eventPayload) ? eventPayload : []);
      setSessions(Array.isArray(schedulePayload) ? schedulePayload : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setEvents([]);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [client, rangeStartIso, rangeEndIso]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (!showBusyLayers || selectedOwners.length === 0) {
      setBusy([]);
      setBusyError(null);
      setBusyLoading(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setBusyLoading(true);
      setBusyError(null);
      try {
        const windows = await client.calendar.freebusy.calculate({
          owner_ids: selectedOwners,
          start_at: rangeStartIso,
          end_at: rangeEndIso
        });
        if (!cancelled) {
          setBusy(Array.isArray(windows) ? windows : []);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setBusyError(message);
          setBusy([]);
        }
      } finally {
        if (!cancelled) {
          setBusyLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [client, selectedOwners, rangeStartIso, rangeEndIso, showBusyLayers]);

  const busyMap = useMemo(() => {
    const map = new Map<string, FreeBusyWindow[]>();
    if (!showBusyLayers) {
      return map;
    }
    busy.forEach((window) => {
      const start = startOfDay(new Date(window.start_at));
      const end = startOfDay(new Date(window.end_at));
      if (!(Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()))) return;
      const cursor = new Date(start);
      while (cursor <= end) {
        const key = dayKey(cursor);
        const bucket = map.get(key) ?? [];
        bucket.push(window);
        map.set(key, bucket);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return map;
  }, [busy, showBusyLayers]);

  const statusOptions = useMemo(() => {
    const statuses = new Set<string>();
    sessions.forEach((session) => {
      const status = (session.status ?? "unknown").toString().toLowerCase();
      statuses.add(status);
    });
    return Array.from(statuses.values()).sort();
  }, [sessions]);

  useEffect(() => {
    if (selectedStatuses.length === 0) return;
    setSelectedStatuses((prev) => {
      const allowed = new Set(statusOptions);
      const filtered = prev.filter((status) => allowed.has(status));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [statusOptions, selectedStatuses.length]);

  const eventBuckets = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      const start = startOfDay(new Date(event.start_at));
      const end = startOfDay(new Date(event.end_at));
      if (!(Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()))) return;
      const cursor = new Date(start);
      while (cursor <= end) {
        const key = dayKey(cursor);
        const bucket = map.get(key) ?? [];
        bucket.push(event);
        map.set(key, bucket);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return map;
  }, [events]);

  const sessionBuckets = useMemo(() => {
    const map = new Map<string, ScheduleTimeline[]>();
    sessions.forEach((session) => {
      const start = startOfDay(new Date(session.scheduled_start));
      const end = startOfDay(new Date(session.scheduled_end));
      if (!(Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()))) return;
      const cursor = new Date(start);
      while (cursor <= end) {
        const key = dayKey(cursor);
        const bucket = map.get(key) ?? [];
        bucket.push(session);
        map.set(key, bucket);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return map;
  }, [sessions]);

  const ownerOptions = useMemo<OwnerOption[]>(() => {
    const entries = new Map<string, OwnerOption>();
    sessions.forEach((session) => {
      if (!session.staff_id) return;
      if (entries.has(session.staff_id)) return;
      entries.set(session.staff_id, {
        id: session.staff_id,
        label: resolveOwnerLabel(session)
      });
    });
    busy.forEach((window) => {
      if (!window.owner_id || entries.has(window.owner_id)) return;
      entries.set(window.owner_id, {
        id: window.owner_id,
        label: `Owner ${window.owner_id.slice(0, 6)}`
      });
    });
    return Array.from(entries.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [sessions, busy]);

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

  const calendarCells = useMemo<CalendarCell[]>(() => {
    const firstDayOfMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth(), 1);
    const firstWeekday = firstDayOfMonth.getDay();
    const totalDaysInMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 0).getDate();
    const totalDaysInPrevMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth(), 0).getDate();

    const todayKey = dayKey(new Date());
    const cells: CalendarCell[] = [];

    for (let index = 0; index < 42; index += 1) {
      const dayOffset = index - firstWeekday + 1;
      let cellDate: Date;
      let isCurrentMonth = true;
      if (dayOffset <= 0) {
        cellDate = new Date(activeMonth.getFullYear(), activeMonth.getMonth() - 1, totalDaysInPrevMonth + dayOffset);
        isCurrentMonth = false;
      } else if (dayOffset > totalDaysInMonth) {
        cellDate = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, dayOffset - totalDaysInMonth);
        isCurrentMonth = false;
      } else {
        cellDate = new Date(activeMonth.getFullYear(), activeMonth.getMonth(), dayOffset);
      }
      const key = dayKey(cellDate);
      cells.push({
        date: cellDate,
        key,
        isCurrentMonth,
        isToday: key === todayKey,
        events: eventBuckets.get(key) ?? [],
        sessions: (sessionBuckets.get(key) ?? []).filter((session) =>
          filteredSessions.includes(session)
        ),
        busyWindows: busyMap.get(key) ?? []
      });
    }

    return cells;
  }, [activeMonth, eventBuckets, sessionBuckets, busyMap, filteredSessions]);

  const onNextMonth = () =>
    setActiveMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));

  const onPrevMonth = () =>
    setActiveMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));

  const onToday = () => setActiveMonth(startOfMonth(new Date()));

  const toggleOwner = (ownerId: string) =>
    setSelectedOwners((prev) =>
      prev.includes(ownerId) ? prev.filter((id) => id !== ownerId) : [...prev, ownerId]
    );

  return (
    <section className={cn("rounded-2xl border shadow-2xl", colors.cardBackground, colors.cardBorder)}>
      <header className={cn("px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3", colors.cardBorder)}>
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isDark ? "bg-white/10" : "bg-violet-100")}>
            <CalendarDays className={cn("w-5 h-5", colors.text)} />
          </div>
          <div>
            <p className={cn("text-xs uppercase tracking-wide font-semibold", colors.textSecondary)}>Schedule</p>
            <h2 className={cn("text-lg font-semibold", colors.text)}>{monthLabel}</h2>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPrevMonth}
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
            onClick={onToday}
            className={cn(
              "px-4 rounded-xl text-xs font-semibold",
              colors.textSecondary,
              isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
            )}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNextMonth}
            className={cn(
              "rounded-xl",
              colors.textSecondary,
              isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
            )}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-xl gap-2",
                  colors.textSecondary,
                  isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
                )}
              >
                <Users className="w-4 h-4" />
                {selectedOwners.length === 0 ? "All owners" : `${selectedOwners.length} owner${selectedOwners.length === 1 ? "" : "s"}`}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className={cn(colors.cardBackground, colors.cardBorder)}>
              <DropdownMenuLabel className="text-xs uppercase tracking-wide">Filter owners</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ownerOptions.length === 0 ? (
                <DropdownMenuItem disabled>No owners detected</DropdownMenuItem>
              ) : (
                ownerOptions.map((owner) => (
                  <DropdownMenuCheckboxItem
                    key={owner.id}
                    checked={selectedOwners.includes(owner.id)}
                    onCheckedChange={() => toggleOwner(owner.id)}
                  >
                    {owner.label}
                  </DropdownMenuCheckboxItem>
                ))
              )}
              {selectedOwners.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setSelectedOwners([])}
                    className="text-xs"
                  >
                    Clear
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-xl gap-2",
                  colors.textSecondary,
                  isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
                )}
              >
                Status
                {selectedStatuses.length > 0 && (
                  <Badge className="bg-violet-500/20 text-violet-200 border-0 text-[10px]">
                    {selectedStatuses.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className={cn(colors.cardBackground, colors.cardBorder, "w-40")}>
              <DropdownMenuLabel className="text-xs uppercase tracking-wide">Filter status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {statusOptions.length === 0 ? (
                <DropdownMenuItem disabled>No statuses detected</DropdownMenuItem>
              ) : (
                statusOptions.map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={selectedStatuses.includes(status)}
                    onCheckedChange={() =>
                      setSelectedStatuses((prev) =>
                        prev.includes(status)
                          ? prev.filter((value) => value !== status)
                          : [...prev, status]
                      )
                    }
                    className="capitalize"
                  >
                    {status.replace(/_/g, " ")}
                  </DropdownMenuCheckboxItem>
                ))
              )}
              {selectedStatuses.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSelectedStatuses([])} className="text-xs">
                    Clear
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowBusyLayers((prev) => !prev)}
            className={cn(
              "rounded-xl gap-2",
              colors.textSecondary,
              isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
            )}
          >
            {showBusyLayers ? "Hide Busy" : "Show Busy"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refreshData()}
            className={cn(
              "rounded-xl gap-2",
              colors.textSecondary,
              isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
            )}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            Refresh
          </Button>
        </div>
      </header>

      {(error || busyError) && (
        <div className="px-6 py-3 border-b border-red-500/30 bg-red-500/5 text-sm text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error ?? busyError}
        </div>
      )}

      <div className="px-6 py-4">
        <div className="grid grid-cols-7 gap-2 mb-3 text-[12px] uppercase tracking-wide">
          {DAY_LABELS.map((label) => (
            <div key={label} className={cn("text-center font-medium", colors.textSecondary)}>
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {calendarCells.map((cell) => {
            const dayNumber = cell.date.getDate();
            const busySummary = busyStatusSummary(cell.busyWindows);
            return (
              <div
                key={cell.key}
                className={cn(
                  "min-h-[140px] rounded-2xl border transition-all duration-200 px-3 py-3 flex flex-col gap-2",
                  cell.isCurrentMonth
                    ? isDark
                      ? "bg-white/5 hover:bg-white/10"
                      : "bg-white/70 hover:bg-white/90"
                    : isDark
                    ? "bg-white/[0.04] opacity-80"
                    : "bg-slate-100/50 opacity-70",
                  cell.isToday && "ring-2 ring-violet-500/70",
                  colors.cardBorder
                )}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={cn(
                      "flex items-center justify-center rounded-full text-[12px] font-semibold w-7 h-7",
                      cell.isToday
                        ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white"
                        : colors.text
                    )}
                  >
                    {dayNumber}
                  </div>
                  <div className="flex items-center gap-1">
                    {busySummary.map(([status, count]) => (
                      <Badge
                        key={`${cell.key}-${status}`}
                        className={cn(
                          "text-[10px] border-0 px-1.5 py-0.5",
                          BUSY_BADGE_COLORS[status] ?? "bg-slate-500/20 text-slate-300"
                        )}
                      >
                        {status} · {count}
                      </Badge>
                    ))}
                  </div>
                </div>

                <ScrollArea className="flex-1 -mx-3 px-3">
                  <div className="space-y-2 pb-2">
                    {cell.sessions.map((session) => {
                      const metadata = session.metadata_json as Record<string, unknown> | undefined;
                      const guardrails = extractGuardrailBadges(metadata);
                      const billingStatus = readString(metadata, "billing_status");
                      const sourceLabels = readArray<string>(metadata, "sources");
                      const ownerLabel = resolveOwnerLabel(session);
                      const timeLabel = formatTimeRange(session.scheduled_start, session.scheduled_end);
                      const gradient = STATUS_GRADIENTS[session.status?.toLowerCase() ?? ""] ?? STATUS_GRADIENTS.default;
                      return (
                        <div
                          key={`session-${session.session_id}-${session.timeline_id}`}
                          className={cn(
                            "rounded-xl border text-xs text-white px-3 py-2 space-y-1 shadow-sm bg-gradient-to-r",
                            gradient,
                            "transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[12px] font-semibold leading-tight truncate">{session.service_type}</p>
                              {timeLabel && <p className="text-[11px] opacity-90">{timeLabel}</p>}
                            </div>
                            <Badge className="bg-black/25 border-white/10 text-[10px] uppercase tracking-wide">
                              {session.status}
                            </Badge>
                          </div>
                          <div className="flex items-center flex-wrap gap-1.5 text-[10px]">
                            <Badge className="bg-black/25 border-white/10 text-[10px]">
                              {ownerLabel}
                            </Badge>
                            {billingStatus && (
                              <Badge className="bg-emerald-500/30 border-white/10 text-[10px]">
                                {billingStatus}
                              </Badge>
                            )}
                            {sourceLabels.slice(0, 2).map((source) => (
                              <Badge key={source} className="bg-black/25 border-white/10 text-[10px] uppercase">
                                {source}
                              </Badge>
                            ))}
                          </div>
                          {guardrails.length > 0 && (
                            <div className="mt-1 flex items-center gap-1 text-[10px]">
                              <Sparkles className="w-3 h-3" />
                              <span>{guardrails.length} guardrail alert{guardrails.length === 1 ? "" : "s"}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {cell.events.map((event) => {
                      const start = formatTimeRange(event.start_at, event.end_at);
                      const location = event.location ?? readString(event.metadata_json as Record<string, unknown>, "location");
                      return (
                        <div
                          key={`event-${event.event_id}`}
                          className={cn(
                            "rounded-xl border px-3 py-2 text-xs transition-all duration-200",
                            isDark
                              ? "bg-white/10 border-white/10 hover:bg-white/15"
                              : "bg-white border-white/50 hover:bg-white/80"
                          )}
                        >
                          <p className={cn("font-medium text-[12px] truncate", colors.text)}>{event.title}</p>
                          <div className={cn("text-[11px] flex items-center gap-2", colors.textSecondary)}>
                            {start && <span>{start}</span>}
                            {location && <span className="truncate">{location}</span>}
                          </div>
                        </div>
                      );
                    })}
                    {cell.sessions.length === 0 && cell.events.length === 0 && (
                      <div className={cn("text-[11px] italic opacity-70", colors.textSecondary)}>No activity</div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      </div>

      {(loading || busyLoading) && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center rounded-2xl">
          <div className="flex items-center gap-3 text-sm text-white/80">
            <Loader2 className="w-4 h-4 animate-spin" />
            Syncing schedule…
          </div>
        </div>
      )}
    </section>
  );
}
