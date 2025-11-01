import { useMemo } from "react";
import type { Task } from "@dydact/taskr-api-client";
import { Calendar, Loader2, MessageSquare, Sparkles } from "lucide-react";
import { useTheme } from "./ThemeContext";
import { Badge } from "./ui/badge";

type ListViewProps = {
  listName: string | null;
  tasks: Task[];
  loading: boolean;
  error: string | null;
};

type GroupedTasks = Record<string, Task[]>;

const PRIORITY_ORDER = ["critical", "high", "medium", "low", "none"];

export const ListView: React.FC<ListViewProps> = ({ listName, tasks, loading, error }) => {
  const { colors } = useTheme();

  const grouped = useMemo<GroupedTasks>(() => {
    return tasks.reduce<GroupedTasks>((acc, task) => {
      const status = (task.status ?? "unassigned").toString();
      acc[status] = acc[status] ? [...acc[status], task] : [task];
      return acc;
    }, {});
  }, [tasks]);

  const statuses = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  return (
    <div className={`${colors.cardBackground} rounded-2xl border ${colors.cardBorder} shadow-2xl overflow-hidden`}>
      <header className={`px-6 py-4 border-b ${colors.cardBorder} flex items-center justify-between`}>
        <div>
          <h2 className={`${colors.text} font-semibold`}>{listName ?? "Select a list"}</h2>
          <p className={`${colors.textSecondary} text-xs mt-0.5`}>
            {loading ? "Syncing tasks…" : `${tasks.length} tasks`}
          </p>
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-violet-400" />}
      </header>

      {error ? (
        <div className="px-6 py-12 text-sm text-red-400 flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          {error}
        </div>
      ) : tasks.length === 0 && !loading ? (
        <div className="px-6 py-12 text-sm text-slate-400 dark:text-slate-500">
          No tasks in this list yet. Create one from the command bar or automation rules.
        </div>
      ) : (
        <div className={`divide-y ${colors.cardBorder}`}>
          {statuses.map((status) => (
            <TaskGroup key={status} title={status} tasks={grouped[status]} />
          ))}
        </div>
      )}
    </div>
  );
};

const TaskGroup: React.FC<{ title: string; tasks: Task[] }> = ({ title, tasks }) => {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";
  const sorted = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const priorityA = PRIORITY_ORDER.indexOf((a.priority ?? "").toLowerCase());
        const priorityB = PRIORITY_ORDER.indexOf((b.priority ?? "").toLowerCase());
        return (priorityA === -1 ? PRIORITY_ORDER.length : priorityA) - (priorityB === -1 ? PRIORITY_ORDER.length : priorityB);
      }),
    [tasks]
  );

  return (
    <section className="p-4">
      <div className="flex items-center gap-2 mb-3 px-2">
        <h3 className={`${colors.text} opacity-80 capitalize`}>{title.replace(/_/g, " ")}</h3>
        <Badge
          variant="secondary"
          className={`${isDark ? "bg-white/10 text-white/70" : "bg-slate-200/60 text-slate-600"} border-0 text-[11px] px-2 rounded-full`}
        >
          {tasks.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {sorted.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>
    </section>
  );
};

const TaskRow: React.FC<{ task: Task }> = ({ task }) => {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const formattedDate = dueDate
    ? dueDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric"
      })
    : "—";
  const rawSummary = (task as any).summary ?? (task.custom_fields as Record<string, unknown> | undefined)?.summary;
  const summary = typeof rawSummary === "string" && rawSummary.trim().length > 0 ? rawSummary : "No description";
  const rawComments = (task as any).comments_count;
  const comments = typeof rawComments === "number" && Number.isFinite(rawComments) ? rawComments : 0;

  return (
    <article
      className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-180 cursor-pointer ${
        isDark
          ? "bg-white/5 hover:bg-white/10 border border-white/10"
          : "bg-white/70 hover:bg-white/90 border border-white/80"
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className={`${colors.text} truncate font-medium`}>{task.title || "Untitled task"}</p>
        <p className={`${colors.textSecondary} text-xs truncate`}>
          {summary}
        </p>
      </div>
      <div className={`flex items-center gap-1.5 text-xs ${colors.textSecondary}`}>
        <Calendar className="w-3.5 h-3.5" />
        {formattedDate}
      </div>
      <div className={`flex items-center gap-1 text-xs ${colors.textSecondary}`}>
        <MessageSquare className="w-3.5 h-3.5" />
        {comments}
      </div>
      {task.priority && (
        <Badge className="bg-violet-500/15 text-violet-200 border-violet-500/20 border px-2 py-0.5 text-[10px] uppercase">
          {task.priority}
        </Badge>
      )}
    </article>
  );
};
