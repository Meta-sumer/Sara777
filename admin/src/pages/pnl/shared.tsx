/* Pieces shared by the Starline / Andar Bahar profit-loss pages and Bookie Corner. */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../../api';
import { amt, dateOnly, fmt, SESSION_LABEL } from '../../format';
import { useLoad } from '../../hooks';
import { Btn, Card, type Column } from '../../ui';

export type PnlKind = 'main' | 'starline' | 'andarbahar';
export type Session = 'open' | 'close';
export type BetGroup = 'digit' | 'panna' | 'jodi' | 'ab' | 'half_sangam' | 'full_sangam';

export interface PnlMarket {
  id: number;
  name: string;
  kind: PnlKind;
  /** result time HH:MM */
  time: string;
  timeLabel: string;
  isActive: boolean;
}

/** One "what if this wins" row from /pnl/game, /pnl/bookie or /pnl/bookie/final. */
export interface PnlRow {
  pick: string;
  label: string;
  bids: number;
  amount: number;
  toPay: number;
  formula: string;
  net: number;
  profit: number;
  loss: number;
}

export interface SummaryRow {
  key: string;
  label: string;
  bids: number;
  amount: number;
}

export interface PnlReport {
  market: Omit<PnlMarket, 'isActive'>;
  date: string;
  session?: Session;
  result: string | null;
  summary: SummaryRow[];
  total: { bids: number; amount: number };
  tables: Partial<Record<'digit' | 'panna' | 'jodi' | 'ab', PnlRow[]>>;
}

/** What the Bid History popup should list. */
export interface BidQuery {
  marketId: number;
  marketName: string;
  date: string;
  session?: Session;
  group: BetGroup;
  pick: string;
  /** the row label, e.g. "123-6" */
  label: string;
  groupLabel: string;
}

/* ---------------------------------------------------------------- markets */

/** Providers of one kind for the search panel. */
export function usePnlMarkets(kind: PnlKind) {
  const load = useCallback(() => api<{ markets: PnlMarket[] }>(`/pnl/markets?kind=${kind}`), [kind]);
  return useLoad(load);
}

/** Dropdown text: the slot time for Starline / Andar Bahar (as in the reference), the name for main markets. */
export function marketOptions(markets: PnlMarket[]) {
  const timeCount = new Map<string, number>();
  for (const m of markets) timeCount.set(m.timeLabel, (timeCount.get(m.timeLabel) ?? 0) + 1);
  return markets.map((m) => {
    let text = m.name;
    if (m.kind !== 'main') text = (timeCount.get(m.timeLabel) ?? 0) > 1 ? `${m.timeLabel} (${m.name})` : m.timeLabel;
    return { value: String(m.id), text: m.isActive ? text : `${text} (inactive)` };
  });
}

/**
 * Provider picked when the page opens: for Starline / Andar Bahar the next slot
 * still to be declared today (the last slot once all are past); for main markets the first active one.
 */
export function defaultMarket(markets: PnlMarket[]): string {
  const active = markets.filter((m) => m.isActive);
  const list = active.length ? active : markets;
  if (!list.length) return '';
  if (list[0].kind === 'main') return String(list[0].id);
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const next = [...list].sort((a, b) => toMins(a.time) - toMins(b.time)).find((m) => toMins(m.time) >= mins);
  return String((next ?? list[list.length - 1]).id);
}

/** Search-panel state plus the submitted query that the report loads from. */
export function usePnlForm<Q extends { marketId: string; date: string }>(
  markets: PnlMarket[] | undefined,
  initial: (marketId: string) => Q,
) {
  const [form, setForm] = useState<Q | null>(null);
  const [query, setQuery] = useState<Q | null>(null);

  // once the providers arrive, fill the defaults and show today's numbers straight away
  useEffect(() => {
    if (!markets || form) return;
    const start = initial(defaultMarket(markets));
    setForm(start);
    if (start.marketId) setQuery(start);
    // `initial` is a fresh closure each render; it only matters on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, form]);

  const set = <K extends keyof Q>(key: K, value: Q[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const submit = () => {
    if (form?.marketId) setQuery({ ...form });
  };
  const reset = () => {
    if (!markets) return;
    const start = initial(defaultMarket(markets));
    setForm(start);
    setQuery(start.marketId ? start : null);
  };
  return { form, query, set, submit, reset };
}

/* ---------------------------------------------------------------- summary */

/**
 * Right-hand summary box: Type | Bids | Amount with a Grand Total row, or the
 * OC Cutting Group's "# | Type | Amount" list.
 */
export function SummaryBox({
  report,
  order,
  numbered = false,
  caption,
}: {
  report: PnlReport | null | undefined;
  /** summary keys in display order */
  order: string[];
  /** OC Cutting Group: "#" column, no Bids column and no Grand Total */
  numbered?: boolean;
  caption?: ReactNode;
}) {
  const rows = report ? order.map((k) => report.summary.find((s) => s.key === k)).filter((s): s is SummaryRow => !!s) : [];
  return (
    <Card>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {numbered && <th>#</th>}
              <th>Type</th>
              {!numbered && <th>Bids</th>}
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.key}>
                {numbered && <td>{i + 1}</td>}
                <td>{s.label}</td>
                {!numbered && <td>{fmt(s.bids)}</td>}
                <td>{amt(s.amount)}</td>
              </tr>
            ))}
          </tbody>
          {report && !numbered && (
            <tfoot>
              <tr>
                <td>Grand Total</td>
                <td>{fmt(report.total.bids)}</td>
                <td>{amt(report.total.amount)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {report && (
        <p className="muted" style={{ margin: '12px 0 0', fontSize: 13.5, lineHeight: 1.5 }}>
          {caption ?? reportCaption(report)}
        </p>
      )}
    </Card>
  );
}

/** "KALYAN · 03/10/2026 · Open · Result 019-07-557" under the summary, so the numbers say what they are for. */
export function reportCaption(report: PnlReport) {
  const parts = [report.market.name, dateOnly(report.date)];
  if (report.session) parts.push(`${SESSION_LABEL[report.session]} session`);
  parts.push(report.result ? `Result ${report.result}` : 'Result not declared yet');
  return parts.join(' · ');
}

/* ---------------------------------------------------------------- columns */

/** Bid Count cell: "View Bids Info (N)" as a dark text link, or a dark button (Andar Bahar). */
export function BidsInfo({ count, button, onClick }: { count: number; button?: boolean; onClick: () => void }) {
  const text = `View Bids Info (${fmt(count)})`;
  if (count === 0) {
    return button ? (
      <Btn variant="dark" sm disabled>
        {text}
      </Btn>
    ) : (
      <span className="muted">{text}</span>
    );
  }
  return (
    <Btn variant={button ? 'dark' : 'link'} sm={button} onClick={onClick}>
      {text}
    </Btn>
  );
}

export function pnlColumns({
  digitsLabel = 'Digits',
  session,
  bidCount,
  amountLabel = 'Total Bids Amount',
  formula = false,
}: {
  digitsLabel?: string;
  /** show a Session column (Bookie Corner) */
  session?: Session;
  /** Bid Count column: omitted for OC Cutting Group */
  bidCount?: { button?: boolean; onView: (row: PnlRow) => void };
  amountLabel?: string;
  /** Andar Bahar: Amount To Pay as "1750*100" plus "Amount To Pay Calculated" */
  formula?: boolean;
}): Column<PnlRow>[] {
  const cols: Column<PnlRow>[] = [{ key: 'label', label: digitsLabel, align: 'center' }];
  if (session) cols.push({ key: 'session', label: 'Session', align: 'center', value: () => SESSION_LABEL[session] });
  if (bidCount) {
    cols.push({
      key: 'bids',
      label: 'Bid Count',
      align: 'center',
      render: (r) => <BidsInfo count={r.bids} button={bidCount.button} onClick={() => bidCount.onView(r)} />,
    });
  }
  cols.push({ key: 'amount', label: amountLabel, align: 'center', render: (r) => amt(r.amount) });
  if (formula) {
    cols.push(
      { key: 'toPay', label: 'Amount To Pay', align: 'center', render: (r) => r.formula },
      {
        key: 'calc',
        label: 'Amount To Pay Calculated',
        align: 'center',
        value: (r) => r.toPay,
        render: (r) => `${r.formula}=${r.toPay}`,
      },
    );
  } else {
    cols.push({ key: 'toPay', label: 'Amount To Pay', align: 'center', render: (r) => amt(r.toPay) });
  }
  cols.push(
    { key: 'profit', label: 'Profit', align: 'center', render: (r) => <span className="profit">{amt(r.profit)}</span> },
    { key: 'loss', label: 'Loss', align: 'center', render: (r) => <span className="loss">{amt(r.loss)}</span> },
  );
  return cols;
}

/** Checkbox in the Pana table's toolbar: pannas nobody bet on are hidden unless ticked. */
export function ShowAllToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="check" style={{ fontWeight: 600 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
