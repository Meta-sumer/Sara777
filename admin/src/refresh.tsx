import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface RefreshValue {
  /** Bump this in a page's load dependencies to re-fetch when Refresh is pressed. */
  nonce: number;
  refresh: () => void;
}

const RefreshContext = createContext<RefreshValue>({ nonce: 0, refresh: () => {} });

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const value = useMemo(() => ({ nonce, refresh }), [nonce, refresh]);
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export function useRefresh() {
  return useContext(RefreshContext);
}
