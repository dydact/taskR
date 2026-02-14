import {
  Task,
  TaskListParams,
  TaskRequest,
  CustomFieldDefinition,
  CustomFieldDefinitionRequest,
  CustomFieldOption,
  CustomFieldOptionRequest,
  Doc,
  DocRequest,
  DocUpdateRequest,
  DocRevision,
  DocRevisionRequest,
  SpaceSummary,
  Preferences,
  AnalyticsSummary,
  BurnDownSeries,
  CycleEfficiencyMetrics,
  AIJob,
  NotificationItem,
  CalendarSource,
  CalendarEvent,
  CalendarEventRequest,
  FreeBusyRequest,
  FreeBusyWindow,
  TimeclockEntry,
  Timesheet,
  PayrollSummary,
  Assignment,
  AssignmentEvent,
  OverdueSummary,
  AssignmentListParams,
  AssignmentIngestRequest,
  AssignmentEventIngestRequest,
  StatusSummary,
  ThroughputHistogram,
  VelocitySeries,
  WorkloadSummary,
  ScheduleTimeline,
  ScheduleTimelineFilters,
  DemoSeedRequest,
  DemoSeedResponse,
  ScrAlert,
  ScrAlertAckRequest
} from "./types";

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
    customFields: {
      list: (spaceSlug: string) =>
        request<CustomFieldDefinition[]>({ path: `/custom-fields/spaces/${spaceSlug}`, method: "GET" }),
      create: (spaceSlug: string, payload: CustomFieldDefinitionRequest) =>
        request<CustomFieldDefinition>({ path: `/custom-fields/spaces/${spaceSlug}`, method: "POST", body: payload }),
      update: (fieldId: string, payload: Partial<CustomFieldDefinitionRequest>) =>
        request<CustomFieldDefinition>({ path: `/custom-fields/${fieldId}`, method: "PATCH", body: payload }),
      remove: (fieldId: string) => request<void>({ path: `/custom-fields/${fieldId}`, method: "DELETE" }),
      listOptions: (fieldId: string) =>
        request<CustomFieldOption[]>({ path: `/custom-fields/${fieldId}/options`, method: "GET" }),
      createOption: (fieldId: string, payload: CustomFieldOptionRequest) =>
        request<CustomFieldOption>({ path: `/custom-fields/${fieldId}/options`, method: "POST", body: payload }),
      updateOption: (fieldId: string, optionId: string, payload: Partial<CustomFieldOptionRequest>) =>
        request<CustomFieldOption>({ path: `/custom-fields/${fieldId}/options/${optionId}`, method: "PATCH", body: payload }),
      removeOption: (fieldId: string, optionId: string) =>
        request<void>({ path: `/custom-fields/${fieldId}/options/${optionId}`, method: "DELETE" })
    },
    docs: {
      list: (params?: { spaceIdentifier?: string; listId?: string }) =>
        request<Doc[]>({
          path: "/docs",
          method: "GET",
          query: {
            space_identifier: params?.spaceIdentifier,
            list_id: params?.listId
          }
        }),
      get: (docId: string) => request<Doc>({ path: `/docs/${docId}`, method: "GET" }),
      create: (payload: DocRequest) => request<Doc>({ path: "/docs", method: "POST", body: payload }),
      update: (docId: string, payload: DocUpdateRequest) =>
        request<Doc>({ path: `/docs/${docId}`, method: "PATCH", body: payload }),
      remove: (docId: string) => request<void>({ path: `/docs/${docId}`, method: "DELETE" }),
      createRevision: (docId: string, payload: DocRevisionRequest) =>
        request<DocRevision>({ path: `/docs/${docId}/revisions`, method: "POST", body: payload }),
      listRevisions: (docId: string) =>
        request<DocRevision[]>({ path: `/docs/${docId}/revisions`, method: "GET" })
    },
    preferences: {
      get: () => request<Preferences>({ path: "/preferences", method: "GET" }),
      update: (payload: Partial<Preferences>) => request<Preferences>({ path: "/preferences", method: "PATCH", body: payload })
    },
    analytics: {
      statusSummary: (spaceSlug: string, listId?: string) =>
        request<StatusSummary>({
          path: `/analytics/spaces/${spaceSlug}/status-summary`,
          method: "GET",
          query: listId ? { list_id: listId } : undefined
        }),
      workload: (spaceSlug: string) =>
        request<WorkloadSummary>({ path: `/analytics/spaces/${spaceSlug}/workload`, method: "GET" }),
      velocity: (spaceSlug: string, params?: { days?: number }) =>
        request<VelocitySeries>({
          path: `/analytics/spaces/${spaceSlug}/velocity`,
          method: "GET",
          query: params?.days ? { days: params.days } : undefined
        }),
      burnDown: (spaceSlug: string, params?: { days?: number; listId?: string }) =>
        request<BurnDownSeries>({
          path: `/analytics/spaces/${spaceSlug}/burn-down`,
          method: "GET",
          query: {
            ...(params?.days ? { days: params.days } : {}),
            ...(params?.listId ? { list_id: params.listId } : {})
          }
        }),
      cycleEfficiency: (spaceSlug: string, params?: { days?: number; listId?: string }) =>
        request<CycleEfficiencyMetrics>({
          path: `/analytics/spaces/${spaceSlug}/cycle-efficiency`,
          method: "GET",
          query: {
            ...(params?.days ? { days: params.days } : {}),
            ...(params?.listId ? { list_id: params.listId } : {})
          }
        }),
      throughput: (spaceSlug: string, params?: { weeks?: number; listId?: string }) =>
        request<ThroughputHistogram>({
          path: `/analytics/spaces/${spaceSlug}/throughput`,
          method: "GET",
          query: {
            ...(params?.weeks ? { weeks: params.weeks } : {}),
            ...(params?.listId ? { list_id: params.listId } : {})
          }
        }),
      overdue: (spaceSlug: string, listId?: string) =>
        request<OverdueSummary>({
          path: `/analytics/spaces/${spaceSlug}/overdue`,
          method: "GET",
          query: listId ? { list_id: listId } : undefined
        }),
      summary: (spaceSlug: string, listId?: string) =>
        request<AnalyticsSummary>({
          path: `/analytics/spaces/${spaceSlug}/summary`,
          method: "GET",
          query: listId ? { list_id: listId } : undefined
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
    alerts: {
      scr: {
        list: (params?: { include_acknowledged?: boolean; limit?: number }) =>
          request<ScrAlert[]>({
            path: "/alerts/scr",
            method: "GET",
            query: {
              include_acknowledged: params?.include_acknowledged ?? false,
              limit: params?.limit ?? 50
            }
          }),
        acknowledge: (alertId: string, payload?: ScrAlertAckRequest) =>
          request<ScrAlert>({
            path: `/alerts/scr/${alertId}/ack`,
            method: "POST",
            body: payload ?? {}
          })
      }
    },
    calendar: {
      sources: {
        list: (params?: { type?: string }) =>
          request<CalendarSource[]>({
            path: "/calendar/sources",
            method: "GET",
            query: params?.type ? { type_filter: params.type } : undefined
          })
      },
      events: {
        list: (params?: { sourceId?: string }) =>
          request<CalendarEvent[]>({
            path: "/calendar/events",
            method: "GET",
            query: params?.sourceId ? { source_id: params.sourceId } : undefined
          }),
        create: (payload: CalendarEventRequest) =>
          request<CalendarEvent>({ path: "/calendar/events", method: "POST", body: payload })
      },
      freebusy: {
        calculate: (payload: FreeBusyRequest) =>
          request<FreeBusyWindow[]>({ path: "/calendar/freebusy", method: "POST", body: payload })
      }
    },
    bridge: {
      schedule: {
        list: (filters?: ScheduleTimelineFilters) => {
          const query: Record<string, unknown> = {};
          if (filters?.start) query.start = filters.start;
          if (filters?.end) query.end = filters.end;
          if (filters?.staffId) query.staff_id = filters.staffId;
          if (filters?.patientId) query.patient_id = filters.patientId;
          if (filters?.status) query.status = filters.status;
          return request<ScheduleTimeline[]>({
            path: "/bridge/schedule",
            method: "GET",
            query: query
          });
        }
      }
    },
    hr: {
      timeclock: {
        open: (params?: { userId?: string }) =>
          request<{ data?: TimeclockEntry[] }>({
            path: "/hr/timeclock/open",
            method: "GET",
            query: params?.userId ? { user_id: params.userId } : undefined
          }),
        history: (params?: { start?: string; end?: string; userId?: string }) => {
          const query: Record<string, unknown> = {};
          if (params?.start) query.start = params.start;
          if (params?.end) query.end = params.end;
          if (params?.userId) query.user_id = params.userId;
          return request<{ data?: TimeclockEntry[] }>({
            path: "/hr/timeclock/history",
            method: "GET",
            query
          });
        }
      },
      timesheets: {
        list: (params?: { status?: string; userId?: string }) =>
          request<{ data?: Timesheet[] }>({
            path: "/hr/timesheets",
            method: "GET",
            query: {
              ...(params?.status ? { status: params.status } : {}),
              ...(params?.userId ? { user_id: params.userId } : {})
            }
          })
      },
      payroll: {
        summary: (params?: { period?: string }) =>
          request<{ data?: PayrollSummary }>({
            path: "/hr/payroll",
            method: "GET",
            query: params?.period ? { period: params.period } : undefined
          })
      }
    },
    dedicated: {
      list: (filters?: AssignmentListParams) =>
        request<Assignment[]>({
          path: "/dedicated/assignments",
          method: "GET",
          query: filters
        }),
      get: (assignmentId: string) =>
        request<Assignment>({ path: `/dedicated/assignments/${assignmentId}`, method: "GET" }),
      listEvents: (assignmentId: string, limit?: number) =>
        request<AssignmentEvent[]>({
          path: `/dedicated/assignments/${assignmentId}/events`,
          method: "GET",
          query: typeof limit === "number" ? { limit } : undefined
        }),
      ingest: (payload: AssignmentIngestRequest) =>
        request<Assignment>({
          path: "/dedicated/assignments",
          method: "POST",
          body: payload
        }),
      ingestEvent: (payload: AssignmentEventIngestRequest) =>
        request<AssignmentEvent>({
          path: "/dedicated/events",
          method: "POST",
          body: payload
        }),
      seedStub: () =>
        request<Assignment>({
          path: "/dedicated/stubs/assignment",
          method: "POST"
        })
    },
    admin: {
      seedDemo: (payload?: DemoSeedRequest) =>
        request<DemoSeedResponse>({ path: "/admin/demo/populate", method: "POST", body: payload ?? {} })
    }
  };

  return client;
};
