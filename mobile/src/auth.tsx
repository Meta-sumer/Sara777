import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { type AppSettings, TOKEN_KEY, type User, api } from './api';

interface AuthValue {
  user: User | null;
  settings: AppSettings | null;
  booting: boolean;
  login: (mobile: string, password: string) => Promise<void>;
  register: (name: string, mobile: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (u: User) => void;
}

const AuthContext = createContext<AuthValue>({} as AuthValue);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [booting, setBooting] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      setSettings(await api.get<AppSettings>('/settings'));
    } catch {
      // offline — the screens fall back to sensible defaults
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadSettings();
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token) {
        try {
          const { user } = await api.get<{ user: User }>('/auth/me');
          setUser(user);
        } catch {
          await AsyncStorage.removeItem(TOKEN_KEY);
        }
      }
      setBooting(false);
    })();
  }, [loadSettings]);

  const login = useCallback(async (mobile: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>('/auth/login', { mobile, password });
    await AsyncStorage.setItem(TOKEN_KEY, res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (name: string, mobile: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>('/auth/register', { name, mobile, password });
    await AsyncStorage.setItem(TOKEN_KEY, res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { user } = await api.get<{ user: User }>('/auth/me');
      setUser(user);
    } catch {
      // keep the cached user; the next screen action will surface the error
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, settings, booting, login, register, logout, refreshUser, setUser }),
    [user, settings, booting, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
