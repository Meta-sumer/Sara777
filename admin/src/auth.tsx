import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, login as apiLogin, setUnauthorizedHandler, TOKEN_KEY } from './api';

export interface PermNode {
  key: string;
  label: string;
  children?: PermNode[];
}

/** The signed-in admin, from GET /api/admin/me. */
export interface Me {
  username: string;
  name: string;
  role: string;
  isSuper: boolean;
  permissions: string[];
  /** every permission key with labels — used by the employee form */
  permissionTree: PermNode[];
}

interface AuthValue {
  ready: boolean;
  authed: boolean;
  me: Me | null;
  /** true when the admin holds any of the keys (super admin: always) */
  can: (...keys: string[]) => boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue>({
  ready: false,
  authed: false,
  me: null,
  can: () => false,
  signIn: async () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setMe(null);
  }, []);

  // a rejected token anywhere in the app drops the session
  useEffect(() => {
    setUnauthorizedHandler(() => setMe(null));
  }, []);

  const loadMe = useCallback(async () => {
    const data = await api<Me>('/me');
    // an API from before staff permissions answers /me without them
    if (!Array.isArray(data.permissions)) {
      throw new Error(
        'The API server is running an older version than this panel. Start the local server (cd server && npm run dev) or deploy the latest server.',
      );
    }
    setMe(data);
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
        await loadMe();
      } catch {
        if (alive) setMe(null);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadMe]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      await apiLogin(username, password);
      try {
        await loadMe();
      } catch (err) {
        localStorage.removeItem(TOKEN_KEY);
        throw err;
      }
    },
    [loadMe],
  );

  const can = useCallback(
    (...keys: string[]) => !!me && (me.isSuper || keys.some((k) => me.permissions.includes(k))),
    [me],
  );

  return (
    <AuthContext.Provider value={{ ready, authed: !!me, me, can, signIn, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
