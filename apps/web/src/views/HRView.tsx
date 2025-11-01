import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Payroll, TimeClockItem, Timesheet } from '../types/hr';
import { MeetingNoteCard } from '../components/meeting/MeetingNoteCard';

const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

const dayFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
});

const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return dateTimeFmt.format(d);
};

const formatDay = (value?: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return dayFmt.format(d);
};

const formatDuration = (seconds?: number | null) => {
  if (seconds == null) return '';
  const abs = Math.abs(seconds);
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return (seconds < 0 ? '-' : '') + parts.join(' ');
};

type HRViewProps = { tenantId: string };

type HRUser = {
  user_id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  status?: string;
  roles?: string[];
  created_ts?: string;
};

const apiFetch = async (path: string, tenantId: string, init?: RequestInit) => {
  let modelProfile = 'general';
  try {
    const raw = localStorage.getItem('taskr_prefs_v1');
    if (raw) {
      const prefs = JSON.parse(raw) as { modelProfile?: string };
      if (prefs.modelProfile === 'reasoning') modelProfile = 'reasoning';
    }
  } catch {}
  const res = await fetch(path, {
    ...(init || {}),
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      'x-model-profile': modelProfile,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
};

const friendlyErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  if (raw.includes('503')) {
    return 'HR service unavailable. Ensure scrAIv is running and TR_SCRAIV_BASE_URL/TR_SCRAIV_API_KEY are set.';
  }
  if (raw.includes('Failed to fetch')) {
    return 'Unable to reach HR service. Check network/proxy configuration.';
  }
  return raw;
};

export const HRView: React.FC<HRViewProps> = ({ tenantId }) => {
  const [tab, setTab] = useState<'clock' | 'timesheets' | 'payroll' | 'summaries'>('clock');
  const [users, setUsers] = useState<HRUser[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [openClocks, setOpenClocks] = useState<TimeClockItem[]>([]);
  const [history, setHistory] = useState<TimeClockItem[]>([]);
  const [clocksError, setClocksError] = useState<string | null>(null);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [timesheetsError, setTimesheetsError] = useState<string | null>(null);
  const [timesheetStatus, setTimesheetStatus] = useState<string>('draft');
  const [timesheetUser, setTimesheetUser] = useState<string>('');
  const [genStart, setGenStart] = useState<string>('');
  const [genEnd, setGenEnd] = useState<string>('');
  const [period, setPeriod] = useState<string>('');
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  const [payrollError, setPayrollError] = useState<string | null>(null);
  const [payrollExporting, setPayrollExporting] = useState(false);
  const [payrollTarget, setPayrollTarget] = useState('csv');
  const [meetingTranscript, setMeetingTranscript] = useState<string>('');
  const [meetingResult, setMeetingResult] = useState<any | null>(null);
  const [autopmThread, setAutopmThread] = useState<string>('');
  const [autopmResult, setAutopmResult] = useState<any | null>(null);

  const timesheetSummary = useMemo(() => {
    if (!Array.isArray(timesheets) || timesheets.length === 0) {
      return { total: 0, byStatus: {} as Record<string, number>, totalHours: 0, payCodes: {} as Record<string, number> };
    }
    const byStatus: Record<string, number> = {};
    const payCodes: Record<string, number> = {};
    let totalHours = 0;
    for (const sheet of timesheets as any[]) {
      const status = String(sheet.status || 'unknown').toLowerCase();
      byStatus[status] = (byStatus[status] || 0) + 1;
      const lines = Array.isArray(sheet.lines) ? sheet.lines : [];
      for (const line of lines) {
        const hrs = Number(line?.hours ?? 0);
        if (!Number.isNaN(hrs)) totalHours += hrs;
        const code = line?.pay_code || line?.code || 'n/a';
        payCodes[code] = (payCodes[code] || 0) + hrs;
      }
    }
    return { total: timesheets.length, byStatus, totalHours, payCodes };
  }, [timesheets]);

  const payrollTotals = useMemo(() => {
    if (!payroll || !Array.isArray(payroll.totals)) {
      return { regular: 0, overtime: 0, paid: 0, pending: 0 };
    }
    return payroll.totals.reduce(
      (acc: { regular: number; overtime: number; paid: number; pending: number }, row: any) => {
        acc.regular += Number(row?.regular ?? 0);
        acc.overtime += Number(row?.overtime ?? 0);
        acc.paid += Number(row?.paid ?? 0);
        acc.pending += Number(row?.pending_count ?? 0);
        return acc;
      },
      { regular: 0, overtime: 0, paid: 0, pending: 0 }
    );
  }, [payroll]);

  const userById = useMemo(() => {
    const map = new Map<string, HRUser>();
    for (const u of users) map.set(u.user_id, u);
    return map;
  }, [users]);

  const formatUserName = useCallback(
    (userId: string | null | undefined) => {
      if (!userId) return "Unknown";
      const user = userById.get(userId);
      if (!user) return userId;
      if (user.display_name) return user.display_name;
      const parts = [user.first_name, user.last_name].filter(Boolean).join(" ");
      if (parts.trim()) return parts.trim();
      return user.email || userId;
    },
    [userById]
  );

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiFetch('/hr/users', tenantId);
      const arr = (data?.data ?? data ?? []) as HRUser[];
      setUsers(Array.isArray(arr) ? arr : []);
      setUsersError(null);
    } catch (e: any) {
      setUsersError(friendlyErrorMessage(e));
    }
  }, [tenantId]);

  const loadClocks = useCallback(async () => {
    try {
      const open = await apiFetch('/hr/timeclock/open', tenantId);
      setOpenClocks(open?.data ?? open ?? []);
      const hist = await apiFetch('/hr/timeclock/history', tenantId);
      setHistory(hist?.data ?? hist ?? []);
      setClocksError(null);
    } catch (e: any) {
      setClocksError(friendlyErrorMessage(e));
    }
  }, [tenantId]);

  const clockIn = useCallback(async () => {
    await apiFetch('/hr/timeclock/in', tenantId, { method: 'POST', body: JSON.stringify({}) });
    await loadClocks();
  }, [tenantId, loadClocks]);

  const clockOut = useCallback(async () => {
    await apiFetch('/hr/timeclock/out', tenantId, { method: 'POST', body: JSON.stringify({}) });
    await loadClocks();
  }, [tenantId, loadClocks]);

  const loadTimesheets = useCallback(async () => {
    try {
      const q: string[] = [];
      if (timesheetStatus) q.push(`status=${encodeURIComponent(timesheetStatus)}`);
      if (timesheetUser) q.push(`user_id=${encodeURIComponent(timesheetUser)}`);
      const url = `/hr/timesheets${q.length ? `?${q.join('&')}` : ''}`;
      const data = await apiFetch(url, tenantId);
      setTimesheets(data?.data ?? data ?? []);
      setTimesheetsError(null);
    } catch (e: any) {
      setTimesheetsError(friendlyErrorMessage(e));
    }
  }, [tenantId, timesheetStatus, timesheetUser]);

  const submitTimesheet = useCallback(async (entryId: string) => {
    await apiFetch(`/hr/timesheets/${entryId}/submit`, tenantId, { method: 'POST', body: JSON.stringify({}) });
    await loadTimesheets();
  }, [tenantId, loadTimesheets]);

  const approveTimesheet = useCallback(async (entryId: string) => {
    await apiFetch(`/hr/timesheets/${entryId}/approve`, tenantId, { method: 'POST', body: JSON.stringify({}) });
    await loadTimesheets();
  }, [tenantId, loadTimesheets]);

  const rejectTimesheet = useCallback(async (entryId: string) => {
    await apiFetch(`/hr/timesheets/${entryId}/reject`, tenantId, { method: 'POST', body: JSON.stringify({}) });
    await loadTimesheets();
  }, [tenantId, loadTimesheets]);

  const generateTimesheets = useCallback(async () => {
    if (!genStart || !genEnd) return;
    await apiFetch('/hr/timesheets/generate', tenantId, {
      method: 'POST',
      body: JSON.stringify({ start: genStart, end: genEnd, user_id: timesheetUser || undefined }),
    });
    await loadTimesheets();
  }, [tenantId, genStart, genEnd, timesheetUser, loadTimesheets]);

  const loadPayroll = useCallback(async () => {
    try {
      const url = `/hr/payroll${period ? `?period=${encodeURIComponent(period)}` : ''}`;
      const data = await apiFetch(url, tenantId);
      setPayroll(data);
      setPayrollError(null);
    } catch (e: any) {
      setPayrollError(friendlyErrorMessage(e));
    }
  }, [tenantId, period]);

  const exportPayroll = useCallback(async () => {
    if (!payroll) return;
    setPayrollExporting(true);
    try {
      const entryIds = Array.isArray(payroll.totals) ? payroll.totals.map((row: any) => row.entry_id).filter(Boolean) : [];
      await apiFetch('/hr/payroll/export', tenantId, {
        method: 'POST',
        body: JSON.stringify({
          entry_ids: entryIds,
          target_system: payrollTarget || 'csv'
        })
      });
    } catch (e: any) {
      setPayrollError(e?.message || String(e));
    } finally {
      setPayrollExporting(false);
    }
  }, [apiFetch, payroll, payrollTarget, tenantId]);

  const summarizeMeeting = useCallback(async () => {
    const data = await apiFetch('/summaries/meetings', tenantId, {
      method: 'POST',
      body: JSON.stringify({ transcript: meetingTranscript }),
    });
    setMeetingResult(data);
  }, [tenantId, meetingTranscript]);

  const summarizeAutoPM = useCallback(async () => {
    const lines = autopmThread.split('\n').map((s) => s.trim()).filter(Boolean);
    const data = await apiFetch('/summaries/autopm', tenantId, {
      method: 'POST',
      body: JSON.stringify({ thread: lines }),
    });
    setAutopmResult(data);
  }, [tenantId, autopmThread]);

  useEffect(() => {
    void loadUsers();
    void loadClocks();
    void loadTimesheets();
    // Subscribe to live HR events
    const es = new EventSource(`/events/stream?tenant=${encodeURIComponent(tenantId)}`);
    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data);
        const t = String(evt?.type || '');
        if (t === 'hr.clock.updated') {
          void loadClocks();
        } else if (t === 'hr.timesheet.submitted' || t === 'hr.timesheet.approved' || t === 'hr.timesheet.rejected') {
          void loadTimesheets();
        }
      } catch {
        // ignore
      }
    };
    return () => es.close();
  }, []);

  return (
    <div className="hr-view">
      <div className="hr-tabs">
        {(['clock', 'timesheets', 'payroll', 'summaries'] as const).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} type="button" onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'clock' && (
        <div className="hr-section">
          <div className="hr-summary">
            <div className="hr-summary__card">
              <span className="hr-summary__label">Open clocks</span>
              <span className="hr-summary__value">{openClocks.length}</span>
            </div>
            <div className="hr-summary__card">
              <span className="hr-summary__label">Clock history entries</span>
              <span className="hr-summary__value">{history.length}</span>
            </div>
          </div>
          <div className="hr-actions">
            <button type="button" onClick={() => void clockIn()}>Clock In</button>
            <button type="button" onClick={() => void clockOut()}>Clock Out</button>
            <button type="button" onClick={() => void loadClocks()}>Refresh</button>
          </div>
          {clocksError && <p className="error">{clocksError}</p>}
          <h3>Open Clocks</h3>
          <table className="hr-table"><thead><tr>
            <th>ID</th><th>User</th><th>Status</th><th>Started</th><th>Ended</th><th>Duration</th>
          </tr></thead><tbody>
            {(openClocks as any[]).map((c, i) => (
              <tr key={c.id || i}>
                <td>{c.id || c.clock_id || '-'}</td>
                <td>{formatUserName(c.user_id)}</td>
                <td>{c.status || 'in'}</td>
                <td>{formatDateTime(c.started_at || c.clock_in_ts)}</td>
                <td>{formatDateTime(c.ended_at || c.clock_out_ts)}</td>
                <td>{formatDuration(c.duration_sec)}</td>
              </tr>
            ))}
          </tbody></table>
          <h3>History</h3>
          <table className="hr-table"><thead><tr>
            <th>ID</th><th>User</th><th>Status</th><th>Started</th><th>Ended</th><th>Duration</th>
          </tr></thead><tbody>
            {(history as any[]).map((c, i) => (
              <tr key={c.id || i}>
                <td>{c.id || c.clock_id || '-'}</td>
                <td>{formatUserName(c.user_id)}</td>
                <td>{c.status || (c.ended_at || c.clock_out_ts ? 'out' : 'in')}</td>
                <td>{formatDateTime(c.started_at || c.clock_in_ts)}</td>
                <td>{formatDateTime(c.ended_at || c.clock_out_ts)}</td>
                <td>{formatDuration(c.duration_sec)}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {tab === 'timesheets' && (
        <div className="hr-section">
          <div className="hr-filters">
            <label>
              Status
              <select value={timesheetStatus} onChange={(e) => setTimesheetStatus(e.target.value)}>
                <option value="">Any</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
              </select>
            </label>
            <label>
              User
              <select value={timesheetUser} onChange={(e) => setTimesheetUser(e.target.value)}>
                <option value="">Any</option>
                {users.map((u) => (
                  <option key={u.user_id} value={u.user_id}>{u.email || u.user_id}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => void loadTimesheets()}>Refresh</button>
          </div>
          <div className="hr-filters">
            <label>
              Generate from
              <input type="date" value={genStart} onChange={(e) => setGenStart(e.target.value)} />
            </label>
            <label>
              to
              <input type="date" value={genEnd} onChange={(e) => setGenEnd(e.target.value)} />
            </label>
            <button type="button" onClick={() => void generateTimesheets()} disabled={!genStart || !genEnd}>Generate</button>
          </div>
          {usersError && <p className="error">Users: {usersError}</p>}
          {timesheetsError && <p className="error">Timesheets: {timesheetsError}</p>}
          <div className="hr-summary">
            <div className="hr-summary__card">
              <span className="hr-summary__label">Total</span>
              <span className="hr-summary__value">{timesheetSummary.total}</span>
            </div>
            {Object.entries(timesheetSummary.byStatus).map(([status, count]) => (
              <div key={status} className="hr-summary__card">
                <span className="hr-summary__label">{status}</span>
                <span className="hr-summary__value">{count}</span>
              </div>
            ))}
            <div className="hr-summary__card">
              <span className="hr-summary__label">Hours</span>
              <span className="hr-summary__value">{timesheetSummary.totalHours.toFixed(1)}</span>
            </div>
            {Object.entries(timesheetSummary.payCodes).map(([code, hrs]) => (
              <div key={code} className="hr-summary__card">
                <span className="hr-summary__label">{code}</span>
                <span className="hr-summary__value">{hrs.toFixed(1)}h</span>
              </div>
            ))}
          </div>
          <table className="hr-table"><thead><tr>
            <th>ID</th><th>User</th><th>Period</th><th>Status</th><th>Approved</th><th>Pay Codes</th><th>Actions</th>
          </tr></thead><tbody>
            {(timesheets as any[]).map((t: any, i: number) => {
              const lines = Array.isArray(t.lines) ? t.lines : [];
              const payCodes = lines.reduce((acc: Record<string, number>, line: any) => {
                const code = line?.pay_code || line?.code || 'n/a';
                const hrs = Number(line?.hours ?? 0);
                if (!Number.isNaN(hrs)) acc[code] = (acc[code] || 0) + hrs;
                return acc;
              }, {});
              const payCodesDisplay = Object.entries(payCodes)
                .map(([code, hrs]) => `${code}: ${hrs.toFixed(1)}h`)
                .join(', ');
              return (
                <tr key={t.id || i}>
                  <td>{t.id || t.entry_id || '-'}</td>
                  <td>{formatUserName(t.user_id)}</td>
                  <td>{t.period ? `${formatDay(t.period.start)} → ${formatDay(t.period.end)}` : ''}</td>
                  <td>{t.status}</td>
                  <td>{t.approved_ts ? formatDateTime(t.approved_ts) : ''}</td>
                  <td>{payCodesDisplay}</td>
                  <td>
                    {t.status === 'draft' && (
                      <button type="button" onClick={() => void submitTimesheet(String(t.id || t.entry_id))}>Submit</button>
                    )}
                    {t.status === 'submitted' && (
                      <>
                        <button type="button" onClick={() => void approveTimesheet(String(t.id || t.entry_id))}>Approve</button>
                        <button type="button" onClick={() => void rejectTimesheet(String(t.id || t.entry_id))} style={{ marginLeft: 6 }}>Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody></table>
          <div>
            <label>
              Submit entry id
              <input id="submit-entry" type="text" placeholder="timesheet id" onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const id = (e.currentTarget as HTMLInputElement).value.trim();
                  if (id) void submitTimesheet(id);
                }
              }} />
            </label>
            <button type="button" onClick={() => {
              const input = document.getElementById('submit-entry') as HTMLInputElement | null;
              const id = input?.value.trim();
              if (id) void submitTimesheet(id);
            }}>Submit</button>
          </div>
        </div>
      )}

      {tab === 'payroll' && (
        <div className="hr-section">
          <div className="hr-filters">
            <label>
              Period
              <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="YYYY-MM or YYYY-WW or date range" />
            </label>
            <button type="button" onClick={() => void loadPayroll()}>Load</button>
          </div>
          {payrollError && <p className="error">{payrollError}</p>}
          {payroll && (
            <>
              <p>Period: {formatDay(payroll.period?.start)} → {formatDay(payroll.period?.end)}</p>
              <div className="hr-filters">
                <label>
              Target system
              <input value={payrollTarget} onChange={(e) => setPayrollTarget(e.target.value)} placeholder="csv | adp | ..." />
            </label>
            <button type="button" onClick={() => void exportPayroll()} disabled={payrollExporting}>
              {payrollExporting ? 'Exporting…' : 'Export Payroll'}
            </button>
          </div>
              <table className="hr-table"><thead><tr>
                <th>User</th><th>Regular</th><th>Overtime</th><th>Paid</th><th>Pending</th>
              </tr></thead><tbody>
                {(payroll.totals || []).map((row: any, i: number) => (
                  <tr key={row.user_id || i}>
                    <td>{formatUserName(row.user_id)}</td>
                    <td>{row.regular}</td>
                    <td>{row.overtime}</td>
                    <td>{row.paid}</td>
                    <td>{row.pending_count ?? 0}</td>
                  </tr>
                ))}
              </tbody></table>
              <div className="hr-summary">
                <div className="hr-summary__card">
                  <span className="hr-summary__label">Regular</span>
                  <span className="hr-summary__value">{payrollTotals.regular.toFixed(2)}</span>
                </div>
                <div className="hr-summary__card">
                  <span className="hr-summary__label">Overtime</span>
                  <span className="hr-summary__value">{payrollTotals.overtime.toFixed(2)}</span>
                </div>
                <div className="hr-summary__card">
                  <span className="hr-summary__label">Paid</span>
                  <span className="hr-summary__value">{payrollTotals.paid.toFixed(2)}</span>
                </div>
                <div className="hr-summary__card">
                  <span className="hr-summary__label">Pending</span>
                  <span className="hr-summary__value">{payrollTotals.pending}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'summaries' && (
        <div className="hr-section">
          <div className="summary-block">
            <h3>Meeting Summary</h3>
            <textarea rows={5} placeholder="Paste transcript..." value={meetingTranscript} onChange={(e) => setMeetingTranscript(e.target.value)} />
            <div>
              <button type="button" onClick={() => void summarizeMeeting()} disabled={!meetingTranscript.trim()}>Summarize</button>
            </div>
            {meetingResult && (
              <MeetingNoteCard
                summary={meetingResult.summary}
                summaryMeta={meetingResult.meta}
                onRegenerate={() => void summarizeMeeting()}
              >
                {Array.isArray(meetingResult.action_items) && meetingResult.action_items.length > 0 && (
                  <div className="summary-card__section">
                    <h4>Action Items</h4>
                    <ul>
                      {meetingResult.action_items.map((item: any, idx: number) => (
                        <li key={idx}>
                          <span>{item.text || JSON.stringify(item)}</span>
                          {item.owner && <span className="summary-card__meta"> — Owner: {item.owner}</span>}
                          {item.due && <span className="summary-card__meta"> (Due {formatDay(item.due)})</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(meetingResult.risks) && meetingResult.risks.length > 0 && (
                  <div className="summary-card__section">
                    <h4>Risks</h4>
                    <ul>
                      {meetingResult.risks.map((risk: string, idx: number) => (
                        <li key={idx}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </MeetingNoteCard>
            )}
          </div>
          <div className="summary-block">
            <h3>AutoPM Summary</h3>
            <textarea rows={5} placeholder="One update per line..." value={autopmThread} onChange={(e) => setAutopmThread(e.target.value)} />
            <div>
              <button type="button" onClick={() => void summarizeAutoPM()} disabled={!autopmThread.trim()}>Summarize</button>
            </div>
            {autopmResult && (
              <div className="summary-card">
                <p className="summary-card__summary">{autopmResult.summary}</p>
                {Array.isArray(autopmResult.next_actions) && autopmResult.next_actions.length > 0 && (
                  <div className="summary-card__section">
                    <h4>Next Actions</h4>
                    <ul>
                      {autopmResult.next_actions.map((item: any, idx: number) => (
                        <li key={idx}>
                          <span>{item.text || JSON.stringify(item)}</span>
                          {item.owner && <span className="summary-card__meta"> — Owner: {item.owner}</span>}
                          {item.due && <span className="summary-card__meta"> (Due {formatDay(item.due)})</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(autopmResult.blockers) && autopmResult.blockers.length > 0 && (
                  <div className="summary-card__section">
                    <h4>Blockers</h4>
                    <ul>
                      {autopmResult.blockers.map((blocker: string, idx: number) => (
                        <li key={idx}>{blocker}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {autopmResult.meta && (
                  <div className="summary-card__meta-grid">
                    {autopmResult.meta.summary_id && (
                      <span>summary_id: {autopmResult.meta.summary_id}</span>
                    )}
                    {autopmResult.meta.source && <span>source: {autopmResult.meta.source}</span>}
                  </div>
                )}
                {Array.isArray(autopmResult.owners) && autopmResult.owners.length > 0 && (
                  <div className="summary-card__meta-grid">
                    {autopmResult.owners.map((owner: any, idx: number) => (
                      <span key={idx}>{owner.name || owner.id || JSON.stringify(owner)}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
