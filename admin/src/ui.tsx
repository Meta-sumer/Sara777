/* Small building blocks every page uses. The class names come from styles.css,
   which keeps the panel looking exactly as it did; Tailwind utilities are used
   for one-off layout inside the pages. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/* ------------------------------------------------------------------- toast */

interface ToastState {
  message: string;
  bad: boolean;
}

const ToastContext = createContext<(message: string, bad?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((message: string, bad = false) => {
    setToast({ message, bad });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && <div className={`toast${toast.bad ? ' bad' : ''}`}>{toast.message}</div>}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/** Run an action and surface any failure as a toast instead of an unhandled rejection. */
export function useGuard() {
  const toast = useToast();
  return useCallback(
    (fn: () => Promise<unknown>) => async () => {
      try {
        await fn();
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), true);
      }
    },
    [toast],
  );
}

/* ------------------------------------------------------------------- modal */

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={wide ? { maxWidth: 900 } : undefined}>
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- primitives */

export function Card({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card ${className}`.trim()}>
      {title && <h2>{title}</h2>}
      {children}
    </div>
  );
}

type BtnVariant = 'primary' | 'success' | 'danger' | 'ghost' | 'plain';

export function Btn({
  variant = 'plain',
  sm,
  block,
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  sm?: boolean;
  block?: boolean;
}) {
  const cls = [
    'btn',
    variant === 'plain' ? '' : variant,
    sm ? 'sm' : '',
    block ? 'block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <button type="button" className={cls} {...rest} />;
}

export function Chip({ tone, children }: { tone?: string; children: ReactNode }) {
  return <span className={`chip ${tone ?? ''}`.trim()}>{children}</span>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="table-wrap">{children}</div>;
}

export function Empty({ children = 'Nothing here yet' }: { children?: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Field({
  label,
  children,
  className = 'field',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      {label}
      {children}
    </label>
  );
}

/* ------------------------------------------------------- data loading view */

export function Loading() {
  return <p className="muted">Loading…</p>;
}

export function ErrorCard({ message }: { message: string }) {
  return (
    <div className="card">
      <p className="error">{message}</p>
    </div>
  );
}

/** Render a loaded resource, or its loading / error state. */
export function Resource<T>({
  state,
  children,
}: {
  state: { data?: T; error?: string; loading: boolean };
  children: (data: T) => ReactNode;
}) {
  if (state.loading && state.data === undefined) return <Loading />;
  if (state.error) return <ErrorCard message={state.error} />;
  if (state.data === undefined) return null;
  return <>{children(state.data)}</>;
}

/** Stable pagination footer used by the bid and user lists. */
export function Pager({
  page,
  total,
  perPage,
  onPage,
}: {
  page: number;
  total: number;
  perPage: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const label = useMemo(() => `Page ${page} of ${pages} · ${total} rows`, [page, pages, total]);
  if (total === 0) return null;
  return (
    <div className="row" style={{ marginTop: 12 }}>
      <Btn sm variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Prev
      </Btn>
      <span className="muted">{label}</span>
      <Btn sm variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </Btn>
    </div>
  );
}
