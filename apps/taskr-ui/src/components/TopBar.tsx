import { useState } from "react";
import { Search, Plus, Zap, Sparkles, Sun, Moon } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useTheme } from "./ThemeContext";
import type { DensityMode } from "../types/shell";
import { useTaskRClient } from "../lib/taskrClient";
import { env } from "../config/env";

interface TopBarProps {
  onToggleRightPanel: () => void;
  density: DensityMode;
  onCycleDensity: () => void;
  onDockToggle: () => void;
  onDockHoverStart: () => void;
  onDockHoverEnd: () => void;
  dockOpen: boolean;
}

const DENSITY_LABELS: Record<DensityMode, string> = {
  comfortable: "Comfort",
  compact: "Compact",
  table: "Table"
};

export function TopBar({
  onToggleRightPanel,
  density,
  onCycleDensity,
  onDockToggle,
  onDockHoverStart,
  onDockHoverEnd,
  dockOpen
}: TopBarProps) {
  const { theme, toggleTheme, colors } = useTheme();
  const client = useTaskRClient();
  const [seedLoading, setSeedLoading] = useState(false);
  const demoSeedEnabled = import.meta.env.VITE_ENABLE_DEMO_SEED === "true";

  const isDark = theme === "dark";
  const densityLabel = DENSITY_LABELS[density] ?? density;

  const handleSeedDemo = async () => {
    setSeedLoading(true);
    try {
      const result = await client.admin.seedDemo();
      window.alert(
        [
          'Demo data seeded successfully.',
          `Spaces: ${result.spaces}`,
          `Lists: ${result.lists}`,
          `Tasks: ${result.tasks}`,
          `Docs: ${result.docs}`
        ].join('\n')
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      window.alert(`Demo seed failed: ${message}`);
    } finally {
      setSeedLoading(false);
    }
  };

  return (
    <header className={`${colors.topBarBackground} border-b ${colors.topBarBorder} shadow-lg`}>
      <div className="px-6 py-3 flex flex-wrap items-center gap-4 md:gap-6">
        <div className="flex items-center gap-4 shrink-0">
          <img
            src="/brand/taskr-power-banner-outline.png"
            alt="taskR powered by dydact"
            className="h-12 w-auto select-none pointer-events-none drop-shadow-sm"
          />
        </div>

        <div className="order-3 w-full md:order-2 md:flex-1">
          <div className="flex flex-wrap items-center justify-center gap-3 md:flex-nowrap">
            <div className="relative w-full md:w-72">
              <Search
                className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
                  isDark ? "text-white/50" : "text-slate-400"
                }`}
              />
              <Input
                placeholder="Search tasks..."
                className={`w-full pl-10 ${
                  isDark
                    ? "bg-white/10 border-white/20 text-white placeholder:text-white/50"
                    : "bg-white/60 border-slate-200/60 text-slate-900 placeholder:text-slate-400"
                } rounded-xl`}
              />
            </div>

            <Button
              size="sm"
              className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl shadow-lg"
            >
              <Plus className="w-4 h-4 mr-1" />
              New
            </Button>

            {demoSeedEnabled && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                onClick={handleSeedDemo}
                disabled={seedLoading}
              >
                <Sparkles className="w-4 h-4 mr-1" />
                {seedLoading ? "Seeding..." : "Seed Demo"}
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto order-2 md:order-3 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={onCycleDensity}
            className={`${colors.textSecondary} ${
              isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
            } rounded-xl`}
          >
            Density: {densityLabel}
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={toggleTheme}
            className={`${colors.textSecondary} ${
              isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
            } rounded-xl`}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className={`${colors.textSecondary} ${
              isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"
            } rounded-xl`}
          >
            <Zap className="w-5 h-5" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={onDockToggle}
            onMouseEnter={onDockHoverStart}
            onMouseLeave={onDockHoverEnd}
            onFocus={onDockHoverStart}
            onBlur={onDockHoverEnd}
            aria-haspopup="dialog"
            aria-expanded={dockOpen}
            aria-label="Open Dydact workspace dock"
            className={[
              colors.textSecondary,
              isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60",
              "rounded-xl relative transition-all",
              dockOpen ? "ring-2 ring-violet-400/60 ring-offset-2 ring-offset-transparent" : ""
            ].join(" ")}
          >
            <img
              src={env.chatIconUrl}
              alt=""
              aria-hidden="true"
              className="w-6 h-6 rounded-md shadow-sm"
              draggable={false}
            />
          </Button>

          <div className="relative group">
            <Button
              size="icon"
              onClick={onToggleRightPanel}
              className="bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 text-white rounded-xl shadow-lg relative overflow-hidden"
            >
              <Sparkles className="w-5 h-5 relative z-10" />
              <div className="absolute inset-0 bg-gradient-to-r from-violet-400 to-blue-400 animate-pulse opacity-50" />
            </Button>
            <div className="absolute -bottom-8 right-0 text-[10px] text-violet-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
              AI Beacon
            </div>
          </div>

          <Avatar
            className={`w-9 h-9 border-2 ${
              isDark ? "border-white/20 hover:border-white/40" : "border-slate-200 hover:border-slate-300"
            } cursor-pointer transition-all`}
          >
            <AvatarImage src="" />
            <AvatarFallback className="bg-gradient-to-br from-orange-400 to-pink-500 text-white">
              JD
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
