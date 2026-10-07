/* Shared pieces for the Reports (part 2) pages: filter option loading, game /
   type / session selects, the server-paged report hook, tab strip, the filter
   card with an Export button, and small cells (status chips, user links). */
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { KIND_LABEL, SESSION_LABEL } from '../../format';
import { useRefresh } from '../../refresh';
import { Btn, Chip, type ServerPaging, useToast } from '../../ui';
import { UserProfileModal } from '../users/UserProfileModal';

/* ------------------------------------------------------------ filter options */

export interface R2Market {
  id: number;
  name: string;
  kind: string;
  isActive: boolean;
}
export interface R2GameType {
  kind: string;
  key: string;
  label: string;
}
export interface R2Options {
  markets: R2Market[];
  gameTypes: R2GameType[];
}

export const KIND_ORDER = ['main', 'starline', 'andarbahar'];

/** Markets and game types for the filters (loaded once per page visit). */
export function useR2Options(): R2Options | null {
  const [opts, setOpts] = useState<R2Options | null>(null);
  const toast = useToast();
  useEffect(() => {
    let live = true;
    api<R2Options>('/reports/r2-options').then(
      (o) => live && setOpts(o),
      (err: Error) => live && toast(err.message, true),
    );
    return () => {
      live = false;
    };
  }, [toast]);
  return opts;
}

/** Kind of a Game Name select value ('' | 'kind:main' | market id). */
export function kindOfGame(value: string, opts: R2Options | null): string | null {
  if (value.startsWith('kind:')) return value.slice(5);
  if (!value || !opts) return null;
  return opts.markets.find((m) => String(m.id) === value)?.kind ?? null;
}

/**
 * Game Name dropdown grouped by market kind.
 *   allLabel   adds an "all games" first option (value '')
 *   kindOptions adds "All Main Market" style entries (value 'kind:<kind>')
 */
export function GameSelect({
  value,
  onChange,
  opts,
  allLabel,
  kindOptions,
  kinds = KIND_ORDER,
}: {
  value: string;
  onChange: (v: string) => void;
  opts: R2Options | null;
  allLabel?: string;
  kindOptions?: boolean;
  kinds?: string[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {allLabel && <option value="">{allLabel}</option>}
      {!allLabel && !opts && <option value="">Loading…</option>}
      {kinds.map((kind) => {
        const list = opts?.markets.filter((m) => m.kind === kind) ?? [];
        if (!list.length) return null;
        return (
          <optgroup key={kind} label={KIND_LABEL[kind] ?? kind}>
            {kindOptions && <option value={`kind:${kind}`}>All {KIND_LABEL[kind] ?? kind}</option>}
            {list.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.isActive ? '' : ' (inactive)'}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

/** Game types offered for a kind (or every type, by default label, when kind is null). */
export function typesFor(opts: R2Options | null, kind: string | null): Array<{ key: string; label: string }> {
  if (!opts) return [];
  if (kind) return opts.gameTypes.filter((t) => t.kind === kind).map((t) => ({ key: t.key, label: t.label }));
  const seen = new Map<string, string>();
  for (const k of KIND_ORDER) {
    for (const t of opts.gameTypes) if (t.kind === k && !seen.has(t.key)) seen.set(t.key, t.label);
  }
  return [...seen].map(([key, label]) => ({ key, label }));
}

export function GameTypeSelect({
  value,
  onChange,
  types,
}: {
  value: string;
  onChange: (v: string) => void;
  types: Array<{ key: string; label: string }>;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">All Types</option>
      {types.map((t) => (
        <option key={t.key} value={t.key}>
          {t.label}
        </option>
      ))}
    </select>
  );
}

export function SessionSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select value={disabled ? 'all' : value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="all">{disabled ? 'No sessions' : 'All Sessions'}</option>
      <option value="open">Open</option>
      <option value="close">Close</option>
    </select>
  );
}

/* --------------------------------------------------------------- cells */

export function sessionText(s: string | null | undefined): string {
  return s ? (SESSION_LABEL[s] ?? s) : '--';
}

const BID_STATUS: Record<string, [label: string, tone: string]> = {
  won: ['Win', 'won'],
  lost: ['Loss', 'lost'],
  pending: ['Pending', 'pending'],
  refunded: ['Refunded', 'info'],
};

export function bidStatusText(s: string): string {
  return BID_STATUS[s]?.[0] ?? s;
}

export function BidStatus({ status }: { status: string }) {
  const [label, tone] = BID_STATUS[status] ?? [status, ''];
  return <Chip tone={tone}>{label}</Chip>;
}

const USER_STATUS: Record<string, [label: string, tone: string]> = {
  active: ['Active', 'ok'],
  blocked: ['Blocked', 'bad'],
  deleted: ['Deleted', 'pending'],
};

export function userStatusText(s: string): string {
  return USER_STATUS[s]?.[0] ?? s;
}

export function UserStatus({ status }: { status: string }) {
  const [label, tone] = USER_STATUS[status] ?? [status, ''];
  return <Chip tone={tone}>{label}</Chip>;
}

const REQUEST_TONE: Record<string, string> = {
  pending: 'pending',
  approved: 'approved',
  completed: 'completed',
  rejected: 'rejected',
  failed: 'failed',
};

export function RequestStatus({ status }: { status: string }) {
  return <Chip tone={REQUEST_TONE[status]}>{status.charAt(0).toUpperCase() + status.slice(1)}</Chip>;
}

/** Username that opens the shared profile popup; the full name underneath. */
export function UserLink({ id, username, name }: { id: number; username: string; name?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Btn variant="link" onClick={() => setOpen(true)} title="View profile">
        {username}
      </Btn>
      {name && name !== username && <div className="muted" style={{ fontSize: 12.5 }}>{name}</div>}
      {open && <UserProfileModal userId={id} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Signed money in report colours: green when positive, red when negative, plain at zero. */
export function Signed({ value, text }: { value: number; text: string }) {
  if (value === 0) return <>{text}</>;
  return <span className={value < 0 ? 'loss' : 'profit'}>{text}</span>;
}

/* ----------------------------------------------------------------- tabs */

export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ key: K; label: string }>;
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            style={{
              border: 0,
              font: 'inherit',
              fontSize: 16,
              fontWeight: active ? 700 : 600,
              padding: '11px 18px',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              color: 'var(--heading)',
              background: active ? 'var(--card)' : '#dde2e8',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------- filter card */

/**
 * Same layout as ui.tsx FilterCard (fields grid, centred buttons) with the
 * reference's green Export button after Cancel / Submit.
 */
export function ReportFilter({
  title,
  children,
  onSubmit,
  onCancel,
  onExport,
  busy,
  exporting,
  canExport = true,
  attached,
}: {
  title?: ReactNode;
  children: ReactNode;
  onSubmit: () => void;
  onCancel?: () => void;
  onExport?: () => void;
  busy?: boolean;
  exporting?: boolean;
  /** false greys the Export button out (nothing loaded yet) */
  canExport?: boolean;
  /** square top corners so the card sits under a tab strip */
  attached?: boolean;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form className="card" onSubmit={submit} style={attached ? { borderTopLeftRadius: 0 } : undefined}>
      {title && <h2 className="card-title">{title}</h2>}
      <div className="filters">{children}</div>
      <div className="form-actions">
        {onCancel && (
          <Btn variant="danger" onClick={onCancel}>
            Cancel
          </Btn>
        )}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : 'Submit'}
        </button>
        {onExport && (
          <Btn variant="success" icon="download" onClick={onExport} disabled={exporting || !canExport}>
            {exporting ? 'Exporting…' : 'Export'}
          </Btn>
        )}
      </div>
    </form>
  );
}

/** Checkbox styled like the reference's "Get all users". */
export function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="check" style={{ alignSelf: 'center', paddingTop: 22 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/* --------------------------------------------------- server-paged reports */

export interface PagedResponse {
  total: number;
  page: number;
  perPage: number;
}

type Query = Record<string, string>;

function queryString(q: Query, extra: Query): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...q, ...extra })) if (v !== '' && v !== undefined) qs.set(k, v);
  return qs.toString();
}

/**
 * A report whose rows are paged and searched on the server.
 *   const r = useServerReport<Resp>('/reports/daily');
 *   r.submit({ from, to })            run with new filters (page 1)
 *   <DataTable rows={r.data?.rows ?? []} server={r.server} />
 *   await r.fetchAll()                every row for Export
 */
export function useServerReport<R extends PagedResponse>(path: string, defaultPerPage = 10) {
  const { nonce } = useRefresh();
  const toast = useToast();
  const [query, setQuery] = useState<Query | null>(null);
  const [paging, setPaging] = useState({ page: 1, pageSize: defaultPerPage, search: '' });
  const [state, setState] = useState<{ data?: R; error?: string; loading: boolean }>({ loading: false });

  useEffect(() => {
    if (!query) return;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    const qs = queryString(query, {
      page: String(paging.page),
      perPage: String(paging.pageSize),
      q: paging.search,
    });
    api<R>(`${path}?${qs}`).then(
      (data) => live && setState({ data, loading: false }),
      (err: Error) => {
        if (!live) return;
        setState({ loading: false, error: err.message });
        toast(err.message, true);
      },
    );
    return () => {
      live = false;
    };
  }, [path, query, paging, nonce, toast]);

  const submit = useCallback((q: Query) => {
    setQuery({ ...q });
    setPaging((p) => ({ ...p, page: 1 }));
  }, []);

  const clear = useCallback(() => {
    setQuery(null);
    setState({ loading: false });
  }, []);

  const server: ServerPaging = useMemo(
    () => ({
      total: state.data?.total ?? 0,
      page: paging.page,
      pageSize: paging.pageSize,
      search: paging.search,
      onChange: (n) => setPaging({ page: n.page, pageSize: n.pageSize, search: n.search }),
    }),
    [state.data, paging],
  );

  const fetchAll = useCallback(async () => {
    if (!query) throw new Error('Press Submit first');
    return api<R>(`${path}?${queryString(query, { all: '1', q: paging.search })}`);
  }, [path, query, paging.search]);

  return { ...state, query, submit, clear, server, fetchAll };
}

/** Plain (client-side) report: fetch on submit, keep the last result. */
export function useReport<R>(path: string) {
  const { nonce } = useRefresh();
  const toast = useToast();
  const [query, setQuery] = useState<Query | null>(null);
  const [state, setState] = useState<{ data?: R; error?: string; loading: boolean }>({ loading: false });

  useEffect(() => {
    if (!query) return;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    api<R>(`${path}?${queryString(query, {})}`).then(
      (data) => live && setState({ data, loading: false }),
      (err: Error) => {
        if (!live) return;
        setState({ loading: false, error: err.message });
        toast(err.message, true);
      },
    );
    return () => {
      live = false;
    };
  }, [path, query, nonce, toast]);

  const submit = useCallback((q: Query) => setQuery({ ...q }), []);
  const clear = useCallback(() => {
    setQuery(null);
    setState({ loading: false });
  }, []);
  return { ...state, query, submit, clear };
}

/** "Loading please wait..." line shown above a table while a report runs. */
export function LoadingLine({ show }: { show: boolean }) {
  if (!show) return null;
  return <p className="muted center" style={{ margin: '0 0 12px', fontWeight: 600 }}>Loading please wait…</p>;
}

/** Bold totals line under a table, e.g. "Total Deposit: 0, Withdraw: 800, …". */
export function TotalsLine({ children }: { children: ReactNode }) {
  return (
    <p className="center" style={{ margin: '16px 0 0', fontWeight: 800, fontSize: 16, color: 'var(--heading)' }}>
      {children}
    </p>
  );
}
