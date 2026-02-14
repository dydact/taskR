import React, { useEffect, useMemo, useState } from "react";
import type { CalendarEvent, CalendarSource } from "@dydact/taskr-api-client";
import type { Task } from "../types/task";
import { useTaskRClient } from "../lib/client";

type CalendarViewProps = {
  hasSelection: boolean;
  listLabel?: string | null;
  tasks: Task[];
};

const formatDate = (value?: string | null) => {
  if (!value) return "TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "TBD";
  return parsed.toLocaleString();
};

export const CalendarView: React.FC<CalendarViewProps> = ({ hasSelection, listLabel, tasks }) => {
  const client = useTaskRClient();
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCalendar = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sourceData, eventData] = await Promise.all([
        client.calendar.sources.list(),
        client.calendar.events.list()
      ]);
      setSources(sourceData);
      setEvents(eventData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalendar();
  }, [client]);

  const sourceNameMap = useMemo(() => {
    const map = new Map<string, string>();
    sources.forEach((source) => {
      map.set(source.source_id, source.name || source.slug);
    });
    return map;
  }, [sources]);

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return [...events]
      .filter((event) => {
        const start = new Date(event.start_at).getTime();
        const end = new Date(event.end_at).getTime();
        return Number.isFinite(start) && (end >= now || start >= now);
      })
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
      .slice(0, 10);
  }, [events]);

  const upcomingDeadlines = useMemo(() => {
    return tasks
      .filter((task) => task.due_at)
      .sort((a, b) => {
        const aTime = new Date(a.due_at ?? "").getTime();
        const bTime = new Date(b.due_at ?? "").getTime();
        return aTime - bTime;
      })
      .slice(0, 10);
  }, [tasks]);

  const showEmptyPrompt = !hasSelection && upcomingEvents.length === 0 && upcomingDeadlines.length === 0;

  return (
    <div className="calendar-view">
      <header className="calendar-header">
        <div>
          <p className="calendar-kicker">Calendar</p>
          <h2>Schedule & Deadlines</h2>
          <p className="calendar-subtext">
            {listLabel ? `Viewing ${listLabel}` : "Tenant-wide events and upcoming due dates."}
          </p>
        </div>
        <button type="button" className="calendar-refresh" onClick={loadCalendar} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {showEmptyPrompt ? (
        <p className="empty-state">Select a list to view deadlines or add calendar events.</p>
      ) : null}

      {error ? <p className="calendar-error">{error}</p> : null}

      <div className="calendar-grid">
        <section className="calendar-panel glass-surface">
          <div className="calendar-panel-header">
            <h3>Upcoming events</h3>
            <span className="calendar-count">{upcomingEvents.length} events</span>
          </div>
          {loading ? (
            <p className="calendar-placeholder">Loading events…</p>
          ) : upcomingEvents.length === 0 ? (
            <p className="calendar-placeholder">No upcoming events.</p>
          ) : (
            <ul className="calendar-list">
              {upcomingEvents.map((event) => (
                <li key={event.event_id} className="calendar-item">
                  <div>
                    <p className="calendar-item-title">{event.title}</p>
                    <p className="calendar-item-meta">
                      {formatDate(event.start_at)} → {formatDate(event.end_at)}
                    </p>
                    {event.location ? <p className="calendar-item-meta">{event.location}</p> : null}
                  </div>
                  <span className="calendar-badge">
                    {sourceNameMap.get(event.source_id) ?? "Calendar"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="calendar-panel glass-surface">
          <div className="calendar-panel-header">
            <h3>Upcoming deadlines</h3>
            <span className="calendar-count">{upcomingDeadlines.length} tasks</span>
          </div>
          {upcomingDeadlines.length === 0 ? (
            <p className="calendar-placeholder">No tasks with due dates.</p>
          ) : (
            <ul className="calendar-list">
              {upcomingDeadlines.map((task) => (
                <li key={task.task_id} className="calendar-item">
                  <div>
                    <p className="calendar-item-title">{task.title}</p>
                    <p className="calendar-item-meta">{formatDate(task.due_at)}</p>
                  </div>
                  <span className="calendar-badge status">{task.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
