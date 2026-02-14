import { useCallback, useEffect, useState } from "react";
import type {
  AnalyticsSummary,
  OverdueSummary,
  StatusSummary,
  ThroughputHistogram,
  VelocitySeries,
  WorkloadSummary
} from "@dydact/taskr-api-client";
import { ApiError } from "@dydact/taskr-api-client";

import { useTaskRClient } from "../lib/taskrClient";

type AnalyticsData = {
  summary: AnalyticsSummary | null;
  status: StatusSummary | null;
  workload: WorkloadSummary | null;
  throughput: ThroughputHistogram | null;
  velocity: VelocitySeries | null;
  overdue: OverdueSummary | null;
};

const EMPTY_DATA: AnalyticsData = {
  summary: null,
  status: null,
  workload: null,
  throughput: null,
  velocity: null,
  overdue: null
};

export const useAnalytics = (spaceSlug: string | null | undefined, listId: string | null | undefined) => {
  const client = useTaskRClient();
  const [data, setData] = useState<AnalyticsData>(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setRefreshToken((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!spaceSlug) {
      setData(EMPTY_DATA);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [summary, status, workload, throughput, velocity, overdue] = await Promise.all([
          client.analytics.summary(spaceSlug, listId ?? undefined),
          client.analytics.statusSummary(spaceSlug, listId ?? undefined),
          client.analytics.workload(spaceSlug),
          client.analytics.throughput(spaceSlug, { weeks: 12, listId: listId ?? undefined }),
          client.analytics.velocity(spaceSlug, { days: 28 }),
          client.analytics.overdue(spaceSlug, listId ?? undefined)
        ]);

        if (!cancelled) {
          setData({
            summary,
            status,
            workload,
            throughput,
            velocity,
            overdue
          });
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.message || `Failed to load analytics (HTTP ${err.status})`
            : err instanceof Error
            ? err.message
            : String(err);
        setError(message);
        setData(EMPTY_DATA);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [client, spaceSlug, listId, refreshToken]);

  return { data, loading, error, refresh };
};
