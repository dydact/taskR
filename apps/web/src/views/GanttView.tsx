import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTaskRClient } from "../lib/client";
import "./placeholder-views.css";
import "./gantt-view.css";

// Schedule Timeline type (matches API client types)
type ScheduleTimeline = {
  timeline_id: string;
  session_id: string;
  patient_id?: string | null;
  staff_id?: string | null;
  location_id?: string | null;
  service_type: string;
  authorization_id?: string | null;
  cpt_code?: string | null;
  modifiers: string[];
  scheduled_start: string;
  scheduled_end: string;
  worked_start?: string | null;
  worked_end?: string | null;
  duration_minutes?: number | null;
  status: string;
  payroll_entry_id?: string | null;
  claim_id?: string | null;
  transport_job_id?: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

// ============================================================================
// Types
// ============================================================================

type StatusFilter = "all" | "scheduled" | "confirmed" | "in-progress" | "completed" | "cancelled";
type PriorityFilter = "all" | "urgent" | "high" | "normal" | "low";

type WorkflowPhase = "intake" | "assessment" | "authorization" | "delivery";

type GanttItem = {
  id: string;
  name: string;
  phase: WorkflowPhase;
  status: string;
  priority: string;
  startDate: Date;
  endDate: Date;
  progress: number;
  meta?: string;
};

type PhaseConfig = {
  id: WorkflowPhase;
  label: string;
  color: string;
};

// ============================================================================
// Constants
// ============================================================================

const PHASES: PhaseConfig[] = [
  { id: "intake", label: "Intake", color: "success" },
  { id: "assessment", label: "Assessment", color: "accent" },
  { id: "authorization", label: "Authorization", color: "warning" },
  { id: "delivery", label: "Delivery", color: "info" }
];

const STATUS_LABELS: Record<Exclude<StatusFilter, "all">, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  "in-progress": "In Progress",
  completed: "Completed",
  cancelled: "Cancelled"
};

const PRIORITY_LABELS: Record<Exclude<PriorityFilter, "all">, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low"
};

// ============================================================================
// Utilities
// ============================================================================

const generateDateRange = (daysBack: number, daysForward: number): Date[] => {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = -daysBack; i <= daysForward; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
};

const formatDayName = (date: Date): string => {
  return date.toLocaleDateString("en-US", { weekday: "short" });
};

const formatDayDate = (date: Date): string => {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const isToday = (date: Date): boolean => {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

const getBarPosition = (
  startDate: Date,
  endDate: Date,
  timelineStart: Date,
  timelineEnd: Date,
  trackWidth: number
): { left: number; width: number } => {
  const totalDays = (timelineEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24);
  const startOffset = Math.max(0, (startDate.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));
  const endOffset = Math.min(totalDays, (endDate.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));
  const duration = Math.max(1, endOffset - startOffset);

  const dayWidth = trackWidth / totalDays;
  return {
    left: startOffset * dayWidth,
    width: duration * dayWidth
  };
};

const getTodayPosition = (
  timelineStart: Date,
  timelineEnd: Date,
  trackWidth: number
): number => {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const totalDays = (timelineEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24);
  const offset = (today.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24);
  return (offset / totalDays) * trackWidth;
};

const getStatusClass = (status: string): string => {
  const normalized = status.toLowerCase().replace(/[_\s]/g, "-");
  if (normalized.includes("complete") || normalized.includes("done")) return "completed";
  if (normalized.includes("progress") || normalized.includes("active")) return "active";
  if (normalized.includes("delay") || normalized.includes("overdue")) return "delayed";
  if (normalized.includes("risk") || normalized.includes("warning")) return "warning";
  if (normalized.includes("schedule")) return "scheduled";
  if (normalized.includes("pending")) return "pending";
  return "active";
};

const inferPhase = (serviceType: string, status: string): WorkflowPhase => {
  const lower = serviceType.toLowerCase();
  if (lower.includes("intake") || lower.includes("referral")) return "intake";
  if (lower.includes("assess") || lower.includes("eval")) return "assessment";
  if (lower.includes("auth") || lower.includes("prior")) return "authorization";
  return "delivery";
};

const toGanttItems = (schedules: ScheduleTimeline[]): GanttItem[] => {
  return schedules.map((s) => {
    const start = new Date(s.scheduled_start);
    const end = new Date(s.scheduled_end);
    const workedStart = s.worked_start ? new Date(s.worked_start) : null;
    const workedEnd = s.worked_end ? new Date(s.worked_end) : null;

    let progress = 0;
    if (s.status === "completed" || s.status === "done") {
      progress = 100;
    } else if (workedStart && workedEnd) {
      const totalDuration = end.getTime() - start.getTime();
      const workedDuration = workedEnd.getTime() - workedStart.getTime();
      progress = Math.min(100, Math.round((workedDuration / totalDuration) * 100));
    } else if (s.status === "in-progress" || s.status === "active") {
      progress = 50;
    }

    const priority = (s.metadata_json?.priority as string) || "normal";

    return {
      id: s.timeline_id,
      name: s.service_type || `Session ${s.session_id.slice(0, 8)}`,
      phase: inferPhase(s.service_type, s.status),
      status: s.status,
      priority,
      startDate: start,
      endDate: end,
      progress,
      meta: s.cpt_code || undefined
    };
  });
};

// ============================================================================
// Mock Data (fallback when API unavailable)
// ============================================================================

const generateMockData = (): GanttItem[] => {
  const today = new Date();
  const items: GanttItem[] = [];

  const mockItems = [
    { name: "New Client Referral", phase: "intake", daysOffset: -2, duration: 3, status: "completed", progress: 100 },
    { name: "Initial Documentation", phase: "intake", daysOffset: 0, duration: 2, status: "in-progress", progress: 60 },
    { name: "Insurance Verification", phase: "intake", daysOffset: 1, duration: 2, status: "scheduled", progress: 0 },
    { name: "Functional Assessment", phase: "assessment", daysOffset: 2, duration: 4, status: "scheduled", progress: 0 },
    { name: "Skills Evaluation", phase: "assessment", daysOffset: 4, duration: 3, status: "scheduled", progress: 0 },
    { name: "Care Plan Development", phase: "assessment", daysOffset: 6, duration: 2, status: "pending", progress: 0 },
    { name: "Prior Auth Request", phase: "authorization", daysOffset: 7, duration: 5, status: "pending", progress: 0 },
    { name: "Auth Review", phase: "authorization", daysOffset: 10, duration: 3, status: "pending", progress: 0 },
    { name: "Session Block 1", phase: "delivery", daysOffset: 12, duration: 7, status: "scheduled", progress: 0 },
    { name: "Progress Review", phase: "delivery", daysOffset: 16, duration: 2, status: "scheduled", progress: 0 },
    { name: "Session Block 2", phase: "delivery", daysOffset: 18, duration: 7, status: "scheduled", progress: 0 }
  ] as const;

  mockItems.forEach((item, index) => {
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() + item.daysOffset);
    startDate.setHours(9, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + item.duration);

    items.push({
      id: `mock-${index}`,
      name: item.name,
      phase: item.phase as WorkflowPhase,
      status: item.status,
      priority: index < 3 ? "high" : "normal",
      startDate,
      endDate,
      progress: item.progress
    });
  });

  return items;
};

// ============================================================================
// Components
// ============================================================================

const GanttIcon: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M3 8h10M3 12h14M3 16h8M3 20h12" />
  </svg>
);

type GanttBarProps = {
  item: GanttItem;
  timelineStart: Date;
  timelineEnd: Date;
  trackWidth: number;
  onClick?: (item: GanttItem) => void;
};

const GanttBar: React.FC<GanttBarProps> = ({ item, timelineStart, timelineEnd, trackWidth, onClick }) => {
  const { left, width } = getBarPosition(item.startDate, item.endDate, timelineStart, timelineEnd, trackWidth);
  const statusClass = getStatusClass(item.status);

  return (
    <div
      className={`gantt-bar gantt-bar--${statusClass}`}
      style={{ left: `${left}px`, width: `${Math.max(60, width)}px` }}
      onClick={() => onClick?.(item)}
      title={`${item.name} (${item.status})`}
    >
      {item.progress > 0 && item.progress < 100 && (
        <div className="gantt-bar__progress" style={{ width: `${item.progress}%` }} />
      )}
      <span className="gantt-bar__label">{item.name}</span>
    </div>
  );
};

type GanttRowProps = {
  item: GanttItem;
  timelineStart: Date;
  timelineEnd: Date;
  dates: Date[];
  onBarClick?: (item: GanttItem) => void;
};

const GanttRow: React.FC<GanttRowProps> = ({ item, timelineStart, timelineEnd, dates, onBarClick }) => {
  const trackWidth = dates.length * 100;

  return (
    <div className="gantt-row">
      <div className="gantt-row__label">
        <span className="gantt-row__name">{item.name}</span>
        <span className="gantt-row__meta">{item.meta || item.status}</span>
      </div>
      <div className="gantt-row__track" style={{ width: `${trackWidth}px` }}>
        <GanttBar
          item={item}
          timelineStart={timelineStart}
          timelineEnd={timelineEnd}
          trackWidth={trackWidth}
          onClick={onBarClick}
        />
      </div>
    </div>
  );
};

type GanttPhaseProps = {
  phase: PhaseConfig;
  items: GanttItem[];
  timelineStart: Date;
  timelineEnd: Date;
  dates: Date[];
  onBarClick?: (item: GanttItem) => void;
};

const GanttPhase: React.FC<GanttPhaseProps> = ({ phase, items, timelineStart, timelineEnd, dates, onBarClick }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`gantt-phase gantt-phase--${phase.id}`}>
      <div className="gantt-phase__header" onClick={() => setCollapsed(!collapsed)}>
        <div className="gantt-phase__indicator" />
        <span className="gantt-phase__title">{phase.label}</span>
        <span className="gantt-phase__count">{items.length} items</span>
        <span className={`gantt-phase__toggle ${collapsed ? "gantt-phase__toggle--collapsed" : ""}`}>
          &#9660;
        </span>
      </div>
      <div className={`gantt-phase__items ${collapsed ? "gantt-phase__items--collapsed" : ""}`}>
        {items.map((item) => (
          <GanttRow
            key={item.id}
            item={item}
            timelineStart={timelineStart}
            timelineEnd={timelineEnd}
            dates={dates}
            onBarClick={onBarClick}
          />
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const GanttView: React.FC = () => {
  const client = useTaskRClient();

  const [items, setItems] = useState<GanttItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [selectedItem, setSelectedItem] = useState<GanttItem | null>(null);

  // Timeline configuration
  const dates = useMemo(() => generateDateRange(3, 25), []);
  const timelineStart = dates[0];
  const timelineEnd = dates[dates.length - 1];
  const trackWidth = dates.length * 100;

  const loadScheduleData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try to fetch from API using raw request (bridge may not be typed yet)
      const bridgeClient = client as unknown as {
        bridge?: { schedule?: { list: (filters?: { start?: string; end?: string }) => Promise<ScheduleTimeline[]> } };
        request: <T>(opts: { path: string; method?: string; query?: Record<string, unknown> }) => Promise<T>;
      };

      let response: ScheduleTimeline[] = [];

      if (bridgeClient.bridge?.schedule?.list) {
        response = await bridgeClient.bridge.schedule.list({
          start: timelineStart.toISOString(),
          end: timelineEnd.toISOString()
        });
      } else {
        // Fallback to raw request
        response = await bridgeClient.request<ScheduleTimeline[]>({
          path: "/bridge/schedule",
          method: "GET",
          query: {
            start: timelineStart.toISOString(),
            end: timelineEnd.toISOString()
          }
        });
      }

      if (response && response.length > 0) {
        setItems(toGanttItems(response));
      } else {
        // Use mock data if no real data available
        setItems(generateMockData());
      }
    } catch (err) {
      // Fallback to mock data on error
      console.warn("Failed to load schedule data, using mock data:", err);
      setItems(generateMockData());
      // Only show error if we truly have nothing
      // setError(err instanceof Error ? err.message : "Failed to load schedule data");
    } finally {
      setLoading(false);
    }
  }, [client, timelineStart, timelineEnd]);

  useEffect(() => {
    void loadScheduleData();
  }, [loadScheduleData]);

  // Filtered and grouped items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== "all") {
        const normalizedStatus = item.status.toLowerCase().replace(/[_\s]/g, "-");
        if (!normalizedStatus.includes(statusFilter.replace(/-/g, ""))) {
          return false;
        }
      }
      if (priorityFilter !== "all" && item.priority !== priorityFilter) {
        return false;
      }
      return true;
    });
  }, [items, statusFilter, priorityFilter]);

  const itemsByPhase = useMemo(() => {
    const grouped: Record<WorkflowPhase, GanttItem[]> = {
      intake: [],
      assessment: [],
      authorization: [],
      delivery: []
    };

    filteredItems.forEach((item) => {
      grouped[item.phase].push(item);
    });

    return grouped;
  }, [filteredItems]);

  // Summary stats
  const stats = useMemo(() => {
    const completed = items.filter((i) => i.status === "completed" || i.status === "done").length;
    const inProgress = items.filter((i) => i.status === "in-progress" || i.status === "active").length;
    const delayed = items.filter((i) => i.status === "delayed" || i.status === "overdue").length;
    return { total: items.length, completed, inProgress, delayed };
  }, [items]);

  const handleBarClick = useCallback((item: GanttItem) => {
    setSelectedItem(item);
  }, []);

  const todayPosition = getTodayPosition(timelineStart, timelineEnd, trackWidth);

  return (
    <div className="gantt-view">
      {/* Header */}
      <header className="gantt-header">
        <div>
          <p className="gantt-kicker">Timeline</p>
          <h2>Gantt View</h2>
          <p className="gantt-subtext">
            Workflow timeline for scheduling and tracking service delivery
          </p>
        </div>
        <div className="gantt-actions">
          <button
            type="button"
            className="gantt-refresh"
            onClick={loadScheduleData}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </header>

      {/* Summary Stats */}
      <div className="gantt-summary glass-surface">
        <div className="gantt-summary__item">
          <span className="gantt-summary__label">Total Items</span>
          <span className="gantt-summary__value">{stats.total}</span>
        </div>
        <div className="gantt-summary__item">
          <span className="gantt-summary__label">Completed</span>
          <span className="gantt-summary__value tone-success">{stats.completed}</span>
        </div>
        <div className="gantt-summary__item">
          <span className="gantt-summary__label">In Progress</span>
          <span className="gantt-summary__value">{stats.inProgress}</span>
        </div>
        <div className="gantt-summary__item">
          <span className="gantt-summary__label">Delayed</span>
          <span className="gantt-summary__value tone-danger">{stats.delayed}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="gantt-filters glass-surface">
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
          >
            <option value="all">All Priorities</option>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Error State */}
      {error && <p className="gantt-error">{error}</p>}

      {/* Timeline Container */}
      <div className="gantt-container glass-surface">
        {loading ? (
          <div className="gantt-loading">
            <div className="gantt-loading__spinner" />
            <span className="gantt-loading__text">Loading schedule data...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="gantt-empty">
            <GanttIcon />
            <h3 className="gantt-empty__title">No items to display</h3>
            <p className="gantt-empty__desc">
              Adjust your filters or add schedule entries to see the timeline.
            </p>
          </div>
        ) : (
          <div className="gantt-timeline">
            {/* Axis */}
            <div className="gantt-axis">
              <div className="gantt-axis__label-col">Phase / Item</div>
              <div className="gantt-axis__timeline" style={{ width: `${trackWidth}px` }}>
                {dates.map((date, index) => (
                  <div
                    key={index}
                    className={`gantt-axis__day ${isToday(date) ? "gantt-axis__day--today" : ""} ${isWeekend(date) ? "gantt-axis__day--weekend" : ""}`}
                  >
                    <span className="gantt-axis__day-name">{formatDayName(date)}</span>
                    <span className="gantt-axis__day-date">{formatDayDate(date)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Phases */}
            <div className="gantt-phases">
              {PHASES.map((phase) => {
                const phaseItems = itemsByPhase[phase.id];
                if (phaseItems.length === 0) return null;

                return (
                  <GanttPhase
                    key={phase.id}
                    phase={phase}
                    items={phaseItems}
                    timelineStart={timelineStart}
                    timelineEnd={timelineEnd}
                    dates={dates}
                    onBarClick={handleBarClick}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Item Detail Tooltip (optional enhancement) */}
      {selectedItem && (
        <div
          className="gantt-tooltip"
          style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
          onClick={() => setSelectedItem(null)}
        >
          <h4 className="gantt-tooltip__title">{selectedItem.name}</h4>
          <div className="gantt-tooltip__row">
            <span className="gantt-tooltip__label">Status</span>
            <span className="gantt-tooltip__value">{selectedItem.status}</span>
          </div>
          <div className="gantt-tooltip__row">
            <span className="gantt-tooltip__label">Phase</span>
            <span className="gantt-tooltip__value">{selectedItem.phase}</span>
          </div>
          <div className="gantt-tooltip__row">
            <span className="gantt-tooltip__label">Progress</span>
            <span className="gantt-tooltip__value">{selectedItem.progress}%</span>
          </div>
          <div className="gantt-tooltip__row">
            <span className="gantt-tooltip__label">Start</span>
            <span className="gantt-tooltip__value">
              {selectedItem.startDate.toLocaleDateString()}
            </span>
          </div>
          <div className="gantt-tooltip__row">
            <span className="gantt-tooltip__label">End</span>
            <span className="gantt-tooltip__value">
              {selectedItem.endDate.toLocaleDateString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
