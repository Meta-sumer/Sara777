import { useCallback, useEffect, useState } from 'react';

export interface LoadState<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

/**
 * Load data for a page and expose a reload(), which is what every action does
 * after it changes something on the server.
 */
export function useLoad<T>(load: () => Promise<T>): LoadState<T> & { reload: () => Promise<void> } {
  const [state, setState] = useState<LoadState<T>>({ loading: true });

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: undefined }));
    try {
      const data = await load();
      setState({ data, loading: false });
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
    // `load` is expected to be memoised by the caller with useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload };
}
