import React, { createContext, useState, useContext, ReactNode } from 'react';

type ThemeMode = 'light' | 'dark';
type FontSize = 'small' | 'medium' | 'large';

interface ThemeContextType {
  mode: ThemeMode;
  fontSize: FontSize;
  toggleTheme: () => void;
  setFontSize: (size: FontSize) => void;
  colors: any;
  typography: any;
}

const lightColors = {
  primary: '#2f95dc',
  background: '#f4f6f8',
  card: '#ffffff',
  text: '#1e293b',
  textSecondary: '#64748b',
  border: '#e2e8f0',
  success: '#10b981',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  error: '#ef4444',
  errorLight: '#fee2e2',
  neutral: '#94a3b8',
  neutralLight: '#f1f5f9',
};

const darkColors = {
  primary: '#38bdf8',
  background: '#0f172a',
  card: '#1e293b',
  text: '#f8fafc',
  textSecondary: '#94a3b8',
  border: '#334155',
  success: '#34d399',
  successLight: '#064e3b',
  warning: '#fbbf24',
  warningLight: '#78350f',
  error: '#f87171',
  errorLight: '#7f1d1d',
  neutral: '#64748b',
  neutralLight: '#0f172a',
};

const getFontScale = (size: FontSize) => {
  if (size === 'small') return 0.85;
  if (size === 'large') return 1.15;
  return 1;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<ThemeMode>('light');
  const [fontSize, setFontSize] = useState<FontSize>('medium');

  const toggleTheme = () => setMode(prev => (prev === 'light' ? 'dark' : 'light'));
  const currentColors = mode === 'light' ? lightColors : darkColors;
  const scale = getFontScale(fontSize);

  const currentTypography = {
    h1: { fontSize: 28 * scale, fontWeight: '800' as const, color: currentColors.text },
    h2: { fontSize: 20 * scale, fontWeight: '700' as const, color: currentColors.text },
    body: { fontSize: 16 * scale, color: currentColors.text },
    bodySecondary: { fontSize: 14 * scale, color: currentColors.textSecondary },
    caption: { fontSize: 12 * scale, color: currentColors.textSecondary },
  };

  return (
    <ThemeContext.Provider value={{ mode, fontSize, toggleTheme, setFontSize, colors: currentColors, typography: currentTypography }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
