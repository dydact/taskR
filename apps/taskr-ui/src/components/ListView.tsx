import { useMemo, useState } from "react";
import type { Task } from "@dydact/taskr-api-client";
import {
  Calendar,
  Loader2,
  MessageSquare,
  Sparkles,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Flag,
  CheckSquare,
  Square,
  User,
  MoreHorizontal,
  Link,
  ExternalLink,
  Copy
} from "lucide-react";
import { useTheme } from "./ThemeContext";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { cn } from "./ui/utils";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "./ui/dropdown-menu";
import { toast } from "sonner";
import { resolveDueDate, resolveTaskId } from "../lib/taskrUtils";

type ListViewProps = {
  listName: string | null;
  tasks: Task[];
  loading: boolean;
  error: string | null;
  onSelectTask?: (taskId: string) => void;
};

type GroupedTasks = Record<string, Task[]>;

const PRIORITY_ORDER = ["critical", "high", "medium", "low", "none"];

const PRIORITY_CONFIG = {
  critical: {
    bg: "bg-gradient-to-r from-red-500/20 to-pink-500/20",
    border: "border-red-500/40",
    text: "text-red-300",
    icon: "text-red-400",
    label: "Critical"
  },
  high: {
    bg: "bg-orange-500/15",
    border: "border-orange-500/30",
    text: "text-orange-300",
    icon: "text-orange-400",
    label: "High"
  },
  medium: {
    bg: "bg-yellow-500/15",
    border: "border-yellow-500/30",
    text: "text-yellow-300",
    icon: "text-yellow-400",
    label: "Medium"
  },
  low: {
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/30",
    text: "text-emerald-300",
    icon: "text-emerald-400",
    label: "Low"
  },
  none: {
    bg: "bg-slate-500/10",
    border: "border-slate-500/20",
    text: "text-slate-400",
    icon: "text-slate-500",
    label: "None"
  }
};

export const ListView: React.FC<ListViewProps> = ({ listName, tasks, loading, error, onSelectTask }) => {
  const { colors } = useTheme();

  const grouped = useMemo<GroupedTasks>(() => {
    if (!tasks || !Array.isArray(tasks)) return {};
    return tasks.reduce<GroupedTasks>((acc, task) => {
      const status = (task.status ?? "unassigned").toString();
      acc[status] = acc[status] ? [...acc[status], task] : [task];
      return acc;
    }, {});
  }, [tasks]);

  const statuses = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  return (
    <div className={cn("rounded-2xl border shadow-2xl overflow-hidden", colors.cardBackground, colors.cardBorder)}>
      <header className={cn("px-6 py-4 border-b flex items-center justify-between", colors.cardBorder)}>
        <div className="flex-1 min-w-0">
          <h2 className={cn(colors.text, "font-semibold truncate")}>{listName ?? "Select a list"}</h2>
          <p className={cn(colors.textSecondary, "text-xs mt-0.5")}>
            {loading ? "Syncing tasks…" : `${tasks?.length ?? 0} tasks`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-violet-400" />}
        </div>
      </header>

      {error ? (
        <ErrorState message={error} />
      ) : loading && (!tasks || tasks.length === 0) ? (
        <LoadingState />
      ) : ((!tasks || tasks.length === 0) && !loading) ? (
        <EmptyState />
      ) : (
        <div className={cn("divide-y", colors.cardBorder)}>
          {statuses.map((status) => (
            <TaskGroup key={status} title={status} tasks={grouped[status]} onSelectTask={onSelectTask} />
          ))}
        </div>
      )}
    </div>
  );
};

const EmptyState: React.FC = () => {
  const { colors } = useTheme();
  return (
    <div className="px-6 py-16 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-violet-500/10 mb-4">
        <CheckSquare className="w-8 h-8 text-violet-400" />
      </div>
      <p className={cn(colors.text, "font-medium mb-1")}>No tasks yet</p>
      <p className={cn(colors.textSecondary, "text-sm")}>Create one from the command bar or automation rules</p>
    </div>
  );
};

const ErrorState: React.FC<{ message: string }> = ({ message }) => (
  <div className="px-6 py-12 text-center">
    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 mb-4">
      <Sparkles className="w-8 h-8 text-red-400" />
    </div>
    <p className="text-sm text-red-400">{message}</p>
  </div>
);

const LoadingState: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className="p-4 space-y-6">
      {[1, 2, 3].map((group) => (
        <div key={group} className="space-y-2">
          <div className="flex items-center gap-2 px-2 mb-3">
            <div className={cn("h-5 w-24 rounded animate-pulse", isDark ? "bg-white/10" : "bg-slate-200/60")} />
            <div className={cn("h-5 w-8 rounded-full animate-pulse", isDark ? "bg-white/10" : "bg-slate-200/60")} />
          </div>
          {[1, 2].map((row) => (
            <div
              key={row}
              className={cn("flex items-center gap-4 px-4 py-3 rounded-xl", isDark ? "bg-white/5" : "bg-white/40")}
            >
              <div className={cn("h-4 w-4 rounded animate-pulse", isDark ? "bg-white/10" : "bg-slate-200/60")} />
              <div className={cn("h-4 flex-1 rounded animate-pulse", isDark ? "bg-white/10" : "bg-slate-200/60")} />
              <div className={cn("h-7 w-7 rounded-full animate-pulse", isDark ? "bg-white/10" : "bg-slate-200/60")} />
              <div className={cn("h-4 w-16 rounded animate-pulse", isDark ? "bg-white/10" : "bg-slate-200/60")} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

const TaskGroup: React.FC<{ title: string; tasks: Task[]; onSelectTask?: (taskId: string) => void }> = ({
  title,
  tasks,
  onSelectTask
}) => {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";
  const [isCollapsed, setIsCollapsed] = useState(false);

  const sorted = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const priorityA = PRIORITY_ORDER.indexOf((a.priority ?? "none").toLowerCase());
        const priorityB = PRIORITY_ORDER.indexOf((b.priority ?? "none").toLowerCase());
        return (priorityA === -1 ? PRIORITY_ORDER.length : priorityA) - (priorityB === -1 ? PRIORITY_ORDER.length : priorityB);
      }),
    [tasks]
  );

  return (
    <section className="p-4">
      <div
        className={cn(
          "sticky top-0 z-10 -mx-4 -mt-4 px-6 py-3 mb-3 backdrop-blur-md transition-all duration-180",
          isDark ? "bg-slate-900/80 hover:bg-slate-900/90" : "bg-white/80 hover:bg-white/90"
        )}
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2 w-full group"
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? (
            <ChevronRight
              className={cn("w-4 h-4 transition-transform duration-180 group-hover:scale-110", colors.textSecondary)}
            />
          ) : (
            <ChevronDown
              className={cn("w-4 h-4 transition-transform duration-180 group-hover:scale-110", colors.textSecondary)}
            />
          )}
          <h3
            className={cn(
              colors.text,
              "opacity-80 capitalize font-medium transition-opacity duration-180 group-hover:opacity-100"
            )}
          >
            {title.replace(/_/g, " ")}
          </h3>
          <Badge
            variant="secondary"
            className={cn(
              "border-0 text-[11px] px-2 rounded-full transition-all duration-180",
              isDark ? "bg-white/10 text-white/70 group-hover:bg-white/15" : "bg-slate-200/60 text-slate-600 group-hover:bg-slate-200/80"
            )}
          >
            {tasks.length}
          </Badge>
        </button>
      </div>
      <div
        className={cn(
          "space-y-2 transition-all duration-300 origin-top",
          isCollapsed ? "scale-y-0 h-0 opacity-0 overflow-hidden" : "scale-y-100 opacity-100"
        )}
      >
        {sorted.map((task, index) => {
          const taskKey = resolveTaskId(task) ?? task.id ?? `${title}-${index}`;
          return <TaskRow key={taskKey} task={task} onSelectTask={onSelectTask} />;
        })}
      </div>
    </section>
  );
};

const TaskRow: React.FC<{ task: Task; onSelectTask?: (taskId: string) => void }> = ({ task, onSelectTask }) => {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";
  const [isSelected, setIsSelected] = useState(false);

  const taskId = resolveTaskId(task);
  const dueDateValue = resolveDueDate(task);
  const dueDate = dueDateValue ? new Date(dueDateValue) : null;
  const formattedDate = dueDate ? dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
  const rawSummary = (task as any).summary ?? (task.custom_fields as Record<string, unknown> | undefined)?.summary;
  const summary = typeof rawSummary === "string" && rawSummary.trim().length > 0 ? rawSummary : null;
  const rawComments = (task as any).comments_count;
  const comments = typeof rawComments === "number" && Number.isFinite(rawComments) ? rawComments : 0;
  const priority = (task.priority?.toLowerCase() ?? "none") as keyof typeof PRIORITY_CONFIG;
  const priorityConfig = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.none;
  const isOverdue = dueDate && dueDate < new Date();
  const subtasks = (task as any).subtasks_completed ?? 0;
  const subtasksTotal = (task as any).subtasks_total ?? 0;
  const hasSubtasks = subtasksTotal > 0;
  const taskLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/tasks/${taskId ?? ""}`;
  }, [taskId]);

  const handleOpenDetails = () => {
    if (!taskId || !onSelectTask) return;
    onSelectTask(taskId);
  };

  const handleCopyLink = async () => {
    try {
      const value = taskLink || String(taskId ?? "");
      await navigator.clipboard.writeText(value);
      toast({ title: "Task link copied" });
    } catch (err) {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  return (
    <article
      className={cn(
        "group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-180 cursor-pointer focus-within:ring-2 focus-within:ring-violet-500/50",
        isDark
          ? cn("bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20", isSelected && "bg-violet-500/10 border-violet-500/30")
          : cn("bg-white/70 hover:bg-white/90 border border-white/40 hover:border-white/60", isSelected && "bg-violet-100/60 border-violet-300/60")
      )}
      role="row"
      tabIndex={0}
      onClick={handleOpenDetails}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpenDetails();
        }
      }}
    >
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsSelected(!isSelected);
          }}
          className={cn(
            "w-4 h-4 transition-opacity duration-180 opacity-0 group-hover:opacity-100 focus:opacity-100",
            isSelected && "opacity-100"
          )}
          aria-label="Select task"
        >
          {isSelected ? (
            <CheckSquare className={cn("w-4 h-4", colors.text)} />
          ) : (
            <Square className={cn("w-4 h-4", colors.textSecondary)} />
          )}
        </button>
        <div
          className={cn(
            "cursor-grab active:cursor-grabbing transition-opacity duration-180 opacity-0 group-hover:opacity-100 focus:opacity-100"
          )}
          aria-label="Drag handle"
        >
          <GripVertical className={cn("w-4 h-4", colors.textSecondary)} />
        </div>
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className={cn(colors.text, "truncate font-medium transition-colors duration-180")}>
            {task.title || "Untitled task"}
          </p>
          {summary && <p className={cn(colors.textSecondary, "text-xs truncate mt-0.5")}>{summary}</p>}
          {hasSubtasks && (
            <div className="flex items-center gap-2 mt-1">
              <div className={cn("flex items-center gap-1 text-[10px]", colors.textSecondary)}>
                <CheckSquare className="w-3 h-3" />
                <span>
                  {subtasks}/{subtasksTotal}
                </span>
              </div>
              <div className="flex-1 max-w-[80px] h-1 rounded-full bg-slate-500/20 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-300"
                  style={{ width: `${(subtasks / subtasksTotal) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0">
          <Avatar
            className={cn(
              "w-7 h-7 border-2 transition-transform duration-180 group-hover:scale-110",
              isDark ? "border-white/20" : "border-white"
            )}
          >
            <AvatarFallback
              className={cn(
                "text-[10px]",
                isDark
                  ? "bg-gradient-to-br from-violet-500/30 to-blue-500/30 text-white/80"
                  : "bg-gradient-to-br from-violet-200 to-blue-200 text-slate-700"
              )}
            >
              <User className="w-3.5 h-3.5" />
            </AvatarFallback>
          </Avatar>
        </div>

        <div
          className={cn(
            "flex items-center gap-1.5 text-xs shrink-0 px-2 py-1 rounded-lg transition-all duration-180",
            isOverdue
              ? isDark
                ? "bg-red-500/15 text-red-300 border border-red-500/30"
                : "bg-red-100/80 text-red-700 border border-red-300/60"
              : cn(isDark ? "bg-white/5 hover:bg-white/10" : "bg-white/50 hover:bg-white/70", colors.textSecondary)
          )}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span className="font-medium">{formattedDate}</span>
        </div>

        <Badge
          className={cn(
            "border px-2.5 py-0.5 text-[10px] uppercase font-semibold shrink-0 transition-all duration-180",
            priorityConfig.bg,
            priorityConfig.border,
            priorityConfig.text
          )}
        >
          <Flag className={cn("w-3 h-3 mr-1", priorityConfig.icon)} />
          {priorityConfig.label}
        </Badge>

        <div
          className={cn(
            "flex items-center gap-1 text-xs shrink-0 px-2 py-1 rounded-lg transition-all duration-180",
            isDark ? "hover:bg-white/10" : "hover:bg-white/70",
            colors.textSecondary,
            comments > 0 && "font-medium"
          )}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{comments}</span>
        </div>

        {(task as any).ai_generated && (
          <div className="shrink-0">
            <div
              className={cn(
                "flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/30 transition-transform duration-180 group-hover:scale-110"
              )}
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            </div>
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
              Assign (coming soon)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
};
