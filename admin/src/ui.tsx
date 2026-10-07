/* Building blocks every page uses. Class names come from styles.css, which
   follows the reference panel (orange sidebar, white cards, DataTables-style
   tables). Tailwind utilities are available for one-off layout in pages.

   Pages should compose these instead of hand-rolling markup:
     <Page title="View Wallet">                 breadcrumb card "Home > View Wallet"
     <Card title="..." actions={...}>            white card with a heading
     <FilterCard onSubmit onCancel>              "Search Panel" form with Cancel / Submit
     <DataTable columns rows />                  Show N entries · Search · sort · pagination
     <Modal title onClose>                       dark-header popup
     const confirm = useConfirm()                "Are you sure?" dialog → Promise<boolean>
     <StatCard label value sub icon color />     dashboard tile
     <Amount value />, <ProfitLoss value />      money formatting
*/
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { amt } from './format';
import { Icon } from './icons';

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
    timer.current = window.setTimeout(() => setToast(null), 2800);
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

/**
 * Run an async action with a busy flag and toast errors:
 *   const [busy, run] = useAction();
 *   <Btn disabled={busy} onClick={() => run(async () => { await api(...); toast('Saved'); })}>
 */
export function useAction(): [boolean, (fn: () => Promise<unknown>) => Promise<void>] {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), true);
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return [busy, run];
}

/* ------------------------------------------------------------------- modal */

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
  size,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** kept for older pages: same as size="lg" */
  wide?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cls = size ?? (wide ? 'lg' : 'sm');
  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-card ${cls === 'sm' ? '' : cls}`.trim()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- confirm */

interface ConfirmOptions {
  title?: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

const ConfirmContext = createContext<(opts?: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions = {}) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    [],
  );

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
          <div className="modal-card confirm-card" role="alertdialog" aria-modal="true">
            <div className="confirm-icon">!</div>
            <h2>{state.title ?? 'Are you sure?'}</h2>
            <p>{state.message ?? "You won't be able to undo this."}</p>
            <div className="form-actions">
              <Btn variant={state.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
                {state.confirmText ?? 'Yes'}
              </Btn>
              <Btn variant="ghost" onClick={() => close(false)}>
                {state.cancelText ?? 'Cancel'}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/** `if (await confirm({ message: 'Approve 12 requests?' })) { ... }` */
export function useConfirm() {
  return useContext(ConfirmContext);
}

/* -------------------------------------------------------------- page frame */

/** Page wrapper: breadcrumb card "Home > {title}" with optional actions on the right. */
export function Page({
  title,
  crumb,
  actions,
  children,
}: {
  title: string;
  /** breadcrumb text when it should differ from the title */
  crumb?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · Rama777 Admin`;
  }, [title]);
  return (
    <>
      <div className="crumb-card">
        <div className="crumb">
          <Link to="/dashboard" className="home">
            Home
          </Link>
          <span className="sep">›</span>
          <span>{crumb ?? title}</span>
        </div>
        {actions}
      </div>
      {children}
    </>
  );
}

/** Centered heading card, e.g. "Starline Profit/Loss Calculations". */
export function TitleCard({ children }: { children: ReactNode }) {
  return (
    <div className="title-card">
      <h2>{children}</h2>
    </div>
  );
}

/* -------------------------------------------------------------- primitives */

export function Card({
  title,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  /** buttons shown at the right of the title */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card ${className}`.trim()}>
      {(title || actions) && (
        <div className="card-head">
          {title ? <h2>{title}</h2> : <div className="grow" />}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export type BtnVariant =
  | 'primary'
  | 'dark'
  | 'info'
  | 'indigo'
  | 'danger'
  | 'success'
  | 'warning'
  | 'brand'
  | 'ghost'
  | 'link'
  | 'plain';

export function Btn({
  variant = 'plain',
  sm,
  block,
  icon,
  className = '',
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  sm?: boolean;
  block?: boolean;
  /** icon name from icons.tsx shown before the label */
  icon?: string;
}) {
  const cls = ['btn', variant === 'plain' ? '' : variant, sm ? 'sm' : '', block ? 'block' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export function Chip({ tone, children }: { tone?: string; children: ReactNode }) {
  return <span className={`chip ${tone ?? ''}`.trim()}>{children}</span>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="table-wrap">{children}</div>;
}

export function Empty({ children = 'No Data Found' }: { children?: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Field({
  label,
  children,
  className = 'field',
}: {
  label: ReactNode;
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

/** Money as "1,23,456.5" (Indian grouping, decimals only when present). */
export function Amount({ value }: { value: number | null | undefined }) {
  return <>{amt(value)}</>;
}

/** Indigo balance badge as in the reference wallet table: "680750/-". */
export function AmountBadge({ value }: { value: number | null | undefined }) {
  return <span className="amt-badge">{`${Number(value ?? 0)}/-`}</span>;
}

/** Signed amount: green when ≥ 0, red with a minus when negative. */
export function ProfitLoss({ value }: { value: number }) {
  return <span className={value < 0 ? 'loss' : 'profit'}>{amt(value)}</span>;
}

/* ---------------------------------------------------------- stat (tiles) */

export function StatCard({
  label,
  value,
  sub,
  icon = 'trend',
  color = 'var(--c-primary)',
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: string;
  color?: string;
  onClick?: () => void;
}) {
  return (
    <div className="stat" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="label">{label}</div>
      <div className="stat-body">
        <span className="stat-icon" style={{ background: color }}>
          <Icon name={icon} />
        </span>
        <div>
          <div className="value">{value}</div>
          {sub && <div className="sub">{sub}</div>}
        </div>
      </div>
      <div className="bar" style={{ background: color }} />
    </div>
  );
}

/* ------------------------------------------------------------- filter form */

/**
 * "Search Panel" card: fields in a grid, Cancel (red) + Submit (blue) centred
 * underneath. Submit also fires on Enter.
 */
export function FilterCard({
  title = 'Search Panel',
  children,
  onSubmit,
  onCancel,
  busy,
  submitText = 'Submit',
  extra,
  className = '',
}: {
  title?: ReactNode;
  children: ReactNode;
  onSubmit: () => void;
  onCancel?: () => void;
  busy?: boolean;
  submitText?: string;
  /** more buttons after Submit (e.g. a green Export) */
  extra?: ReactNode;
  className?: string;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form className={`card ${className}`.trim()} onSubmit={submit}>
      {title && <p className="card-sub">{title}</p>}
      <div className="filters">{children}</div>
      <div className="form-actions">
        {onCancel && (
          <Btn variant="danger" onClick={onCancel}>
            Cancel
          </Btn>
        )}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : submitText}
        </button>
        {extra}
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- DataTable */

export interface Column<T> {
  key: string;
  label: ReactNode;
  /** cell content; `index` is the row's position in the filtered + sorted list (0-based) */
  render?: (row: T, index: number) => ReactNode;
  /** value used for sorting, searching and CSV export (defaults to row[key]) */
  value?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  className?: string;
}

function cellValue<T>(col: Column<T>, row: T): string | number | null | undefined {
  if (col.value) return col.value(row);
  const v = (row as Record<string, unknown>)[col.key];
  return v === undefined || v === null ? v : typeof v === 'number' ? v : String(v);
}

/** Server-side paging: the page owns fetching; the table only renders and reports changes. */
export interface ServerPaging {
  total: number;
  page: number;
  pageSize: number;
  search?: string;
  onChange: (next: { page: number; pageSize: number; search: string }) => void;
}

/**
 * DataTables-style table: "Show [N] entries", "Search:", sortable headers,
 * "Showing X to Y of Z entries" and Previous 1 2 … Next.
 * Client-side by default; pass `server` to page/search on the API instead.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  pageSize = 10,
  pageSizes = [10, 25, 50, 100],
  searchable = true,
  paginate = true,
  empty = 'No data available in table',
  footer,
  toolbar,
  server,
  initialSort,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey?: (row: T, index: number) => string | number;
  pageSize?: number;
  pageSizes?: number[];
  searchable?: boolean;
  /** false shows every row with no Show/pagination controls */
  paginate?: boolean;
  empty?: ReactNode;
  /** extra rows rendered in <tfoot> (e.g. a totals row) */
  footer?: ReactNode;
  /** extra controls rendered between "Show entries" and "Search" */
  toolbar?: ReactNode;
  server?: ServerPaging;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  rowClassName?: (row: T) => string;
}) {
  const [size, setSize] = useState(pageSize);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(server?.search ?? '');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);

  // a new data set (new filter submitted) starts on page 1
  const rowCount = rows.length;
  const serverMode = !!server;
  useEffect(() => {
    if (!serverMode) setPage(1);
  }, [rowCount, serverMode]);

  const filtered = useMemo(() => {
    if (server || !search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      columns.some((c) => {
        const v = cellValue(c, r);
        return v !== null && v !== undefined && String(v).toLowerCase().includes(q);
      }),
    );
  }, [rows, columns, search, server]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = cellValue(col, a);
      const vb = cellValue(col, b);
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      const na = Number(va);
      const nb = Number(vb);
      if (String(va).trim() !== '' && String(vb).trim() !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) {
        return (na - nb) * dir;
      }
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filtered, sort, columns]);

  const total = server ? server.total : sorted.length;
  const curSize = server ? server.pageSize : paginate ? size : Math.max(1, sorted.length);
  const pages = Math.max(1, Math.ceil(total / curSize));
  const curPage = server ? server.page : Math.min(page, pages);
  const start = (curPage - 1) * curSize;
  const visible = server || !paginate ? sorted : sorted.slice(start, start + curSize);
  const offset = server ? start : paginate ? start : 0;

  const go = (p: number) => {
    const next = Math.min(Math.max(1, p), pages);
    if (server) server.onChange({ page: next, pageSize: server.pageSize, search });
    else setPage(next);
  };

  const toggleSort = (key: string) => {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  // server-mode search waits for typing to pause
  const searchTimer = useRef<number | undefined>(undefined);
  const onSearch = (value: string) => {
    setSearch(value);
    if (server) {
      window.clearTimeout(searchTimer.current);
      searchTimer.current = window.setTimeout(
        () => server.onChange({ page: 1, pageSize: server.pageSize, search: value }),
        350,
      );
    } else {
      setPage(1);
    }
  };

  const pageButtons = useMemo(() => {
    const list: Array<number | '…'> = [];
    const add = (n: number | '…') => list.push(n);
    if (pages <= 7) {
      for (let i = 1; i <= pages; i++) add(i);
    } else {
      add(1);
      if (curPage > 4) add('…');
      for (let i = Math.max(2, curPage - 1); i <= Math.min(pages - 1, curPage + 1); i++) add(i);
      if (curPage < pages - 3) add('…');
      add(pages);
    }
    return list;
  }, [pages, curPage]);

  const showTop = paginate || searchable || toolbar;

  return (
    <div>
      {showTop && (
        <div className="dt-top">
          {paginate ? (
            <label>
              Show
              <select
                value={curSize}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (server) server.onChange({ page: 1, pageSize: n, search });
                  else {
                    setSize(n);
                    setPage(1);
                  }
                }}
              >
                {[...new Set([...pageSizes, pageSize])].sort((a, b) => a - b).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              entries
            </label>
          ) : (
            <span />
          )}
          {toolbar}
          {searchable && (
            <label>
              Search:
              <input value={search} onChange={(e) => onSearch(e.target.value)} />
            </label>
          )}
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c) => {
                const sortable = c.sortable !== false && !server;
                const dir = sort?.key === c.key ? sort.dir : '';
                return (
                  <th
                    key={c.key}
                    className={[sortable ? `sortable ${dir}` : '', c.align ?? '', c.className ?? ''].join(' ').trim()}
                    onClick={sortable ? () => toggleSort(c.key) : undefined}
                  >
                    {c.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="empty">
                  {empty}
                </td>
              </tr>
            ) : (
              visible.map((row, i) => (
                <tr key={rowKey ? rowKey(row, offset + i) : offset + i} className={rowClassName?.(row)}>
                  {columns.map((c) => (
                    <td key={c.key} className={[c.align ?? '', c.className ?? ''].join(' ').trim() || undefined}>
                      {c.render ? c.render(row, offset + i) : (cellValue(c, row) ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {footer && <tfoot>{footer}</tfoot>}
        </table>
      </div>

      {paginate && (
        <div className="dt-bottom">
          <div className="dt-info">
            {total === 0
              ? 'Showing 0 to 0 of 0 entries'
              : `Showing ${start + 1} to ${Math.min(start + curSize, total)} of ${total} entries`}
          </div>
          <div className="dt-pages">
            <button disabled={curPage <= 1} onClick={() => go(curPage - 1)}>
              Previous
            </button>
            {pageButtons.map((p, i) =>
              p === '…' ? (
                <button key={`gap${i}`} disabled>
                  …
                </button>
              ) : (
                <button key={p} className={p === curPage ? 'active' : ''} onClick={() => go(p)}>
                  {p}
                </button>
              ),
            )}
            <button disabled={curPage >= pages} onClick={() => go(curPage + 1)}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "Sr. No" column helper: numbers rows 1..N in their current order. */
export function srColumn<T>(label = 'Sr. No'): Column<T> {
  return { key: '__sr', label, render: (_row, i) => i + 1, sortable: false, align: 'center' };
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

/** Simple pagination footer kept for older pages. */
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

/** Placeholder for a page whose module has not been built yet. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <Page title={title}>
      <Card title={title}>
        <Empty>This page is being built.</Empty>
      </Card>
    </Page>
  );
}
