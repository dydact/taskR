import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckSquare,
  Clock,
  MessageSquare,
  Plus,
  RefreshCcw,
  Send,
  Tag,
  Trash2,
  User
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Sheet, SheetContent } from "./ui/sheet";
import { Textarea } from "./ui/textarea";
import { cn } from "./ui/utils";
import { useTaskRClient } from "../lib/taskrClient";
import { useTheme } from "./ThemeContext";
import type { NavigationSpace } from "../types/navigation";
import { env } from "../config/env";
import { isUuid, resolveDueDate } from "../lib/taskrUtils";

type TaskDetail = {
  id?: string;
  task_id?: string;
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  due_date?: string | null;
  due_at?: string | null;
  assignee_id?: string | null;
  assignees?: string[];
  list_id?: string;
  space_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  custom_fields?: Array<Record<string, unknown>> | Record<string, unknown>;
  custom_field_values?: Array<Record<string, unknown>>;
  metadata_json?: Record<string, unknown>;
  tags?: string[];
  created_by_id?: string | null;
};

type CommentRecord = {
  id?: string;
  comment_id?: string;
  task_id?: string;
  author_id?: string | null;
  body?: string;
  mentions?: string[];
  created_at?: string;
  updated_at?: string;
};

type SubtaskRecord = {
  id?: string;
  subtask_id?: string;
  task_id?: string;
  title?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

type ActivityRecord = {
  id?: string;
  event_id?: string;
  task_id?: string | null;
  actor_id?: string | null;
  event_type?: string;
  payload?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

type TaskDetailDrawerProps = {
  open: boolean;
  taskId: string | null;
  navigation?: NavigationSpace | null;
  onOpenChange: (open: boolean) => void;
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  backlog: { label: "Backlog", className: "bg-slate-500/15 text-slate-300" },
  ready: { label: "Ready", className: "bg-slate-500/10 text-slate-300" },
  "in progress": { label: "In Progress", className: "bg-blue-500/15 text-blue-300" },
  review: { label: "Review", className: "bg-purple-500/15 text-purple-300" },
  blocked: { label: "Blocked", className: "bg-red-500/15 text-red-300" },
  done: { label: "Done", className: "bg-emerald-500/15 text-emerald-300" },
  completed: { label: "Completed", className: "bg-emerald-500/15 text-emerald-300" }
};

const PRIORITY_META: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "bg-rose-500/20 text-rose-200" },
  critical: { label: "Critical", className: "bg-red-500/20 text-red-200" },
  high: { label: "High", className: "bg-orange-500/20 text-orange-200" },
  medium: { label: "Medium", className: "bg-amber-500/20 text-amber-200" },
  low: { label: "Low", className: "bg-emerald-500/15 text-emerald-200" },
  none: { label: "None", className: "bg-slate-500/15 text-slate-300" }
};

const normalizeStatus = (value?: string) =>
  (value || "").toLowerCase().replace(/_/g, " ").trim();

const formatDateTime = (value?: string | null) => {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString();
};

const formatDueLabel = (value?: string | null) => {
  if (!value) return "No due date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "No due date";
  const diffDays = Math.round((parsed.getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "Due today";
  return `Due in ${diffDays}d`;
};

const mentionRegex = /@([a-zA-Z0-9._-]+)/g;

const isMentionBoundary = (text: string, index: number) => {
  if (index === 0) return true;
  return !/[a-zA-Z0-9_]/.test(text[index - 1]);
};

const extractMentions = (text: string) => {
  const mentions = new Set<string>();
  mentionRegex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(text)) !== null) {
    const start = match.index ?? 0;
    if (!isMentionBoundary(text, start)) {
      continue;
    }
    mentions.add(match[1]);
  }
  return Array.from(mentions);
};

const splitMentions = (text: string) => {
  const parts: Array<{ type: "text" | "mention"; value: string }> = [];
  mentionRegex.lastIndex = 0;
  let match: RegExpExecArray | null;
  let cursor = 0;

  while ((match = mentionRegex.exec(text)) !== null) {
    const start = match.index ?? 0;
    if (!isMentionBoundary(text, start)) {
      continue;
    }
    if (start > cursor) {
      parts.push({ type: "text", value: text.slice(cursor, start) });
    }
    parts.push({ type: "mention", value: match[0] });
    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    parts.push({ type: "text", value: text.slice(cursor) });
  }

  return parts;
};

const isSubtaskDone = (status?: string | null) => {
  if (!status) return false;
  const value = status.toLowerCase();
  return value === "done" || value === "completed" || value === "complete";
};

const shortId = (value?: string | null) => {
  if (!value) return "Unassigned";
  return value.length > 8 ? `${value.slice(0, 8)}...` : value;
};

const getMentionList = (payload?: Record<string, unknown>) => {
  const mentions = payload?.mentions;
  if (!Array.isArray(mentions)) return [];
  return mentions.filter((mention): mention is string => typeof mention === "string" && mention.length > 0);
};

const formatActivityTitle = (event: ActivityRecord) => {
  if (event.event_type === "comment.mention") {
    const mentions = getMentionList(event.payload);
    if (mentions.length === 0) {
      return "Mentioned in comment";
    }
    const label = mentions
      .slice(0, 3)
      .map((mention) => (mention.startsWith("@") ? mention : `@${mention}`))
      .join(", ");
    const suffix = mentions.length > 3 ? ` +${mentions.length - 3} more` : "";
    return `Mentioned ${label}${suffix}`;
  }
  return (event.event_type || "activity").replace(/[_\.]/g, " ");
};

const formatActivityBody = (event: ActivityRecord) => {
  if (event.event_type === "comment.mention") {
    return typeof event.payload?.snippet === "string" ? event.payload.snippet : "";
  }
  return "";
};

const normalizeList = <T,>(payload: unknown): T[] => {
  if (Array.isArray((payload as { data?: T[] })?.data)) {
    return (payload as { data: T[] }).data;
  }
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  return [];
};

const normalizeError = (err: unknown, fallback: string) => {
  if (err instanceof Error) return err.message;
  return fallback;
};

const resolveCommentId = (comment: CommentRecord) => comment.comment_id ?? comment.id ?? "";
const resolveSubtaskId = (subtask: SubtaskRecord) => subtask.subtask_id ?? subtask.id ?? "";
const resolveActivityId = (event: ActivityRecord) => event.event_id ?? event.id ?? "";

const mapCustomFields = (task: TaskDetail | null) => {
  if (!task) return [];
  if (Array.isArray(task.custom_field_values) && task.custom_field_values.length > 0) {
    return task.custom_field_values.map((field) => ({
      key: String(field.field_id ?? field.field_slug ?? field.field_name ?? "field"),
      label: String(field.field_name ?? field.field_slug ?? "Field"),
      value: field.value ?? null
    }));
  }
  if (Array.isArray(task.custom_fields)) {
    return task.custom_fields.map((field) => ({
      key: String(field.field_id ?? field.field_slug ?? field.field_name ?? "field"),
      label: String(field.field_name ?? field.field_slug ?? "Field"),
      value: (field as { value?: unknown }).value ?? null
    }));
  }
  if (task.custom_fields && typeof task.custom_fields === "object") {
    return Object.entries(task.custom_fields).map(([key, value]) => ({
      key,
      label: key,
      value
    }));
  }
  return [];
};

const resolveTags = (task: TaskDetail | null) => {
  if (!task) return [];
  if (Array.isArray(task.tags)) return task.tags;
  const metadataTags = task.metadata_json?.tags;
  if (Array.isArray(metadataTags)) {
    return metadataTags.filter((tag): tag is string => typeof tag === "string");
  }
  return [];
};

export const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({ open, taskId, navigation, onOpenChange }) => {
  const client = useTaskRClient();
  const { colors } = useTheme();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [subtasks, setSubtasks] = useState<SubtaskRecord[]>([]);
  const [activityEvents, setActivityEvents] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [subtasksError, setSubtasksError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [savingSubtask, setSavingSubtask] = useState(false);
  const [updatingSubtaskId, setUpdatingSubtaskId] = useState<string | null>(null);
  const [deletingSubtaskId, setDeletingSubtaskId] = useState<string | null>(null);

  const listLookup = useMemo(() => {
    const map = new Map<string, string>();
    if (!navigation) return map;
    navigation.root_lists.forEach((list) => {
      map.set(list.list_id, list.name);
    });
    navigation.folders.forEach((folder) => {
      folder.lists.forEach((list) => {
        map.set(list.list_id, `${folder.name} / ${list.name}`);
      });
    });
    return map;
  }, [navigation]);

  const spaceLookup = useMemo(() => {
    const map = new Map<string, string>();
    if (!navigation) return map;
    map.set(navigation.space_id, navigation.name);
    return map;
  }, [navigation]);

  const refresh = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    setCommentsError(null);
    setSubtasksError(null);
    setActivityError(null);
    setActivityLoading(true);
    try {
      const [taskResult, commentsResult, subtasksResult, activityResult] = await Promise.allSettled([
        client.request<TaskDetail>({ path: `/tasks/${taskId}`, method: "GET" }),
        client.request<CommentRecord[]>({ path: `/comments/tasks/${taskId}`, method: "GET" }),
        client.request<SubtaskRecord[]>({ path: `/subtasks/tasks/${taskId}`, method: "GET" }),
        client.request<ActivityRecord[]>({ path: `/tasks/${taskId}/activity`, method: "GET" })
      ]);

      if (taskResult.status === "rejected") {
        throw taskResult.reason;
      }

      setTask(taskResult.value);

      if (commentsResult.status === "fulfilled") {
        setComments(normalizeList(commentsResult.value));
      } else {
        setComments([]);
        setCommentsError("Comments unavailable");
      }

      if (subtasksResult.status === "fulfilled") {
        setSubtasks(normalizeList(subtasksResult.value));
      } else {
        setSubtasks([]);
        setSubtasksError("Subtasks unavailable");
      }

      if (activityResult.status === "fulfilled") {
        setActivityEvents(normalizeList(activityResult.value));
      } else {
        setActivityEvents([]);
        setActivityError("Activity unavailable");
      }
    } catch (err) {
      setError(normalizeError(err, "Failed to load task"));
      setTask(null);
      setComments([]);
      setSubtasks([]);
      setActivityEvents([]);
    } finally {
      setLoading(false);
      setActivityLoading(false);
    }
  }, [client, taskId]);

  useEffect(() => {
    if (!open) {
      setTask(null);
      setComments([]);
      setSubtasks([]);
      setActivityEvents([]);
      setError(null);
      setCommentsError(null);
      setSubtasksError(null);
      setActivityError(null);
      setCommentBody("");
      setSubtaskTitle("");
      return;
    }
    void refresh();
  }, [open, refresh]);

  const authorId = isUuid(env.userId) ? env.userId : null;
  const canPostComment = Boolean(commentBody.trim());
  const canAddSubtask = Boolean(subtaskTitle.trim());
  const detectedMentions = useMemo(() => extractMentions(commentBody), [commentBody]);
  const customFields = useMemo(() => mapCustomFields(task), [task]);
  const tags = resolveTags(task);
  const statusKey = normalizeStatus(task?.status);
  const statusMeta = STATUS_META[statusKey] ?? {
    label: task?.status ?? "Unknown",
    className: "bg-slate-500/15 text-slate-300"
  };
  const priorityKey = task?.priority ?? "none";
  const priorityMeta = PRIORITY_META[priorityKey] ?? PRIORITY_META.none;
  const listLabel = task?.list_id ? listLookup.get(task.list_id) : null;
  const spaceLabel = task?.space_id ? spaceLookup.get(task.space_id) : null;
  const assigneeValue = task?.assignee_id ?? task?.assignees?.[0] ?? null;
  const dueDateValue = resolveDueDate(task);

  const handleAddComment = async () => {
    if (!taskId || !commentBody.trim()) return;
    setSavingComment(true);
    setCommentsError(null);
    try {
      const payload: Record<string, unknown> = {
        task_id: taskId,
        body: commentBody.trim(),
        mentions: detectedMentions
      };
      if (authorId) {
        payload.author_id = authorId;
      }
      const created = await client.request<CommentRecord>({
        path: "/comments",
        method: "POST",
        body: payload
      });
      setComments((prev) => [...prev, created]);
      setCommentBody("");
      if (detectedMentions.length > 0) {
        setActivityLoading(true);
        try {
          const events = await client.request<ActivityRecord[]>({
            path: `/tasks/${taskId}/activity`,
            method: "GET"
          });
          setActivityEvents(normalizeList(events));
          setActivityError(null);
        } catch (activityErr) {
          setActivityError(normalizeError(activityErr, "Activity unavailable"));
        } finally {
          setActivityLoading(false);
        }
      }
    } catch (err) {
      setCommentsError(normalizeError(err, "Failed to add comment"));
    } finally {
      setSavingComment(false);
    }
  };

  const handleAddSubtask = async () => {
    if (!taskId || !subtaskTitle.trim()) return;
    setSavingSubtask(true);
    setSubtasksError(null);
    try {
      const created = await client.request<SubtaskRecord>({
        path: `/subtasks/tasks/${taskId}`,
        method: "POST",
        body: {
          title: subtaskTitle.trim(),
          status: "pending"
        }
      });
      setSubtasks((prev) => [...prev, created]);
      setSubtaskTitle("");
    } catch (err) {
      setSubtasksError(normalizeError(err, "Failed to add subtask"));
    } finally {
      setSavingSubtask(false);
    }
  };

  const handleToggleSubtask = async (subtask: SubtaskRecord) => {
    if (!taskId) return;
    const subtaskId = resolveSubtaskId(subtask);
    if (!subtaskId) return;
    const nextStatus = isSubtaskDone(subtask.status) ? "pending" : "completed";
    setUpdatingSubtaskId(subtaskId);
    try {
      const updated = await client.request<SubtaskRecord>({
        path: `/subtasks/tasks/${taskId}/${subtaskId}`,
        method: "PATCH",
        body: { status: nextStatus }
      });
      setSubtasks((prev) =>
        prev.map((item) => (resolveSubtaskId(item) === resolveSubtaskId(updated) ? updated : item))
      );
    } catch (err) {
      setSubtasksError(normalizeError(err, "Failed to update subtask"));
    } finally {
      setUpdatingSubtaskId(null);
    }
  };

  const handleDeleteSubtask = async (subtask: SubtaskRecord) => {
    if (!taskId) return;
    const subtaskId = resolveSubtaskId(subtask);
    if (!subtaskId) return;
    setDeletingSubtaskId(subtaskId);
    setSubtasksError(null);
    try {
      await client.request<void>({
        path: `/subtasks/tasks/${taskId}/${subtaskId}`,
        method: "DELETE"
      });
      setSubtasks((prev) => prev.filter((item) => resolveSubtaskId(item) !== subtaskId));
    } catch (err) {
      setSubtasksError(normalizeError(err, "Failed to delete subtask"));
    } finally {
      setDeletingSubtaskId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "w-full sm:max-w-[720px] p-0 overflow-hidden",
          colors.cardBackground,
          colors.cardBorder
        )}
      >
        <div className="flex h-full flex-col">
          <header className={cn("border-b px-6 py-4 pr-12 flex items-start justify-between gap-4", colors.cardBorder)}>
            <div className="flex-1 min-w-0">
              <p className={cn(colors.textSecondary, "text-xs uppercase tracking-widest")}>Task detail</p>
              <h2 className={cn(colors.text, "text-xl font-semibold mt-1 truncate")}>
                {task?.title ?? "Task details"}
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline" className={cn("border-0", statusMeta.className)}>
                  {statusMeta.label}
                </Badge>
                <Badge variant="outline" className={cn("border-0", priorityMeta.className)}>
                  {priorityMeta.label}
                </Badge>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px]">
                        <Tag className="h-3 w-3" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={refresh}
                className={cn("rounded-xl border px-3", colors.cardBorder, colors.textSecondary)}
              >
                {loading ? <Clock className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                <span className="text-xs font-medium">{loading ? "Refreshing" : "Refresh"}</span>
              </Button>
            </div>
          </header>

          {error ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-red-400">
                <AlertTriangle className="h-6 w-6" />
                <p className="text-sm">{error}</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="px-6 py-6 space-y-6">
                <section className={cn("rounded-xl border p-4 space-y-3", colors.cardBorder)}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <p className={cn(colors.textSecondary, "text-[11px] uppercase tracking-widest")}>Space</p>
                      <p className={cn(colors.text, "text-sm font-medium")}>{spaceLabel ?? shortId(task?.space_id)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className={cn(colors.textSecondary, "text-[11px] uppercase tracking-widest")}>List</p>
                      <p className={cn(colors.text, "text-sm font-medium")}>{listLabel ?? shortId(task?.list_id)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className={cn(colors.textSecondary, "text-[11px] uppercase tracking-widest")}>Due</p>
                      <div className={cn(colors.textSecondary, "flex items-center gap-2 text-sm")}>
                        <Calendar className="h-4 w-4" />
                        <span>{formatDueLabel(dueDateValue)}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className={cn(colors.textSecondary, "text-[11px] uppercase tracking-widest")}>Assignee</p>
                      <div className={cn(colors.textSecondary, "flex items-center gap-2 text-sm")}>
                        <User className="h-4 w-4" />
                        <span>{assigneeValue ? shortId(assigneeValue) : "Unassigned"}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className={cn(colors.textSecondary, "text-[11px] uppercase tracking-widest")}>Created</p>
                      <div className={cn(colors.textSecondary, "flex items-center gap-2 text-sm")}>
                        <Clock className="h-4 w-4" />
                        <span>{formatDateTime(task?.created_at)}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className={cn(colors.textSecondary, "text-[11px] uppercase tracking-widest")}>Updated</p>
                      <div className={cn(colors.textSecondary, "flex items-center gap-2 text-sm")}>
                        <Clock className="h-4 w-4" />
                        <span>{formatDateTime(task?.updated_at)}</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className={cn("rounded-xl border p-4 space-y-2", colors.cardBorder)}>
                  <div className="flex items-center gap-2">
                    <MessageSquare className={cn("h-4 w-4", colors.textSecondary)} />
                    <h3 className={cn(colors.text, "text-sm font-semibold")}>Description</h3>
                  </div>
                  {task?.description ? (
                    <p className={cn(colors.textSecondary, "text-sm leading-relaxed")}>{task.description}</p>
                  ) : (
                    <p className={cn(colors.textSecondary, "text-sm")}>No description provided.</p>
                  )}
                </section>

                <section className={cn("rounded-xl border p-4 space-y-3", colors.cardBorder)}>
                  <div className="flex items-center gap-2">
                    <CheckSquare className={cn("h-4 w-4", colors.textSecondary)} />
                    <h3 className={cn(colors.text, "text-sm font-semibold")}>Custom fields</h3>
                  </div>
                  {customFields.length === 0 ? (
                    <p className={cn(colors.textSecondary, "text-sm")}>No custom fields configured.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {customFields.map((field) => (
                        <div key={field.key} className={cn("rounded-lg border p-3", colors.cardBorder)}>
                          <p className={cn(colors.textSecondary, "text-[11px] uppercase tracking-widest")}>{field.label}</p>
                          <p className={cn(colors.text, "text-sm mt-1")}>{String(field.value ?? "None")}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className={cn("rounded-xl border p-4 space-y-3", colors.cardBorder)}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CheckSquare className={cn("h-4 w-4", colors.textSecondary)} />
                      <h3 className={cn(colors.text, "text-sm font-semibold")}>Subtasks</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        value={subtaskTitle}
                        onChange={(event) => setSubtaskTitle(event.target.value)}
                        placeholder="New subtask"
                        className="h-8 w-[180px]"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddSubtask}
                        disabled={!canAddSubtask || savingSubtask}
                        className="h-8 px-2"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {subtasksError ? (
                    <p className="text-sm text-red-400">{subtasksError}</p>
                  ) : subtasks.length === 0 ? (
                    <p className={cn(colors.textSecondary, "text-sm")}>No subtasks yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {subtasks.map((subtask) => {
                        const done = isSubtaskDone(subtask.status);
                        const subtaskId = resolveSubtaskId(subtask);
                        return (
                          <div
                            key={subtaskId || subtask.title}
                            className={cn("flex items-center gap-3 rounded-lg border px-3 py-2", colors.cardBorder)}
                          >
                            <label className="flex items-center gap-3 flex-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={done}
                                onChange={() => handleToggleSubtask(subtask)}
                                disabled={updatingSubtaskId === subtaskId || deletingSubtaskId === subtaskId}
                                className="h-4 w-4"
                              />
                              <span className={cn("text-sm flex-1", done ? "line-through text-slate-400" : colors.text)}>
                                {subtask.title ?? "Untitled subtask"}
                              </span>
                            </label>
                            <span className={cn(colors.textSecondary, "text-[10px] uppercase")}>{subtask.status ?? "pending"}</span>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              disabled={deletingSubtaskId === subtaskId}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                handleDeleteSubtask(subtask);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-slate-400" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className={cn("rounded-xl border p-4 space-y-3", colors.cardBorder)}>
                  <div className="flex items-center gap-2">
                    <Clock className={cn("h-4 w-4", colors.textSecondary)} />
                    <h3 className={cn(colors.text, "text-sm font-semibold")}>Activity</h3>
                  </div>
                  {activityLoading ? (
                    <p className={cn(colors.textSecondary, "text-sm")}>Loading activity...</p>
                  ) : activityError ? (
                    <p className="text-sm text-red-400">{activityError}</p>
                  ) : activityEvents.length === 0 ? (
                    <p className={cn(colors.textSecondary, "text-sm")}>No activity yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {activityEvents.map((event) => {
                        const body = formatActivityBody(event);
                        return (
                          <div key={resolveActivityId(event) || event.event_type} className={cn("rounded-lg border p-3", colors.cardBorder)}>
                            <div className={cn(colors.textSecondary, "flex items-center justify-between text-[11px] uppercase tracking-widest")}>
                              <span>{formatActivityTitle(event)}</span>
                              <span>{formatDateTime(event.created_at)}</span>
                            </div>
                            {event.actor_id && (
                              <p className={cn(colors.textSecondary, "mt-1 text-xs")}>By {shortId(event.actor_id)}</p>
                            )}
                            {body ? (
                              <p className={cn(colors.text, "mt-2 text-sm whitespace-pre-wrap")}>
                                {splitMentions(body).map((segment, index) =>
                                  segment.type === "mention" ? (
                                    <span key={`${resolveActivityId(event)}-mention-${index}`} className="font-semibold text-indigo-300">
                                      {segment.value}
                                    </span>
                                  ) : (
                                    <span key={`${resolveActivityId(event)}-text-${index}`}>{segment.value}</span>
                                  )
                                )}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className={cn("rounded-xl border p-4 space-y-3", colors.cardBorder)}>
                  <div className="flex items-center gap-2">
                    <MessageSquare className={cn("h-4 w-4", colors.textSecondary)} />
                    <h3 className={cn(colors.text, "text-sm font-semibold")}>Comments</h3>
                  </div>
                  <div className="space-y-2">
                    <Textarea
                      value={commentBody}
                      onChange={(event) => setCommentBody(event.target.value)}
                      placeholder={authorId ? "Add a comment" : "Set VITE_TASKR_USER_ID to a UUID for author attribution"}
                      rows={3}
                    />
                    <div className="flex items-center justify-between">
                      <span className={cn(colors.textSecondary, "text-xs")}>
                        {detectedMentions.length > 0 ? `Mentions: ${detectedMentions.map((mention) => `@${mention}`).join(", ")}` : "Mentions supported with @handle"}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddComment}
                        disabled={!canPostComment || savingComment}
                        className="h-8 px-3"
                      >
                        <Send className="h-3.5 w-3.5 mr-1" />
                        Post
                      </Button>
                    </div>
                  </div>
                  {commentsError ? (
                    <p className="text-sm text-red-400">{commentsError}</p>
                  ) : comments.length === 0 ? (
                    <p className={cn(colors.textSecondary, "text-sm")}>No comments yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {comments.map((comment) => (
                        <div key={resolveCommentId(comment) || comment.body} className={cn("rounded-lg border p-3", colors.cardBorder)}>
                          <div className={cn(colors.textSecondary, "flex items-center justify-between text-[11px] uppercase tracking-widest")}>
                            <span>{comment.author_id ? shortId(comment.author_id) : "Unknown"}</span>
                            <span>{formatDateTime(comment.created_at)}</span>
                          </div>
                          <p className={cn(colors.text, "mt-2 text-sm whitespace-pre-wrap")}>
                            {splitMentions(comment.body || "").map((segment, index) =>
                              segment.type === "mention" ? (
                                <span key={`${resolveCommentId(comment)}-mention-${index}`} className="font-semibold text-indigo-300">
                                  {segment.value}
                                </span>
                              ) : (
                                <span key={`${resolveCommentId(comment)}-text-${index}`}>{segment.value}</span>
                              )
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
