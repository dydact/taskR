const trimTrailingSlash = (value: string | undefined | null) => {
  if (!value) return "";
  return value.replace(/\/$/, "");
};

const isLocalHost = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost")
  );
};

const isRelativePath = (value: string) => value.startsWith("/") && !value.startsWith("//");

const normalizeDevUrl = (value: string | undefined | null) => {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (isRelativePath(trimmed)) {
    return trimTrailingSlash(trimmed);
  }
  try {
    const url = new URL(trimmed);
    return trimTrailingSlash(url.toString());
  } catch {
    return trimTrailingSlash(trimmed);
  }
};

const deriveDefaultApiBase = () => {
  if (typeof window === "undefined") {
    return "http://localhost:8010";
  }
  try {
    const current = new URL(window.location.href);
    if (isLocalHost(current.hostname)) {
      return "/api";
    }
    return trimTrailingSlash(current.origin);
  } catch {
    return "http://localhost:8010";
  }
};

const parsePositiveInt = (raw: string | undefined, fallback: number) => {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
};

const DEFAULT_TENANT_ID = "demo";
const DEFAULT_USER_ID = "demo-user";
const DEFAULT_TASK_PAGE_SIZE = 200;

const configuredTaskrApiBase = normalizeDevUrl(import.meta.env.VITE_TASKR_API);
let resolvedTaskrApiBase = configuredTaskrApiBase || deriveDefaultApiBase();
if (typeof window !== "undefined") {
  try {
    const currentHost = new URL(window.location.href);
    const configuredUrl = new URL(resolvedTaskrApiBase, currentHost.origin);
    const currentIsLocal = isLocalHost(currentHost.hostname);
    const configuredIsLocal = isLocalHost(configuredUrl.hostname);
    const sameProtocol = configuredUrl.protocol === currentHost.protocol;
    const samePort = configuredUrl.port === currentHost.port || (!configuredUrl.port && !currentHost.port);
    if (currentIsLocal && configuredIsLocal && (!sameProtocol || !samePort)) {
      resolvedTaskrApiBase = "/api";
    }
  } catch {
    // ignore parsing issues and keep the original value
  }
}
const configuredClaimsApiBase = normalizeDevUrl(import.meta.env.VITE_CLAIMS_API_BASE);
let resolvedClaimsApiBase =
  configuredClaimsApiBase || configuredTaskrApiBase || resolvedTaskrApiBase;
if (typeof window !== "undefined" && configuredClaimsApiBase) {
  try {
    const configuredUrl = new URL(resolvedClaimsApiBase, window.location.origin);
    if (configuredUrl.hostname.toLowerCase() === "scr.local") {
      resolvedClaimsApiBase = "/scr";
    }
  } catch {
    // ignore and keep the configured value
  }
}

export const env = {
  tenantId: import.meta.env.VITE_TENANT_ID ?? DEFAULT_TENANT_ID,
  userId: import.meta.env.VITE_TASKR_USER_ID ?? DEFAULT_USER_ID,
  taskrApiBase: resolvedTaskrApiBase,
  claimsApiBase: resolvedClaimsApiBase,
  preferenceModelSlug: (import.meta.env.VITE_PREFERENCE_MODEL_SLUG ?? "assistant-router").toLowerCase(),
  taskPageSize: parsePositiveInt(import.meta.env.VITE_TASK_PAGE_SIZE, DEFAULT_TASK_PAGE_SIZE),
  chatIconUrl: (import.meta as any).env?.VITE_DYDACT_CHAT_ICON || "/brand/taskr-favicon.png"
} as const;
