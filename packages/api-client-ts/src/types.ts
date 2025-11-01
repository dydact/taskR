export type IdentityHeaders = {
  tenantId: string;
  userId?: string;
};

export type PaginationMeta = {
  page?: number;
  perPage?: number;
  total?: number;
};

export type Task = {
  id: string;
  list_id: string;
  title: string;
  status: string;
  assignees?: string[];
  due_date?: string;
  priority?: string;
  custom_fields?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TaskListParams = {
  list_id?: string;
  status?: string;
  assignee?: string;
  search?: string;
};

export type TaskRequest = {
  list_id: string;
  title: string;
  description?: string;
  status?: string;
  assignees?: string[];
  due_date?: string;
  priority?: string;
  custom_fields?: Record<string, unknown>;
};

export type SpaceSummary = {
  id: string;
  slug: string;
  name: string;
  color?: string;
  favorite?: boolean;
  counts?: {
    tasks?: number;
  };
};

export type Preferences = {
  theme?: "dark" | "light";
  view_density?: "comfortable" | "compact" | "table";
  favorites?: string[];
  last_view?: "list" | "board" | "calendar" | "gantt" | "dashboard" | "claims" | "hr";
  right_panel_open?: boolean;
  ai_persona?: "balanced" | "detailed" | "concise";
  list_view_columns?: Record<string, boolean>;
  [key: string]: unknown;
};

export type AnalyticsStatusEntry = {
  status: string;
  count: number;
};

export type AIJob = {
  id: string;
  prompt_id: string;
  status: string;
  created_at: string;
  metadata?: Record<string, unknown>;
};

export type NotificationItem = {
  id: string;
  type: string;
  message: string;
  created_at: string;
  read?: boolean;
  metadata?: Record<string, unknown>;
};

export type TimeclockEntry = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at?: string;
  metadata?: Record<string, unknown>;
};
