import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, AlertCircle, CheckCircle, Clock, Sparkles, AlertTriangle, Filter } from "lucide-react";
import { createClaimsApi, ClaimsApiError, type ClaimSummary, type ClaimEvent } from "../lib/claimsApi";
import { useTheme } from "../components/ThemeContext";
import { env } from "../config/env";
import { Badge } from "../components/ui/badge";
import { ScrollArea } from "../components/ui/scroll-area";
import { cn } from "../components/ui/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../components/ui/dropdown-menu";
import { Button } from "../components/ui/button";

type ClaimsViewProps = {
  baseUrl?: string;
  tenantId: string;
  userId: string;
  searchTerm?: string;
};

export const ClaimsView: React.FC<ClaimsViewProps> = ({
  baseUrl = env.claimsApiBase || env.taskrApiBase || window.location.origin,
  tenantId,
  userId,
  searchTerm = ""
}) => {
  const { colors, theme } = useTheme();
  const [claims, setClaims] = useState<ClaimSummary[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [events, setEvents] = useState<ClaimEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  const api = useMemo(
    () =>
      createClaimsApi({
        baseUrl: baseUrl || env.claimsApiBase,
        tenantId,
        userId
      }),
    [baseUrl, tenantId, userId]
  );

  const loadClaims = useCallback(async () => {
    setClaimsLoading(true);
    setClaimsError(null);
    try {
      const response = await api.listClaims(searchTerm ? { search: searchTerm } : undefined);
      const payload = Array.isArray((response as any)?.data)
        ? (response as { data: ClaimSummary[] }).data
        : Array.isArray(response)
        ? (response as ClaimSummary[])
        : [];
      setClaims(payload);
      if (payload.length > 0 && !selectedClaimId) {
        setSelectedClaimId(payload[0].claim_id ?? payload[0].claimId ?? null);
      }
    } catch (err) {
      const message =
        err instanceof ClaimsApiError
          ? err.message || `Failed to load claims (HTTP ${err.status})`
          : err instanceof Error
          ? err.message
          : String(err);
      setClaimsError(message);
      setClaims([]);
    } finally {
      setClaimsLoading(false);
    }
  }, [api, searchTerm, selectedClaimId]);

  const loadEvents = useCallback(
    async (claimId: string | null) => {
      if (!claimId) {
        setEvents([]);
        return;
      }
      setEventsLoading(true);
      setEventsError(null);
      try {
        const response = await api.getClaimEvents(claimId);
        const payload = Array.isArray((response as any)?.data)
          ? (response as { data: ClaimEvent[] }).data
          : Array.isArray(response)
          ? (response as ClaimEvent[])
          : [];
        setEvents(payload);
      } catch (err) {
        const message =
          err instanceof ClaimsApiError
            ? err.message || `Failed to load claim timeline (HTTP ${err.status})`
            : err instanceof Error
            ? err.message
            : String(err);
        setEventsError(message);
        setEvents([]);
      } finally {
        setEventsLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    void loadClaims();
  }, [loadClaims]);

  useEffect(() => {
    void loadEvents(selectedClaimId);
  }, [selectedClaimId, loadEvents]);

  const isDark = theme === "dark";
  const selectedClaim = useMemo(
    () =>
      claims.find((claim) => (claim.claim_id ?? claim.claimId) === selectedClaimId) ?? null,
    [claims, selectedClaimId]
  );

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    claims.forEach((claim) => {
      if (claim.status) set.add(String(claim.status).toLowerCase());
    });
    return Array.from(set.values()).sort();
  }, [claims]);

const filteredClaims = useMemo(() => {
  if (statusFilter.length === 0) return claims;
  const allowed = new Set(statusFilter);
  return claims.filter((claim) => allowed.has(String(claim.status ?? "unknown").toLowerCase()));
}, [claims, statusFilter]);

  const statusSummary = useMemo(() => {
    const counts = new Map<string, number>();
    filteredClaims.forEach((claim) => {
      const status = String(claim.status ?? "unknown").toLowerCase();
      counts.set(status, (counts.get(status) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [filteredClaims]);

  useEffect(() => {
    if (statusFilter.length === 0) return;
    const allowed = new Set(statusOptions);
    setStatusFilter((prev) => {
      const filtered = prev.filter((status) => allowed.has(status));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [statusOptions, statusFilter.length]);

  return (
    <div className="grid grid-cols-[2fr,1fr] gap-6">
      <section className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-xl overflow-hidden`}>
        <header className={`px-6 py-4 border-b ${colors.cardBorder} flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <h2 className={`${colors.text} font-semibold`}>Claims</h2>
            <p className={`${colors.textSecondary} text-xs mt-0.5`}>
              {claimsLoading
                ? "Syncing claims…"
                : `${filteredClaims.length} shown · ${claims.length} total`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "rounded-xl gap-2",
                    colors.textSecondary,
                    isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
                  )}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Status
                  {statusFilter.length > 0 && (
                    <Badge className="bg-violet-500/20 text-violet-200 border-0 text-[10px]">
                      {statusFilter.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs uppercase tracking-wide">Filter status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {statusOptions.length === 0 ? (
                  <DropdownMenuItem disabled>No statuses</DropdownMenuItem>
                ) : (
                  statusOptions.map((status) => (
                    <DropdownMenuCheckboxItem
                      key={status}
                      checked={statusFilter.includes(status)}
                      onCheckedChange={() =>
                        setStatusFilter((prev) =>
                          prev.includes(status) ? prev.filter((value) => value !== status) : [...prev, status]
                        )
                      }
                      className="capitalize"
                    >
                      {status.replace(/_/g, " ")}
                    </DropdownMenuCheckboxItem>
                  ))
                )}
                {statusFilter.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setStatusFilter([])} className="text-xs">
                      Clear
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "flex items-center gap-2 text-xs rounded-xl",
                colors.textSecondary,
                isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
              )}
              onClick={() => void loadClaims()}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
          </div>
        </header>
        <div className="px-6 py-3 border-b border-white/5 flex items-center gap-2 text-sm">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? "bg-white/10" : "bg-white/70"} text-xs text-slate-400 dark:text-slate-200/70`}> 
            <Search className="w-3.5 h-3.5" />
            <span>{searchTerm || "Filter by payer, patient, or status"}</span>
          </div>
        </div>
        <div className="px-6 py-4 border-b border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statusSummary.map(([status, count]) => (
            <div
              key={status}
              className={cn(
                "rounded-xl px-3 py-2 text-xs flex flex-col gap-1 border",
                colors.cardBorder,
                "bg-white/50 dark:bg-white/5"
              )}
            >
              <span className="capitalize text-[11px] text-slate-500 dark:text-slate-400">
                {status.replace(/_/g, " ")}
              </span>
              <span className={cn(colors.text, "text-sm font-semibold")}>{count}</span>
            </div>
          ))}
          {statusSummary.length === 0 && (
            <div className="text-xs text-slate-400 col-span-full">No claims in view yet.</div>
          )}
        </div>
        {claimsError ? (
          <div className="p-6 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {claimsError}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className={`${isDark ? "bg-white/5" : "bg-white/80"} text-left text-xs uppercase tracking-wide`}> 
              <tr>
                <th className="px-6 py-3">Claim</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Payer</th>
                <th className="px-6 py-3 text-right">Amount</th>
                <th className="px-6 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredClaims.map((claim) => {
                const claimId = claim.claim_id ?? claim.claimId ?? "";
                const isSelected = claimId === selectedClaimId;
                return (
                  <tr
                    key={claimId}
                    className={`${isSelected ? (isDark ? "bg-white/10" : "bg-violet-50") : ""} cursor-pointer transition-colors`}
                    onClick={() => setSelectedClaimId(claimId)}
                  >
                    <td className="px-6 py-3 whitespace-nowrap text-xs font-medium">{claimId || "—"}</td>
                    <td className="px-6 py-3 text-xs">
                      <Badge className={cn("border-0 text-[11px] capitalize", statusBadgeTone(claim.status))}>
                        {claim.status ?? "unknown"}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-xs truncate">{claim.payer ?? "—"}</td>
                    <td className="px-6 py-3 text-xs text-right">
                      {typeof claim.amount === "number" ? `$${(claim.amount / 100).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-6 py-3 text-xs">
                      {claim.updated_at ? new Date(claim.updated_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                );
              })}
              {filteredClaims.length === 0 && !claimsLoading && (
                <tr>
                  <td className="px-6 py-8 text-sm text-slate-400" colSpan={5}>
                    No claims found for the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {claimsLoading && (
          <div className="py-4 flex items-center justify-center text-xs text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Fetching claims
          </div>
        )}
      </section>
      <aside className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-xl overflow-hidden`}>
        <header className={`px-6 py-4 border-b ${colors.cardBorder}`}>
          <h3 className={`${colors.text} font-semibold`}>Timeline</h3>
          <p className={`${colors.textSecondary} text-xs mt-0.5`}>
            {selectedClaim ? (selectedClaim.payer ? `Payer: ${selectedClaim.payer}` : "Claim details") : "Select a claim"}
          </p>
        </header>
        {eventsError ? (
          <div className="p-6 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {eventsError}
          </div>
        ) : eventsLoading ? (
          <div className="p-6 text-sm text-slate-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading events…
          </div>
        ) : events.length === 0 ? (
          <div className="p-6 text-sm text-slate-400">No timeline events for this claim yet.</div>
        ) : (
          <ScrollArea className="max-h-72">
            <ul className="divide-y divide-white/5">
              {events.map((event, index) => {
                const { Icon, tone } = timelineIconForStatus(event.status);
                const occurredAt = event.timestamp ? new Date(event.timestamp) : null;
                const metaEntries = Object.entries(event as Record<string, unknown>)
                  .filter(
                    ([key, value]) =>
                      !["timestamp", "status", "description"].includes(key) &&
                      (typeof value === "string" || typeof value === "number")
                  )
                  .slice(0, 3) as Array<[string, string | number]>;
                return (
                  <li key={`${event.timestamp ?? index}`} className="px-6 py-4 text-sm">
                    <div className="flex items-start gap-3">
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center bg-white/5", tone)}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className={`${colors.text} font-medium capitalize`}>{event.status ?? "Event"}</p>
                          <span className={`${colors.textSecondary} text-[11px]`}>
                            {occurredAt ? occurredAt.toLocaleString() : "—"}
                          </span>
                        </div>
                        <p className={`${colors.textSecondary} text-xs mt-1`}>{event.description ?? "—"}</p>
                        {metaEntries.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {metaEntries.map(([key, value]) => (
                              <Badge key={key} className="bg-white/5 border-white/10 text-[10px] uppercase tracking-wide">
                                {key}: {String(value)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </aside>
    </div>
  );
};
const STATUS_PILLS: Record<string, string> = {
  paid: "bg-emerald-500/20 text-emerald-200",
  approved: "bg-blue-500/20 text-blue-200",
  submitted: "bg-violet-500/20 text-violet-200",
  denied: "bg-rose-500/20 text-rose-200",
  pending: "bg-amber-500/20 text-amber-200"
};

const statusBadgeTone = (status?: string) => STATUS_PILLS[(status ?? "").toLowerCase()] ?? "bg-slate-500/20 text-slate-200";

const timelineIconForStatus = (status?: string) => {
  const normalized = (status ?? "").toLowerCase();
  if (normalized.includes("paid") || normalized.includes("approved")) {
    return { Icon: CheckCircle, tone: "text-emerald-400" };
  }
  if (normalized.includes("submitted") || normalized.includes("pending")) {
    return { Icon: Clock, tone: "text-amber-400" };
  }
  if (normalized.includes("denied") || normalized.includes("error")) {
    return { Icon: AlertTriangle, tone: "text-rose-400" };
  }
  return { Icon: Sparkles, tone: "text-blue-400" };
};
