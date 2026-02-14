import { useMemo, useState } from "react";
import type { Task } from "@dydact/taskr-api-client";
import {
  Calendar,
  CheckSquare,
  Clock,
  Flag,
  GripVertical,
  Layers,
  Loader2,
  MessageSquare,
  RefreshCcw,
  Sparkles,
  MoreHorizontal,
  ExternalLink,
  Copy,
  Link
} from "lucide-react";
import { cn } from "./ui/utils";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "./ui/dropdown-menu";
import { toast } from "sonner";
import { useTheme } from "./ThemeContext";
import { resolveDueDate, resolveTaskId } from "../lib/taskrUtils";

const STATUS_LIBRARY: Record<
  string,
  {
    title: string;
    gradient: string;
    accent: string;
    softBg: string;
    order: number;
  }
> = {
  backlog: {
    title: "Backlog",
    gradient: "from-slate-600 to-slate-500",
    accent: "text-slate-300",
    softBg: "bg-slate-500/10",
    order: 0
  },
  ready: {
    title: "Ready",
    gradient: "from-slate-500 to-slate-600",
    accent: "text-slate-200",
    softBg: "bg-slate-500/15",
    order: 1
  },
  "in progress": {
    title: "In Progress",
    gradient: "from-blue-600 to-cyan-500",
    accent: "text-cyan-200",
    softBg: "bg-blue-500/15",
    order: 2
  },
  review: {
    title: "Review",
    gradient: "from-purple-600 to-violet-500",
    accent: "text-purple-200",
    softBg: "bg-purple-500/15",
    order: 3
  },
  blocked: {
    title: "Blocked",
    gradient: "from-red-500 to-rose-500",
    accent: "text-red-100",
    softBg: "bg-red-500/15",
    order: 4
  },
  done: {
    title: "Done",
    gradient: "from-emerald-500 to-green-500",
    accent: "text-emerald-200",
    softBg: "bg-emerald-500/15",
    order: 5
  }
};

type BoardViewProps = {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  onRefresh?: () => void;
  onSelectTask?: (taskId: string) => void;
};

type LaneData = {
  key: string;
  title: string;
  gradient: string;
  accent: string;
  softBg: string;
  tasks: Task[];
  order: number;
};

const PRIORITY_ORDER = ["critical", "high", "medium", "low", "none"];

export const BoardView: React.FC<BoardViewProps> = ({ tasks, loading, error, onRefresh, onSelectTask }) => {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";
  const [hoveredLane, setHoveredLane] = useState<string | null>(null);

  const lanes = useMemo(() => deriveLanes(tasks), [tasks]);
  const isEmpty = lanes.every((lane) => lane.tasks.length === 0);

  return (
    <section className={cn("rounded-2xl border shadow-2xl", colors.cardBackground, colors.cardBorder)}>
      <header className={cn("px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3", colors.cardBorder)}>
        <div>
          <p className={cn("text-xs uppercase tracking-wider font-semibold", colors.textSecondary)}>Task Board</p>
          <h2 className={cn("text-lg font-semibold", colors.text)}>Status by lane</h2>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "hidden md:flex items-center gap-1 text-xs rounded-full px-3 py-1.5",
              isDark ? "bg-white/5 text-white/70" : "bg-slate-100 text-slate-500"
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{lanes.length} lanes</span>
          </div>
          {onRefresh && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onRefresh}
              className={cn(
                "rounded-xl border px-3",
                colors.cardBorder,
                colors.textSecondary,
                isDark ? "hover:bg-white/10 hover:text-white" : "hover:bg-white/80 hover:text-slate-900"
              )}
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
              <span className="text-xs font-medium">{loading ? "Refreshing" : "Refresh"}</span>
            </Button>
          )}
        </div>
      </header>

      {error ? (
        <BoardError message={error} />
      ) : loading && isEmpty ? (
        <BoardLoading />
      ) : (
        <div className="p-4 md:p-6 space-y-4">
          {isEmpty && (
            <div
              className={cn(
                "flex flex-col items-center justify-center gap-3 border rounded-xl py-12 text-center",
                colors.cardBorder,
                colors.textSecondary
              )}
            >
              <CheckSquare className="w-8 h-8 text-violet-400" />
              <div>
                <p className={cn("font-medium text-sm", colors.text)}>No tasks on the board</p>
                <p className="text-xs opacity-80">
                  Create tasks or assign statuses to populate drag lanes.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {lanes.map((lane) => (
              <Lane
                key={lane.key}
                lane={lane}
                hovered={hoveredLane === lane.key}
                onHoverChange={(state) => setHoveredLane(state ? lane.key : null)}
                onSelectTask={onSelectTask}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

const Lane: React.FC<{
  lane: LaneData;
  hovered: boolean;
  onHoverChange: (isHovering: boolean) => void;
  onSelectTask?: (taskId: string) => void;
}> = ({ lane, hovered, onHoverChange, onSelectTask }) => {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <article
      className={cn(
        "rounded-2xl border flex flex-col min-h-[320px] transition-all duration-200",
        colors.cardBorder,
        isDark ? "bg-white/5" : "bg-white/60"
      )}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <header
        className={cn(
          "px-4 py-3 rounded-t-2xl text-sm font-medium flex items-center justify-between gap-2 bg-gradient-to-r text-white",
          lane.gradient
        )}
      >
        <button
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="flex items-center gap-2 text-left w-full focus:outline-none"
        >
          <span className="capitalize">{lane.title}</span>
          <Badge className="bg-white/20 text-white border-0 text-[11px] px-2">{lane.tasks.length}</Badge>
        </button>
        <div
          className={cn(
            "rounded-full px-2 py-1 text-[10px] font-semibold tracking-wide uppercase",
            "bg-white/20 text-white/90"
          )}
        >
          Lane
        </div>
      </header>

      <div
        className={cn(
          "flex-1 flex flex-col gap-2 p-3 transition-all duration-200 overflow-hidden",
          isCollapsed ? "max-h-0 opacity-0 pointer-events-none" : "max-h-[1600px] opacity-100"
        )}
      >
        {lane.tasks.length === 0 ? (
          <div
            className={cn(
              "flex-1 border border-dashed rounded-xl px-3 py-6 text-center text-xs flex flex-col items-center justify-center gap-2",
              isDark ? "border-white/10 text-white/60" : "border-slate-300/50 text-slate-500/90",
              hovered && "border-violet-400/70 text-violet-500 bg-violet-500/5"
            )}
          >
            <GripVertical className="w-4 h-4" />
            Drop task here
          </div>
        ) : (
          lane.tasks.map((task, index) => {
            const taskKey = resolveTaskId(task) ?? task.id ?? `${lane.key}-${index}`;
            return (
              <TaskCard
                key={taskKey}
                task={task}
                laneAccent={lane.softBg}
                onSelectTask={onSelectTask}
              />
            );
          })
        )}
        <div
          className={cn(
            "border border-dashed rounded-xl px-3 py-2 text-xs flex items-center justify-center gap-2 transition-colors duration-150",
            hovered
              ? "border-violet-400/70 text-violet-500 bg-violet-500/5"
              : isDark
                ? "border-white/5 text-white/40 hover:border-white/20 hover:text-white/70"
                : "border-slate-200/60 text-slate-400 hover:border-slate-400/60 hover:text-slate-600"
          )}
        >
          <GripVertical className="w-4 h-4" />
          Drag tasks here
        </div>
      </div>
    </article>
  );
};

const TaskCard: React.FC<{ task: Task; laneAccent: string; onSelectTask?: (taskId: string) => void }> = ({
  task,
  laneAccent,
  onSelectTask
}) => {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";
  const taskId = resolveTaskId(task);
  const dueDateValue = resolveDueDate(task);
  const dueDate = dueDateValue ? new Date(dueDateValue) : null;
  const formattedDue = dueDate
    ? dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;
  const isOverdue = dueDate ? dueDate < new Date() : false;
  const summary =
    (task as any).summary ??
    (task.custom_fields as Record<string, unknown> | undefined)?.summary ??
    null;
  const comments = Number((task as any).comments_count ?? 0);
  const priority = (task.priority ?? "none").toString().toLowerCase();
  const priorityIndex = PRIORITY_ORDER.indexOf(priority);
  const priorityLabel = priorityIndex === -1 ? "None" : priority;
  const assignees = ((task as any).assignees ?? []) as Array<Record<string, unknown> | string>;
  const aiGenerated = Boolean((task as any).ai_generated);
  const estimate = (task as any).duration_minutes ?? null;
  const taskLink = typeof window !== "undefined" ? `${window.location.origin}/tasks/${taskId ?? ""}` : "";

  const handleOpenDetails = () => {
    if (!taskId || !onSelectTask) return;
    onSelectTask(taskId);
  };

  const handleCopyLink = async () => {
    try {
      const value = taskLink || String(taskId ?? "");
      await navigator.clipboard.writeText(value);
      toast({ title: "Task link copied" });
    } catch {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  return (
    <article
      className={cn(
        "group border rounded-xl p-3 bg-white/90 dark:bg-white/10 flex flex-col gap-3 shadow-sm",
        colors.cardBorder,
        "transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg focus-within:ring-2 focus-within:ring-violet-500/40"
      )}
      tabIndex={0}
      role="article"
      onClick={handleOpenDetails}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpenDetails();
        }
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 rounded-lg border px-1.5 py-1 text-[10px] uppercase font-semibold tracking-wide",
            laneAccent,
            isDark ? "text-white/80 border-white/20" : "text-slate-600 border-white"
          )}
        >
          {(task.status ?? "Status").toString()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={cn(colors.text, "font-medium text-sm leading-snug truncate")}>
            {task.title || "Untitled task"}
          </h3>
          {summary && (
            <p className={cn(colors.textSecondary, "text-xs mt-1 leading-snug line-clamp-2")}>{summary}</p>
          )}
        </div>
        <button
          type="button"
          className={cn(
            "self-start -mr-1 rounded-md p-1 transition-opacity duration-150 opacity-0 group-hover:opacity-100",
            isDark ? "hover:bg-white/10" : "hover:bg-slate-100"
          )}
          aria-label="Drag task"
          onClick={(event) => event.stopPropagation()}
        >
          <GripVertical className={cn("w-4 h-4", colors.textSecondary)} />
        </button>
      </div>

      <div className="flex items-center flex-wrap gap-3">
        <Badge
          className={cn(
            "flex items-center gap-1 text-[10px] uppercase border px-2.5 py-0.5 tracking-wide",
            priorityIndex <= 1
              ? "bg-red-500/15 border-red-400/30 text-red-300"
              : priorityIndex === 2
                ? "bg-amber-500/15 border-amber-400/30 text-amber-300"
                : priorityIndex === 3
                  ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-300"
                  : "bg-slate-500/10 border-slate-500/30 text-slate-400"
          )}
        >
          <Flag className="w-3 h-3" />
          {priorityLabel}
        </Badge>
        {estimate && (
          <div
            className={cn(
              "flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border",
              isDark ? "border-white/10 text-white/70" : "border-slate-200 text-slate-500"
            )}
          >
            <Clock className="w-3.5 h-3.5" />
            {estimate} min
          </div>
        )}
        {formattedDue && (
          <div
            className={cn(
              "flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border",
              isOverdue
                ? isDark
                  ? "bg-red-500/15 border-red-400/40 text-red-200"
                  : "bg-red-100 border-red-300 text-red-700"
                : isDark
                  ? "border-white/10 text-white/70"
                  : "border-slate-200 text-slate-500"
            )}
          >
            <Calendar className="w-3.5 h-3.5" />
            {formattedDue}
          </div>
        )}
        {comments > 0 && (
          <div
            className={cn(
              "flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border",
              isDark ? "border-white/10 text-white/70" : "border-slate-200 text-slate-500"
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {comments}
          </div>
        )}
        {aiGenerated && (
          <div className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-violet-400/40 text-violet-300 bg-violet-500/10">
            <Sparkles className="w-3.5 h-3.5" />
            AI
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-4">
        <div className="flex -space-x-2">
          {(assignees.length > 0 ? assignees : [null]).slice(0, 3).map((assignee, index) => (
            <Avatar
              key={`${taskId ?? task.id ?? "task"}-assignee-${index}`}
              className={cn(
                "w-7 h-7 border-2 transition-transform duration-150 group-hover:scale-105",
                isDark ? "border-white/20" : "border-white"
              )}
            >
              <AvatarFallback className="bg-gradient-to-br from-violet-500/40 to-blue-500/40 text-white text-[10px]">
                {initialsFromAssignee(assignee)}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>
        <div
          className={cn(
            "text-[11px] font-medium px-2 py-1 rounded-lg border",
            isDark ? "border-white/10 text-white/60" : "border-slate-200 text-slate-500"
          )}
        >
          {(task as any).tag ?? "Task"}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs uppercase tracking-wide">Quick actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleCopyLink}>
              <Copy className="w-4 h-4 mr-2" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                handleOpenDetails();
              }}
              disabled={!taskId}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <Link className="w-4 h-4 mr-2" />
              Move to list (soon)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </footer>
    </article>
  );
};

const BoardLoading: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
      {[0, 1, 2, 3].map((column) => (
        <div
          key={column}
          className={cn(
            "rounded-2xl border p-4 space-y-3",
            isDark ? "bg-white/5 border-white/10" : "bg-white/80 border-white"
          )}
        >
          <div className={cn("h-10 rounded-xl animate-pulse", isDark ? "bg-white/10" : "bg-slate-200/70")} />
          {[0, 1, 2].map((card) => (
            <div key={card} className="space-y-2 rounded-xl border px-3 py-4 animate-pulse border-dashed border-slate-200/60">
              <div className={cn("h-3.5 rounded", isDark ? "bg-white/10" : "bg-slate-200/70")} />
              <div className={cn("h-3 rounded w-3/4", isDark ? "bg-white/5" : "bg-slate-200/50")} />
              <div className="flex gap-2 pt-1">
                <div className={cn("h-2.5 w-12 rounded", isDark ? "bg-white/5" : "bg-slate-200/60")} />
                <div className={cn("h-2.5 w-10 rounded", isDark ? "bg-white/5" : "bg-slate-200/60")} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

const BoardError: React.FC<{ message: string }> = ({ message }) => (
  <div className="p-10 flex flex-col items-center justify-center gap-3 text-center text-sm text-red-400">
    <Sparkles className="w-8 h-8 text-red-400" />
    <p>{message}</p>
  </div>
);

const deriveLanes = (tasks: Task[]): LaneData[] => {
  const defaultKeys = Object.keys(STATUS_LIBRARY);
  const store = new Map<string, Task[]>();

  defaultKeys.forEach((key) => store.set(key, []));

  tasks.forEach((task) => {
    const rawStatus = (task.status ?? "ready").toString().toLowerCase();
    const key = STATUS_LIBRARY[rawStatus] ? rawStatus : defaultKeys.includes(rawStatus) ? rawStatus : rawStatus;
    const bucket = store.get(key) ?? [];
    bucket.push(task);
    store.set(key, bucket);
  });

  const additionalStatuses = Array.from(store.keys());

  return additionalStatuses
    .map((status) => {
      const preset = STATUS_LIBRARY[status] ?? {
        title: status.replace(/_/g, " "),
        gradient: "from-slate-500 to-slate-600",
        accent: "text-slate-200",
        softBg: "bg-slate-500/10",
        order: 99
      };

      const bucket = store.get(status) ?? [];
      bucket.sort((a, b) => {
        const priorityA = PRIORITY_ORDER.indexOf((a.priority ?? "none").toString().toLowerCase());
        const priorityB = PRIORITY_ORDER.indexOf((b.priority ?? "none").toString().toLowerCase());
        return (priorityA === -1 ? PRIORITY_ORDER.length : priorityA) - (priorityB === -1 ? PRIORITY_ORDER.length : priorityB);
      });

      return {
        key: status,
        title: preset.title,
        gradient: preset.gradient,
        accent: preset.accent,
        softBg: preset.softBg,
        tasks: bucket,
        order: preset.order
      };
    })
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.title.localeCompare(b.title);
    });
};

const initialsFromAssignee = (assignee: Record<string, unknown> | string | null | undefined): string => {
  if (!assignee) return "??";
  if (typeof assignee === "string") {
    return assignee
      .split(" ")
      .map((segment) => segment.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  if ("name" in assignee && typeof assignee.name === "string") {
    return assignee.name
      .split(" ")
      .map((segment) => segment.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  if ("initials" in assignee && typeof assignee.initials === "string") {
    return assignee.initials.slice(0, 2).toUpperCase();
  }
  return "??";
};
