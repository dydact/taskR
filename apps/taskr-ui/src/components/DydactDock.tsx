import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { ServiceDefinition } from "@dydact/control-center";
import type { ScrAlert } from "@dydact/taskr-api-client";
import { AlertTriangle, Calendar, Clock3, Command, LayoutDashboard, MessageSquare, Satellite, Sparkles, Users, X } from "lucide-react";

import { env } from "../config/env";
import { useTheme } from "./ThemeContext";
import { useTaskRClient } from "../lib/taskrClient";
import type { ShellSpace } from "../context/ShellContext";
import type { ViewMode } from "../types/shell";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";

type TrackEventFn = (event: { name: string; properties?: Record<string, unknown> }) => void | Promise<void>;

type DockProductKey = "taskr" | "scrAiv" | "dydact";

type DydactDockProps = {
  open: boolean;
  onRequestClose: () => void;
  onIntentOpen: () => void;
  onIntentClose: () => void;
  spaces: ShellSpace[];
  activeSpaceId: string | null;
  onSelectSpace: (spaceId: string) => void;
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  trackEvent?: TrackEventFn;
  viewOptions: ViewMode[];
};

type QuickAction = {
  id: string;
  label: string;
  description?: string;
  onSelect: () => void;
  icon: JSX.Element;
  active?: boolean;
};

type ChatSessionSummary = {
  id: string;
  name: string;
  created: string;
  updated: string;
};

type ControlCenterChatComponent = React.ComponentType<{
  service: ServiceDefinition;
  runtimeUrl?: string;
  tenantId?: string;
  headers?: Record<string, string>;
  avatarUrl?: string;
  threadId?: string;
  onSessionChange?: (sessionId: string) => void;
  showDevConsole?: boolean;
}>;

const CONTROL_CENTER_SPEC = (import.meta as any).env?.VITE_DYDACT_CONTROL_CENTER_MODULE as string | undefined;
const RUNTIME_URL = (import.meta as any).env?.VITE_DYDACT_RUNTIME_URL as string | undefined;
const CHAT_URL = (import.meta as any).env?.VITE_DYDACT_CHAT_URL as string | undefined;
const CONTAINER_URL = (import.meta as any).env?.VITE_DYDACT_CONTAINER_URL as string | undefined;
const SERVICE_ID_CONFIG = (import.meta as any).env?.VITE_DYDACT_SERVICE_ID as string | undefined;
const SERVICE_NAME_CONFIG = (import.meta as any).env?.VITE_DYDACT_SERVICE_NAME as string | undefined;
const SERVICE_AVATAR_URL = (import.meta as any).env?.VITE_DYDACT_AVATAR_URL as string | undefined;
const SESSION_ID_HEADER = (import.meta as any).env?.VITE_DYDACT_SESSION_ID as string | undefined;

const DEFAULT_RUNTIME_URL = "https://scr.local/api/copilot";
const DEFAULT_CONTAINER_URL = "https://scr.local/dydact?mode=container";

const PRODUCT_LABELS: Record<DockProductKey, { label: string; description: string }> = {
  taskr: {
    label: SERVICE_NAME_CONFIG || "TaskR",
    description: "Navigate spaces, queues, and automations."
  },
  scrAiv: {
    label: "scrAIv",
    description: "Claims, HR sync, and compliance guardrails."
  },
  dydact: {
    label: "Dydact",
    description: "Agent orchestration, memPODS, and shared workbench."
  }
};

const toMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const resolveProductFromCategory = (category: string | null): DockProductKey => {
  if (!category) {
    return "taskr";
  }
  const normalized = category.toLowerCase();
  if (normalized.includes("scr") || normalized.includes("claim") || normalized.includes("hr")) {
    return "scrAiv";
  }
  if (normalized.includes("dydact") || normalized.includes("agent") || normalized.includes("platform")) {
    return "dydact";
  }
  return "taskr";
};

const buildServiceDefinition = (product: DockProductKey): ServiceDefinition => {
  switch (product) {
    case "scrAiv":
      return {
        key: "scrAiv",
        label: "scrAIv",
        description: "Coordinate claims, HR scheduling, and compliance triage.",
        accentClass: "bg-gradient-to-r from-emerald-400/40 to-teal-400/40 text-emerald-100"
      };
    case "dydact":
      return {
        key: "dydact",
        label: "Dydact Control Center",
        description: "Cross-product agent overlay and shared automations.",
        accentClass: "bg-gradient-to-r from-amber-400/40 to-orange-400/40 text-amber-900"
      };
    case "taskr":
    default:
      return {
        key: SERVICE_ID_CONFIG || "taskr",
        label: SERVICE_NAME_CONFIG || "TaskR",
        description: "Track work, launch automations, and surface context.",
        accentClass: "bg-gradient-to-r from-violet-500/40 to-blue-500/40 text-white"
      };
  }
};

export const DydactDock: React.FC<DydactDockProps> = ({
  open,
  onRequestClose,
  onIntentOpen,
  onIntentClose,
  spaces,
  activeSpaceId,
  onSelectSpace,
  currentView,
  onViewChange,
  rightPanelOpen,
  onToggleRightPanel,
  trackEvent,
  viewOptions
}) => {
  const { colors, theme } = useTheme();
  const client = useTaskRClient();

  const products = useMemo(() => {
    const set = new Set<DockProductKey>();
    spaces.forEach((space) => {
      set.add(resolveProductFromCategory(space.category ?? null));
    });
    if (viewOptions.includes("claims") || viewOptions.includes("hr")) {
      set.add("scrAiv");
    }
    if (viewOptions.includes("dedicated")) {
      set.add("dydact");
    }
    if (set.size === 0) {
      set.add("taskr");
    }
    return Array.from(set);
  }, [spaces, viewOptions]);

  const [activeProduct, setActiveProduct] = useState<DockProductKey>(products[0] ?? "taskr");

  useEffect(() => {
    if (!products.includes(activeProduct)) {
      setActiveProduct(products[0] ?? "taskr");
    }
  }, [products, activeProduct]);

  const spacesByProduct = useMemo(() => {
    const map = new Map<DockProductKey, ShellSpace[]>();
    spaces.forEach((space) => {
      const key = resolveProductFromCategory(space.category ?? null);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(space);
    });
    return map;
  }, [spaces]);

  const [controlCenter, setControlCenter] = useState<ControlCenterChatComponent | null>(null);
  const [controlCenterError, setControlCenterError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || controlCenter || controlCenterError) {
      return;
    }
    let cancelled = false;
    const moduleSpec = CONTROL_CENTER_SPEC || "@dydact/control-center";
    import(/* @vite-ignore */ moduleSpec)
      .then((mod) => {
        if (cancelled) return;
        const component = (mod as Record<string, unknown>).ControlCenterChat;
        if (typeof component === "function") {
          setControlCenter(() => component as ControlCenterChatComponent);
        } else {
          setControlCenterError("Control Center module does not export ControlCenterChat");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setControlCenterError(toMessage(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, controlCenter, controlCenterError]);

  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const payload = await client.request<{ data: ChatSessionSummary[] }>({
        path: "/chat/sessions",
        method: "GET"
      });
      const list = Array.isArray(payload?.data) ? payload.data : [];
      setSessions(list);
      if (!activeSessionId && list.length > 0) {
        setActiveSessionId(list[0].id);
      }
      setSessionError(null);
    } catch (error) {
      setSessionError(toMessage(error));
    } finally {
      setSessionsLoading(false);
      setSessionsLoaded(true);
    }
  }, [client, activeSessionId]);

  useEffect(() => {
    if (!open || sessionsLoaded) {
      return;
    }
    void fetchSessions();
  }, [open, sessionsLoaded, fetchSessions]);

  const handleCreateSession = useCallback(async () => {
    setCreatingSession(true);
    try {
      const descriptor = PRODUCT_LABELS[activeProduct];
      const response = await client.request<ChatSessionSummary>({
        path: "/chat/sessions",
        method: "POST",
        body: {
          name: `${descriptor.label} session`
        }
      });
      setSessions((prev) => [response, ...prev]);
      setActiveSessionId(response.id);
      setSessionError(null);
      if (trackEvent) {
        void trackEvent({
          name: "dock.chat_session_created",
          properties: {
            product: activeProduct
          }
        });
      }
    } catch (error) {
      setSessionError(toMessage(error));
    } finally {
      setCreatingSession(false);
    }
  }, [client, activeProduct, trackEvent]);

  const [alerts, setAlerts] = useState<ScrAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [ackPending, setAckPending] = useState<Set<string>>(new Set());

  const scrAlertsEnabled = products.includes("scrAiv");

  useEffect(() => {
    if (!open || !scrAlertsEnabled) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      setAlertsLoading(true);
      try {
        const data = await client.alerts.scr.list({ limit: 20 });
        if (!cancelled) {
          setAlerts(data);
          setAlertsError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setAlerts([]);
          setAlertsError(toMessage(error));
        }
      } finally {
        if (!cancelled) {
          setAlertsLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, scrAlertsEnabled, client]);

  const handleAcknowledgeAlert = useCallback(
    async (alertId: string) => {
      setAckPending((prev) => {
        const next = new Set(prev);
        next.add(alertId);
        return next;
      });
      try {
        const updated = await client.alerts.scr.acknowledge(alertId, {});
        setAlerts((prev) =>
          prev.map((alert) => (alert.alert_id === updated.alert_id ? updated : alert))
        );
        setAlertsError(null);
        if (trackEvent) {
          void trackEvent({
            name: "dock.alert_acknowledged",
            properties: {
              alert_id: alertId
            }
          });
        }
      } catch (error) {
        setAlertsError(toMessage(error));
      } finally {
        setAckPending((prev) => {
          const next = new Set(prev);
          next.delete(alertId);
          return next;
        });
      }
    },
    [client, trackEvent]
  );

  const ensureTracked = useCallback(
    (action: () => void, eventName: string, properties?: Record<string, unknown>) => {
      return () => {
        action();
        if (trackEvent) {
          void trackEvent({
            name: eventName,
            properties
          });
        }
        onRequestClose();
      };
    },
    [trackEvent, onRequestClose]
  );

  const quickActions = useMemo<QuickAction[]>(() => {
    const actions: QuickAction[] = [];
    const pushView = (view: ViewMode, label: string, description: string, icon: JSX.Element) => {
      if (!viewOptions.includes(view)) return;
      actions.push({
        id: `view-${view}`,
        label,
        description,
        active: currentView === view,
        icon,
        onSelect: ensureTracked(
          () => {
            if (currentView !== view) {
              onViewChange(view);
            }
          },
          "dock.view_selected",
          {
            view,
            product: activeProduct
          }
        )
      });
    };

    if (activeProduct === "taskr") {
      pushView("dashboard", "Dashboard overview", "Review portfolio health metrics.", <LayoutDashboard className="w-4 h-4" />);
      pushView("board", "Board planning", "Drag cards across swim lanes.", <MessageSquare className="w-4 h-4" />);
      pushView("list", "List focus", "Inline edits and quick triage.", <Command className="w-4 h-4" />);
      pushView("calendar", "Calendar", "Visualise timeline and capacity.", <Calendar className="w-4 h-4" />);
    } else if (activeProduct === "scrAiv") {
      pushView("claims", "Claims console", "Work scrAIv alerts and appeals.", <AlertTriangle className="w-4 h-4" />);
      pushView("hr", "HR operations", "Timesheets, payroll, scheduling bridge.", <Users className="w-4 h-4" />);
    } else if (activeProduct === "dydact") {
      pushView("dedicated", "Agent roster", "Monitor dedicated agent assignments.", <Satellite className="w-4 h-4" />);
      pushView("dashboard", "Shared dashboard", "Cross-product telemetry snapshots.", <LayoutDashboard className="w-4 h-4" />);
    }

    actions.push({
      id: "right-rail-toggle",
      label: rightPanelOpen ? "Hide AI beacon" : "Open AI beacon",
      description: "Toggle the right-side automation assistant.",
      icon: <Sparkles className="w-4 h-4" />,
      onSelect: ensureTracked(
        () => onToggleRightPanel(),
        "dock.right_panel_toggled",
        { open: !rightPanelOpen }
      )
    });

    const productSpaces = spacesByProduct.get(activeProduct) ?? [];
    productSpaces
      .slice(0, 3)
      .forEach((space) => {
        actions.push({
          id: `space-${space.spaceId}`,
          label: space.name,
          description: activeSpaceId === space.spaceId ? "Currently focused workspace." : "Switch workspace context.",
          active: activeSpaceId === space.spaceId,
          icon: <MessageSquare className="w-4 h-4" />,
          onSelect: ensureTracked(
            () => onSelectSpace(space.spaceId),
            "dock.space_selected",
            { space_id: space.spaceId, product: activeProduct }
          )
        });
      });

    return actions;
  }, [
    activeProduct,
    activeSpaceId,
    currentView,
    ensureTracked,
    onSelectSpace,
    onToggleRightPanel,
    onViewChange,
    rightPanelOpen,
    spacesByProduct,
    viewOptions
  ]);

  const runtimeUrl = useMemo(() => RUNTIME_URL || DEFAULT_RUNTIME_URL, []);

  const serviceDefinition = useMemo(() => buildServiceDefinition(activeProduct), [activeProduct]);

  const chatHeaders = useMemo(() => {
    const headers: Record<string, string> = {};
    if (env.userId) {
      headers["x-user-id"] = env.userId;
    }
    if (SESSION_ID_HEADER) {
      headers["session_id"] = SESSION_ID_HEADER;
    }
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      headers["x-request-id"] = crypto.randomUUID();
    }
    headers["x-dydact-surface"] = activeProduct;
    return headers;
  }, [activeProduct]);

  const avatarUrl = useMemo(() => {
    if (!SERVICE_AVATAR_URL) return undefined;
    if (typeof window !== "undefined") {
      try {
        return new URL(SERVICE_AVATAR_URL, window.location.origin).toString();
      } catch {
        return SERVICE_AVATAR_URL;
      }
    }
    return SERVICE_AVATAR_URL;
  }, []);

  const fallbackUrl = useMemo(() => {
    const base = CONTAINER_URL || CHAT_URL || DEFAULT_CONTAINER_URL;
    if (typeof window === "undefined") {
      return base;
    }
    try {
      const url = new URL(base, window.location.origin);
      url.searchParams.set("tenant", env.tenantId);
      if (env.userId) {
        url.searchParams.set("user", env.userId);
      }
      url.searchParams.set("embed", "1");
      url.searchParams.set("surface", activeProduct);
      return url.toString();
    } catch {
      return base;
    }
  }, [activeProduct]);

  const unreadAlerts = useMemo(
    () => alerts.filter((alert) => !alert.acknowledged_at),
    [alerts]
  );

  const handleControlCenterSessionChange = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId);
      setSessions((prev) => {
        if (prev.some((session) => session.id === sessionId)) {
          return prev;
        }
        const now = new Date().toISOString();
        const placeholder: ChatSessionSummary = {
          id: sessionId,
          name: "Session",
          created: now,
          updated: now
        };
        return [placeholder, ...prev];
      });
    },
    []
  );

  const renderQuickActions = () => {
    if (quickActions.length === 0) {
      return (
        <p className={`${colors.textSecondary} text-xs`}>
          No quick actions available yet. Explore spaces to populate shortcuts.
        </p>
      );
    }
    return quickActions.map((action) => (
      <button
        key={action.id}
        type="button"
        onClick={action.onSelect}
        className={clsx(
          "w-full rounded-2xl border border-white/10 px-3 py-2 text-left transition-all",
          theme === "dark"
            ? "bg-white/5 hover:bg-white/10 text-white"
            : "bg-white/70 hover:bg-white text-slate-900 shadow-sm",
          action.active ? "ring-2 ring-violet-400/60" : ""
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center rounded-xl bg-white/10 p-2 text-white/80 dark:bg-white/15">
            {action.icon}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{action.label}</p>
            {action.description && (
              <p className={`${colors.textSecondary} text-xs truncate`}>{action.description}</p>
            )}
          </div>
        </div>
      </button>
    ));
  };

  const renderSessions = () => {
    if (sessionError) {
      return <p className="text-xs text-amber-400">{sessionError}</p>;
    }
    if (sessionsLoading && sessions.length === 0) {
      return <p className={`${colors.textSecondary} text-xs`}>Loading conversations…</p>;
    }
    if (!sessions.length) {
      return (
        <p className={`${colors.textSecondary} text-xs`}>
          Start a conversation to sync context with Dydact.
        </p>
      );
    }
    return sessions.map((session) => (
      <button
        key={session.id}
        type="button"
        onClick={() => setActiveSessionId(session.id)}
        className={clsx(
          "w-full rounded-xl px-3 py-2 text-left transition-colors",
          session.id === activeSessionId
            ? theme === "dark"
              ? "bg-violet-500/20 text-white"
              : "bg-violet-100 text-slate-900"
            : theme === "dark"
            ? "bg-white/5 hover:bg-white/10 text-white/80"
            : "bg-white/70 hover:bg-white text-slate-800"
        )}
      >
        <p className="truncate text-sm font-semibold">{session.name}</p>
        <p className={`${colors.textSecondary} text-[11px]`}>
          Updated {new Date(session.updated).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </p>
      </button>
    ));
  };

  const renderAlerts = () => {
    if (alertsError) {
      return <p className="text-xs text-amber-400">{alertsError}</p>;
    }
    if (alertsLoading && alerts.length === 0) {
      return <p className={`${colors.textSecondary} text-xs`}>Fetching scrAIv alerts…</p>;
    }
    if (!alerts.length) {
      return <p className={`${colors.textSecondary} text-xs`}>No open alerts right now.</p>;
    }
    return alerts.slice(0, 4).map((alert) => {
      const acknowledged = Boolean(alert.acknowledged_at);
      const isPending = ackPending.has(alert.alert_id);
      return (
        <div
          key={alert.alert_id}
          className={clsx(
            "rounded-xl border px-3 py-2",
            theme === "dark"
              ? "border-white/10 bg-white/5 text-white/80"
              : "border-slate-200/50 bg-white/80 text-slate-800"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold truncate">{alert.message}</p>
              <p className="text-xs opacity-70">
                {new Date(alert.created_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit"
                })}
              </p>
            </div>
            <Badge
              className={clsx(
                "border-0 text-[10px]",
                acknowledged
                  ? "bg-emerald-500/20 text-emerald-100"
                  : "bg-rose-500/20 text-rose-100"
              )}
            >
              {acknowledged ? "Cleared" : alert.severity.toUpperCase()}
            </Badge>
          </div>
          {!acknowledged && (
            <Button
              size="sm"
              variant="ghost"
              className={clsx(
                "mt-2 w-full rounded-lg",
                theme === "dark" ? "text-white/80 hover:bg-white/10" : "text-slate-800 hover:bg-white"
              )}
              onClick={() => handleAcknowledgeAlert(alert.alert_id)}
              disabled={isPending}
            >
              {isPending ? "Acknowledging…" : "Mark resolved"}
            </Button>
          )}
        </div>
      );
    });
  };

  const renderChatSurface = () => {
    if (controlCenterError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
          <p className="text-sm font-semibold text-white">Dydact overlay unavailable</p>
          <p className="text-xs text-white/70">{controlCenterError}</p>
          <a
            className="text-xs underline text-violet-200"
            href={fallbackUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open in new tab
          </a>
        </div>
      );
    }
    if (!controlCenter) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <Sparkles className="w-8 h-8 text-violet-300 animate-pulse" />
          <p className="text-sm font-semibold text-white">Loading Dydact workspace…</p>
          <p className="text-xs text-white/70">Preparing shared chat container.</p>
        </div>
      );
    }
    return (
      <controlCenter
        service={serviceDefinition}
        runtimeUrl={runtimeUrl}
        tenantId={env.tenantId}
        headers={chatHeaders}
        avatarUrl={avatarUrl}
        threadId={activeSessionId ?? undefined}
        onSessionChange={handleControlCenterSessionChange}
      />
    );
  };

  return (
    <div className="pointer-events-none fixed left-4 top-24 z-50 flex justify-start">
      <div
        role="dialog"
        aria-label="Dydact workspace dock"
        className={clsx(
          "pointer-events-auto w-[420px] max-h-[calc(100vh-140px)] rounded-[32px] border shadow-[0_30px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl transition-all duration-200",
          colors.cardBorder,
          theme === "dark" ? "bg-slate-900/90" : "bg-white/80",
          open ? "translate-x-0 opacity-100" : "-translate-x-6 opacity-0 pointer-events-none"
        )}
        onMouseEnter={onIntentOpen}
        onMouseLeave={onIntentClose}
      >
        <div className="flex h-full flex-col p-4">
          <header className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-white/60 dark:text-white/60">
                Dydact Dock
              </p>
              <h2 className={clsx("text-lg font-semibold", colors.text)}>
                {PRODUCT_LABELS[activeProduct].label}
              </h2>
              <p className={clsx("text-xs", colors.textSecondary)}>
                {PRODUCT_LABELS[activeProduct].description}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {scrAlertsEnabled && unreadAlerts.length > 0 && (
                <Badge className="bg-rose-500/30 text-rose-100 border-0">
                  {unreadAlerts.length} open
                </Badge>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={onRequestClose}
                className={clsx(
                  theme === "dark"
                    ? "text-white/70 hover:bg-white/10 hover:text-white"
                    : "text-slate-600 hover:bg-white hover:text-slate-900",
                  "rounded-xl"
                )}
                aria-label="Close Dydact dock"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </header>

          <div className="mt-3 flex flex-wrap gap-2">
            {products.map((product) => (
              <button
                type="button"
                key={product}
                onClick={() => setActiveProduct(product)}
                className={clsx(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-all",
                  product === activeProduct
                    ? "bg-violet-500/80 text-white shadow-md"
                    : theme === "dark"
                    ? "bg-white/10 text-white/70 hover:bg-white/15"
                    : "bg-white/80 text-slate-700 hover:bg-white"
                )}
              >
                {PRODUCT_LABELS[product].label}
              </button>
            ))}
          </div>

          <ScrollArea className="mt-4 max-h-[240px] pr-1">
            <div className="space-y-3">
              <section
                className={clsx(
                  "rounded-3xl border px-4 py-3",
                  theme === "dark" ? "border-white/10 bg-white/5" : "border-slate-200/60 bg-white/80"
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.35em] text-white/60 dark:text-white/70">
                    Quick Actions
                  </p>
                </div>
                <div className="mt-3 space-y-2">{renderQuickActions()}</div>
              </section>

              <section
                className={clsx(
                  "rounded-3xl border px-4 py-3",
                  theme === "dark" ? "border-white/10 bg-white/5" : "border-slate-200/60 bg-white/80"
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.35em] text-white/60 dark:text-white/70">
                    Conversations
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCreateSession}
                    disabled={creatingSession}
                    className={clsx(
                      "rounded-lg",
                      theme === "dark"
                        ? "text-white/80 hover:bg-white/10"
                        : "text-slate-700 hover:bg-white"
                    )}
                  >
                    <MessageSquare className="w-4 h-4 mr-1" />
                    {creatingSession ? "Creating…" : "New"}
                  </Button>
                </div>
                <div className="mt-3 space-y-2">{renderSessions()}</div>
              </section>

              {scrAlertsEnabled && (
                <section
                  className={clsx(
                    "rounded-3xl border px-4 py-3",
                    theme === "dark" ? "border-white/10 bg-white/5" : "border-slate-200/60 bg-white/80"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-[0.35em] text-white/60 dark:text-white/70">
                      Live Alerts
                    </p>
                    {alertsLoading && (
                      <Clock3 className="w-4 h-4 text-white/50 animate-spin" />
                    )}
                  </div>
                  <div className="mt-3 space-y-2">{renderAlerts()}</div>
                </section>
              )}
            </div>
          </ScrollArea>

          <div
            className={clsx(
              "mt-4 flex-1 overflow-hidden rounded-3xl border",
              theme === "dark"
                ? "border-white/10 bg-black/30"
                : "border-slate-200/60 bg-white/85"
            )}
          >
            {renderChatSurface()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DydactDock;
