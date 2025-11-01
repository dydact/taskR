import { useState } from 'react';
import { Sparkles, Zap, Bell, Check, X, TrendingUp, AlertTriangle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useTheme } from './ThemeContext';

export function RightPanel() {
  const [activeTab, setActiveTab] = useState('ai');
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';

  return (
    <aside className={`w-[320px] ${colors.navBackground} border-l ${colors.navBorder} flex flex-col`}>
      <div className={`p-4 border-b ${colors.navBorder}`}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`w-full ${isDark ? 'bg-black/20 border border-white/10' : 'bg-slate-200/50 border border-slate-200'}`}>
            <TabsTrigger value="notifications" className={`flex-1 ${isDark ? 'data-[state=active]:bg-white/20' : 'data-[state=active]:bg-white/80'}`}>
              <Bell className="w-4 h-4 mr-1" />
              Notifs
            </TabsTrigger>
            <TabsTrigger value="ai" className={`flex-1 ${isDark ? 'data-[state=active]:bg-white/20' : 'data-[state=active]:bg-white/80'}`}>
              <Sparkles className="w-4 h-4 mr-1" />
              AI
            </TabsTrigger>
            <TabsTrigger value="automations" className={`flex-1 ${isDark ? 'data-[state=active]:bg-white/20' : 'data-[state=active]:bg-white/80'}`}>
              <Zap className="w-4 h-4 mr-1" />
              Auto
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1 p-4">
        {activeTab === 'ai' && <AIInsights />}
        {activeTab === 'notifications' && <Notifications />}
        {activeTab === 'automations' && <Automations />}
      </ScrollArea>
    </aside>
  );
}

function AIInsights() {
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';
  
  return (
    <div className="space-y-3">
      <h3 className={`${colors.textSecondary} text-[13px] mb-4`}>AI Insights</h3>

      {/* Insight Card 1 - Annotated */}
      <div className="relative group">
        <div className={`${isDark ? 'bg-gradient-to-br from-white/10 to-white/5' : 'bg-white/80'} backdrop-blur-sm rounded-2xl p-4 border ${isDark ? 'border-white/10' : 'border-slate-200/60'} shadow-lg hover:shadow-xl transition-all duration-180`}>
          {/* Gradient accent stripe */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-blue-500 rounded-t-2xl" />
          
          <div className="flex items-start gap-3 mb-3">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <h4 className={`${colors.text} text-[13px] mb-1`}>Sprint Velocity Insight</h4>
              <p className={`${colors.textSecondary} text-[12px] leading-relaxed`}>
                Your team is trending 15% ahead of schedule. Consider pulling in 2-3 tasks from the backlog.
              </p>
            </div>
          </div>
          
          {/* Accept/Decline buttons */}
          <div className="flex gap-2">
            <Button 
              size="sm" 
              className="flex-1 bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 text-white rounded-xl h-8"
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              Accept
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              className={`flex-1 ${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-xl h-8`}
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Decline
            </Button>
          </div>
        </div>

        {/* Annotation */}
        <div className="absolute -left-2 top-1/2 -translate-y-1/2 -translate-x-full mr-2 text-[9px] text-violet-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Insight rail cards with accept/decline
        </div>
      </div>

      {/* Insight Card 2 */}
      <div className={`${isDark ? 'bg-gradient-to-br from-white/10 to-white/5' : 'bg-white/80'} backdrop-blur-sm rounded-2xl p-4 border ${isDark ? 'border-white/10' : 'border-slate-200/60'} shadow-lg hover:shadow-xl transition-all duration-180`}>
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 to-orange-400 rounded-t-2xl" />
        
        <div className="flex items-start gap-3 mb-3">
          <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-orange-400 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <h4 className={`${colors.text} text-[13px] mb-1`}>Blocker Detected</h4>
            <p className={`${colors.textSecondary} text-[12px] leading-relaxed`}>
              3 tasks in "Review" have been waiting for approval for over 48 hours.
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            size="sm" 
            className="flex-1 bg-gradient-to-r from-pink-500 to-orange-400 hover:from-pink-600 hover:to-orange-500 text-white rounded-xl h-8"
          >
            <Check className="w-3.5 h-3.5 mr-1" />
            Notify Team
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className={`flex-1 ${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-xl h-8`}
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Dismiss
          </Button>
        </div>
      </div>

      {/* Insight Card 3 */}
      <div className={`${isDark ? 'bg-gradient-to-br from-white/10 to-white/5' : 'bg-white/80'} backdrop-blur-sm rounded-2xl p-4 border ${isDark ? 'border-white/10' : 'border-slate-200/60'} shadow-lg hover:shadow-xl transition-all duration-180`}>
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-500 to-emerald-400 rounded-t-2xl" />
        
        <div className="flex items-start gap-3 mb-3">
          <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-400 rounded-xl flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <h4 className={`${colors.text} text-[13px] mb-1`}>Smart Task Grouping</h4>
            <p className={`${colors.textSecondary} text-[12px] leading-relaxed`}>
              I found 5 similar tasks that could be batched together for efficiency.
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            size="sm" 
            className="flex-1 bg-gradient-to-r from-green-500 to-emerald-400 hover:from-green-600 hover:to-emerald-500 text-white rounded-xl h-8"
          >
            <Check className="w-3.5 h-3.5 mr-1" />
            Group Tasks
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className={`flex-1 ${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-xl h-8`}
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
}

function Notifications() {
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';
  
  return (
    <div className="space-y-3">
      <h3 className={`${colors.textSecondary} text-[13px] mb-4`}>Recent Notifications</h3>
      
      <div className={`${isDark ? 'bg-white/5' : 'bg-white/60'} rounded-xl p-3 border ${isDark ? 'border-white/10' : 'border-slate-200/60'}`}>
        <p className={`${colors.text} text-[13px]`}>Sarah assigned you to "Update landing page"</p>
        <p className={`${colors.textSecondary} text-[11px] mt-1 opacity-70`}>2 minutes ago</p>
      </div>

      <div className={`${isDark ? 'bg-white/5' : 'bg-white/60'} rounded-xl p-3 border ${isDark ? 'border-white/10' : 'border-slate-200/60'}`}>
        <p className={`${colors.text} text-[13px]`}>New comment on "API Integration"</p>
        <p className={`${colors.textSecondary} text-[11px] mt-1 opacity-70`}>15 minutes ago</p>
      </div>

      <div className={`${isDark ? 'bg-white/5' : 'bg-white/60'} rounded-xl p-3 border ${isDark ? 'border-white/10' : 'border-slate-200/60'}`}>
        <p className={`${colors.text} text-[13px]`}>Sprint deadline is tomorrow</p>
        <p className={`${colors.textSecondary} text-[11px] mt-1 opacity-70`}>1 hour ago</p>
      </div>
    </div>
  );
}

function Automations() {
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';
  
  return (
    <div className="space-y-3">
      <h3 className={`${colors.textSecondary} text-[13px] mb-4`}>Active Automations</h3>
      
      <div className={`${isDark ? 'bg-white/5' : 'bg-white/60'} rounded-xl p-3 border ${isDark ? 'border-white/10' : 'border-slate-200/60'}`}>
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          <p className={`${colors.text} text-[13px]`}>Auto-assign on tag</p>
        </div>
        <p className={`${colors.textSecondary} text-[11px]`}>When a task is tagged "urgent", assign to team lead</p>
        <Badge className="bg-green-500/20 text-green-400 border-0 mt-2">Active</Badge>
      </div>

      <div className={`${isDark ? 'bg-white/5' : 'bg-white/60'} rounded-xl p-3 border ${isDark ? 'border-white/10' : 'border-slate-200/60'}`}>
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          <p className={`${colors.text} text-[13px]`}>Slack notification</p>
        </div>
        <p className={`${colors.textSecondary} text-[11px]`}>Notify #engineering when tasks move to "Review"</p>
        <Badge className="bg-green-500/20 text-green-400 border-0 mt-2">Active</Badge>
      </div>
    </div>
  );
}
