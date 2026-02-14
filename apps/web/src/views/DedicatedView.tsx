import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Assignment, AssignmentEvent } from "@dydact/taskr-api-client";
import { useTaskRClient } from "../lib/client";
import { env } from "../config/env";
import { useDedicatedStream } from "../hooks/useDedicatedStream";
import "./placeholder-views.css";

// ============================================================================
// Types & Constants
// ============================================================================

type AgentStatus = "active" | "busy" | "idle";

type AgentConfig = {
  slug: string;
  name: string;
  color: string;
  description: string;
  icon: React.ReactNode;
};

const AGENT_CONFIGS: AgentConfig[] = [
  {
    slug: "kairos",
    name: "Kairos",
    color: "#ec4899",
    description: "Temporal reasoning and deadline management",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
      </svg>
    )
  },
  {
    slug: "sentinel",
    name: "Sentinel",
    color: "#6c7bff",
    description: "Security monitoring and compliance checks",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    )
  },
  {
    slug: "oracle",
    name: "Oracle",
    color: "#4ad0a7",
    description: "Predictive analytics and data insights",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    )
  },
  {
    slug: "tempo",
    name: "Tempo",
    color: "#f7b23b",
    description: "Workflow orchestration and scheduling",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    )
  },
  {
    slug: "nexus",
    name: "Nexus",
    color: "#38bdf8",
    description: "Integration hub and data synchronization",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        <polyline points="7.5,4.21 12,6.81 16.5,4.21" />
        <polyline points="7.5,19.79 7.5,14.6 3,12" />
        <polyline points="21,12 16.5,14.6 16.5,19.79" />
        <polyline points="3.27,6.96 12,12.01 20.73,6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    )
  },
  {
    slug: "polaris",
    name: "Polaris",
    color: "#8b5cf6",
    description: "Governance oversight and obligation tracking",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    )
  }
];

type AgentState = {
  slug: string;
  status: AgentStatus;
  currentTask: string | null;
  lastActive: string | null;
  assignmentCount: number;
  assignment: Assignment | null;
};

// ============================================================================
// Helper Functions
// ============================================================================

const formatTimestamp = (iso: string | null | undefined) => {
  if (!iso) return "Never";
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  } catch {
    return iso;
  }
};

const getAgentStatus = (assignments: Assignment[], slug: string): AgentStatus => {
  const agentAssignments = assignments.filter((a) => a.agent_slug === slug);
  if (agentAssignments.length === 0) return "idle";

  const hasActive = agentAssignments.some((a) => a.status === "active");
  if (hasActive) return "active";

  const hasPending = agentAssignments.some((a) => a.status === "pending" || a.status === "paused");
  if (hasPending) return "busy";

  return "idle";
};

const getOverlayString = (overlay: Assignment["overlay"] | undefined, key: string) => {
  if (!overlay) return null;
  const value = overlay[key];
  return typeof value === "string" ? value : null;
};

const toErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unexpected error";
  }
};

// ============================================================================
// Components
// ============================================================================

type AgentCardProps = {
  config: AgentConfig;
  state: AgentState;
  isSelected: boolean;
  onClick: () => void;
};

const AgentCard: React.FC<AgentCardProps> = ({ config, state, isSelected, onClick }) => {
  return (
    <button
      type="button"
      className={`dedicated-agent-card${isSelected ? " dedicated-agent-card--selected" : ""}`}
      onClick={onClick}
      style={{ "--agent-color": config.color } as React.CSSProperties}
    >
      <div className="dedicated-agent-card__avatar">
        <span className={`dedicated-agent-card__status dedicated-agent-card__status--${state.status}`} />
        <span className="dedicated-agent-card__icon" style={{ color: config.color }}>
          {config.icon}
        </span>
      </div>
      <div className="dedicated-agent-card__info">
        <span className="dedicated-agent-card__name">{config.name}</span>
        <span className="dedicated-agent-card__status-label">{state.status}</span>
      </div>
      {state.currentTask && (
        <div className="dedicated-agent-card__task">
          <span className="dedicated-agent-card__task-label">Task:</span>
          <span className="dedicated-agent-card__task-value">{state.currentTask}</span>
        </div>
      )}
      <div className="dedicated-agent-card__meta">
        <span className="dedicated-agent-card__assignments">{state.assignmentCount} assignments</span>
        <span className="dedicated-agent-card__last-active">{formatTimestamp(state.lastActive)}</span>
      </div>
    </button>
  );
};

type AgentDetailPanelProps = {
  config: AgentConfig | null;
  state: AgentState | null;
  events: AssignmentEvent[];
  eventsLoading: boolean;
  eventsError: string | null;
  onAssign: () => void;
  onUnassign: () => void;
};

const AgentDetailPanel: React.FC<AgentDetailPanelProps> = ({
  config,
  state,
  events,
  eventsLoading,
  eventsError,
  onAssign,
  onUnassign
}) => {
  if (!config || !state) {
    return (
      <div className="dedicated-detail glass-surface">
        <div className="dedicated-detail__empty">Select an agent to view details</div>
      </div>
    );
  }

  const assignment = state.assignment;

  return (
    <div className="dedicated-detail glass-surface">
      <header className="dedicated-detail__header">
        <div className="dedicated-detail__avatar" style={{ "--agent-color": config.color } as React.CSSProperties}>
          <span className="dedicated-detail__icon" style={{ color: config.color }}>
            {config.icon}
          </span>
        </div>
        <div className="dedicated-detail__title">
          <h2>{config.name}</h2>
          <p className="dedicated-detail__description">{config.description}</p>
        </div>
        <div className="dedicated-detail__actions">
          <button
            type="button"
            className="dedicated-detail__btn dedicated-detail__btn--assign"
            onClick={onAssign}
            disabled={state.status === "active"}
          >
            Assign Task
          </button>
          <button
            type="button"
            className="dedicated-detail__btn dedicated-detail__btn--unassign"
            onClick={onUnassign}
            disabled={!assignment || assignment.status === "completed"}
          >
            Unassign
          </button>
        </div>
      </header>

      <div className="dedicated-detail__status-bar">
        <span className={`dedicated-detail__status-badge dedicated-detail__status-badge--${state.status}`}>
          {state.status.toUpperCase()}
        </span>
        <span className="dedicated-detail__status-meta">
          {state.assignmentCount} total assignments | Last active: {formatTimestamp(state.lastActive)}
        </span>
      </div>

      {assignment ? (
        <>
          <section className="dedicated-section">
            <h3>Current Task</h3>
            <div className="dedicated-task-card glass-surface">
              <div className="dedicated-task-card__header">
                <span className={`dedicated-status dedicated-status--${assignment.status}`}>{assignment.status}</span>
                <span className="dedicated-task-card__id">ID: {assignment.assignment_id.slice(0, 8)}</span>
              </div>
              <div className="dedicated-task-card__title">
                {getOverlayString(assignment.overlay, "label") || assignment.agent_slug}
              </div>
              {assignment.node_id && (
                <div className="dedicated-task-card__meta">Node: {assignment.node_id}</div>
              )}
              {assignment.tags?.length ? (
                <div className="dedicated-task-card__tags">
                  {assignment.tags.map((tag) => (
                    <span key={tag} className="dedicated-chip">{tag}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section className="dedicated-section">
            <h3>Prompt History</h3>
            {assignment.prompt_history.length === 0 ? (
              <p className="dedicated-empty">No prompt turns recorded.</p>
            ) : (
              <ul className="dedicated-prompt-history">
                {assignment.prompt_history.slice(-8).map((turn, index) => (
                  <li key={`${turn.role}-${index}`} className={`dedicated-prompt dedicated-prompt--${turn.role}`}>
                    <div className="dedicated-prompt__header">
                      <span className="dedicated-chip dedicated-chip--role">{turn.role}</span>
                      {turn.created_at && (
                        <span className="dedicated-prompt__time">{formatTimestamp(turn.created_at)}</span>
                      )}
                    </div>
                    <pre className="dedicated-prompt__content">{String(turn.content)}</pre>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dedicated-section">
            <h3>Polaris Obligations</h3>
            {assignment.polaris_obligations.length === 0 ? (
              <p className="dedicated-empty">No active obligations.</p>
            ) : (
              <ul className="dedicated-obligations">
                {assignment.polaris_obligations.map((obligation) => (
                  <li key={obligation.obligation_id} className="dedicated-obligation">
                    <div className="dedicated-obligation__header">
                      <span className="dedicated-obligation__kind">{obligation.kind}</span>
                      <span className={`dedicated-chip dedicated-chip--${obligation.status}`}>
                        {obligation.status}
                      </span>
                    </div>
                    {obligation.due_at && (
                      <div className="dedicated-obligation__due">Due: {formatTimestamp(obligation.due_at)}</div>
                    )}
                    {obligation.metadata && Object.keys(obligation.metadata).length > 0 && (
                      <pre className="dedicated-obligation__meta">
                        {JSON.stringify(obligation.metadata, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dedicated-section">
            <h3>Timeline</h3>
            {eventsError && <div className="dedicated-error">{eventsError}</div>}
            {eventsLoading ? (
              <div className="dedicated-empty">Loading events...</div>
            ) : events.length === 0 ? (
              <div className="dedicated-empty">No events recorded.</div>
            ) : (
              <ul className="dedicated-timeline">
                {events.slice(0, 15).map((event) => (
                  <li key={event.event_id} className="dedicated-event">
                    <div className="dedicated-event__dot" />
                    <div className="dedicated-event__content">
                      <div className="dedicated-event__header">
                        <span className="dedicated-chip">{event.event_type}</span>
                        <span className="dedicated-event__time">{formatTimestamp(event.occurred_at)}</span>
                      </div>
                      {event.source && (
                        <p className="dedicated-event__source">Source: {event.source}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <div className="dedicated-no-assignment">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12h8M12 8v8" />
          </svg>
          <p>No active assignment</p>
          <span>Assign a task to this agent to get started</span>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

type DedicatedViewProps = {
  initialAgent?: string;
};

export const DedicatedView: React.FC<DedicatedViewProps> = ({ initialAgent }) => {
  const client = useTaskRClient();
  const tenantId = env.tenantId;
  const userId = env.userId;

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>(initialAgent || "kairos");
  const [events, setEvents] = useState<AssignmentEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState<boolean>(false);

  // Update selected agent when prop changes
  useEffect(() => {
    if (initialAgent && initialAgent !== selectedAgent) {
      setSelectedAgent(initialAgent);
    }
  }, [initialAgent]);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const { event: streamEvent, error: streamError } = useDedicatedStream(tenantId, {
    enabled: Boolean(tenantId),
    userId
  });

  // Load all assignments
  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await client.dedicated.assignments.list({});
      setAssignments(payload);
    } catch (err) {
      setAssignments([]);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  // Initial load
  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  // Compute agent states from assignments
  const agentStates = useMemo(() => {
    const states: Record<string, AgentState> = {};

    for (const config of AGENT_CONFIGS) {
      const agentAssignments = assignments.filter((a) => a.agent_slug === config.slug);
      const activeAssignment = agentAssignments.find((a) => a.status === "active" || a.status === "pending");
      const latestUpdate = agentAssignments.reduce<string | null>((latest, a) => {
        const ts = a.updated_at ?? a.created_at;
        if (!latest) return ts;
        return new Date(ts).getTime() > new Date(latest).getTime() ? ts : latest;
      }, null);

      states[config.slug] = {
        slug: config.slug,
        status: getAgentStatus(assignments, config.slug),
        currentTask: activeAssignment
          ? getOverlayString(activeAssignment.overlay, "label") || activeAssignment.assignment_id.slice(0, 8)
          : null,
        lastActive: latestUpdate,
        assignmentCount: agentAssignments.length,
        assignment: activeAssignment ?? agentAssignments[0] ?? null
      };
    }

    return states;
  }, [assignments]);

  // Handle SSE stream events
  useEffect(() => {
    if (!streamEvent) return;

    if (streamEvent.action === "assignment_upserted") {
      const incoming = streamEvent.payload as Assignment;
      setAssignments((prev) => {
        const next = [...prev];
        const index = next.findIndex((item) => item.assignment_id === incoming.assignment_id);
        if (index === -1) {
          next.unshift(incoming);
        } else {
          next[index] = incoming;
        }
        return next;
      });
    } else if (streamEvent.action === "assignment_event") {
      const incomingEvent = streamEvent.payload as AssignmentEvent;
      const currentAssignment = agentStates[selectedAgent]?.assignment;
      if (currentAssignment && incomingEvent.assignment_id === currentAssignment.assignment_id) {
        setEvents((prev) => {
          if (prev.some((item) => item.event_id === incomingEvent.event_id)) return prev;
          const next = [incomingEvent, ...prev];
          return next.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
        });
      }
    }
  }, [streamEvent, selectedAgent, agentStates]);

  // Load events for selected agent's assignment
  useEffect(() => {
    const assignment = agentStates[selectedAgent]?.assignment;
    if (!assignment) {
      setEvents([]);
      return;
    }

    let cancelled = false;
    setEventsLoading(true);
    setEventsError(null);

    client.dedicated.events
      .list(assignment.assignment_id, 100)
      .then((records) => {
        if (cancelled) return;
        const sorted = [...records].sort(
          (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
        );
        setEvents(sorted);
      })
      .catch((err) => {
        if (cancelled) return;
        setEvents([]);
        setEventsError(toErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, selectedAgent, agentStates]);

  const selectedConfig = AGENT_CONFIGS.find((c) => c.slug === selectedAgent) ?? null;
  const selectedState = agentStates[selectedAgent] ?? null;

  const handleAssign = useCallback(() => {
    // In a real implementation, this would open a modal or drawer to create an assignment
    alert(`Assign task to ${selectedConfig?.name ?? selectedAgent}`);
  }, [selectedAgent, selectedConfig]);

  const handleUnassign = useCallback(async () => {
    const assignment = selectedState?.assignment;
    if (!assignment) return;

    if (!confirm(`Cancel assignment for ${selectedConfig?.name}?`)) return;

    try {
      // In a real implementation, call the API to cancel/complete the assignment
      // await client.dedicated.assignments.cancel(assignment.assignment_id);
      await loadAssignments();
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }, [selectedState, selectedConfig, loadAssignments]);

  const handleRefresh = useCallback(() => {
    void loadAssignments();
  }, [loadAssignments]);

  return (
    <div className="dedicated-view">
      <div className="dedicated-view__header glass-surface">
        <div className="dedicated-view__title">
          <h1>Dedicated Agents</h1>
          <p className="dedicated-view__subtitle">
            Manage AI agent assignments, view status, and track Polaris obligations
          </p>
        </div>
        <div className="dedicated-view__actions">
          <button type="button" className="dedicated-view__refresh" onClick={handleRefresh} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="dedicated-error glass-surface">{error}</div>}
      {streamError && <div className="dedicated-error glass-surface">Stream error: {streamError}</div>}

      <div className="dedicated-view__content">
        <div className="dedicated-grid">
          {AGENT_CONFIGS.map((config) => (
            <AgentCard
              key={config.slug}
              config={config}
              state={agentStates[config.slug]}
              isSelected={selectedAgent === config.slug}
              onClick={() => setSelectedAgent(config.slug)}
            />
          ))}
        </div>

        <AgentDetailPanel
          config={selectedConfig}
          state={selectedState}
          events={events}
          eventsLoading={eventsLoading}
          eventsError={eventsError}
          onAssign={handleAssign}
          onUnassign={handleUnassign}
        />
      </div>
    </div>
  );
};
