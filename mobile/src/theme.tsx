import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface Palette {
  primary: string;
  primaryDark: string;
  primarySoft: string;
  onPrimary: string;
  bg: string;
  bgAlt: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
  success: string;
  danger: string;
  shadow: string;
  overlay: string;
}

const light: Palette = {
  primary: '#E8722C',
  primaryDark: '#C85A18',
  primarySoft: '#FDF1E7',
  onPrimary: '#FFFFFF',
  bg: '#FFFFFF',
  bgAlt: '#F6F7F9',
  card: '#FFFFFF',
  border: '#F0E2D6',
  text: '#1B2A4A',
  textMuted: '#6B7280',
  success: '#15803D',
  danger: '#DC2626',
  shadow: '#0B1B3A',
  overlay: 'rgba(15, 23, 42, 0.45)',
};

const dark: Palette = {
  primary: '#F08036',
  primaryDark: '#D2651F',
  primarySoft: '#33210F',
  onPrimary: '#FFFFFF',
  bg: '#0F1319',
  bgAlt: '#151A22',
  card: '#1A202A',
  border: '#2A323E',
  text: '#EEF1F5',
  textMuted: '#9AA3AF',
  success: '#4ADE80',
  danger: '#F87171',
  shadow: '#000000',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const spacing = (n: number) => n * 4;

interface ThemeValue {
  colors: Palette;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeValue>({ colors: light, isDark: false, toggleTheme: () => {} });

const STORAGE_KEY = 'app.theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v) setIsDark(v === 'dark');
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      AsyncStorage.setItem(STORAGE_KEY, prev ? 'light' : 'dark');
      return !prev;
    });
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({ colors: isDark ? dark : light, isDark, toggleTheme }),
    [isDark, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
