import { IdentityHeaders, Task, TaskListParams, TaskRequest, SpaceSummary, Preferences, AnalyticsStatusEntry, AIJob, NotificationItem, TimeclockEntry } from "./types";

export type TaskRClientConfig = {
  baseUrl: string;
  tenantId: string;
  userId?: string;
  getToken?: () => string | null | Promise<string | null>;
  fetchFn?: typeof fetch;
  defaultHeaders?: Record<string, string>;
};

export type RequestOptions = {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export class ApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `TaskR API request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

type RequestFn = <T>(options: RequestOptions) => Promise<T>;

const buildQueryString = (query?: Record<string, unknown>) => {
  if (!query) return "";
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, String(entry)));
    } else {
      params.append(key, String(value));
    }
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

const createRequestFn = (config: TaskRClientConfig): RequestFn => {
  const fetchImpl = config.fetchFn ?? (globalThis.fetch as typeof fetch | undefined);
  if (!fetchImpl) {
    throw new Error("No fetch implementation available. Provide fetchFn in TaskR client config.");
  }

  return async <T>(options: RequestOptions): Promise<T> => {
    const token = config.getToken ? await config.getToken() : null;
    const url = `${config.baseUrl}${options.path}${buildQueryString(options.query)}`;

    const headers: Record<string, string> = {
      "Content-Type": options.body !== undefined ? "application/json" : "application/json",
      "x-tenant-id": config.tenantId,
      ...(config.userId ? { "x-user-id": config.userId } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...config.defaultHeaders,
      ...options.headers
    };

    const response = await fetchImpl(url, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal
    });

    const contentType = response.headers.get("content-type");
    const isJson = contentType && contentType.includes("application/json");
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      throw new ApiError(response.status, payload, (payload as any)?.error?.message);
    }

    return payload as T;
  };
};

export type TaskRClient = ReturnType<typeof createTaskRClient>;

export const createTaskRClient = (config: TaskRClientConfig) => {
  const request = createRequestFn(config);

  const listTasks = (params?: TaskListParams) =>
    request<{ data: Task[]; meta?: { page?: number; total?: number } }>({
      path: "/tasks",
      method: "GET",
      query: params
    });

  const client = {
    request,
    tasks: {
      list: listTasks,
      create: (payload: TaskRequest) => request<Task>({ path: "/tasks", method: "POST", body: payload }),
      get: (id: string) => request<Task>({ path: `/tasks/${id}`, method: "GET" }),
      update: (id: string, payload: Partial<TaskRequest>) =>
        request<Task>({ path: `/tasks/${id}`, method: "PATCH", body: payload })
    },
    spaces: {
      list: () => request<{ data: SpaceSummary[] }>({ path: "/spaces", method: "GET" })
    },
    preferences: {
      get: () => request<Preferences>({ path: "/preferences", method: "GET" }),
      update: (payload: Partial<Preferences>) => request<Preferences>({ path: "/preferences", method: "PATCH", body: payload })
    },
    analytics: {
      status: (spaceId?: string) =>
        request<{ data: AnalyticsStatusEntry[] }>({
          path: "/analytics/status",
          method: "GET",
          query: spaceId ? { space_id: spaceId } : undefined
        })
    },
    ai: {
      listJobs: (promptId?: string) =>
        request<{ data: AIJob[] }>({
          path: "/ai/jobs",
          method: "GET",
          query: promptId ? { prompt_id: promptId } : undefined
        })
    },
    notifications: {
      list: () => request<{ data: NotificationItem[] }>({ path: "/notifications", method: "GET" }),
      acknowledge: (id: string) => request<{ success: boolean }>({ path: `/notifications/${id}/ack`, method: "POST" })
    },
    hr: {
      timeclock: {
        open: () => request<{ data: TimeclockEntry[] }>({ path: "/hr/timeclock/open", method: "GET" })
      }
    }
  };

  return client;
};
