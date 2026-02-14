import { useEffect, useMemo, useState } from "react";
import type { Assignment } from "@dydact/taskr-api-client";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import { AlertCircle, Cpu, Loader2, Radio, RefreshCcw, Satellite, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  useDedicatedAssignmentEvents,
  useDedicatedAssignments,
} from "../hooks/useDedicatedAssignments";

const STATUS_COLORS: Record<string, string> = {
  reserved: "bg-amber-500/80",
  pending: "bg-amber-500/70",
  active: "bg-emerald-500/80",
  paused: "bg-sky-500/80",
  released: "bg-slate-500/70",
  completed: "bg-slate-500/80",
  failed: "bg-rose-500/80",
  cancelled: "bg-slate-500/60",
};

const PRIORITY_BADGES: Record<string, string> = {
  low: "bg-slate-700 text-slate-200",
  normal: "bg-slate-600 text-slate-100",
  high: "bg-amber-500 text-slate-900",
  critical: "bg-rose-500 text-white",
};

const formatDate = (value: string | undefined | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const statusBadge = (status: string) => (
  <span
    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
      STATUS_COLORS[status] ?? "bg-slate-600"
    }`}
  >
    <span className="h-2 w-2 rounded-full bg-white" />
    {status}
  </span>
);

const priorityBadge = (priority: string) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
      PRIORITY_BADGES[priority] ?? "bg-slate-600 text-slate-100"
    }`}
  >
    {priority}
  </span>
);

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
};

const readString = (record: Record<string, unknown> | null, key: string): string | null => {
  if (!record) return null;
  const raw = record[key];
  return typeof raw === "string" ? raw : null;
};

const readRecord = (record: Record<string, unknown> | null, key: string): Record<string, unknown> | null => {
  if (!record) return null;
  const raw = record[key];
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
};

const AssignmentListItem = ({
  assignment,
  active,
  onSelect,
}: {
  assignment: Assignment;
  active: boolean;
  onSelect: (id: string) => void;
}) => {
  const overlayRecord = asRecord(assignment.overlay);
  const overlayLabel = readString(overlayRecord, "label");

  return (
    <button
      type="button"
      onClick={() => onSelect(assignment.assignment_id)}
      className={`w-full rounded-xl border px-4 py-3 text-left transition ${
        active
          ? "border-violet-500/60 bg-violet-500/10 shadow-lg shadow-violet-500/10"
          : "border-slate-800 bg-slate-900/60 hover:border-violet-500/40 hover:bg-slate-900"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-violet-200">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">{assignment.agent_slug}</div>
            <div className="text-xs text-slate-400">
              {assignment.node_id ? `Attached to ${assignment.node_id}` : "Awaiting node"}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {statusBadge(assignment.status)}
          {priorityBadge(assignment.priority)}
        </div>
      </div>
      {overlayLabel && (
        <div className="mt-3 rounded-lg bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
          Overlay: <span className="font-medium text-white">{overlayLabel}</span>
        </div>
      )}
      {assignment.feature_flags?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {assignment.feature_flags.map((flag) => (
            <Badge key={flag} variant="outline" className="border-slate-700 text-[11px] text-slate-200">
              {flag}
            </Badge>
          ))}
        </div>
      ) : null}
    </button>
  );
};

const PromptHistory = ({ assignment }: { assignment: Assignment }) => {
  if (!assignment.prompt_history?.length) {
    return (
      <div className="rounded-lg bg-slate-950/70 px-4 py-6 text-sm text-slate-400">
        No prompt history recorded yet.
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-64 rounded-lg border border-slate-800">
      <div className="divide-y divide-slate-800">
        {assignment.prompt_history.map((turn, index) => {
          const role = readString(turn, "role") ?? "unknown";
          const content = readString(turn, "content") ?? "";
          const createdAt = readString(turn, "created_at");

          return (
            <div key={`${role}-${index}`} className="bg-slate-950/50 px-4 py-3">
              <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                <span>{role}</span>
                <span>{formatDate(createdAt)}</span>
              </div>
              <div className="whitespace-pre-wrap text-sm text-slate-200">{content}</div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
};

const ObligationList = ({ assignment }: { assignment: Assignment }) => {
  if (!assignment.polaris_obligations?.length) {
    return (
      <div className="rounded-lg border border-slate-800 px-4 py-3 text-sm text-slate-400">
        No Polaris obligations tracked.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {assignment.polaris_obligations.map((obligation, index) => {
        const record = obligation;
        const obligationId = readString(record, "obligation_id") ?? `obligation-${index}`;
        const kind = readString(record, "kind") ?? "obligation";
        const status = readString(record, "status") ?? "unknown";
        const dueAt = readString(record, "due_at");
        const metadata = readRecord(record, "metadata");
        const dueDate = dueAt ? new Date(dueAt) : null;
        const now = new Date();
        const isOverdue = dueDate ? dueDate.getTime() < now.getTime() : false;

        return (
          <div key={obligationId} className="rounded-lg border border-slate-800 px-4 py-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
              <span>{kind}</span>
              <span className={isOverdue ? "text-rose-300" : undefined}>{formatDate(dueAt)}</span>
            </div>
            <div className="mt-2 text-sm text-slate-200">{status}</div>
            {metadata && Object.keys(metadata).length > 0 ? (
              <div className="mt-3 rounded-lg bg-slate-950/70 px-3 py-2 text-xs text-slate-400 space-y-1">
                {Object.entries(metadata).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-200 capitalize">{key.replace(/_/g, " ")}</span>
                    <span>{typeof value === "string" ? value : JSON.stringify(value)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

const EventTimeline = ({
  events,
  loading,
  error,
}: {
  events: ReturnType<typeof useDedicatedAssignmentEvents>["events"];
  loading: boolean;
  error: string | null;
}) => {
  if (!events.length && loading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-slate-800 px-4 py-3 text-sm text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin text-violet-300" />
        Loading assignment timeline…
      </div>
    );
  }

  if (!events.length && error) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-rose-500/60 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
        <AlertCircle className="h-4 w-4" />
        {error}
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="rounded-lg border border-slate-800 px-4 py-3 text-sm text-slate-400">
        No timeline events yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const payload = event.payload && Object.keys(event.payload).length > 0 ? (
          <div className="mt-2 rounded-lg bg-slate-950/80 px-3 py-2 text-xs text-slate-300">
            <pre className="whitespace-pre-wrap break-words">{JSON.stringify(event.payload, null, 2)}</pre>
          </div>
        ) : null;
        return (
          <div key={event.event_id} className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
              <span>{event.event_type}</span>
              <span>{formatDate(event.occurred_at)}</span>
            </div>
            {event.source ? (
              <div className="mt-1 text-xs text-slate-500">Source: {event.source}</div>
            ) : null}
            {payload}
          </div>
        );
      })}
    </div>
  );
};

export const DedicatedView: React.FC = () => {
  const {
    assignments,
    assignmentsLoading,
    assignmentsError,
    refreshAssignments,
    latestEvent,
    isStreaming,
    streamError,
    seedDemoAssignment,
  } = useDedicatedAssignments();
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState<boolean>(false);

  useEffect(() => {
    if (!assignments.length) {
      setSelectedAssignmentId(null);
      return;
    }
    if (selectedAssignmentId && assignments.some((assignment) => assignment.assignment_id === selectedAssignmentId)) {
      return;
    }
    setSelectedAssignmentId(assignments[0].assignment_id);
  }, [assignments, selectedAssignmentId]);

  const selectedAssignment = useMemo<Assignment | null>(
    () => assignments.find((assignment) => assignment.assignment_id === selectedAssignmentId) ?? null,
    [assignments, selectedAssignmentId],
  );

  const {
    events,
    eventsLoading,
    eventsError,
    refreshEvents,
  } = useDedicatedAssignmentEvents(selectedAssignmentId, latestEvent);

  const overlayRecord = selectedAssignment ? asRecord(selectedAssignment.overlay) : null;
  const overlayId = readString(overlayRecord, "overlay_id") ?? "—";
  const overlayType = readString(overlayRecord, "overlay_type") ?? "persona";
  const overlayLabel = readString(overlayRecord, "label");
  const overlayMetadata = readRecord(overlayRecord, "metadata");

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      await seedDemoAssignment();
      toast({ title: "Demo assignment seeded" });
    } catch (error) {
      console.error("Failed to seed demo assignment", error);
      toast({ title: "Failed to seed demo assignment", variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  const handleRefresh = () => {
    refreshAssignments();
    if (selectedAssignmentId) {
      refreshEvents();
    }
  };

  useEffect(() => {
    if (assignmentsError) {
      toast({ title: assignmentsError, variant: "destructive" });
    }
  }, [assignmentsError, toast]);

  useEffect(() => {
    if (streamError) {
      toast({ title: streamError, variant: "destructive" });
    }
  }, [streamError, toast]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-white">Dedicated Agents (xOxO)</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={`flex items-center gap-2 border ${
                    isStreaming
                      ? "border-emerald-500/60 text-emerald-200 animate-pulse"
                      : "border-rose-500/60 text-rose-200"
                  }`}
                >
                  <Radio className={`h-3 w-3 ${isStreaming ? "text-emerald-400" : "text-rose-400"}`} />
                  {isStreaming ? "Live" : "Offline"}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isStreaming ? "Live updates via SSE stream" : streamError ?? "Stream disconnected. Will retry automatically."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            className="gap-2 border-slate-700 text-slate-200 hover:border-violet-500 hover:text-white"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleSeedDemo}
            disabled={seeding}
            className="gap-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white hover:from-violet-600 hover:to-blue-600"
          >
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Seed Demo Assignment
          </Button>
        </div>
      </div>

      {assignmentsError ? (
        <div className="rounded-lg border border-rose-500/60 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          {assignmentsError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5">
          <Card className="border-slate-800 bg-slate-950/70">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-base text-white">Active Assignments</CardTitle>
              <div className="text-xs text-slate-400">
                {assignmentsLoading ? "Syncing…" : `${assignments.length} tracked`}
              </div>
            </CardHeader>
            <CardContent>
              {assignmentsLoading && !assignments.length ? (
                <div className="flex items-center gap-3 rounded-lg border border-slate-800 px-4 py-3 text-sm text-slate-300">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-300" />
                  Loading dedicated assignments…
                </div>
              ) : null}
              {!assignmentsLoading && assignments.length === 0 ? (
                <div className="rounded-lg border border-slate-800 px-4 py-6 text-sm text-slate-400">
                  No dedicated assignments yet. Seed a demo reservation to validate the bridge workflow.
                </div>
              ) : null}
              <ScrollArea className="max-h-[28rem] space-y-3 pr-2">
                <div className="space-y-3">
                  {assignments.map((assignment) => (
                    <AssignmentListItem
                      key={assignment.assignment_id}
                      assignment={assignment}
                      active={assignment.assignment_id === selectedAssignmentId}
                      onSelect={setSelectedAssignmentId}
                    />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-7">
          <Card className="border-slate-800 bg-slate-950/70">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base text-white">
                {selectedAssignment ? selectedAssignment.agent_slug : "No assignment selected"}
              </CardTitle>
              {selectedAssignment ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Satellite className="h-4 w-4 text-violet-300" />
                  Last update: {formatDate(selectedAssignment.updated_at)}
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedAssignment ? (
                <div className="rounded-lg border border-slate-800 px-4 py-6 text-sm text-slate-400">
                  Select an assignment to see details.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    {statusBadge(selectedAssignment.status)}
                    {priorityBadge(selectedAssignment.priority)}
                    {selectedAssignment.service_owner ? (
                      <Badge variant="outline" className="border-slate-700 text-[11px] text-slate-200">
                        Owner: {selectedAssignment.service_owner}
                      </Badge>
                    ) : null}
                    {selectedAssignment.agent_version ? (
                      <Badge variant="secondary" className="bg-slate-800 text-[11px] text-slate-200">
                        Version {selectedAssignment.agent_version}
                      </Badge>
                    ) : null}
                  </div>
                  <Separator className="bg-slate-800" />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-200">Overlay</h3>
                      <div className="rounded-lg border border-slate-800 px-4 py-3 text-sm text-slate-300">
                        {overlayRecord ? (
                          <>
                            <div className="text-slate-200">
                              <span className="text-xs uppercase text-slate-500">Overlay ID</span>
                              <div className="text-sm font-medium text-white">{overlayId}</div>
                            </div>
                            <div className="mt-2 text-xs uppercase text-slate-500">{overlayType}</div>
                            {overlayLabel ? (
                              <div className="mt-2 text-xs uppercase text-slate-500 text-slate-300">
                                Label:
                                <span className="ml-2 text-sm font-medium text-white">{overlayLabel}</span>
                              </div>
                            ) : null}
                            {overlayMetadata ? (
                              <div className="mt-3 rounded-lg bg-slate-950/70 px-3 py-2 text-xs text-slate-400">
                                <pre className="whitespace-pre-wrap break-words">
                                  {JSON.stringify(overlayMetadata, null, 2)}
                                </pre>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          "No overlay metadata"
                        )}
                      </div>
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-slate-200">Polaris Obligations</h3>
                        <ObligationList assignment={selectedAssignment} />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-200">Prompt History</h3>
                      <PromptHistory assignment={selectedAssignment} />
                    </div>
                  </div>
                  <Separator className="bg-slate-800" />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-200">Timeline</h3>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className="flex items-center gap-2 border border-slate-700 text-[11px] text-slate-300"
                            >
                              <Satellite className="h-3 w-3 text-violet-300" />
                              Live updates
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="left">Recent AssignmentEvents from the ingestion bridge.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <EventTimeline events={events} loading={eventsLoading} error={eventsError} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DedicatedView;
