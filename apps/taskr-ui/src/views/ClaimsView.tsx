import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, AlertCircle } from "lucide-react";
import { createClaimsApi, ClaimsApiError, type ClaimSummary, type ClaimEvent } from "../lib/claimsApi";
import { useTheme } from "../components/ThemeContext";
import { env } from "../config/env";

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

  return (
    <div className="grid grid-cols-[2fr,1fr] gap-6">
      <section className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-xl overflow-hidden`}> 
        <header className={`px-6 py-4 border-b ${colors.cardBorder} flex items-center justify-between`}> 
          <div>
            <h2 className={`${colors.text} font-semibold`}>Claims</h2>
            <p className={`${colors.textSecondary} text-xs mt-0.5`}>
              {claimsLoading ? "Syncing claims…" : `${claims.length} records`}
            </p>
          </div>
          <button
            type="button"
            className={`flex items-center gap-2 text-xs ${colors.textSecondary} ${
              isDark ? "hover:text-white" : "hover:text-slate-900"
            }`}
            onClick={() => void loadClaims()}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </header>
        <div className="px-6 py-3 border-b border-white/5 flex items-center gap-2 text-sm">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? "bg-white/10" : "bg-white/70"} text-xs text-slate-400 dark:text-slate-200/70`}> 
            <Search className="w-3.5 h-3.5" />
            <span>{searchTerm || "Filter by payer, patient, or status"}</span>
          </div>
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
              {claims.map((claim) => {
                const claimId = claim.claim_id ?? claim.claimId ?? "";
                const isSelected = claimId === selectedClaimId;
                return (
                  <tr
                    key={claimId}
                    className={`${isSelected ? (isDark ? "bg-white/10" : "bg-violet-50") : ""} cursor-pointer transition-colors`}
                    onClick={() => setSelectedClaimId(claimId)}
                  >
                    <td className="px-6 py-3 whitespace-nowrap text-xs font-medium">{claimId || "—"}</td>
                    <td className="px-6 py-3 text-xs capitalize">{claim.status ?? "unknown"}</td>
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
              {claims.length === 0 && !claimsLoading && (
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
          <ul className="divide-y divide-white/5">
            {events.map((event, index) => (
              <li key={`${event.timestamp ?? index}`} className="px-6 py-4 text-sm">
                <p className={`${colors.text} font-medium`}>{event.status ?? "Event"}</p>
                <p className={`${colors.textSecondary} text-xs mt-1`}>{event.description ?? "—"}</p>
                <p className={`${colors.textSecondary} text-xs mt-1`}>{event.timestamp ? new Date(event.timestamp).toLocaleString() : "—"}</p>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
};
