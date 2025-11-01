export type CustomFieldValue = {
  field_id: string;
  field_slug: string;
  field_name: string;
  field_type: string;
  value: unknown;
};

export type Task = {
  task_id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  due_at?: string | null;
  list_id: string;
  custom_fields?: CustomFieldValue[];
  metadata_json?: Record<string, unknown>;
};

export type TaskComment = {
  comment_id: string;
  tenant_id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  mentions: string[];
  created_at: string;
  updated_at: string;
};

export type Subtask = {
  subtask_id: string;
  tenant_id: string;
  task_id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
};
