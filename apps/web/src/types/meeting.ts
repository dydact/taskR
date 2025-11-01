export type MeetingSummaryMeta = {
  summary_id?: string;
  generated_at?: string;
  source?: string;
  [key: string]: unknown;
};

export type MeetingActionItem = {
  text?: string;
  owner?: string;
  due?: string;
  [key: string]: unknown;
};

export type MeetingNote = {
  note_id: string;
  tenant_id: string;
  event_id?: string | null;
  task_id?: string | null;
  title: string;
  content: string;
  summary?: string | null;
  action_items: MeetingActionItem[];
  metadata_json: Record<string, unknown>;
  summary_meta?: MeetingSummaryMeta | null;
  created_at: string;
  updated_at: string;
};
