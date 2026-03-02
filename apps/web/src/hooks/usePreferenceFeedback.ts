import { useCallback, useEffect, useState } from "react";
import type { TaskRClient } from "../lib/client";
import type { ApiFetchResponse } from "../lib/apiFetch";
import { resolveErrorMessage } from "../lib/errorUtils";
import type { ViewMode } from "../types/shell";
import { env } from "../config/env";

const API_BASE = env.taskrApiBase;
const TENANT_ID = env.tenantId;
const PREFERENCE_MODEL_SLUG = env.preferenceModelSlug;

type PreferenceModel = {
  model_id: string;
  slug: string;
  name: string;
  status: string;
};

type PreferenceRolloutSnapshot = {
  rollout_id: string;
  variant_id: string | null;
  variant_key: string | null;
  stage: string | null;
  current_rate: number | null;
  target_rate: number | null;
  safety_status: string;
  total_feedback: number;
  positive: number;
  negative: number;
  negative_ratio: number;
  guardrail_evaluated_at?: string | null;
  last_feedback_at?: string | null;
};

export type PreferenceSummary = {
  model_id: string;
  variant_id: string | null;
  total_feedback: number;
  positive: number;
  negative: number;
  avg_rating: number | null;
  negative_ratio: number;
  safety_status: string;
  guardrail_evaluated_at?: string | null;
  last_feedback_at?: string | null;
  rollouts: PreferenceRolloutSnapshot[];
};

type UsePreferenceFeedbackParams = {
  viewMode: ViewMode;
  activeTaskId: string | null;
  selectedListId: string | null;
  setActiveTaskId: (id: string | null) => void;
  apiFetch: (url: string, init?: RequestInit & { method?: string }) => Promise<ApiFetchResponse>;
  client: TaskRClient;
};

export function usePreferenceFeedback({
  viewMode,
  activeTaskId,
  selectedListId,
  setActiveTaskId,
  apiFetch,
  client
}: UsePreferenceFeedbackParams) {
  const [preferenceModelId, setPreferenceModelId] = useState<string | null>(null);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [preferenceSummary, setPreferenceSummary] = useState<PreferenceSummary | null>(null);
  const [preferenceSummaryError, setPreferenceSummaryError] = useState<string | null>(null);

  // Load preference models
  useEffect(() => {
    if (!PREFERENCE_MODEL_SLUG) {
      return;
    }
    const controller = new AbortController();
    const loadPreferenceModels = async () => {
      try {
        const models = await client.request<PreferenceModel[]>({
          path: "/preferences/models",
          method: "GET",
          signal: controller.signal
        });
        const match = models.find((model) => model.slug.toLowerCase() === PREFERENCE_MODEL_SLUG);
        if (match) {
          setPreferenceModelId(match.model_id);
          setPreferenceError(null);
        } else if (models.length > 0) {
          setPreferenceModelId(models[0].model_id);
          setPreferenceError(
            `Preference model '${PREFERENCE_MODEL_SLUG}' not found; defaulting to ${models[0].slug}`
          );
        } else {
          setPreferenceModelId(null);
          setPreferenceError("No preference models available. Feedback will be disabled.");
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to load preference models", err);
        setPreferenceError(resolveErrorMessage(err, "Unable to load preference models"));
      }
    };

    void loadPreferenceModels();

    return () => {
      controller.abort();
    };
  }, [client]);

  // Load preference summary when on dashboard
  useEffect(() => {
    if (!preferenceModelId || viewMode !== "dashboard") {
      if (viewMode !== "dashboard") {
        setPreferenceSummary(null);
      }
      return;
    }
    const controller = new AbortController();
    setPreferenceSummaryError(null);
    apiFetch(`${API_BASE}/preferences/models/${preferenceModelId}/summary`, {
      headers: { "x-tenant-id": TENANT_ID },
      signal: controller.signal
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load preference summary: ${res.status}`);
        }
        return res.json();
      })
      .then((data: PreferenceSummary) => {
        setPreferenceSummary({ ...data, rollouts: data.rollouts ?? [] });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load preference summary", err);
        setPreferenceSummaryError("Unable to load preference guardrail metrics");
        setPreferenceSummary(null);
      });

    return () => {
      controller.abort();
    };
  }, [apiFetch, preferenceModelId, viewMode]);

  const handlePreferenceFeedback = useCallback(
    (taskId: string, rating: number) => {
      setActiveTaskId(taskId);
      if (!preferenceModelId) {
        if (preferenceError) {
          console.warn(preferenceError);
        }
        return;
      }
      const payload = {
        model_id: preferenceModelId,
        variant_id: null,
        task_id: taskId,
        user_id: null,
        source: "web",
        signal_type: "thumbs",
        rating,
        metadata_json: {
          list_id: selectedListId,
          view_mode: viewMode
        }
      };
      apiFetch(`${API_BASE}/preferences/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": TENANT_ID
        },
        body: JSON.stringify(payload)
      }).catch((err) => console.error("Failed to record preference feedback", err));
    },
    [apiFetch, preferenceModelId, preferenceError, selectedListId, viewMode, setActiveTaskId]
  );

  // Hotkey listener for preference feedback
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!activeTaskId) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select") {
          return;
        }
      }
      if (event.key === "]") {
        event.preventDefault();
        handlePreferenceFeedback(activeTaskId, 1);
      } else if (event.key === "[") {
        event.preventDefault();
        handlePreferenceFeedback(activeTaskId, -1);
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [activeTaskId, handlePreferenceFeedback]);

  return {
    preferenceModelId,
    preferenceError,
    preferenceSummary,
    preferenceSummaryError,
    handlePreferenceFeedback
  };
}
