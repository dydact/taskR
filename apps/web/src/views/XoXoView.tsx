import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Assignment, AssignmentEvent } from "@dydact/taskr-api-client";
import { useTaskRClient } from "../lib/client";
import { env } from "../config/env";
import { useDedicatedStream } from "../hooks/useDedicatedStream";

type StatusFilter = "all" | "pending" | "active" | "paused" | "completed" | "failed" | "cancelled";

const STATUS_LABELS: Record<Exclude<StatusFilter, "all">, string> = {
  pending: "Pending",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled"
};

const STATUS_ORDER: Exclude<StatusFilter, "all">[] = [
  "active",
  "pending",
  "paused",
  "completed",
  "failed",
  "cancelled"
];

const statusSortKey = (status: string) => {
  const index = STATUS_ORDER.indexOf(status as Exclude<StatusFilter, "all">);
  return index === -1 ? STATUS_ORDER.length : index;
};

const getOverlayString = (overlay: Assignment["overlay"] | undefined, key: string) => {
  if (!overlay) return null;
  const value = overlay[key];
  return typeof value === "string" ? value : null;
};

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
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

const sortAssignments = (items: Assignment[]) =>
  [...items].sort((a, b) => {
    if (a.status !== b.status) {
      return statusSortKey(a.status) - statusSortKey(b.status);
    }
    const aTime = new Date(a.updated_at ?? a.created_at).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at).getTime();
    return bTime - aTime;
  });

const allowStubSeed = () => {
  const base = env.taskrApiBase.toLowerCase();
  return base.includes("localhost") || base.includes("127.0.0.1") || base.includes("dev");
};

export const XoXoView: React.FC = () => {
  const client = useTaskRClient();
  const tenantId = env.tenantId;
  const userId = env.userId;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<AssignmentEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState<boolean>(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [stubBusy, setStubBusy] = useState<boolean>(false);

  const { event: streamEvent, error: streamError } = useDedicatedStream(tenantId, {
    enabled: Boolean(tenantId),
    userId
  });

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await client.dedicated.assignments.list({
        status: statusFilter !== "all" ? [statusFilter] : undefined,
        agent_slug: agentFilter !== "all" ? [agentFilter] : undefined
      });
      const sorted = sortAssignments(payload);
      setAssignments(sorted);
      setSelectedId((prev) => {
        if (prev && sorted.some((item) => item.assignment_id === prev)) {
          return prev;
        }
        return sorted[0]?.assignment_id ?? null;
      });
    } catch (err) {
      setAssignments([]);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [client, statusFilter, agentFilter]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    if (!streamEvent) return;

    if (streamEvent.action === "assignment_upserted") {
      const incoming = streamEvent.payload as Assignment;
      if (
        (statusFilter !== "all" && incoming.status !== statusFilter) ||
        (agentFilter !== "all" && incoming.agent_slug !== agentFilter)
      ) {
        return;
      }

      setAssignments((prev) => {
        const next = [...prev];
        const index = next.findIndex((item) => item.assignment_id === incoming.assignment_id);
        if (index === -1) {
          next.unshift(incoming);
        } else {
          next[index] = incoming;
        }
        return sortAssignments(next);
      });
    } else if (streamEvent.action === "assignment_event") {
      const incomingEvent = streamEvent.payload as AssignmentEvent;
      if (incomingEvent.assignment_id !== selectedId) {
        return;
      }
      setEvents((prev) => {
        if (prev.some((item) => item.event_id === incomingEvent.event_id)) {
          return prev;
        }
        const next = [incomingEvent, ...prev];
        return next.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
      });
    }
  }, [streamEvent, statusFilter, agentFilter, selectedId]);

  const selectedAssignment = useMemo(
    () => assignments.find((item) => item.assignment_id === selectedId) ?? null,
    [assignments, selectedId]
  );

  const filteredAssignments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return assignments;
    }

    return assignments.filter((assignment) => {
      const haystack = [
        assignment.assignment_id,
        assignment.agent_slug,
        assignment.agent_version ?? "",
        assignment.node_id ?? "",
        getOverlayString(assignment.overlay, "label") ?? "",
        ...(assignment.tags ?? [])
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [assignments, searchTerm]);

  useEffect(() => {
    if (!filteredAssignments.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => {
      if (prev && filteredAssignments.some((item) => item.assignment_id === prev)) {
        return prev;
      }
      return filteredAssignments[0].assignment_id;
    });
  }, [filteredAssignments]);

  useEffect(() => {
    if (!selectedId) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    setEventsLoading(true);
    setEventsError(null);

    client.dedicated.events
      .list(selectedId, 200)
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
        if (!cancelled) {
          setEventsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, selectedId]);

  const agentOptions = useMemo(() => {
    const unique = new Set<string>();
    assignments.forEach((assignment) => {
      if (assignment.agent_slug) {
        unique.add(assignment.agent_slug);
      }
    });
    return Array.from(unique).sort();
  }, [assignments]);

  const statusSummary = useMemo(() => {
    const summary = new Map<string, number>();
    assignments.forEach((assignment) => {
      const value = summary.get(assignment.status) ?? 0;
      summary.set(assignment.status, value + 1);
    });
    return summary;
  }, [assignments]);

  const handleSelectAssignment = useCallback((assignmentId: string) => {
    setSelectedId(assignmentId);
  }, []);

  const handleRefresh = useCallback(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const handleSeed = useCallback(async () => {
    setStubBusy(true);
    try {
      await client.dedicated.assignments.createStub();
      await loadAssignments();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setStubBusy(false);
    }
  }, [client, loadAssignments]);

  return (
    <div className="workspace-scroll">
      <div className="xoxo-panel">
        <div className="xoxo-panel__column xoxo-panel__column--list">
          <div className="xoxo-toolbar glass-surface">
            <div>
              <h2>xOxO Assignments</h2>
              <p className="xoxo-toolbar__meta">
                {loading ? "Loading assignments…" : `${filteredAssignments.length} visible`} •
                {" "}
                {assignments.length} total
              </p>
            </div>
            <div className="xoxo-toolbar__actions">
              <button type="button" onClick={handleRefresh} disabled={loading}>
                Refresh
              </button>
              {allowStubSeed() ? (
                <button type="button" onClick={handleSeed} disabled={stubBusy}>
                  {stubBusy ? "Seeding…" : "Seed demo"}
                </button>
              ) : null}
            </div>
          </div>
          <div className="xoxo-filters glass-surface">
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.currentTarget.value as StatusFilter)}
              >
                <option value="all">All</option>
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Agent
              <select
                value={agentFilter}
                onChange={(event) => setAgentFilter(event.currentTarget.value)}
              >
                <option value="all">All</option>
                {agentOptions.map((slug) => (
                  <option key={slug} value={slug}>
                    {slug}
                  </option>
                ))}
              </select>
            </label>
            <label className="xoxo-filters__search">
              Search
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.currentTarget.value)}
                placeholder="Agent, node, tag"
              />
            </label>
          </div>

          {error ? <div className="xoxo-error">{error}</div> : null}
          {streamError ? <div className="xoxo-error">SSE error: {streamError}</div> : null}

          <div className="xoxo-panel__list glass-surface">
            {loading && assignments.length === 0 ? (
              <div className="xoxo-empty">Loading…</div>
            ) : filteredAssignments.length === 0 ? (
              <div className="xoxo-empty">No assignments match the current filters.</div>
            ) : (
              <ul>
                {filteredAssignments.map((assignment) => {
                  const isActive = assignment.assignment_id === selectedId;
                  const overlayLabel = getOverlayString(assignment.overlay, "label");
                  return (
                    <li key={assignment.assignment_id}>
                      <button
                        type="button"
                        className={`xoxo-assignment${isActive ? " xoxo-assignment--active" : ""}`}
                        onClick={() => handleSelectAssignment(assignment.assignment_id)}
                      >
                        <div className="xoxo-assignment__header">
                          <span className={`xoxo-status xoxo-status--${assignment.status}`}>
                            {STATUS_LABELS[assignment.status as Exclude<StatusFilter, "all">] ?? assignment.status}
                          </span>
                          <span className="xoxo-assignment__timestamp">
                            Updated {formatDate(assignment.updated_at ?? assignment.created_at)}
                          </span>
                        </div>
                        <div className="xoxo-assignment__title">{assignment.agent_slug}</div>
                        <div className="xoxo-assignment__meta">
                          <span>ID: {assignment.assignment_id.slice(0, 8)}</span>
                          {assignment.node_id ? <span>Node: {assignment.node_id}</span> : null}
                          {overlayLabel ? <span>{overlayLabel}</span> : null}
                        </div>
                        {assignment.tags?.length ? (
                          <div className="xoxo-assignment__tags">
                            {assignment.tags.map((tag) => (
                              <span key={tag} className="xoxo-chip">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="xoxo-summary glass-surface">
            {STATUS_ORDER.map((status) => (
              <div key={status} className="xoxo-summary__item">
                <span className={`xoxo-status xoxo-status--${status}`}>{STATUS_LABELS[status]}</span>
                <span className="xoxo-summary__value">{statusSummary.get(status) ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="xoxo-panel__column xoxo-panel__column--detail">
          <div className="xoxo-detail glass-surface">
            {!selectedAssignment ? (
              <div className="xoxo-empty">Select an assignment to inspect details.</div>
            ) : (
              <>
                <header className="xoxo-detail__header">
                  <div>
                    <h2>{selectedAssignment.agent_slug}</h2>
                    <p className="xoxo-detail__subhead">
                      Assignment {selectedAssignment.assignment_id} • {selectedAssignment.status}
                    </p>
                  </div>
                  <div className="xoxo-detail__badges">
                    <span className={`xoxo-status xoxo-status--${selectedAssignment.status}`}>
                      {STATUS_LABELS[selectedAssignment.status as Exclude<StatusFilter, "all">] ?? selectedAssignment.status}
                    </span>
                    <span className="xoxo-chip">Priority: {selectedAssignment.priority}</span>
                    {selectedAssignment.feature_flags.map((flag) => (
                      <span key={flag} className="xoxo-chip">
                        {flag}
                      </span>
                    ))}
                  </div>
                </header>

                <section className="xoxo-section">
                  <h3>Overlay</h3>
                  {selectedAssignment.overlay && Object.keys(selectedAssignment.overlay).length > 0 ? (
                    <dl className="xoxo-properties">
                      {Object.entries(selectedAssignment.overlay).map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="xoxo-empty">No overlay metadata.</p>
                  )}
                </section>

                <section className="xoxo-section">
                  <h3>Prompt History</h3>
                  {selectedAssignment.prompt_history.length === 0 ? (
                    <p className="xoxo-empty">No prompt turns recorded.</p>
                  ) : (
                    <ul className="xoxo-prompt-history">
                      {selectedAssignment.prompt_history.slice(-10).map((turn, index) => (
                        <li key={`${turn.role}-${index}`}>
                          <header>
                            <span className="xoxo-chip">{turn.role}</span>
                            {turn.created_at ? <span>{formatDate(turn.created_at ?? null)}</span> : null}
                          </header>
                          <pre>{String(turn.content)}</pre>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="xoxo-section">
                  <h3>Polaris Obligations</h3>
                  {selectedAssignment.polaris_obligations.length === 0 ? (
                    <p className="xoxo-empty">No active obligations.</p>
                  ) : (
                    <ul className="xoxo-obligations">
                      {selectedAssignment.polaris_obligations.map((obligation) => (
                        <li key={obligation.obligation_id}>
                          <div className="xoxo-obligation__header">
                            <span>{obligation.kind}</span>
                            <span className="xoxo-chip">{obligation.status}</span>
                          </div>
                          {obligation.due_at ? (
                            <div className="xoxo-obligation__meta">Due {formatDate(obligation.due_at ?? null)}</div>
                          ) : null}
                          {obligation.metadata ? (
                            <pre>{JSON.stringify(obligation.metadata, null, 2)}</pre>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="xoxo-section">
                  <h3>Metadata</h3>
                  <div className="xoxo-detail-grid">
                    <dl>
                      <dt>Service Owner</dt>
                      <dd>{selectedAssignment.service_owner ?? "—"}</dd>
                    </dl>
                    <dl>
                      <dt>Node</dt>
                      <dd>{selectedAssignment.node_id ?? "—"}</dd>
                    </dl>
                    <dl>
                      <dt>Created</dt>
                      <dd>{formatDate(selectedAssignment.created_at)}</dd>
                    </dl>
                    <dl>
                      <dt>Updated</dt>
                      <dd>{formatDate(selectedAssignment.updated_at)}</dd>
                    </dl>
                  </div>
                  {Object.keys(selectedAssignment.metadata_json ?? {}).length ? (
                    <pre className="xoxo-json">
                      {JSON.stringify(selectedAssignment.metadata_json, null, 2)}
                    </pre>
                  ) : null}
                  {Object.keys(selectedAssignment.context ?? {}).length ? (
                    <>
                      <h4>Context</h4>
                      <pre className="xoxo-json">{JSON.stringify(selectedAssignment.context, null, 2)}</pre>
                    </>
                  ) : null}
                </section>

                <section className="xoxo-section">
                  <h3>Timeline</h3>
                  {eventsError ? <div className="xoxo-error">{eventsError}</div> : null}
                  {eventsLoading ? (
                    <div className="xoxo-empty">Loading events…</div>
                  ) : events.length === 0 ? (
                    <div className="xoxo-empty">No events recorded.</div>
                  ) : (
                    <ul className="xoxo-events">
                      {events.map((event) => (
                        <li key={event.event_id}>
                          <header>
                            <span className="xoxo-chip">{event.event_type}</span>
                            <span>{formatDate(event.occurred_at)}</span>
                          </header>
                          {event.source ? <p className="xoxo-event-source">Source: {event.source}</p> : null}
                          {Object.keys(event.payload ?? {}).length ? (
                            <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
