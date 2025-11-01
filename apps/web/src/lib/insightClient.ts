import type {
  AutoPMResponse,
  ChatMessage,
  MeetingSummaryResponse,
} from '../types/insight';

export type InsightClientOptions = {
  baseUrl: string; // e.g., http://localhost:3003 or http://localhost:8000
  tenant: string; // x-tenant-id value
  userId?: string; // optional x-user-id
  modelProfile?: 'general' | 'reasoning';
  headers?: Record<string, string>;
};

export type ChatStreamOptions = {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  onDelta: (textChunk: string) => void;
};

export function createInsightClient(opts: InsightClientOptions) {
  const base = opts.baseUrl.replace(/\/$/, '');
  const commonHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    'x-tenant-id': opts.tenant,
    ...(opts.userId ? { 'x-user-id': opts.userId } : {}),
    ...(opts.modelProfile ? { 'x-model-profile': opts.modelProfile } : {}),
    ...(opts.headers || {}),
  };

  async function chatStream({ messages, maxTokens = 1800, temperature = 0.3, signal, onDelta }: ChatStreamOptions) {
    const url = `${base}/openai/v1/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: commonHeaders,
      body: JSON.stringify({ model: 'qwen2.5', messages, max_tokens: maxTokens, temperature, stream: true }),
      signal,
    });
    if (!res.ok || !res.body) {
      const msg = await res.text().catch(() => '');
      throw new Error(msg || `HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const p of parts) {
        const line = p.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) onDelta(delta);
        } catch {
          // ignore malformed chunks
        }
      }
    }
  }

  async function meetingSummary(input: {
    transcript?: string;
    notes?: string;
    meeting_meta?: Record<string, unknown>;
  }): Promise<MeetingSummaryResponse> {
    const res = await fetch(`${base}/summaries/meetings`, {
      method: 'POST',
      headers: commonHeaders,
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as MeetingSummaryResponse;
  }

  async function autopm(input: {
    thread?: string[];
    updates?: string[];
    project_meta?: Record<string, unknown>;
  }): Promise<AutoPMResponse> {
    const res = await fetch(`${base}/summaries/autopm`, {
      method: 'POST',
      headers: commonHeaders,
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as AutoPMResponse;
  }

  return {
    chat: { stream: chatStream },
    summaries: {
      meetings: meetingSummary,
      autopm,
    },
  };
}

// Example usage (dev):
// const client = createInsightClient({ baseUrl: import.meta.env.VITE_INSIGHT_API ?? 'http://localhost:8000', tenant: import.meta.env.VITE_TENANT_ID });
// await client.summaries.meetings({ transcript: 'We reviewed Q3 metrics...' });

