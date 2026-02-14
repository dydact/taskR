const trimTrailingSlash = (value: string | undefined | null) => {
  if (!value) return "";
  return value.replace(/\/$/, "");
};

const resolveNumber = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
};

const DEFAULT_TENANT = "demo";
const DEFAULT_USER = "demo-user";
const DEFAULT_CLAIMS_PAGE_SIZE = 200;

export const env = {
  tenantId: import.meta.env.VITE_TENANT_ID ?? DEFAULT_TENANT,
  userId: import.meta.env.VITE_TASKR_USER_ID ?? DEFAULT_USER,
  taskrApiBase: trimTrailingSlash(import.meta.env.VITE_TASKR_API ?? ""),
  claimsApiBase: trimTrailingSlash((import.meta.env.VITE_CLAIMS_API_BASE ?? import.meta.env.VITE_TASKR_API) ?? ""),
  preferenceModelSlug: (import.meta.env.VITE_PREFERENCE_MODEL_SLUG ?? "assistant-router").toLowerCase(),
  taskPageSize: resolveNumber(import.meta.env.VITE_TASK_PAGE_SIZE, DEFAULT_CLAIMS_PAGE_SIZE),
  chatIconUrl: (import.meta as any).env?.VITE_DYDACT_CHAT_ICON || "/brand/taskr-favicon.png"
} as const;
