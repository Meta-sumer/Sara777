import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, login as apiLogin, setUnauthorizedHandler, TOKEN_KEY } from './api';

interface AuthValue {
  ready: boolean;
  authed: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue>({
  ready: false,
  authed: false,
  signIn: async () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthed(false);
  }, []);

  // a rejected token anywhere in the app drops the session
  useEffect(() => {
    setUnauthorizedHandler(() => setAuthed(false));
  }, []);

  // resume the stored session if the server still accepts it
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!getToken()) {
        if (alive) setReady(true);
        return;
      }
      try {
        await api('/me');
        if (alive) setAuthed(true);
      } catch {
        if (alive) setAuthed(false);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    await apiLogin(username, password);
    setAuthed(true);
  }, []);

  return (
    <AuthContext.Provider value={{ ready, authed, signIn, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
