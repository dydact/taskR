import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TaskRClient } from "../lib/client";
import type { ApiFetchResponse } from "../lib/apiFetch";
import type {
  AnalyticsSummary,
  BurnDownSeries,
  CycleEfficiencyMetrics,
  DashboardWidget,
  DashboardWidgetType,
  StatusSummary,
  ThroughputHistogram as ThroughputHistogramData,
  VelocitySeries,
  WorkloadSummary,
  OverdueSummary
} from "../types/dashboard";
import type { SpaceSummary } from "../types/hierarchy";
import type { ViewMode } from "../types/shell";
import { packDashboardWidgets } from "../components/dashboard/DashboardGrid";

type Dashboard = {
  dashboard_id: string;
  space_id: string;
  slug: string;
  name: string;
  layout: DashboardWidget[];
  metadata_json?: Record<string, unknown>;
};

type Space = SpaceSummary;

type UseDashboardParams = {
  viewMode: ViewMode;
  selectedSpaceId: string | null;
  spaces: Space[];
  client: TaskRClient;
  showToast: (input: { message: string; variant?: "info" | "success" | "error"; detail?: string }) => void;
};

export function useDashboard({
  viewMode,
  selectedSpaceId,
  spaces,
  client,
  showToast
}: UseDashboardParams) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dashboardWidgets, setDashboardWidgets] = useState<DashboardWidget[]>([]);
  const [statusSummary, setStatusSummary] = useState<StatusSummary | null>(null);
  const [workloadSummary, setWorkloadSummary] = useState<WorkloadSummary | null>(null);
  const [velocitySeries, setVelocitySeries] = useState<VelocitySeries | null>(null);
  const [burnDownSeries, setBurnDownSeries] = useState<BurnDownSeries | null>(null);
  const [cycleEfficiencyMetrics, setCycleEfficiencyMetrics] = useState<CycleEfficiencyMetrics | null>(null);
  const [throughputHistogram, setThroughputHistogram] = useState<ThroughputHistogramData | null>(null);
  const [overdueSummary, setOverdueSummary] = useState<OverdueSummary | null>(null);
  const [analyticsSummaryData, setAnalyticsSummaryData] = useState<AnalyticsSummary | null>(null);
  const [isEditingDashboard, setIsEditingDashboard] = useState(false);
  const [isSavingDashboard, setIsSavingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsReloadKey, setAnalyticsReloadKey] = useState(0);
  const dashboardCacheRef = useRef<Map<string, { ts: number; data: unknown }>>(new Map());
  const isEditingRef = useRef(false);

  const sortWidgets = useCallback(
    (widgets: DashboardWidget[]) =>
      [...widgets].sort((a, b) => {
        if (a.position.y === b.position.y) {
          return a.position.x - b.position.x;
        }
        return a.position.y - b.position.y;
      }),
    []
  );

  // Sync dashboard widgets from dashboard layout
  useEffect(() => {
    if (!dashboard) {
      setDashboardWidgets([]);
      return;
    }
    if (isEditingDashboard) {
      return;
    }
    setDashboardWidgets(sortWidgets(dashboard.layout));
  }, [dashboard, isEditingDashboard, sortWidgets]);

  // Exit edit mode when leaving dashboard view
  useEffect(() => {
    if (viewMode !== "dashboard" && isEditingDashboard) {
      setIsEditingDashboard(false);
    }
  }, [viewMode, isEditingDashboard]);

  // Track editing ref
  useEffect(() => {
    isEditingRef.current = isEditingDashboard;
  }, [isEditingDashboard]);

  // Fetch dashboard and analytics data
  useEffect(() => {
    if (viewMode !== "dashboard" || !selectedSpaceId) {
      return;
    }
    const space = spaces.find((s) => s.space_id === selectedSpaceId);
    if (!space) return;
    const identifier = space.slug ?? selectedSpaceId;
    let cancelled = false;
    setAnalyticsError(null);
    setDashboardError(null);
    setStatusSummary(null);
    setWorkloadSummary(null);
    setVelocitySeries(null);
    setBurnDownSeries(null);
    setCycleEfficiencyMetrics(null);
    setThroughputHistogram(null);
    setOverdueSummary(null);
    setAnalyticsSummaryData(null);

    const fetchDashboardData = async () => {
      try {
        const data = await client.request<Dashboard>({
          path: `/dashboards/spaces/${identifier}`,
          method: "GET"
        });
        if (cancelled) return;
        const normalized = sortWidgets(data.layout);
        setDashboard({ ...data, layout: normalized });
        if (!isEditingRef.current) {
          setDashboardWidgets(normalized);
        }
      } catch (err) {
        console.error("Failed to load dashboard", err);
        if (!cancelled) {
          setDashboard(null);
          setDashboardWidgets([]);
          setDashboardError("Unable to load dashboard layout");
        }
      }
    };

    const fetchJsonCached = async (path: string, ttlMs = 30000) => {
      const now = Date.now();
      const cached = dashboardCacheRef.current.get(path);
      if (cached && now - cached.ts < ttlMs) {
        return cached.data;
      }
      const data = await client.request<any>({ path, method: "GET" });
      dashboardCacheRef.current.set(path, { ts: now, data });
      return data;
    };

    const fetchAnalytics = async () => {
      const layoutSource = dashboardWidgets.length > 0 ? dashboardWidgets : dashboard?.layout ?? [];
      const configFor = (type: DashboardWidgetType): Record<string, unknown> => {
        const widget = layoutSource.find((item) => item.widget_type === type);
        return widget?.config ?? {};
      };

      const velocityConfig = configFor("velocity");
      const burnConfig = configFor("burn_down");
      const cycleConfig = configFor("cycle_efficiency");
      const throughputConfig = configFor("throughput");

      const velocityDays = Number(velocityConfig.window_days) || 30;
      const burnDays = Number(burnConfig.days) || 14;
      const cycleDays = Number(cycleConfig.days) || 30;
      const throughputWeeks = Number(throughputConfig.weeks) || 12;

      try {
        const [statusData, workloadData, velocityData, burnData, cycleData, throughputData, overdueData, summaryData] =
          await Promise.all([
            fetchJsonCached(`/analytics/spaces/${identifier}/status-summary`),
            fetchJsonCached(`/analytics/spaces/${identifier}/workload`),
            fetchJsonCached(`/analytics/spaces/${identifier}/velocity?days=${velocityDays}`),
            fetchJsonCached(`/analytics/spaces/${identifier}/burn-down?days=${burnDays}`),
            fetchJsonCached(`/analytics/spaces/${identifier}/cycle-efficiency?days=${cycleDays}`),
            fetchJsonCached(`/analytics/spaces/${identifier}/throughput?weeks=${throughputWeeks}`),
            fetchJsonCached(`/analytics/spaces/${identifier}/overdue`),
            fetchJsonCached(`/analytics/spaces/${identifier}/summary`)
          ]);

        if (cancelled) return;
        setStatusSummary(statusData);
        setWorkloadSummary(workloadData);
        setVelocitySeries(velocityData);
        setBurnDownSeries(burnData);
        setCycleEfficiencyMetrics(cycleData);
        setThroughputHistogram(throughputData);
        setOverdueSummary(overdueData);
        setAnalyticsSummaryData(summaryData);
      } catch (err) {
        console.error("Failed to load analytics", err);
        if (!cancelled) {
          setStatusSummary(null);
          setWorkloadSummary(null);
          setVelocitySeries(null);
          setBurnDownSeries(null);
          setCycleEfficiencyMetrics(null);
          setThroughputHistogram(null);
          setOverdueSummary(null);
          setAnalyticsSummaryData(null);
          setAnalyticsError("Unable to load analytics");
        }
      }
    };

    fetchDashboardData();
    fetchAnalytics();

    return () => {
      cancelled = true;
    };
  }, [client, viewMode, selectedSpaceId, spaces, sortWidgets, analyticsReloadKey]);

  const layoutDirty = useMemo(() => {
    if (!dashboard) return false;
    const saved = sortWidgets(dashboard.layout);
    if (saved.length !== dashboardWidgets.length) {
      return true;
    }
    for (let i = 0; i < saved.length; i += 1) {
      const a = saved[i];
      const b = dashboardWidgets[i];
      if (a.widget_id !== b.widget_id) {
        return true;
      }
      if (JSON.stringify(a.position) !== JSON.stringify(b.position)) {
        return true;
      }
    }
    return false;
  }, [dashboard, dashboardWidgets, sortWidgets]);

  const handleDashboardLayoutChange = useCallback((nextWidgets: DashboardWidget[]) => {
    setDashboardWidgets(nextWidgets);
  }, []);

  const handleStartDashboardEdit = useCallback(() => {
    if (dashboard) {
      const normalized = packDashboardWidgets(sortWidgets(dashboard.layout));
      setDashboardWidgets(normalized);
    }
    setIsEditingDashboard(true);
  }, [dashboard, sortWidgets]);

  const handleCancelDashboardEdit = useCallback(() => {
    if (dashboard) {
      setDashboardWidgets(sortWidgets(dashboard.layout));
    }
    setIsEditingDashboard(false);
  }, [dashboard, sortWidgets]);

  const handleResetDashboard = useCallback(() => {
    if (dashboard) {
      const normalized = isEditingDashboard
        ? packDashboardWidgets(sortWidgets(dashboard.layout))
        : sortWidgets(dashboard.layout);
      setDashboardWidgets(normalized);
    }
  }, [dashboard, isEditingDashboard, sortWidgets]);

  const handleSaveDashboard = useCallback(async () => {
    if (!dashboard || !selectedSpaceId) return;
    const space = spaces.find((s) => s.space_id === selectedSpaceId);
    if (!space) return;
    const identifier = space.slug ?? selectedSpaceId;
    setIsSavingDashboard(true);
    try {
      const payload = {
        name: dashboard.name,
        layout: dashboardWidgets.map((widget) => ({
          ...widget,
          position: { ...widget.position }
        })),
        metadata_json: dashboard.metadata_json ?? {}
      };
      const saved = await client.request<Dashboard>({
        path: `/dashboards/spaces/${identifier}`,
        method: "PUT" as any,
        body: payload
      });
      const normalized = sortWidgets(saved.layout);
      setDashboard({ ...saved, layout: normalized });
      setDashboardWidgets(normalized);
      setIsEditingDashboard(false);
    } catch (err) {
      console.error("Failed to save dashboard", err);
      setDashboardError("Unable to save dashboard");
    } finally {
      setIsSavingDashboard(false);
    }
  }, [client, dashboard, selectedSpaceId, spaces, dashboardWidgets, sortWidgets]);

  const refreshAnalytics = useCallback(() => {
    setAnalyticsReloadKey((key) => key + 1);
  }, []);

  return {
    dashboard,
    dashboardWidgets,
    isEditingDashboard,
    isSavingDashboard,
    dashboardError,
    statusSummary,
    workloadSummary,
    velocitySeries,
    burnDownSeries,
    cycleEfficiencyMetrics,
    throughputHistogram,
    overdueSummary,
    analyticsSummaryData,
    analyticsError,
    layoutDirty,
    handleDashboardLayoutChange,
    handleStartDashboardEdit,
    handleCancelDashboardEdit,
    handleResetDashboard,
    handleSaveDashboard,
    refreshAnalytics
  };
}
