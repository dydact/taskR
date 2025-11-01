export type DashboardWidgetPosition = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DashboardWidgetType =
  | "status_summary"
  | "workload"
  | "velocity"
  | "burn_down"
  | "cycle_efficiency"
  | "throughput"
  | "overdue"
  | "metric_cards"
  | "open_count"
  | "preference_guardrail";

export type DashboardWidget = {
  widget_id: string;
  widget_type: DashboardWidgetType;
  title: string;
  position: DashboardWidgetPosition;
  config: Record<string, unknown>;
};

export type StatusSummaryEntry = {
  status: string;
  count: number;
};

export type StatusSummary = {
  space_id: string;
  list_id?: string | null;
  entries: StatusSummaryEntry[];
};

export type WorkloadEntry = {
  assignee_id: string | null;
  assignee_email: string | null;
  task_count: number;
  total_minutes: number;
};

export type WorkloadSummary = {
  space_id: string;
  entries: WorkloadEntry[];
};

export type VelocityPoint = {
  date: string;
  completed: number;
};

export type VelocitySeries = {
  space_id: string;
  window_days: number;
  points: VelocityPoint[];
};

export type BurnDownPoint = {
  date: string;
  planned: number;
  completed: number;
  remaining: number;
};

export type BurnDownSeries = {
  space_id: string;
  window_days: number;
  total_scope: number;
  points: BurnDownPoint[];
};

export type CycleEfficiencyMetrics = {
  space_id: string;
  window_days: number;
  sample_size: number;
  avg_cycle_hours: number;
  avg_active_hours: number;
  avg_wait_hours: number;
  efficiency_percent: number;
};

export type ThroughputBucket = {
  week_start: string;
  completed: number;
};

export type ThroughputHistogram = {
  space_id: string;
  window_weeks: number;
  buckets: ThroughputBucket[];
};

export type OverdueSummary = {
  space_id: string;
  total_overdue: number;
  severe_overdue: number;
  avg_days_overdue: number | null;
  due_soon: number;
};

export type MetricCard = {
  key: string;
  label: string;
  value: number;
  delta?: number | null;
  trend?: string | null;
};

export type AnalyticsSummary = {
  space_id: string;
  cards: MetricCard[];
};
