import { useState, useEffect, useMemo } from 'react';
import { X, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { useTheme } from './ThemeContext';
import { useTaskRClient } from '../lib/taskrClient';
import type { ScrAlert } from '@dydact/taskr-api-client';

type NotificationStatus = 'idle' | 'attention';

const severityBadgeStyles: Record<string, string> = {
  critical: 'from-red-500 to-rose-500',
  high: 'from-orange-500 to-red-400',
  medium: 'from-amber-400 to-yellow-400',
  low: 'from-emerald-400 to-green-500'
};

const severityLabels: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low'
};

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState<ScrAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = useTaskRClient();
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    let cancelled = false;

    const fetchAlerts = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await client.alerts.scr.list({ limit: 40 });
        if (!cancelled) {
          setAlerts(data);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setAlerts([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchAlerts();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const unreadCount = alerts.filter((alert) => !alert.acknowledged_at).length;
  const status: NotificationStatus = unreadCount > 0 ? 'attention' : 'idle';

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const updated = await client.alerts.scr.acknowledge(alertId, {});
      setAlerts((prev) => prev.map((alert) => (alert.alert_id === alertId ? updated : alert)));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const date = new Date(iso);
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  const formatGroupLabel = (date: Date) => {
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffMs = startToday.getTime() - target.getTime();
    const diffDays = Math.round(diffMs / 86400000);
    if (diffDays <= 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: today.getFullYear() === date.getFullYear() ? undefined : 'numeric' });
  };

  const groupedAlerts = useMemo(() => {
    if (!alerts.length) return [];
    const buckets = new Map<string, { label: string; date: Date; items: ScrAlert[] }>();
    alerts.forEach((alert) => {
      const created = new Date(alert.created_at);
      const key = created.toISOString().slice(0, 10);
      const bucket = buckets.get(key) ?? { label: formatGroupLabel(created), date: created, items: [] };
      bucket.items.push(alert);
      buckets.set(key, bucket);
    });
    return Array.from(buckets.values())
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((bucket) => ({
        ...bucket,
        items: bucket.items.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      }));
  }, [alerts]);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open taskR attention center"
        className={`
          fixed bottom-6 right-6 z-50
          w-14 h-14 rounded-full
          flex items-center justify-center
          transition-all duration-200
          hover:scale-110
          focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/60
          ${isOpen ? 'scale-110' : ''}
          ${status === 'attention' && !isOpen ? 'animate-[pulse_3s_ease-in-out_infinite]' : ''}
        `}
      >
        <div className="relative flex items-center justify-center">
          <img
            src="/brand/taskr-favicon.png"
            alt=""
            aria-hidden="true"
            className={`
              w-12 h-12 select-none pointer-events-none transition
              ${status === 'idle' ? 'opacity-60 grayscale' : 'opacity-100'}
            `}
          />

          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center bg-red-500 text-white border-0 text-[10px] rounded-full">
              {unreadCount}
            </Badge>
          )}
        </div>
      </button>

      {isOpen && (
        <div
          className={`
            fixed bottom-24 right-6 z-50
            w-96 max-h-[600px]
            ${colors.cardBackground}
            border ${colors.cardBorder}
            rounded-2xl shadow-2xl
            animate-in slide-in-from-bottom-4 duration-300
          `}
        >
          <div className={`px-4 py-3 border-b ${colors.cardBorder} flex items-center justify-between`}>
            <div className="flex items-center gap-2">
              <h3 className={colors.text}>Notifications</h3>
              {unreadCount > 0 && (
                <Badge className={`${isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-700'} border-0 text-[11px]`}>
                  {unreadCount} new
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                className={`${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-lg w-7 h-7`}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <ScrollArea className="max-h-[500px]">
            <div className="p-2">
              {loading ? (
                <div className="py-12 text-center">
                  <p className={`${colors.textSecondary} text-[13px]`}>Loading alerts…</p>
                </div>
              ) : alerts.length === 0 ? (
                <div className="py-12 text-center">
                  <p className={`${colors.textSecondary} text-[13px]`}>
                    {error ? `Failed to load alerts: ${error}` : "You're all caught up."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedAlerts.map((group) => (
                    <div key={group.label}>
                      <div className={`${colors.textSecondary} text-[11px] uppercase tracking-wide px-1`}>{group.label}</div>
                      <div className="space-y-2 mt-2">
                        {group.items.map((alert) => {
                          const severity = (alert.severity || 'low').toLowerCase();
                          const accent = severityBadgeStyles[severity] ?? 'from-slate-300 to-slate-200';
                          const label = severityLabels[severity] ?? alert.severity;
                          const acknowledged = !!alert.acknowledged_at;

                          return (
                            <div
                              key={alert.alert_id}
                              className={`
                                relative rounded-2xl border ${colors.cardBorder}
                                ${isDark ? 'bg-white/6' : 'bg-white'}
                                p-3 shadow-sm transition-all duration-200
                                ${!acknowledged ? 'ring-1 ring-violet-500/30' : ''}
                              `}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-10 h-10 bg-gradient-to-br ${accent} rounded-xl flex items-center justify-center text-white ${!acknowledged ? 'animate-pulse' : ''}`}>
                                  {acknowledged ? <ShieldCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className={`${colors.text} text-sm font-semibold`}>{alert.kind}</h4>
                                    <Badge className={`bg-gradient-to-r ${accent} text-white border-0 text-[10px] px-1.5`}>
                                      {label}
                                    </Badge>
                                    {!acknowledged && (
                                      <Badge className="bg-blue-500/20 text-blue-100 border-0 text-[10px] animate-pulse">
                                        NEW
                                      </Badge>
                                    )}
                                  </div>
                                  <p className={`${colors.textSecondary} text-xs mt-1`}>{alert.message}</p>
                                  <p className={`${colors.textSecondary} text-[11px] mt-2`}>
                                    {formatTimestamp(alert.created_at)} • Source: {alert.source}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-3 flex items-center justify-between">
                                <div className={`${colors.textSecondary} text-[11px]`}>
                                  Alert ID: {alert.alert_id.slice(0, 8)}… • {acknowledged ? 'Acknowledged' : 'Awaiting review'}
                                </div>
                                {!acknowledged && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => acknowledgeAlert(alert.alert_id)}
                                    className={`${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-lg text-[11px] h-7 px-3`}
                                  >
                                    Mark resolved
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </>
  );
}
