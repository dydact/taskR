import { useState } from 'react';
import { 
  Home, 
  Inbox, 
  Target, 
  ChevronDown, 
  ChevronRight, 
  MoreHorizontal,
  Megaphone,
  Code,
  DollarSign,
  Users,
  Circle
} from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useTheme } from './ThemeContext';

const spaces = [
  { 
    id: 1, 
    name: 'Marketing', 
    icon: Megaphone, 
    color: 'from-pink-500 to-orange-400',
    count: 12,
    hasAI: true,
    sublists: ['Campaign Planning', 'Social Media', 'Content Calendar']
  },
  { 
    id: 2, 
    name: 'Engineering', 
    icon: Code, 
    color: 'from-blue-500 to-cyan-400',
    count: 24,
    hasAI: true,
    sublists: ['Frontend', 'Backend', 'DevOps', 'QA']
  },
  { 
    id: 3, 
    name: 'Finance', 
    icon: DollarSign, 
    color: 'from-green-500 to-emerald-400',
    count: 8,
    hasAI: false,
    sublists: ['Budget Review', 'Invoicing']
  },
  { 
    id: 4, 
    name: 'HR', 
    icon: Users, 
    color: 'from-purple-500 to-violet-400',
    count: 5,
    hasAI: true,
    sublists: ['Recruiting', 'Onboarding']
  },
];

export function LeftNav() {
  const [expandedSpaces, setExpandedSpaces] = useState<number[]>([1, 2]);
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';

  const toggleSpace = (id: number) => {
    setExpandedSpaces(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <aside className={`w-[270px] ${colors.navBackground} border-r ${colors.navBorder} flex flex-col`}>
      <ScrollArea className="flex-1 px-3 py-4">
        {/* Top Section */}
        <div className="space-y-1 mb-6">
          <NavItem icon={Home} label="Home" active />
          <NavItem icon={Inbox} label="Inbox" badge="5" />
          <NavItem icon={Target} label="Goals" />
        </div>

        {/* Spaces Section */}
        <div>
          <div className="px-3 mb-2">
            <h3 className={`${colors.textSecondary} text-[11px] uppercase tracking-wider opacity-70`}>Spaces</h3>
          </div>

          <div className="space-y-1">
            {spaces.map((space) => {
              const isExpanded = expandedSpaces.includes(space.id);
              const Icon = space.icon;
              
              return (
                <div key={space.id} className="relative group">
                  {/* Main Space Item - Annotated on first item */}
                  <div 
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl ${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} transition-all duration-180 cursor-pointer`}
                    onClick={() => toggleSpace(space.id)}
                  >
                    <button className="w-4 h-4 flex items-center justify-center">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    
                    <div className={`w-6 h-6 bg-gradient-to-br ${space.color} rounded-lg flex items-center justify-center`}>
                      <Icon className="w-3.5 h-3.5 text-white" />
                    </div>
                    
                    <span className="flex-1">{space.name}</span>
                    
                    <Badge 
                      variant="secondary" 
                      className={`${isDark ? 'bg-white/10 text-white/70' : 'bg-slate-200/60 text-slate-600'} border-0 text-[11px] px-1.5`}
                    >
                      {space.count}
                    </Badge>
                    
                    {/* AI Indicator */}
                    {space.hasAI && (
                      <div className="w-1.5 h-1.5 bg-gradient-to-r from-violet-400 to-blue-400 rounded-full animate-pulse" />
                    )}

                    {/* Hover Quick Menu */}
                    <Button
                      size="icon"
                      variant="ghost"
                      className={`w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? 'text-white/50 hover:text-white hover:bg-white/20' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-200/60'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Annotation for first space */}
                  {space.id === 1 && (
                    <div className="absolute -right-2 top-1/2 -translate-y-1/2 translate-x-full ml-2 text-[9px] text-violet-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      Nested space with hover menu
                    </div>
                  )}

                  {/* Sublists */}
                  {isExpanded && (
                    <div className="ml-10 mt-1 space-y-0.5">
                      {space.sublists.map((sublist) => (
                        <div
                          key={sublist}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/5' : 'hover:text-slate-900 hover:bg-slate-100/40'} transition-all duration-180 cursor-pointer opacity-80`}
                        >
                          <Circle className="w-2 h-2 fill-current" />
                          <span className="text-[13px]">{sublist}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
  badge 
}: { 
  icon: any; 
  label: string; 
  active?: boolean; 
  badge?: string;
}) {
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';
  
  return (
    <div 
      className={`
        flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-180 cursor-pointer
        ${active 
          ? `${colors.activeBackground} ${colors.text} shadow-md` 
          : `${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'}`
        }
      `}
    >
      <Icon className="w-5 h-5" />
      <span className="flex-1">{label}</span>
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
