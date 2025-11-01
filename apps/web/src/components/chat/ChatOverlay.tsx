import React, { useEffect, useMemo, useState } from "react";
import type { ServiceDefinition } from "@dydact/control-center";

type Props = {
  tenantId: string;
  userId?: string | null;
  open: boolean;
  onClose(): void;
};

type ControlCenterChatComponent = React.ComponentType<{
  service: ServiceDefinition;
  runtimeUrl?: string;
  tenantId?: string;
  headers?: Record<string, string>;
  avatarUrl?: string;
  onClose?: () => void;
}>;

const DEFAULT_CHAT_URL = (import.meta as any).env?.VITE_DYDACT_CHAT_URL as string | undefined;
const DEFAULT_CONTAINER_URL = (import.meta as any).env?.VITE_DYDACT_CONTAINER_URL as string | undefined;
const RUNTIME_URL = (import.meta as any).env?.VITE_DYDACT_RUNTIME_URL as string | undefined;
const SERVICE_ID = (import.meta as any).env?.VITE_DYDACT_SERVICE_ID as string | undefined;
const SERVICE_NAME = (import.meta as any).env?.VITE_DYDACT_SERVICE_NAME as string | undefined;
const SERVICE_AVATAR = (import.meta as any).env?.VITE_DYDACT_AVATAR_URL as string | undefined;
const DEFAULT_RUNTIME_URL = "https://scr.local/api/copilot";
const CONTROL_CENTER_SPEC = (import.meta as any).env?.VITE_DYDACT_CONTROL_CENTER_MODULE as string | undefined;

export const ChatOverlay: React.FC<Props> = ({ tenantId, userId, open, onClose }) => {
  const [ControlCenterChat, setControlCenterChat] = useState<ControlCenterChatComponent | null>(null);
  const [embedError, setEmbedError] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!open || ControlCenterChat) {
      return () => {
        mounted = false;
      };
    }
    const moduleSpec = CONTROL_CENTER_SPEC || "@dydact/control-center";
    import(/* @vite-ignore */ moduleSpec)
      .then((mod) => {
        if (!mounted) return;
        const component = mod && (mod as Record<string, unknown>).ControlCenterChat;
        if (component && typeof component === "function") {
          setControlCenterChat(() => component as ControlCenterChatComponent);
        } else {
          setEmbedError(true);
        }
      })
      .catch(() => {
        if (mounted) setEmbedError(true);
      });
    return () => {
      mounted = false;
    };
  }, [open, ControlCenterChat]);

  const headers = useMemo(() => {
    const nextHeaders: Record<string, string> = {};
    if (userId) nextHeaders["x-user-id"] = userId;
    const sessionId = (import.meta as any).env?.VITE_DYDACT_SESSION_ID as string | undefined;
    if (sessionId) nextHeaders["session_id"] = sessionId;
    const requestId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : undefined;
    if (requestId) nextHeaders["x-request-id"] = requestId;
    return nextHeaders;
  }, [userId]);

  const serviceDescriptor = useMemo(() => {
    const descriptor: ServiceDefinition = {
      key: SERVICE_ID ?? "taskr",
      label: SERVICE_NAME ?? "TaskR",
      description: "TaskR automation queues and HR guardrails.",
      accentClass: "bg-violet-400/40 text-violet-900",
    };
    return descriptor;
  }, []);

  const avatarUrl = useMemo(() => {
    if (!SERVICE_AVATAR) return undefined;
    if (typeof window !== "undefined") {
      try {
        return new URL(SERVICE_AVATAR, window.location.origin).toString();
      } catch {
        return SERVICE_AVATAR;
      }
    }
    return SERVICE_AVATAR;
  }, []);

  const runtimeUrl = useMemo(() => RUNTIME_URL || DEFAULT_RUNTIME_URL, []);

  const iframeUrl = useMemo(() => {
    const base = DEFAULT_CONTAINER_URL || DEFAULT_CHAT_URL || "https://scr.local/dydact?mode=container";
    try {
      const parsed = new URL(base, window.location.origin);
      parsed.searchParams.set("tenant", tenantId);
      if (userId) parsed.searchParams.set("user", userId);
      parsed.searchParams.set("embed", "1");
      return parsed.toString();
    } catch (err) {
      console.warn("Invalid VITE_DYDACT_CHAT_URL, falling back to base string", err);
      return base;
    }
  }, [tenantId, userId]);

  const controlCenterAvailable = ControlCenterChat && !embedError;

  if (!open) return null;

  return (
    <div className="chat-overlay">
      <div className="chat-overlay__backdrop" role="presentation" onClick={onClose} />
      <div className="chat-overlay__panel" role="dialog" aria-label="Dydact Assistant chat">
        <header className="chat-overlay__header">
          <span>Dydact Assistant</span>
          <button type="button" onClick={onClose} aria-label="Close chat">×</button>
        </header>
        <div className="chat-overlay__content">
          {controlCenterAvailable ? (
            <ControlCenterChat
              service={serviceDescriptor}
              runtimeUrl={runtimeUrl}
              tenantId={tenantId}
              headers={headers}
              avatarUrl={avatarUrl}
              onClose={onClose}
            />
          ) : (
            <iframe
              src={iframeUrl}
              title="Dydact Chat"
              className="chat-overlay__frame"
              loading="lazy"
              allow="clipboard-write; microphone; camera"
              sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-forms"
            />
          )}
        </div>
      </div>
    </div>
  );
};
