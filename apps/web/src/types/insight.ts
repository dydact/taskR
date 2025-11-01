export type InsightActionItem = {
  text: string;
  owner?: string;
  due?: string;
};

export type MeetingSummaryResponse = {
  summary: string;
  action_items: InsightActionItem[];
  risks?: string[];
  timeline?: Array<{ when: string; note: string }>;
  meta?: Record<string, unknown>;
};

export type AutoPMNextAction = {
  text: string;
  owner?: string;
  due?: string;
};

export type AutoPMOwner = { id?: string; name: string };

export type AutoPMResponse = {
  summary: string;
  blockers?: string[];
  next_actions: AutoPMNextAction[];
  owners?: AutoPMOwner[];
  meta?: Record<string, unknown>;
};

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

