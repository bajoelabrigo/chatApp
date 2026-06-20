import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgModal: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentDark: string;
  accentText: string;
  border: string;
  borderLight: string;
  bubbleMine: string;
  bubbleTheirs: string;
  bubbleMineText: string;
  bubbleTheirsText: string;
  bubbleMineSubtext: string;
  bubbleTheirsSubtext: string;
  bubbleMineShadow: string;
  inputBg: string;
  inputText: string;
  inputPlaceholder: string;
  tabBar: string;
  tabBorder: string;
  headerBg: string;
  avatarBg: string;
  danger: string;
  onlineDot: string;
  statusRead: string;
  actionSheetBg: string;
  callBg: string;
}

const LIGHT: ThemeColors = {
  bgPrimary: '#F4F7FF',
  bgSecondary: '#FFFFFF',
  bgTertiary: '#EEF2FF',
  bgModal: '#FFFFFF',
  textPrimary: '#1E293B',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  accent: '#3B82F6',
  accentDark: '#2563EB',
  accentText: '#FFFFFF',
  border: '#E2E8F0',
  borderLight: '#E4E7FF',
  // Bubbles: mine = indigo-blue rico, theirs = lavanda suave para distinción visual
  bubbleMine: '#4F6EF7',
  bubbleTheirs: '#EFF1FE',
  bubbleMineText: '#FFFFFF',
  bubbleTheirsText: '#1E293B',
  bubbleMineSubtext: 'rgba(255,255,255,0.68)',
  bubbleTheirsSubtext: '#64748B',
  bubbleMineShadow: '#4F6EF7',
  inputBg: '#F1F5F9',
  inputText: '#1E293B',
  inputPlaceholder: '#94A3B8',
  tabBar: '#FFFFFF',
  tabBorder: '#E2E8F0',
  headerBg: '#FFFFFF',
  avatarBg: '#E0E7FF',
  danger: '#EF4444',
  onlineDot: '#22C55E',
  statusRead: '#4F6EF7',
  actionSheetBg: '#FFFFFF',
  callBg: '#EEF2FF',
};

const DARK: ThemeColors = {
  bgPrimary: '#0A0A0A',
  bgSecondary: '#1A1A1A',
  bgTertiary: '#222222',
  bgModal: '#1A1A1A',
  textPrimary: '#F5F5F5',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',
  accent: '#6366F1',
  accentDark: '#4F46E5',
  accentText: '#FFFFFF',
  border: '#2A2A2A',
  borderLight: '#252B45',
  // Bubbles: mine = índigo profundo, theirs = azul marino oscuro — totalmente distintos
  bubbleMine: '#4338CA',
  bubbleTheirs: '#1E2236',
  bubbleMineText: '#EEF2FF',
  bubbleTheirsText: '#DDE4FF',
  bubbleMineSubtext: 'rgba(255,255,255,0.58)',
  bubbleTheirsSubtext: '#7B8CAD',
  bubbleMineShadow: '#4338CA',
  inputBg: '#2A2A2A',
  inputText: '#F5F5F5',
  inputPlaceholder: '#71717A',
  tabBar: '#0A0A0A',
  tabBorder: '#2A2A2A',
  headerBg: '#111111',
  avatarBg: '#2D2B52',
  danger: '#EF4444',
  onlineDot: '#22C55E',
  statusRead: '#818CF8',
  actionSheetBg: '#1A1A1A',
  callBg: '#0D0F1E',
};

interface ThemeContextType {
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  colors: DARK,
  toggleTheme: () => {},
});

const STORAGE_KEY = '@app_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [scheme, setScheme] = useState<ColorScheme>('dark');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark') setScheme(saved);
      else setScheme(system === 'light' ? 'light' : 'dark');
    });
  }, []);

  const toggleTheme = () => {
    const next: ColorScheme = scheme === 'dark' ? 'light' : 'dark';
    setScheme(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <ThemeContext.Provider value={{ isDark: scheme === 'dark', colors: scheme === 'dark' ? DARK : LIGHT, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
