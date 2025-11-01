import { useState, useEffect } from 'react';
import { X, Clock, CheckCircle, AlertCircle, User, Zap } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { useTheme } from './ThemeContext';
import { Avatar, AvatarFallback } from './ui/avatar';
import dydactLogo from 'figma:asset/d8653aa4a6b3b745bda3371d1f0f71f3602055f4.png';

type NotificationStatus = 'idle' | 'unread' | 'processing';

interface Notification {
  id: number;
  type: 'assignment' | 'update' | 'completion' | 'mention' | 'automation';
  sender: string;
  senderInitials: string;
  senderColor: string;
  summary: string;
  time: string;
  isRead: boolean;
  isOngoing?: boolean;
}

const mockNotifications: Notification[] = [
  {
    id: 1,
    type: 'assignment',
    sender: 'Sarah K.',
    senderInitials: 'SK',
    senderColor: 'from-pink-500 to-orange-400',
    summary: 'Assigned you to "Update landing page design"',
    time: '2m ago',
    isRead: false,
  },
  {
    id: 2,
    type: 'automation',
    sender: 'AI Assistant',
    senderInitials: 'AI',
    senderColor: 'from-violet-500 to-blue-500',
    summary: 'Auto-assigned task based on your expertise',
    time: '5m ago',
    isRead: false,
    isOngoing: true,
  },
  {
    id: 3,
    type: 'update',
    sender: 'John D.',
    senderInitials: 'JD',
    senderColor: 'from-green-500 to-emerald-400',
    summary: 'Moved "API Integration" to Review',
    time: '12m ago',
    isRead: true,
  },
  {
    id: 4,
    type: 'mention',
    sender: 'Mike J.',
    senderInitials: 'MJ',
    senderColor: 'from-blue-500 to-cyan-400',
    summary: 'Mentioned you in "Sprint Planning" comments',
    time: '1h ago',
    isRead: false,
  },
  {
    id: 5,
    type: 'completion',
    sender: 'Emily C.',
    senderInitials: 'EC',
    senderColor: 'from-orange-500 to-red-400',
    summary: 'Completed "Design system components"',
    time: '2h ago',
    isRead: true,
  },
  {
    id: 6,
    type: 'update',
    sender: 'Anna T.',
    senderInitials: 'AT',
    senderColor: 'from-purple-500 to-violet-400',
    summary: 'Updated deadline for "Marketing Campaign"',
    time: '3h ago',
    isRead: true,
  },
];

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const hasOngoing = notifications.some(n => n.isOngoing);

  // Determine status
  const getStatus = (): NotificationStatus => {
    if (hasOngoing) return 'processing';
    if (unreadCount > 0) return 'unread';
    return 'idle';
  };

  const status = getStatus();

  const markAsRead = (id: number) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const deleteNotification = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'assignment':
        return User;
      case 'automation':
        return Zap;
      case 'completion':
        return CheckCircle;
      case 'mention':
        return AlertCircle;
      case 'update':
        return Clock;
      default:
        return Clock;
    }
  };

  return (
    <>
      {/* Notification Button - Fixed Bottom Right */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          fixed bottom-6 right-6 z-50
          w-14 h-14 rounded-full 
          bg-white shadow-2xl
          flex items-center justify-center
          transition-all duration-200
          hover:scale-110 hover:shadow-xl
          ${isOpen ? 'scale-110' : ''}
        `}
      >
        {/* Status Ring */}
        <div
          className={`
            absolute inset-0 rounded-full
            ${status === 'unread' ? 'ring-4 ring-red-500 animate-pulse' : ''}
            ${status === 'processing' ? 'ring-4 ring-green-500' : ''}
          `}
        />

        {/* Inner content */}
        <div className="relative flex items-center justify-center">
          {/* R logo - styled based on status */}
          <span
            className={`
              font-bold text-xl
              ${status === 'idle' ? 'text-black' : ''}
              ${status === 'unread' ? 'text-red-500' : ''}
              ${status === 'processing' ? 'text-green-500' : ''}
            `}
          >
            R{status === 'unread' ? '!' : ''}
          </span>

          {/* Unread Badge */}
          {unreadCount > 0 && status !== 'processing' && (
            <Badge className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center bg-red-500 text-white border-0 text-[10px] rounded-full">
              {unreadCount}
            </Badge>
          )}

          {/* Processing indicator */}
          {status === 'processing' && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
          )}
        </div>
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <div
          className={`
            fixed bottom-24 right-6 z-50
            w-96 max-h-[600px]
            ${colors.cardBackground}
            border ${colors.cardBorder}
            rounded-2xl shadow-2xl
            animate-in slide-in-from-bottom-4 duration-300
          `}
        >
          {/* Header */}
          <div className={`px-4 py-3 border-b ${colors.cardBorder} flex items-center justify-between`}>
            <div className="flex items-center gap-2">
              <h3 className={colors.text}>Notifications</h3>
              {unreadCount > 0 && (
                <Badge className={`${isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-700'} border-0 text-[11px]`}>
                  {unreadCount} new
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={markAllAsRead}
                  className={`${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-lg text-[11px] h-7 px-2`}
                >
                  Mark all read
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                className={`${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-lg w-7 h-7`}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Notifications List */}
          <ScrollArea className="max-h-[500px]">
            <div className="p-2">
              {notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <p className={`${colors.textSecondary} text-[13px]`}>No notifications</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {notifications.map(notification => {
                    const Icon = getNotificationIcon(notification.type);
                    return (
                      <div
                        key={notification.id}
                        onClick={() => !notification.isRead && markAsRead(notification.id)}
                        className={`
                          group relative p-3 rounded-xl cursor-pointer
                          transition-all duration-180
                          ${!notification.isRead
                            ? isDark
                              ? 'bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20'
                              : 'bg-violet-50 hover:bg-violet-100 border border-violet-200/60'
                            : isDark
                              ? 'bg-white/5 hover:bg-white/10'
                              : 'bg-white/40 hover:bg-white/60'
                          }
                        `}
                      >
                        {/* Unread indicator dot */}
                        {!notification.isRead && (
                          <div className="absolute top-3 left-1 w-2 h-2 bg-violet-500 rounded-full" />
                        )}

                        <div className="flex items-start gap-3">
                          {/* Avatar */}
                          <Avatar className={`w-9 h-9 border-2 ${isDark ? 'border-white/20' : 'border-white'} flex-shrink-0`}>
                            <AvatarFallback className={`bg-gradient-to-br ${notification.senderColor} text-white text-[11px]`}>
                              {notification.senderInitials}
                            </AvatarFallback>
                          </Avatar>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className={`${colors.text} text-[13px]`}>
                                {notification.sender}
                              </span>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {notification.isOngoing && (
                                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                )}
                                <Icon className={`w-3.5 h-3.5 ${colors.textSecondary}`} />
                              </div>
                            </div>
                            <p className={`${colors.textSecondary} text-[12px] line-clamp-2 leading-snug`}>
                              {notification.summary}
                            </p>
                            <div className="flex items-center justify-between mt-2">
                              <span className={`${colors.textSecondary} text-[11px] opacity-70`}>
                                {notification.time}
                              </span>
                              {notification.isOngoing && (
                                <Badge className="bg-green-500/20 text-green-400 border-0 text-[9px] px-1.5 h-4">
                                  Ongoing
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Delete button (visible on hover) */}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notification.id);
                            }}
                            className={`
                              w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0
                              ${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'}
                              rounded-lg
                            `}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className={`px-4 py-3 border-t ${colors.cardBorder}`}>
              <Button
                variant="ghost"
                size="sm"
                className={`w-full ${colors.textSecondary} ${isDark ? 'hover:text-white hover:bg-white/10' : 'hover:text-slate-900 hover:bg-slate-100/60'} rounded-xl text-[12px]`}
              >
                View All Notifications
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Backdrop (click to close) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
