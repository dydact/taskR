import { useEffect, useMemo, useState, type MouseEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Circle,
  Star,
  LayoutDashboard,
  List,
  KanbanSquare,
  Calendar,
  BarChart3,
  FileText,
  Users,
  ScrollText,
  Satellite
} from "lucide-react";
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useTheme } from './ThemeContext';
import type { ShellSpace } from '../context/ShellContext';
import type { NavigationFolder, NavigationList, NavigationSpace } from '../types/navigation';
import type { ViewMode } from "../types/shell";


type LeftNavProps = {
  spaces: ShellSpace[];
  activeSpaceId: string | null;
  navigation: NavigationSpace | null;
  navigationLoading: boolean;
  navigationError: string | null;
  selectedListId: string | null;
  onSelectSpace: (spaceId: string) => void;
  onSelectList: (spaceId: string, listId: string) => void;
  onToggleFavorite: (spaceId: string) => void;
  viewMode: ViewMode;
  viewOptions: ViewMode[];
  onViewModeChange: (mode: ViewMode) => void;
};

export function LeftNav({
  spaces,
  activeSpaceId,
  navigation,
  navigationLoading,
  navigationError,
  selectedListId,
  onSelectSpace,
  onSelectList,
  onToggleFavorite,
  viewMode,
  viewOptions,
  onViewModeChange
}: LeftNavProps) {
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set(activeSpaceId ? [activeSpaceId] : []));
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (activeSpaceId) {
      setExpandedSpaces((prev) => {
        const next = new Set(prev);
        next.add(activeSpaceId);
        return next;
      });
    }
  }, [activeSpaceId]);

  const toggleSpace = (spaceId: string) => {
    setExpandedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) {
        next.delete(spaceId);
      } else {
        next.add(spaceId);
      }
      return next;
    });
  };

  const navigationBySpaceId = useMemo(() => {
    if (!navigation) return null;
    return navigation;
  }, [navigation]);

  const viewOrder: ViewMode[] = ["dashboard", "list", "board", "calendar", "gantt", "claims", "hr", "dedicated"];
  const orderedViewModes = viewOrder.filter((mode) => viewOptions.includes(mode));

  const groupedSpaces = useMemo(() => {
    const order: string[] = [];
    const groups = new Map<string, ShellSpace[]>();
    spaces.forEach((space) => {
      const rawCategory = space.category ? space.category.trim() : "";
      const key = rawCategory.length > 0 ? rawCategory : "__uncategorized__";
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push(space);
    });
    return order.map((key) => ({
      category: key === "__uncategorized__" ? null : key,
      items: groups.get(key) ?? []
    }));
  }, [spaces]);

  return (
    <aside className={`w-[270px] ${colors.navBackground} border-r ${colors.navBorder} flex flex-col`}>
      <ScrollArea className="flex-1 px-3 py-4">
        {/* Top Section */}
        <div className="space-y-1 mb-6">
          {orderedViewModes.map((mode) => (
            <NavItem
              key={mode}
              icon={VIEW_ICONS[mode] ?? LayoutDashboard}
              label={VIEW_LABELS[mode] ?? mode}
              active={viewMode === mode}
              onClick={() => onViewModeChange(mode)}
            />
          ))}
        </div>

        {/* Spaces Section */}
        <div>
          <div className="px-3 mb-2">
            <h3 className={`${colors.textSecondary} text-[11px] uppercase tracking-wider opacity-70`}>Spaces</h3>
          </div>

          <div className="space-y-4">
            {groupedSpaces.map(({ category, items }) => (
              <div key={category ?? "uncategorized"} className="space-y-1">
                {category && (
                  <div className="px-3 mt-2">
                    <h4 className={`${colors.textSecondary} text-[11px] uppercase tracking-wider opacity-60`}>{category}</h4>
                  </div>
                )}
                {items.map((space) => {
            const isExpanded = expandedSpaces.has(space.spaceId);
            const isActiveSpace = activeSpaceId === space.spaceId;
            const nav = navigationBySpaceId && navigationBySpaceId.space_id === space.spaceId ? navigationBySpaceId : null;
            const badgeCount = typeof (space as any).counts?.tasks === 'number' ? (space as any).counts.tasks : undefined;
            const initials = space.name ? space.name.slice(0, 2).toUpperCase() : '•';

            return (
              <div key={space.id} className="relative group">
                {/* Main Space Item - Annotated on first item */}
                <div 
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isActiveSpace ? colors.text : colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} transition-all duration-180 cursor-pointer`}
                  onClick={() => {
                    onSelectSpace(space.spaceId);
                    toggleSpace(space.spaceId);
                  }}
                >
                  <button className="w-4 h-4 flex items-center justify-center">
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    
                    <div className={`w-6 h-6 bg-gradient-to-br ${space.color ?? 'from-blue-500 to-indigo-500'} rounded-lg flex items-center justify-center text-white text-xs font-semibold`}>
                      {initials}
                    </div>

                    <span className="flex-1 truncate" title={space.name}>
                      {space.name}
                    </span>

                    {typeof badgeCount === 'number' && (
                      <Badge 
                        variant="secondary" 
                        className={`${isDark ? 'bg-white/10 text-white/70' : 'bg-slate-200/60 text-slate-600'} border-0 text-[11px] px-1.5`}
                      >
                        {badgeCount}
                      </Badge>
                    )}
                    
                    <button
                      type="button"
                      onClick={(event: MouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation();
                        onToggleFavorite(space.spaceId);
                      }}
                      className={`w-6 h-6 flex items-center justify-center rounded-lg transition-colors ${
                        isDark ? 'text-white/40 hover:text-yellow-300 hover:bg-white/10' : 'text-slate-400 hover:text-yellow-500 hover:bg-slate-100/60'
                      }`}
                      aria-label="Toggle favorite"
                    >
                      <Star className={`w-3.5 h-3.5 ${space.favorite ? 'fill-current' : ''}`} />
                    </button>

                    {/* Hover Quick Menu */}
                    <Button
                      size="icon"
                      variant="ghost"
                      className={`w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? 'text-white/50 hover:text-white hover:bg-white/20' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-200/60'}`}
                      onClick={(event: MouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation();
                      }}
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Sublists */}
                  {isExpanded && (
                    <div className="ml-10 mt-1 space-y-0.5">
                      {renderNavigation({
                        navigation: nav,
                        textColor: colors.textSecondary,
                        isDark,
                        activeSpaceId: space.spaceId,
                        selectedListId,
                        onSelectList
                      })}
                      {isActiveSpace && navigationLoading && (
                        <div className={`text-xs ${colors.textSecondary} opacity-60 italic`}>Loading navigation…</div>
                      )}
                      {isActiveSpace && navigationError && (
                        <div className="text-xs text-red-400/80">{navigationError}</div>
                      )}
                    </div>
                  )}
                </div>
              );
                })}
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}

function NavItem({
  icon: Icon,
  label,
  active = false,
  badge,
  preview = false,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  badge?: string;
  preview?: boolean;
  onClick?: () => void;
}) {
  const { theme, colors } = useTheme();
  const isDark = theme === "dark";
  
  return (
    <div 
      className={`
        flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-180 cursor-pointer
        ${
          preview
            ? `${colors.textSecondary} opacity-60 ${isDark ? "hover:bg-white/5" : "hover:bg-slate-100/50"}`
            : active
            ? `${colors.activeBackground} ${colors.text} shadow-md`
            : `${colors.textSecondary} ${isDark ? "hover:text-white hover:bg-white/10" : "hover:text-slate-900 hover:bg-slate-100/60"}`
        }
      `}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <Icon className="w-5 h-5" />
      <span className="flex-1">
        {label}
        {preview && <span className="ml-2 text-[10px] uppercase tracking-wide opacity-70">Soon</span>}
      </span>
      {badge && (
        <Badge 
          variant="secondary" 
          className="bg-gradient-to-r from-violet-500 to-blue-500 text-white border-0 text-[11px] px-1.5"
        >
          {badge}
        </Badge>
      )}
    </div>
  );
}

const renderNavigation = ({
  navigation,
  textColor,
  isDark,
  activeSpaceId,
  selectedListId,
  onSelectList
}: {
  navigation: NavigationSpace | null;
  textColor: string;
  isDark: boolean;
  activeSpaceId: string;
  selectedListId: string | null;
  onSelectList: (spaceId: string, listId: string) => void;
}) => {
  if (!navigation) {
    return null;
  }
  const items: JSX.Element[] = [];

  navigation.root_lists.forEach((list) => {
    items.push(
      <NavListItem
        key={list.list_id}
        list={list}
        textColor={textColor}
        isDark={isDark}
        isSelected={selectedListId === list.list_id}
        onSelect={() => onSelectList(activeSpaceId, list.list_id)}
      />
    );
  });

  navigation.folders.forEach((folder) => {
    items.push(
      <div key={folder.folder_id} className="mt-2">
        <div className={`text-[11px] uppercase tracking-wide mb-1 ${textColor}`}>{folder.name}</div>
        {folder.lists.map((list) => (
          <NavListItem
            key={list.list_id}
            list={list}
            textColor={textColor}
            isDark={isDark}
            indent
            isSelected={selectedListId === list.list_id}
            onSelect={() => onSelectList(activeSpaceId, list.list_id)}
          />
        ))}
      </div>
    );
  });

  return items;
};

const NavListItem: React.FC<{
  list: NavigationList;
  textColor: string;
  isDark: boolean;
  indent?: boolean;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ list, textColor, isDark, indent = false, isSelected, onSelect }) => {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${textColor} ${isDark ? 'hover:text-white hover:bg-white/5' : 'hover:text-slate-900 hover:bg-slate-100/40'} transition-all duration-180 cursor-pointer ${indent ? 'ml-3' : ''} ${isSelected ? (isDark ? 'bg-white/10 text-white' : 'bg-white/80 text-slate-900') : 'opacity-80'}`}
      title={list.name}
      onClick={onSelect}
    >
      <Circle className="w-2 h-2 fill-current" />
      <span className="text-[13px] truncate">{list.name}</span>
    </div>
  );
};

const VIEW_LABELS: Record<ViewMode, string> = {
  dashboard: "Dashboard",
  inbox: "Inbox",
  goals: "Goals",
  list: "List",
  board: "Board",
  calendar: "Calendar",
  gantt: "Gantt",
  claims: "Claims & Services",
  hr: "HR",
  docs: "Service Catalogue",
  dedicated: "Dedicated Agents",
  xoxo: "xOxO"
};

const VIEW_ICONS: Partial<Record<ViewMode, LucideIcon>> = {
  dashboard: LayoutDashboard,
  inbox: LayoutDashboard,
  goals: LayoutDashboard,
  list: List,
  board: KanbanSquare,
  calendar: Calendar,
  gantt: BarChart3,
  claims: FileText,
  hr: Users,
  docs: ScrollText,
  dedicated: Satellite,
  xoxo: Satellite
};
