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

export type CustomFieldOption = {
  option_id: string;
  label: string;
  value: string;
  color?: string | null;
  position: number;
  is_active: boolean;
};

export type CustomFieldOptionRequest = {
  label: string;
  value: string;
  color?: string | null;
  position?: number;
  is_active?: boolean;
};

export type CustomFieldDefinition = {
  field_id: string;
  tenant_id: string;
  space_id?: string | null;
  list_id?: string | null;
  name: string;
  slug: string;
  field_type: "text" | "number" | "date" | "boolean" | "select" | "multi_select";
  description?: string | null;
  config: Record<string, unknown>;
  is_required: boolean;
  is_active: boolean;
  position: number;
  options: CustomFieldOption[];
  created_at: string;
  updated_at: string;
};

export type CustomFieldDefinitionRequest = {
  name: string;
  slug?: string;
  field_type: CustomFieldDefinition["field_type"];
  description?: string;
  config?: Record<string, unknown>;
  is_required?: boolean;
  is_active?: boolean;
  position?: number;
  list_id?: string;
  options?: CustomFieldOptionRequest[];
};

export type Doc = {
  doc_id: string;
  tenant_id: string;
  title: string;
  slug: string;
  summary?: string | null;
  tags: string[];
  metadata_json: Record<string, unknown>;
  space_id?: string | null;
  list_id?: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  created_by_id?: string | null;
  updated_by_id?: string | null;
  current_revision_id?: string | null;
  current_revision_version?: number | null;
  content?: string | null;
};

export type DocRequest = {
  title: string;
  slug?: string;
  summary?: string | null;
  tags?: string[];
  metadata_json?: Record<string, unknown>;
  space_id?: string | null;
  list_id?: string | null;
  is_archived?: boolean;
  text?: string | null;
  payload_base64?: string | null;
  content_type?: string | null;
  filename?: string | null;
};

export type DocUpdateRequest = {
  title?: string;
  slug?: string;
  summary?: string | null;
  tags?: string[];
  metadata_json?: Record<string, unknown>;
  space_id?: string | null;
  list_id?: string | null;
  is_archived?: boolean;
};

export type DocRevision = {
  revision_id: string;
  doc_id: string;
  version: number;
  title: string;
  content: string;
  plain_text?: string | null;
  metadata_json: Record<string, unknown>;
  created_by_id?: string | null;
  created_at: string;
};

export type DocRevisionRequest = {
  text?: string | null;
  payload_base64?: string | null;
  content_type?: string | null;
  filename?: string | null;
  title?: string | null;
  metadata_json?: Record<string, unknown>;
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
  last_view?: "list" | "board" | "calendar" | "gantt" | "dashboard" | "claims" | "hr" | "dedicated";
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

export type CalendarSource = {
  source_id: string;
  tenant_id: string;
  slug: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CalendarEvent = {
  event_id: string;
  tenant_id: string;
  source_id: string;
  title: string;
  start_at: string;
  end_at: string;
  location?: string | null;
  attendees: Array<Record<string, unknown>>;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CalendarEventRequest = {
  source_id: string;
  title: string;
  start_at: string;
  end_at: string;
  location?: string | null;
  attendees?: Array<Record<string, unknown>>;
  metadata_json?: Record<string, unknown>;
};

export type FreeBusyRequest = {
  owner_ids?: string[] | null;
  start_at: string;
  end_at: string;
};

export type FreeBusyWindow = {
  owner_id: string | null;
  start_at: string;
  end_at: string;
  status: string;
};

export type ScrAlert = {
  alert_id: string;
  tenant_id: string;
  taskr_task_id?: string | null;
  severity: string;
  kind: string;
  message: string;
  source: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  acknowledged_at?: string | null;
};

export type ScrAlertAckRequest = {
  notes?: string | null;
};

export type DemoSeedRequest = {
  spaces?: number;
  lists?: number;
  tasks?: number;
  comments?: number;
  docs?: number;
  schedule?: number;
};

export type DemoSeedResponse = {
  tenant_id: string;
  spaces: number;
  lists: number;
  tasks: number;
  comments: number;
  docs: number;
  employees: number;
  operators: number;
  clients: number;
  schedule_entries: number;
};

export type TimeclockEntry = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at?: string;
  metadata?: Record<string, unknown>;
};

export type Timesheet = {
  id: string;
  user_id: string;
  period_start?: string;
  period_end?: string;
  status?: string;
  total_hours?: number;
  metadata_json?: Record<string, unknown>;
};

export type PayrollSummary = {
  period_start?: string;
  period_end?: string;
  total_pay?: number;
  pending?: number;
  metadata_json?: Record<string, unknown>;
};

export type ScheduleTimeline = {
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

export type ScheduleTimelineFilters = {
  start?: string;
  end?: string;
  staffId?: string;
  patientId?: string;
  status?: string | string[];
};

export type AssignmentPromptTurn = {
  role: string;
  content: string;
  created_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type AssignmentPolarisObligation = {
  obligation_id: string;
  kind: string;
  status: string;
  due_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type AssignmentOverlay = Record<string, unknown>;

export type Assignment = {
  assignment_id: string;
  tenant_id: string;
  agent_slug: string;
  agent_version?: string | null;
  status: string;
  priority: string;
  service_owner?: string | null;
  node_id?: string | null;
  overlay: AssignmentOverlay;
  prompt_history: AssignmentPromptTurn[];
  polaris_obligations: AssignmentPolarisObligation[];
  feature_flags: string[];
  tags: string[];
  metadata_json: Record<string, unknown>;
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AssignmentListParams = {
  status?: string | string[];
  agent_slug?: string | string[];
  node_id?: string;
  tag?: string | string[];
};

export type AssignmentEvent = {
  event_id: string;
  tenant_id: string;
  assignment_id: string;
  event_type: string;
  source?: string | null;
  payload: Record<string, unknown>;
  metadata_json: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

export type AssignmentIngestRequest = {
  assignment_id: string;
  tenant_id: string;
  agent_slug: string;
  agent_version?: string | null;
  status?: string;
  priority?: string;
  service_owner?: string | null;
  node_id?: string | null;
  overlay?: AssignmentOverlay | null;
  prompt_history?: AssignmentPromptTurn[];
  polaris_obligations?: AssignmentPolarisObligation[];
  feature_flags?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type AssignmentEventIngestRequest = {
  event_id: string;
  assignment_id: string;
  tenant_id: string;
  event_type: string;
  source?: string | null;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  occurred_at: string;
};
