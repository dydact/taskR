import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ResizableColumns } from "../components/layout/ResizableColumns";
import { SessionSummaryCard, SessionSummaryRail } from "../components/claims/SessionSummaryRail";
import { TimelineRibbon, TimelineRibbonAction, TimelineRibbonEvent } from "../components/claims/TimelineRibbon";
import { RejectGroup, RejectStack } from "../components/claims/RejectStack";
import { createClaimsClient } from "../lib/claimsClient";
import type {
  Claim,
  Transmission,
  ClaimAck,
  Reject,
  Event,
  AcksResponse,
  TransmissionsResponse,
  ClaimsListResponse,
  RejectsResponse,
  EventsResponse,
} from "../types/claims";

type ClaimsViewProps = {
  apiBase: string;
  tenantId: string;
  userId: string;
  searchTerm?: string;
  onToast?: (input: { message: string; variant?: "info" | "success" | "error"; detail?: string }) => void;
};

type ClaimDetail = {
  claim: Claim;
  transmissions: Transmission[];
  acks: ClaimAck[];
  rejects: Reject[];
  events: Event[];
  jobEvents: Event[];
};

type DensityMode = "comfortable" | "compact" | "table";

const LAYOUT_STORAGE_KEY = "taskr_claims_layout";
const DENSITY_STORAGE_KEY = "taskr_claims_density_v1";
const SUMMARY_PIN_STORAGE_KEY = "taskr_claims_summary_pin_v1";
const FAVORITES_STORAGE_KEY = "taskr_claim_favorites_v1";

const DENSITY_OPTIONS: Array<{ id: DensityMode; label: string }> = [
  { id: "comfortable", label: "Comfort" },
  { id: "compact", label: "Compact" },
  { id: "table", label: "Table" },
];

const progressScale: Record<string, number> = {
  draft: 0.1,
  ready: 0.18,
  queued: 0.24,
  submitted: 0.32,
  ack_pending: 0.4,
  ack_partial: 0.45,
  ack_success: 0.62,
  ack_failure: 0.2,
  ack: 0.6,
  accepted: 0.75,
  accepted_with_errors: 0.66,
  partial: 0.58,
  paid: 0.92,
  rejected: 0.25,
  error: 0.18,
  failed: 0.16,
  in_progress: 0.48,
  succeeded: 0.82,
  canceled: 0.22,
};

const statusBadgeClass = (status: string) => {
  const normalized = status.toLowerCase();
  if (["accepted", "paid", "success", "succeeded"].includes(normalized)) return "status-badge success";
  if (["submitted", "acknowledged", "info", "in_progress", "pending", "queued"].includes(normalized)) return "status-badge info";
  if (["rejected", "error", "danger", "failed", "ack_failure"].includes(normalized)) return "status-badge danger";
  if (["ack_partial", "warning", "warn", "accepted_with_errors"].includes(normalized)) return "status-badge warn";
  return "status-badge";
};

const toneFromStatus = (status: string) => {
  const normalized = status.toLowerCase();
  if (["accepted", "paid", "success", "succeeded"].includes(normalized)) return "success";
  if (["rejected", "error", "failed", "danger", "ack_failure"].includes(normalized)) return "danger";
  if (["ack_partial", "warning", "warn", "pending", "accepted_with_errors"].includes(normalized)) return "warning";
  if (["info", "queued", "submitted", "in_progress"].includes(normalized)) return "accent";
  return "neutral";
};

const rejectLevelLabel: Record<Reject["level"], string> = {
  interchange: "ISA level",
  functional_group: "GS level",
  transaction: "ST level",
  detail: "Line item",
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatDateTimeShort = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
};

const formatCurrency = (cents?: number, currency = "USD") => {
  if (cents == null) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
};

const safeLocalStorageGet = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeLocalStorageSet = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
};

const ClaimProgressSpark: React.FC<{ points: Array<{ timestamp: number; value: number }> }> = ({ points }) => {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
  const min = Math.min(...sorted.map((p) => p.value));
  const max = Math.max(...sorted.map((p) => p.value));
  const range = Math.max(max - min, 0.05);
  const path = sorted
    .map((point, index) => {
      const x = (index / (sorted.length - 1)) * 100;
      const normalized = (point.value - min) / range;
      const y = 100 - normalized * 100;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const gradientId = `spark-gradient-${Math.abs(points[0].timestamp)}`;
  return (
    <svg
      className="claim-progress-spark"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      aria-label="Claim progression spark chart"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(108, 123, 255, 0.35)" />
          <stop offset="100%" stopColor="rgba(74, 208, 167, 0.4)" />
        </linearGradient>
      </defs>
      <path d={path} stroke={`url(#${gradientId})`} fill="none" strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
};

export const ClaimsView: React.FC<ClaimsViewProps> = ({ apiBase, tenantId, userId, searchTerm = "", onToast }) => {
  const client = useMemo(
    () =>
      createClaimsClient({
        baseUrl: apiBase || "",
        tenantId,
        defaultHeaders: { "x-user-id": userId },
      }),
    [apiBase, tenantId, userId]
  );

  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [srSummary, setSrSummary] = useState("");
  const [favoriteClaimIds, setFavoriteClaimIds] = useState<string[]>(() => {
    const raw = safeLocalStorageGet(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === "string");
      }
    } catch {
      /* ignore parse failures */
    }
    return [];
  });
  const favoriteSet = useMemo(() => new Set(favoriteClaimIds), [favoriteClaimIds]);

  const filteredClaims = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return [...claims].sort((a, b) => {
        const aFav = favoriteSet.has(a.id);
        const bFav = favoriteSet.has(b.id);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    }
    const filtered = claims.filter((claim) => {
      const fields: Array<string | undefined> = [
        claim.id,
        claim.externalKey,
        claim.payerName,
        claim.payerId,
        claim.controlNumbers?.lastISA13,
        claim.controlNumbers?.lastGS06,
        claim.controlNumbers?.lastST02,
      ];
      return fields.filter(Boolean).some((field) => field!.toLowerCase().includes(query));
    });
    return filtered.sort((a, b) => {
      const aFav = favoriteSet.has(a.id);
      const bFav = favoriteSet.has(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [claims, searchTerm, favoriteSet]);

  const [listDensity, setListDensity] = useState<DensityMode>(() => {
    const stored = safeLocalStorageGet(DENSITY_STORAGE_KEY);
    if (stored === "compact" || stored === "table" || stored === "comfortable") {
      return stored;
    }
    return "comfortable";
  });
  const [sessionPinned, setSessionPinned] = useState<boolean>(() => {
    const stored = safeLocalStorageGet(SUMMARY_PIN_STORAGE_KEY);
    if (stored === "true" || stored === "false") return stored === "true";
    return true;
  });

  const cycleDensity = useCallback(() => {
    setListDensity((prev) => {
      if (prev === "comfortable") return "compact";
      if (prev === "compact") return "table";
      return "comfortable";
    });
  }, []);

  const toggleFavorite = useCallback(
    (claimId: string) => {
      setFavoriteClaimIds((prev) => {
        const isFavorite = prev.includes(claimId);
        const next = isFavorite ? prev.filter((id) => id !== claimId) : [claimId, ...prev];
        if (onToast) {
          onToast({
            message: isFavorite ? `Removed ${claimId} from favorites` : `Favorited ${claimId}`,
            variant: isFavorite ? "info" : "success"
          });
        }
        return next;
      });
    },
    [onToast]
  );

  const announceClaimSummary = useCallback(() => {
    if (!detail) return;
    const rejectCount = detail.rejects.length;
    const nextAction =
      rejectCount > 0
        ? "Review outstanding rejects"
        : detail.acks.length === 0
        ? "Await acknowledgements"
        : "Monitor payment status";
    const summary = `Claim ${detail.claim.id}. Status ${detail.claim.status}. ${rejectCount} outstanding rejects. Next action: ${nextAction}.`;
    setSrSummary(summary);
  }, [detail]);

  useEffect(() => {
    setSrSummary("");
  }, [detail?.claim.id]);

  const loadClaims = useCallback(async () => {
    setClaimsLoading(true);
    setClaimsError(null);
    try {
      const response: ClaimsListResponse = await client.listClaims({ perPage: 100 });
      setClaims(response.data ?? []);
      if (response.data && response.data.length > 0) {
        const [firstClaim] = response.data;
        setSelectedClaimId((prev) => prev ?? firstClaim.id);
      }
    } catch (error) {
      console.error("Failed to load claims", error);
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : "Failed to load claims.";
      setClaimsError(message);
    } finally {
      setClaimsLoading(false);
    }
  }, [client]);

  const loadClaimDetail = useCallback(
    async (claimId: string) => {
      if (!claimId) return;
      setDetailLoading(true);
      setDetailError(null);
      try {
        const [claimData, transmissionsData, acksData, rejectsData, eventsData] = (await Promise.all([
          client.getClaim(claimId),
          client.listTransmissions(claimId),
          client.listAcks(claimId),
          client.listRejects(claimId),
          client.listEvents(claimId),
        ])) as [Claim, TransmissionsResponse, AcksResponse, RejectsResponse, EventsResponse];

        let jobEvents: Event[] = [];
        if (claimData.lastJobId) {
          try {
            const jobEventsResponse = await client.listJobEvents(claimData.lastJobId);
            jobEvents = [...(jobEventsResponse.data ?? [])].sort((a, b) => {
              const aTs = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
              const bTs = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
              return aTs - bTs;
            });
          } catch (jobError) {
            console.warn("Failed to load job events", jobError);
          }
        }

        const sortedEvents = [...(eventsData.data ?? [])].sort((a, b) => {
          const aTs = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
          const bTs = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
          return aTs - bTs;
        });

        setDetail({
          claim: claimData,
          transmissions: transmissionsData.data ?? [],
          acks: acksData.data ?? [],
          rejects: rejectsData.data ?? [],
          events: sortedEvents,
          jobEvents,
        });
      } catch (error) {
        console.error("Failed to load claim detail", error);
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "string"
            ? error
            : "Failed to load claim details.";
        setDetailError(message);
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [client]
  );

  useEffect(() => {
    void loadClaims();
  }, [loadClaims]);

  useEffect(() => {
    if (filteredClaims.length === 0) {
      setSelectedClaimId(null);
      return;
    }
    if (!selectedClaimId || !filteredClaims.some((claim) => claim.id === selectedClaimId)) {
      setSelectedClaimId(filteredClaims[0].id);
    }
  }, [filteredClaims, selectedClaimId]);

  useEffect(() => {
    if (selectedClaimId) {
      void loadClaimDetail(selectedClaimId);
    } else {
      setDetail(null);
    }
  }, [selectedClaimId, loadClaimDetail]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.key === "L" || event.key === "l") && event.shiftKey) {
        event.preventDefault();
        cycleDensity();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cycleDensity]);

  useEffect(() => {
    safeLocalStorageSet(DENSITY_STORAGE_KEY, listDensity);
  }, [listDensity]);

  useEffect(() => {
    safeLocalStorageSet(SUMMARY_PIN_STORAGE_KEY, sessionPinned ? "true" : "false");
  }, [sessionPinned]);

  useEffect(() => {
    safeLocalStorageSet(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteClaimIds));
  }, [favoriteClaimIds]);

  const timelineAnalysis = useMemo(() => {
    if (!detail) {
      return { events: [] as TimelineRibbonEvent[], progress: [] as Array<{ timestamp: number; value: number }> };
    }
    const nodes: TimelineRibbonEvent[] = [];
    const progress: Array<{ timestamp: number; value: number }> = [];
    const pushProgress = (timestamp: string | undefined | null, status: string | undefined | null) => {
      if (!timestamp || !status) return;
      const ts = new Date(timestamp).getTime();
      if (!Number.isFinite(ts)) return;
      const normalizedStatus = status.toLowerCase();
      const value = progressScale[normalizedStatus] ?? 0.5;
      progress.push({ timestamp: ts, value });
    };

    detail.transmissions.forEach((tx) => {
      const id = `tx-${tx.id}`;
      nodes.push({
        id,
        title: `${tx.kind.toUpperCase()} ${tx.direction === "outbound" ? "→" : "←"}`,
        subtitle: `Transmission • ${tx.direction === "outbound" ? "Outbound" : "Inbound"}`,
        statusTone: toneFromStatus(tx.status),
        timestamp: tx.createdAt,
        description: `Status: ${tx.status}`,
        details: [
          { label: "Created", value: formatDateTimeShort(tx.createdAt) },
          { label: "Updated", value: formatDateTimeShort(tx.updatedAt) },
          { label: "Ack Type", value: tx.expectedAckType ?? "—" },
        ],
        badges: tx.controlNumbers
          ? [
              tx.controlNumbers.lastISA13 ? { id: `${id}-isa`, label: `ISA13 ${tx.controlNumbers.lastISA13}` } : null,
              tx.controlNumbers.lastGS06 ? { id: `${id}-gs`, label: `GS06 ${tx.controlNumbers.lastGS06}` } : null,
              tx.controlNumbers.lastST02 ? { id: `${id}-st`, label: `ST02 ${tx.controlNumbers.lastST02}` } : null,
            ].filter(Boolean) as TimelineRibbonEvent["badges"]
          : undefined,
        payloadPreview: tx.payloadHash ? <code>Payload hash: {tx.payloadHash}</code> : undefined,
        actions:
          tx.artifactId != null
            ? [
                {
                  id: `${id}-artifact`,
                  label: "Open artifact",
                  onSelect: () => {
                    void client
                      .getArtifact(tx.artifactId!)
                      .then(() => {
                        onToast?.({ message: `Artifact ${tx.artifactId} opened`, variant: "info" });
                      })
                      .catch((error) => {
                        console.error("Failed to fetch artifact", error);
                        onToast?.({
                          message: "Artifact fetch failed",
                          variant: "error",
                          detail: error instanceof Error ? error.message : String(error)
                        });
                      });
                  },
                },
              ]
            : undefined,
      });
      pushProgress(tx.createdAt, tx.status);
      pushProgress(tx.updatedAt, tx.status);
    });

    detail.acks.forEach((ack) => {
      const id = `ack-${ack.id}`;
      nodes.push({
        id,
        title: `${(ack.type ?? ack.ackType ?? "").toUpperCase()} Ack`,
        subtitle: `Acknowledgement • ${ack.status}`,
        statusTone: toneFromStatus(ack.status ?? ""),
        timestamp: ack.receivedAt ?? new Date().toISOString(),
        description: `Acknowledgement ${ack.status}`,
        details: [
          { label: "Received", value: formatDateTimeShort(ack.receivedAt) },
          { label: "Ack Type", value: ack.type ?? ack.ackType ?? "—" },
        ],
        badges: ack.control
          ? [
              ack.control.isa13 ? { id: `${id}-isa`, label: `ISA13 ${ack.control.isa13}` } : null,
              ack.control.gs06 ? { id: `${id}-gs`, label: `GS06 ${ack.control.gs06}` } : null,
              ack.control.st02 ? { id: `${id}-st`, label: `ST02 ${ack.control.st02}` } : null,
            ].filter(Boolean) as TimelineRibbonEvent["badges"]
          : undefined,
        payloadPreview: ack.rawUri ? <code>{ack.rawUri}</code> : undefined,
        actions:
          ack.rawUri != null
            ? [
                {
                  id: `${id}-download`,
                  label: "Open raw acknowledgement",
                  onSelect: () => {
                    window.open(ack.rawUri ?? "#", "_blank", "noopener");
                    onToast?.({ message: `Opening ${ack.type ?? ack.ackType ?? "ack"} acknowledgment`, variant: "info" });
                  },
                } satisfies TimelineRibbonAction,
              ]
            : undefined,
      });
      pushProgress(ack.receivedAt, ack.status ?? "");
    });

    [...detail.events, ...detail.jobEvents].forEach((event) => {
      const timestamp = event.occurredAt ?? "";
      const id = `event-${event.id}`;
      nodes.push({
        id,
        title: event.type ?? "Event",
        subtitle: event.level ?? "Event",
        statusTone: toneFromStatus(event.statusAfter ?? event.level ?? ""),
        timestamp,
        description: event.message ?? "",
        details: [
          { label: "Occurred", value: formatDateTimeShort(timestamp) },
          event.statusAfter ? { label: "Status After", value: <span className={statusBadgeClass(event.statusAfter)}>{event.statusAfter}</span> } : null,
        ].filter(Boolean) as TimelineRibbonEvent["details"],
      });
      pushProgress(timestamp, event.statusAfter ?? event.level ?? "");
    });

    if (detail.claim.status) {
      pushProgress(detail.claim.updatedAt ?? detail.claim.createdAt, detail.claim.status);
    }

    const sortedNodes = nodes.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const sortedProgress = progress.sort((a, b) => a.timestamp - b.timestamp);
    return { events: sortedNodes, progress: sortedProgress };
  }, [client, detail, onToast]);

  const summaryCards = useMemo<SessionSummaryCard[]>(() => {
    if (!detail) return [];
    const lastSubmission = detail.transmissions.find((tx) => tx.direction === "outbound");
    const latestAck = [...detail.acks].sort((a, b) => {
      const aTs = new Date(a.receivedAt ?? 0).getTime();
      const bTs = new Date(b.receivedAt ?? 0).getTime();
      return bTs - aTs;
    })[0];
    const outstandingRejects = detail.rejects.filter((reject) => reject.followupRecommended !== false);
    const latestJobEvent = detail.jobEvents.at(-1);

    const cards: SessionSummaryCard[] = [
      {
        id: "submission",
        title: "Submission",
        subtitle: lastSubmission ? formatDateTimeShort(lastSubmission.createdAt) : "Not yet submitted",
        statusLabel: lastSubmission ? lastSubmission.status : "Pending",
        tone: toneFromStatus(lastSubmission?.status ?? detail.claim.status),
        metrics: [
          { label: "Charges", value: formatCurrency(detail.claim.totals?.chargeCents) },
          { label: "Balance", value: formatCurrency(detail.claim.totals?.balanceCents) },
        ],
        footer: detail.claim.controlNumbers?.lastISA13
          ? `ISA13 ${detail.claim.controlNumbers.lastISA13}`
          : detail.claim.externalKey
          ? `External key ${detail.claim.externalKey}`
          : null,
      },
      {
        id: "latest-ack",
        title: "Latest Ack",
        subtitle: latestAck ? formatDateTimeShort(latestAck.receivedAt) : "Awaiting acknowledgement",
        statusLabel: latestAck?.status ?? "Pending",
        tone: toneFromStatus(latestAck?.status ?? ""),
        metrics: latestAck
          ? [
              { label: "Type", value: latestAck.type ?? latestAck.ackType ?? "—" },
              { label: "Claims", value: `${latestAck.claims.length}` },
            ]
          : undefined,
        quickActions: latestAck?.rawUri
          ? [
              {
                id: "download-ack",
                label: "Download raw ack",
                onSelect: () => {
                  window.open(latestAck.rawUri ?? "#", "_blank", "noopener");
                  onToast?.({ message: `Opening ${latestAck.type ?? latestAck.ackType ?? "ack"}`, variant: "info" });
                },
              },
            ]
          : undefined,
      },
      {
        id: "rejects",
        title: "Outstanding Rejects",
        subtitle: outstandingRejects.length > 0 ? `${outstandingRejects.length} need attention` : "Clean",
        statusLabel: outstandingRejects.length > 0 ? "Remediate" : "All clear",
        tone: outstandingRejects.length > 0 ? "danger" : "success",
        metrics: [
          { label: "Interchange", value: `${outstandingRejects.filter((reject) => reject.level === "interchange").length}` },
          { label: "Transaction", value: `${outstandingRejects.filter((reject) => reject.level === "transaction").length}` },
        ],
      },
      {
        id: "transport",
        title: "Transport Job",
        subtitle: latestJobEvent ? formatDateTimeShort(latestJobEvent.occurredAt) : "Awaiting job events",
        statusLabel: latestJobEvent?.statusAfter ?? "Queued",
        tone: toneFromStatus(latestJobEvent?.statusAfter ?? ""),
        metrics: detail.claim.lastJobId ? [{ label: "Job ID", value: detail.claim.lastJobId }] : undefined,
      },
    ];

    return cards;
  }, [detail, onToast]);

  const rejectGroups = useMemo<RejectGroup[]>(() => {
    if (!detail) return [];
    const groups = new Map<Reject["level"], RejectGroup>();
    detail.rejects.forEach((reject) => {
      const group = groups.get(reject.level) ?? {
        id: reject.level,
        label: rejectLevelLabel[reject.level],
        count: 0,
        pills: [],
      };
      group.count += 1;
      group.pills.push({
        id: reject.id,
        code: reject.code,
        description: reject.description,
        levelLabel: rejectLevelLabel[reject.level],
        occurredAt: formatDateTimeShort(reject.occurredAt),
        tone: reject.followupRecommended === false ? "info" : reject.level === "detail" ? "warning" : "danger",
        primaryAction: {
          id: `${reject.id}-task`,
          label: "Create task",
          onSelect: () =>
            onToast?.({
              message: `Task drafted for reject ${reject.code}`,
              variant: "success"
            })
        },
        secondaryActions: [
          {
            id: `${reject.id}-mitigate`,
            label: "Mark mitigated",
            onSelect: () =>
              onToast?.({
                message: `Marked reject ${reject.code} mitigated`,
                variant: "info"
              })
          },
        ],
      });
      groups.set(reject.level, group);
    });
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [detail, onToast]);

  const sessionRail = detail ? (
    <SessionSummaryRail
      cards={summaryCards}
      isPinned={sessionPinned}
      onTogglePinned={() => setSessionPinned((prev) => !prev)}
    />
  ) : null;

  return (
    <ResizableColumns
      left={
        <aside className={`claims-sidebar glass-surface density-${listDensity}`} data-density={listDensity}>
          <header className="claims-sidebar__header">
            <div>
              <h2>Claims</h2>
              <p className="claims-sidebar__sub">Favorite a claim to pin it across devices.</p>
            </div>
            <button type="button" onClick={() => void loadClaims()} disabled={claimsLoading}>
              {claimsLoading ? "Refreshing…" : "Refresh"}
            </button>
          </header>
          <div className="claims-density-toggle" role="group" aria-label="Adjust claim density">
            {DENSITY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={listDensity === option.id ? "active" : ""}
                onClick={() => setListDensity(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {claimsError && <p className="claims-error">{claimsError}</p>}
          {!claimsError && claims.length === 0 && !claimsLoading && (
            <div className="claims-empty-state glass-surface">
              <p>No claims found for this tenant.</p>
              <button type="button">Upload 837</button>
            </div>
          )}
          {!claimsError && claims.length > 0 && filteredClaims.length === 0 && searchTerm.trim() !== "" && (
            <p className="claims-empty">No matches for “{searchTerm.trim()}”.</p>
          )}
          <div className="claims-table-wrapper">
            <table className={`claims-table ${listDensity === "table" ? "table-mode" : ""}`}>
              <thead>
                <tr>
                  <th>Claim</th>
                  <th>Status</th>
                  <th>Payer</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredClaims.map((claim) => {
                  const isSelected = claim.id === selectedClaimId;
                  return (
                    <tr
                      key={claim.id}
                      className={isSelected ? "selected" : undefined}
                      onClick={() => setSelectedClaimId(claim.id)}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          setSelectedClaimId(claim.id);
                        }
                      }}
                    >
                      <td>
                        <div className="claim-row-heading">
                          <button
                            type="button"
                            className={`favorite-toggle${favoriteSet.has(claim.id) ? " active" : ""}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleFavorite(claim.id);
                            }}
                            aria-pressed={favoriteSet.has(claim.id)}
                            aria-label={
                              favoriteSet.has(claim.id)
                                ? `Remove claim ${claim.id} from favorites`
                                : `Add claim ${claim.id} to favorites`
                            }
                          >
                            {favoriteSet.has(claim.id) ? "★" : "☆"}
                          </button>
                          <div className="claim-cell">
                            <span className="claim-id">{claim.id}</span>
                            {claim.externalKey && <span className="claim-external">#{claim.externalKey}</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={statusBadgeClass(claim.status)}>{claim.status}</span>
                      </td>
                      <td>{claim.payerName || claim.payerId}</td>
                      <td>{formatDateTimeShort(claim.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </aside>
      }
      main={
        <section className="claims-detail-shell">
          {!selectedClaimId && <p className="claims-placeholder">Select a claim to view activity.</p>}
          {selectedClaimId && detailLoading && <p className="claims-placeholder">Loading claim details…</p>}
          {detailError && <p className="claims-error">{detailError}</p>}
          {detail && !detailLoading && (
            <div className="claims-detail-modern">
              <header className="claims-detail-header glass-surface">
                <div className="claims-detail-heading">
                  <div className="claims-detail-title">
                    <div className="claims-detail-title-row">
                      <h2>{detail.claim.id}</h2>
                      <button
                        type="button"
                        className={`favorite-toggle${favoriteSet.has(detail.claim.id) ? " active" : ""}`}
                        onClick={() => toggleFavorite(detail.claim.id)}
                        aria-pressed={favoriteSet.has(detail.claim.id)}
                        aria-label={
                          favoriteSet.has(detail.claim.id)
                            ? `Remove claim ${detail.claim.id} from favorites`
                            : `Add claim ${detail.claim.id} to favorites`
                        }
                      >
                        {favoriteSet.has(detail.claim.id) ? "★" : "☆"}
                      </button>
                    </div>
                    <span className="claims-detail-status">
                      <span className={statusBadgeClass(detail.claim.status)}>{detail.claim.status}</span>
                      {detail.claim.statusReason && <span className="claims-detail-status-reason">{detail.claim.statusReason}</span>}
                    </span>
                  </div>
                  <p className="claims-detail-meta">
                    {detail.claim.payerName || "Unknown payer"} • Subscriber {detail.claim.subscriberId ?? "—"}
                  </p>
                  <button type="button" className="claims-sr-summary" onClick={announceClaimSummary}>
                    Screen reader summary
                  </button>
                </div>
                <div className="claims-detail-spark">
                  <ClaimProgressSpark points={timelineAnalysis.progress} />
                  <button
                    type="button"
                    onClick={() => void loadClaimDetail(detail.claim.id)}
                    disabled={detailLoading}
                  >
                    {detailLoading ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              </header>

              <div className="sr-only" aria-live="polite">
                {srSummary}
              </div>

              <div className="claims-summary-grid glass-surface">
                <div className="claims-summary-card">
                  <span className="label">External Key</span>
                  <span className="value">{detail.claim.externalKey ?? "—"}</span>
                </div>
                <div className="claims-summary-card">
                  <span className="label">Service Dates</span>
                  <span className="value">
                    {detail.claim.serviceDateStart
                      ? `${detail.claim.serviceDateStart}${detail.claim.serviceDateEnd ? ` → ${detail.claim.serviceDateEnd}` : ""}`
                      : "—"}
                  </span>
                </div>
                <div className="claims-summary-card">
                  <span className="label">Charges</span>
                  <span className="value">{formatCurrency(detail.claim.totals?.chargeCents)}</span>
                </div>
                <div className="claims-summary-card">
                  <span className="label">Paid</span>
                  <span className="value">{formatCurrency(detail.claim.totals?.paidCents)}</span>
                </div>
                <div className="claims-summary-card">
                  <span className="label">Balance</span>
                  <span className="value">{formatCurrency(detail.claim.totals?.balanceCents)}</span>
                </div>
                <div className="claims-summary-card">
                  <span className="label">Last Updated</span>
                  <span className="value">{formatDateTimeShort(detail.claim.updatedAt)}</span>
                </div>
              </div>

              <section className="claims-section glass-surface">
                <header>
                  <h3>Transmission Timeline</h3>
                  <p className="claims-section-sub">Scroll the ribbon to inspect transmissions, acknowledgements, and job events.</p>
                </header>
                {timelineAnalysis.events.length === 0 ? (
                  <p className="claims-empty">No events recorded.</p>
                ) : (
                  <TimelineRibbon
                    events={timelineAnalysis.events}
                    storageKey={`claims_timeline_${detail.claim.id}`}
                  />
                )}
              </section>

              <section className="claims-section glass-surface">
                <header>
                  <h3>Outstanding Rejects</h3>
                  <p className="claims-section-sub">Triage by level and apply corrective workflows without leaving the workspace.</p>
                </header>
                <RejectStack groups={rejectGroups} />
              </section>
            </div>
          )}
        </section>
      }
      right={sessionRail}
      isRightCollapsed={!sessionPinned}
      onRightCollapseChange={(collapsed) => setSessionPinned(!collapsed)}
      storageKey={LAYOUT_STORAGE_KEY}
      initialLeftWidth={360}
      initialRightWidth={320}
      minLeftWidth={280}
      minMainWidth={640}
      minRightWidth={280}
    />
  );
};
