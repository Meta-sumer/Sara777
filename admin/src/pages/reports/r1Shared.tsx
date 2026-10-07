/* Pieces shared by the report pages in part 1 (sales and fund reports). */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../../api';
import type { Player } from '../../components/PlayerSelect';
import { PlayerSelect } from '../../components/PlayerSelect';
import { dateOnly, slash } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import { Btn, Chip, Field, useAction, useToast } from '../../ui';
import { UserProfileModal } from '../users/UserProfileModal';

export type { Player };

/** Totals the server returns for every sales-style aggregate. */
export interface Sales {
  bids: number;
  players: number;
  amount: number;
  win: number;
  profit: number;
  winners: number;
  pending: number;
}

export interface MarketSales extends Sales {
  marketId: number;
  marketName: string;
  kind: string;
}

export interface MarketOption {
  id: number;
  name: string;
  kind: string;
  isActive: boolean;
}

/** Query string from an object, skipping empty values. */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
  }
  return q.toString();
}

/**
 * Filter form state with a separate "applied" copy: the report reloads only
 * when Submit (or Cancel, which resets) is pressed, or when Refresh is.
 */
export function useFilters<F>(defaults: () => F) {
  const [form, setForm] = useState<F>(defaults);
  const [applied, setApplied] = useState<{ f: F; n: number }>(() => ({ f: form, n: 0 }));
  const set = useCallback(<K extends keyof F>(key: K, value: F[K]) => setForm((s) => ({ ...s, [key]: value })), []);
  const submit = () => setApplied((a) => ({ f: form, n: a.n + 1 }));
  const reset = () => {
    const d = defaults();
    setForm(d);
    setApplied((a) => ({ f: d, n: a.n + 1 }));
  };
  return { form, set, applied: applied.f, run: applied.n, submit, reset };
}

/** Load `path` (relative to /api/admin) whenever it, the run counter or Refresh changes. */
export function useReport<T>(path: string, run: number) {
  const { nonce } = useRefresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => api<T>(path), [path, run, nonce]);
  return useLoad(load);
}

/** Markets of the given kinds for the "Provider Name" dropdowns. */
export function useMarkets(kinds: string[]): MarketOption[] {
  const [list, setList] = useState<MarketOption[]>([]);
  const toast = useToast();
  const key = kinds.join(',');
  useEffect(() => {
    let alive = true;
    api<{ markets: MarketOption[] }>('/markets')
      .then((r) => alive && setList(r.markets.filter((m) => key.split(',').includes(m.kind))))
      .catch((err: Error) => toast(err.message, true));
    return () => {
      alive = false;
    };
  }, [key, toast]);
  return list;
}

/* ------------------------------------------------------------------ fields */

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <input type="date" value={value} required onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function ProviderField({
  markets,
  value,
  onChange,
  allLabel = 'All',
  disabled,
}: {
  markets: MarketOption[];
  value: string;
  onChange: (v: string) => void;
  allLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Field label="Provider Name">
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{allLabel}</option>
        {markets.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.isActive ? '' : ' (inactive)'}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** "Player Name" with the 3-character suggestion hint under it. */
export function PlayerField({ value, onChange }: { value: Player | null; onChange: (p: Player | null) => void }) {
  return (
    // on wide screens the hint hangs below the box so the input lines up with its neighbours
    <div className="field" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--heading)', position: 'relative' }}>
      Player Name
      <div style={{ marginTop: 7, fontWeight: 400 }}>
        <PlayerSelect value={value} onChange={onChange} placeholder="Type Username" />
      </div>
      <div className="muted md:absolute md:left-0 md:top-full" style={{ fontSize: 12, fontWeight: 600, marginTop: 3 }}>
        Type Minimum 3 Char to get suggestion
      </div>
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/* ------------------------------------------------------------------ output */

/** "05/10/2026 TO 05/10/2026" */
export function rangeLabel(from: string, to: string) {
  return `${dateOnly(from)} TO ${dateOnly(to)}`;
}

/** Signed profit/loss for CSV cells (no grouping, 2 decimals max). */
export function num(n: number) {
  return Math.round(n * 100) / 100;
}

/** Bold, letter-spaced "Total Amount : 13673145/-" line under report tables. */
export function TotalLine({ items }: { items: Array<{ label: string; value: number; tone?: 'profit' | 'loss' }> }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '6px 36px',
        fontSize: 21,
        fontWeight: 800,
        letterSpacing: 0.8,
        color: 'var(--heading)',
      }}
    >
      {items.map((i) => (
        <span key={i.label}>
          {i.label} : <span className={i.tone}>{slash(i.value)}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Table footer row holding a TotalLine. The line sticks to the visible part of
 * a horizontally scrolled table, so it stays readable on a phone.
 */
export function TotalRow({ colSpan, items }: { colSpan: number; items: Parameters<typeof TotalLine>[0]['items'] }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: '18px 12px', background: '#fff' }}>
        <div style={{ position: 'sticky', left: 12, width: 'min(100%, calc(100vw - 96px))' }}>
          <TotalLine items={items} />
        </div>
      </td>
    </tr>
  );
}

/**
 * One-row bordered summary table (Jodi All style): headers over values,
 * centred, "No Records Found" when `empty`.
 */
export function SummaryTable({
  cells,
  empty,
}: {
  cells: Array<{ label: string; value: ReactNode }>;
  empty?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {cells.map((c) => (
              <th key={c.label} className="center">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {empty ? (
              <td colSpan={cells.length} className="empty">
                No Records Found
              </td>
            ) : (
              cells.map((c) => (
                <td key={c.label} className="center">
                  {c.value}
                </td>
              ))
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Note shown when some bids in a report still wait for their result. */
export function PendingNote({ pending }: { pending: number }) {
  if (!pending) return null;
  return (
    <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>
      {pending} {pending === 1 ? 'bid is' : 'bids are'} still waiting for a result, so {pending === 1 ? 'its' : 'their'}{' '}
      winnings are not counted yet.
    </p>
  );
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  completed: 'Completed',
  rejected: 'Rejected',
  failed: 'Failed',
  won: 'Won',
  lost: 'Lost',
  refunded: 'Refunded',
};

export function statusLabel(s: string) {
  return STATUS_LABEL[s] ?? s;
}

export function StatusChip({ status }: { status: string }) {
  return <Chip tone={status === 'refunded' ? 'info' : status}>{statusLabel(status)}</Chip>;
}

/** Green "IP" style badge for a payment particular. */
export function ParticularBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="muted">--</span>;
  return (
    <span
      style={{
        display: 'inline-block',
        background: 'var(--c-success)',
        color: '#fff',
        padding: '3px 9px',
        borderRadius: 4,
        fontWeight: 700,
        fontSize: 12.5,
      }}
    >
      {value}
    </span>
  );
}

/** Indigo time badge used by the reference Fund Report. */
export function TimeBadge({ children }: { children: ReactNode }) {
  return <span className="amt-badge" style={{ fontWeight: 600, fontSize: 13 }}>{children}</span>;
}

/** Username as a link that opens the shared profile popup. */
export function useProfile() {
  const [userId, setUserId] = useState<number | null>(null);
  const link = (id: number, label: ReactNode) => (
    <Btn variant="link" onClick={() => setUserId(id)}>
      {label}
    </Btn>
  );
  const modal = userId !== null ? <UserProfileModal userId={userId} onClose={() => setUserId(null)} /> : null;
  return { link, modal };
}

/** Export button that fetches every matching row first (server-paged reports). */
export function ExportButton({ onExport, disabled }: { onExport: () => Promise<void>; disabled?: boolean }) {
  const [busy, run] = useAction();
  return (
    <Btn variant="success" icon="download" disabled={disabled || busy} onClick={() => run(onExport)}>
      {busy ? 'Exporting…' : 'Export'}
    </Btn>
  );
}

