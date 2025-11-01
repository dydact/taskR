import { Search, Plus, Zap, Bell, Sparkles, Sun, Moon } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { useTheme } from './ThemeContext';
import dydactLogo from 'figma:asset/d8653aa4a6b3b745bda3371d1f0f71f3602055f4.png';
import dydactBanner from 'figma:asset/3dbe68ab2b383f8b60cfb9f283f480a2234ef1f2.png';

interface TopBarProps {
  currentView: string;
  onViewChange: (view: 'list' | 'board' | 'calendar' | 'gantt' | 'dashboard') => void;
  onToggleRightPanel: () => void;
}

export function TopBar({ currentView, onViewChange, onToggleRightPanel }: TopBarProps) {
  const { theme, toggleTheme, colors } = useTheme();
  
  const views = [
    { id: 'list', label: 'List' },
    { id: 'board', label: 'Board' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'gantt', label: 'Gantt' },
    { id: 'dashboard', label: 'Dashboard' },
  ];

  const isDark = theme === 'dark';

  return (
    <header className={`${colors.topBarBackground} border-b ${colors.topBarBorder} shadow-lg`}>
      <div className="flex items-center justify-between px-6 py-3">
        {/* Logo & Brand */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {/* Dydact Logo Icon */}
            <img 
              src={dydactLogo} 
              alt="Dydact Logo" 
              className="w-10 h-10 object-contain"
            />
            <div>
              {/* taskR branding */}
              <h1 className={colors.text}>
                task<span className="text-red-500">R</span>
              </h1>
              {/* Powered by dydact banner */}
              <div className="flex items-center gap-1 -mt-1">
                <span className={`text-[9px] ${colors.textSecondary}`}>powered by</span>
                <img 
                  src={dydactBanner} 
                  alt="dydact" 
                  className="h-2.5 object-contain"
                />
              </div>
            </div>
          </div>

          {/* View Toggle - Segmented Control */}
          <div className={`flex items-center gap-1 ${isDark ? 'bg-black/20' : 'bg-slate-200/50'} backdrop-blur-sm rounded-xl p-1 ml-6`}>
            {views.map((view) => (
              <button
                key={view.id}
                onClick={() => onViewChange(view.id as any)}
                className={`
                  px-4 py-1.5 rounded-lg transition-all duration-200
                  ${currentView === view.id 
                    ? `${isDark ? 'bg-white/20 text-white' : 'bg-white/80 text-slate-900'} shadow-md` 
                    : `${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-white/40'}`
                  }
                `}
              >
                {view.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-white/50' : 'text-slate-400'}`} />
            <Input 
              placeholder="Search tasks..." 
              className={`w-64 pl-10 ${isDark ? 'bg-white/10 border-white/20 text-white placeholder:text-white/50' : 'bg-white/60 border-slate-200/60 text-slate-900 placeholder:text-slate-400'} rounded-xl`}
            />
          </div>

          {/* Quick Create */}
          <Button 
            size="sm"
            className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl shadow-lg"
          >
            <Plus className="w-4 h-4 mr-1" />
            New
          </Button>

          {/* Theme Toggle */}
          <Button 
            size="icon"
            variant="ghost"
            onClick={toggleTheme}
            className={`${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-xl`}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>

          {/* Automation Trigger */}
          <Button 
            size="icon"
            variant="ghost"
            className={`${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-xl`}
          >
            <Zap className="w-5 h-5" />
          </Button>

          {/* Notifications */}
          <Button 
            size="icon"
            variant="ghost"
            className={`${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-xl relative`}
          >
            <Bell className="w-5 h-5" />
            <Badge className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center bg-gradient-to-r from-pink-500 to-orange-400 text-white border-0 text-[10px]">
              3
            </Badge>
          </Button>

          {/* AI Beacon - Annotated */}
          <div className="relative group">
            <Button 
              size="icon"
              onClick={onToggleRightPanel}
              className="bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 text-white rounded-xl shadow-lg relative overflow-hidden"
            >
              <Sparkles className="w-5 h-5 relative z-10" />
              {/* Pulsing glow effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-violet-400 to-blue-400 animate-pulse opacity-50" />
            </Button>
            {/* Annotation */}
            <div className="absolute -bottom-8 right-0 text-[10px] text-violet-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
              AI Beacon
            </div>
          </div>

          {/* Profile */}
          <Avatar className={`w-9 h-9 border-2 ${isDark ? 'border-white/20 hover:border-white/40' : 'border-slate-200 hover:border-slate-300'} cursor-pointer transition-all`}>
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
