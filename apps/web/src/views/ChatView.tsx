import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatMessage as Bubble } from "../components/chat/ChatMessage";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string; ts?: number };

type ChatViewProps = {
  tenantId: string;
};

export const ChatView: React.FC<ChatViewProps> = ({ tenantId }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [reasonMode, setReasonMode] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('taskr_prefs_v1');
      if (raw) {
        const prefs = JSON.parse(raw) as { modelProfile?: string };
        return (prefs.modelProfile || 'general') === 'reasoning';
      }
    } catch {}
    return false;
  });
  const endRef = useRef<HTMLDivElement | null>(null);
  const sessionKey = "chat_sessions";
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [sessions, setSessions] = useState<Record<string, ChatMessage[]>>(() => {
    try {
      const raw = localStorage.getItem(sessionKey);
      return raw ? (JSON.parse(raw) as Record<string, ChatMessage[]>) : {};
    } catch {
      return {};
    }
  });
  const metaKey = "chat_session_meta";
  const [sessionMeta, setSessionMeta] = useState<Array<{ id: string; name: string; created: number; updated: number }>>(() => {
    try {
      const raw = localStorage.getItem(metaKey);
      return raw ? (JSON.parse(raw) as Array<{ id: string; name: string; created: number; updated: number }>) : [];
    } catch {
      return [];
    }
  });
  const USER_ID = (import.meta as any).env?.VITE_TASKR_USER_ID as string | undefined;
  const apiFetch = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(path, {
      ...(init || {}),
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
        ...(USER_ID ? { 'x-user-id': USER_ID } : {}),
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }, [tenantId]);
  const [aborter, setAborter] = useState<AbortController | null>(null);
  const lastUserText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].content;
    }
    return "";
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load server sessions (best-effort) on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch('/chat/sessions');
        const rows = (data?.data ?? []) as Array<{ id: string; name: string; created: string; updated: string }>;
        if (Array.isArray(rows) && rows.length) {
          const meta = rows.map((r) => ({ id: r.id, name: r.name, created: Date.parse(r.created), updated: Date.parse(r.updated) }));
          setSessionMeta(meta);
          localStorage.setItem(metaKey, JSON.stringify(meta));
          // Prime cache for first session
          const first = meta[0];
          if (first && !sessions[first.id]) {
            const m = await apiFetch(`/chat/sessions/${first.id}/messages`);
            const list = (m?.data ?? []) as Array<{ role: ChatMessage['role']; content: string; ts?: string }>;
            const msgs = list.map((x) => ({ role: x.role, content: x.content, ts: x.ts ? Date.parse(x.ts) : undefined }));
            setSessions((prev) => ({ ...prev, [first.id]: msgs }));
            setSessionId(first.id);
          }
        }
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    // Load current session
    (async () => {
      if (sessions[sessionId]) {
        setMessages(sessions[sessionId]);
        return;
      }
      try {
        const m = await apiFetch(`/chat/sessions/${sessionId}/messages`);
        const list = (m?.data ?? []) as Array<{ role: ChatMessage['role']; content: string; ts?: string }>;
        const msgs = list.map((x) => ({ role: x.role, content: x.content, ts: x.ts ? Date.parse(x.ts) : undefined }));
        setSessions((prev) => ({ ...prev, [sessionId]: msgs }));
        setMessages(msgs);
      } catch {
        setMessages([]);
      }
    })();
  }, [sessionId]);

  useEffect(() => {
    // Persist session updates
    const next = { ...sessions, [sessionId]: messages };
    setSessions(next);
    try {
      localStorage.setItem(sessionKey, JSON.stringify(next));
      const now = Date.now();
      const existing = sessionMeta.find((m) => m.id === sessionId);
      let updatedMeta = sessionMeta;
      if (existing) {
        existing.updated = now;
        updatedMeta = [...sessionMeta];
      } else {
        const name = `Session ${sessionMeta.length + 1}`;
        updatedMeta = [...sessionMeta, { id: sessionId, name, created: now, updated: now }];
      }
      setSessionMeta(updatedMeta);
      localStorage.setItem(metaKey, JSON.stringify(updatedMeta));
    } catch {}
  }, [messages]);

  const renameSession = useCallback(async () => {
    const name = prompt("Rename session", sessionMeta.find((m) => m.id === sessionId)?.name || "");
    if (!name) return;
    const updated = sessionMeta.map((m) => (m.id === sessionId ? { ...m, name } : m));
    setSessionMeta(updated);
    localStorage.setItem(metaKey, JSON.stringify(updated));
    try { await apiFetch(`/chat/sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify({ name }) }); } catch {}
  }, [sessionId, sessionMeta]);

  const newSession = useCallback(async () => {
    aborter?.abort();
    let id = crypto.randomUUID();
    try {
      const res = await apiFetch('/chat/sessions', { method: 'POST', body: JSON.stringify({ name: `Session ${sessionMeta.length + 1}` }) });
      if (res?.id) id = String(res.id);
    } catch {}
    setSessionId(id);
  }, [aborter]);

  const deleteSession = useCallback(() => {
    if (!confirm("Delete this session?")) return;
    const nextSessions = { ...sessions };
    delete nextSessions[sessionId];
    const nextMeta = sessionMeta.filter((m) => m.id !== sessionId);
    setSessions(nextSessions);
    setSessionMeta(nextMeta);
    localStorage.setItem(sessionKey, JSON.stringify(nextSessions));
    localStorage.setItem(metaKey, JSON.stringify(nextMeta));
    setSessionId(nextMeta[0]?.id || crypto.randomUUID());
  }, [sessionId, sessions, sessionMeta]);

  // Global command hooks
  useEffect(() => {
    const onNew = () => newSession();
    const onToggleReason = () => setReasonMode((v) => !v);
    const newHandler = () => onNew();
    const toggleHandler = () => onToggleReason();
    document.addEventListener("chat:new-session", newHandler);
    document.addEventListener("chat:toggle-reason", toggleHandler);
    return () => {
      document.removeEventListener("chat:new-session", newHandler);
      document.removeEventListener("chat:toggle-reason", toggleHandler);
    };
  }, [newSession]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text) return;
    if (!overrideText) setInput("");
    aborter?.abort();
    const controller = new AbortController();
    setAborter(controller);
    const now = Date.now();
    const userMsg: ChatMessage = { role: "user", content: text, ts: now };
    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "" }]);
    setLoading(true);
    try {
      try { await apiFetch(`/chat/sessions/${sessionId}/messages`, { method: 'POST', body: JSON.stringify({ role: 'user', content: text }) }); } catch {}
      const INSIGHT_API = (import.meta as any).env?.VITE_INSIGHT_API as string | undefined;
      const endpoint = INSIGHT_API
        ? `${INSIGHT_API.replace(/\/$/, '')}/openai/v1/chat/completions`
        : "/chat/completions";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": tenantId,
          ...(reasonMode ? { "x-model-profile": "reasoning" } : {})
        },
        body: JSON.stringify({
          ...(INSIGHT_API ? { model: "qwen2.5" } : {}),
          messages: [
            { role: "system", content: "You are a helpful assistant that follows instructions and outputs Markdown for rich formatting." },
            ...messages,
            userMsg
          ],
          max_tokens: 1800,
          temperature: 0.3,
          stream: true
        }),
        signal: controller.signal
      });
      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const append = (chunk: string) => {
        setMessages((prev) => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (lastIdx >= 0 && next[lastIdx].role === "assistant") {
            next[lastIdx] = { role: "assistant", content: (next[lastIdx].content || "") + chunk };
          }
          return next;
        });
      };
      let assistantText = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta = json?.choices?.[0]?.delta?.content;
            const chunk = typeof delta === "string" ? delta : "";
            if (chunk) { assistantText += chunk; append(chunk); }
          } catch {
            // best-effort; ignore malformed chunks
          }
        }
      }
      if (assistantText.trim()) {
        try { await apiFetch(`/chat/sessions/${sessionId}/messages`, { method: 'POST', body: JSON.stringify({ role: 'assistant', content: assistantText }) }); } catch {}
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => {
        const next = [...prev];
        const lastIdx = next.length - 1;
        if (lastIdx >= 0 && next[lastIdx].role === "assistant") {
          next[lastIdx] = { role: "assistant", content: `Error: ${msg}` };
        } else {
          next.push({ role: "assistant", content: `Error: ${msg}` });
        }
        return next;
      });
    } finally {
      setLoading(false);
      setAborter(null);
    }
  }, [input, messages, reasonMode, tenantId]);

  return (
    <div className="chat-view">
      <div className="chat-header">
        <h2>Assistant</h2>
        <label className="chat-toggle">
          <input type="checkbox" checked={reasonMode} onChange={(e) => setReasonMode(e.target.checked)} />
          <span>Reason Mode</span>
        </label>
      </div>
      <div className="chat-body">
        <aside className="chat-sessions">
          <div className="chat-sessions-header">
            <button type="button" onClick={newSession}>New</button>
            <button type="button" onClick={renameSession} disabled={!sessionMeta.length}>Rename</button>
            <button type="button" onClick={deleteSession} disabled={!sessionMeta.length}>Delete</button>
          </div>
          <ul>
            {sessionMeta.map((m) => (
              <li key={m.id} className={m.id === sessionId ? "active" : undefined}>
                <button type="button" onClick={() => setSessionId(m.id)} title={new Date(m.updated).toLocaleString()}>
                  {m.name}
                </button>
              </li>
            ))}
            {!sessionMeta.length && (
              <li className="empty">No sessions yet</li>
            )}
          </ul>
        </aside>
        <div className="chat-transcript">
          {messages.map((m, idx) => (
            <Bubble key={idx} role={m.role} content={m.content} />
          ))}
          <div ref={endRef} />
        </div>
      </div>
      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={loading ? "Waiting for reply…" : "Type a message…"}
          disabled={loading}
          rows={3}
        />
        {loading ? (
          <button type="button" onClick={() => aborter?.abort()}>
            Stop
          </button>
        ) : (
          <>
            <button type="button" onClick={() => sendMessage()} disabled={!input.trim()}>
              Send
            </button>
            <button type="button" onClick={() => sendMessage(lastUserText)} disabled={!lastUserText}>
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
};
