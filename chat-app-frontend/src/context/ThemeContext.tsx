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
  // Bubbles (idénticas a la web / holy_app): en tema claro estilo WhatsApp →
  // burbuja propia verde clara, ajena blanca, texto oscuro.
  bubbleMine: '#d9fdd3',
  bubbleTheirs: '#FFFFFF',
  bubbleMineText: '#111b21',
  bubbleTheirsText: '#111b21',
  bubbleMineSubtext: '#667781',
  bubbleTheirsSubtext: '#667781',
  bubbleMineShadow: '#0b141a',
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
  // Bubbles (idénticas a la web / holy_app): en tema oscuro → burbuja propia
  // azul (blue-500), ajena morada (purple-500), texto blanco.
  bubbleMine: '#3b82f6',
  bubbleTheirs: '#a855f7',
  bubbleMineText: '#FFFFFF',
  bubbleTheirsText: '#FFFFFF',
  bubbleMineSubtext: 'rgba(255,255,255,0.70)',
  bubbleTheirsSubtext: 'rgba(255,255,255,0.70)',
  bubbleMineShadow: '#0b141a',
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
