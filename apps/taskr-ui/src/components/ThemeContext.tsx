import { createContext, useContext, ReactNode, useMemo } from 'react';
import { useShell } from '../context/ShellContext';
import { useTelemetry } from '../lib/telemetry';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  colors: {
    background: string;
    cardBackground: string;
    cardBorder: string;
    text: string;
    textSecondary: string;
    hoverBackground: string;
    activeBackground: string;
    topBarBackground: string;
    topBarBorder: string;
    navBackground: string;
    navBorder: string;
  };
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const {
    preferences: { theme },
    setTheme
  } = useShell();
  const { track } = useTelemetry();

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    void track({
      name: 'preferences.theme_changed',
      properties: {
        theme: next
      }
    });
  };

  const colors = useMemo(
    () =>
      theme === 'dark'
        ? {
            background: 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
            cardBackground: 'bg-white/10 backdrop-blur-xl',
            cardBorder: 'border-white/20',
            text: 'text-white',
            textSecondary: 'text-white/70',
            hoverBackground: 'hover:bg-white/10',
            activeBackground: 'bg-white/10',
            topBarBackground: 'bg-gradient-to-r from-violet-600/30 via-purple-600/30 to-blue-600/30 backdrop-blur-xl',
            topBarBorder: 'border-white/10',
            navBackground: 'bg-white/5 backdrop-blur-xl',
            navBorder: 'border-white/10'
          }
        : {
            background: 'bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50',
            cardBackground: 'bg-white/60 backdrop-blur-xl',
            cardBorder: 'border-slate-200/60',
            text: 'text-slate-900',
            textSecondary: 'text-slate-600',
            hoverBackground: 'hover:bg-slate-100/60',
            activeBackground: 'bg-slate-100/60',
            topBarBackground: 'bg-white/60 backdrop-blur-xl',
            topBarBorder: 'border-slate-200/60',
            navBackground: 'bg-white/40 backdrop-blur-xl',
            navBorder: 'border-slate-200/60'
          },
    [theme]
  );

  return <ThemeContext.Provider value={{ theme, toggleTheme, colors }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
