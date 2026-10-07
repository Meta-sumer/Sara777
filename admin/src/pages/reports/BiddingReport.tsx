import { useEffect, useMemo, useState } from 'react';
import { exportCsv } from '../../export';
import { amt, dateOnly, today } from '../../format';
import { Card, Chip, type Column, DataTable, Field, Page, ProfitLoss, srColumn, useAction } from '../../ui';
import {
  BidStatus,
  GameSelect,
  GameTypeSelect,
  LoadingLine,
  ReportFilter,
  SessionSelect,
  bidStatusText,
  kindOfGame,
  sessionText,
  typesFor,
  useR2Options,
  useReport,
} from './r2Common';

interface DigitRow {
  date: string;
  gameType: string;
  typeLabel: string;
  session: string | null;
  pick: string;
  bids: number;
  amount: number;
  payout: number;
  won: number;
  status: string;
}

interface Resp {
  date: string;
  market: { id: number; name: string; kind: string };
  result: string | null;
  rows: DigitRow[];
  totals: { numbers: number; bids: number; amount: number; payout: number; won: number; profit: number };
}

interface Filters {
  marketId: string;
  gameType: string;
  session: string;
  date: string;
}

/** Reports → Bidding Report: points bid on each number of one game, type and session. */
export function BiddingReport() {
  const opts = useR2Options();
  const [f, setF] = useState<Filters>(() => ({ marketId: '', gameType: 'all', session: 'all', date: today() }));
  const report = useReport<Resp>('/reports/bidding');
  const [exporting, runExport] = useAction();
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((s) => ({ ...s, [k]: v }));

  const kind = kindOfGame(f.marketId, opts);
  const types = useMemo(() => typesFor(opts, kind), [opts, kind]);
  useEffect(() => {
    if (f.gameType !== 'all' && opts && !types.some((t) => t.key === f.gameType)) set('gameType', 'all');
  }, [types, f.gameType, opts]);

  // open on the first main market for today
  const { submit } = report;
  const first = opts?.markets.find((m) => m.kind === 'main') ?? opts?.markets[0];
  useEffect(() => {
    if (!first) return;
    setF((s) => (s.marketId ? s : { ...s, marketId: String(first.id) }));
    submit({ marketId: String(first.id), gameType: 'all', session: 'all', date: today() });
  }, [first, submit]);

  const run = () => submit({ ...f, session: kind === 'main' ? f.session : 'all' });
  const cancel = () => {
    const reset = { marketId: first ? String(first.id) : '', gameType: 'all', session: 'all', date: today() };
    setF(reset);
    if (first) submit(reset);
  };

  const data = report.data;
  const showType = !!data && new Set(data.rows.map((r) => r.gameType)).size > 1;
  const showSession = !!data && data.market.kind === 'main' && new Set(data.rows.map((r) => r.session)).size > 1;

  const columns: Column<DigitRow>[] = [
    srColumn('Sr.'),
    { key: 'date', label: 'Date', render: (r) => dateOnly(r.date) },
    ...(showType ? [{ key: 'typeLabel', label: 'Game Type' } as Column<DigitRow>] : []),
    ...(showSession
      ? [{ key: 'session', label: 'Session', render: (r: DigitRow) => sessionText(r.session) } as Column<DigitRow>]
      : []),
    { key: 'pick', label: 'Bidding Digit', render: (r) => <strong>{r.pick}</strong> },
    { key: 'bids', label: 'Bids', align: 'right' },
    { key: 'amount', label: 'Bidding Points', align: 'right', render: (r) => amt(r.amount) },
    { key: 'payout', label: 'Winning Points', align: 'right', render: (r) => amt(r.payout) },
    {
      key: 'won',
      label: 'Paid',
      align: 'right',
      render: (r) => (r.won > 0 ? <span className="loss">{amt(r.won)}</span> : r.status === 'pending' ? '--' : '0'),
    },
    { key: 'status', label: 'Status', align: 'center', render: (r) => <BidStatus status={r.status} /> },
  ];
  const lead = 2 + (showType ? 1 : 0) + (showSession ? 1 : 0) + 1;

  const doExport = () =>
    runExport(async () => {
      if (!data) return;
      exportCsv(
        `bidding-report-${data.market.name}-${data.date}`,
        ['Sr.', 'Date', 'Game', 'Game Type', 'Session', 'Bidding Digit', 'Bids', 'Bidding Points', 'Winning Points', 'Paid', 'Status'],
        data.rows.map((r, i) => [
          i + 1,
          dateOnly(r.date),
          data.market.name,
          r.typeLabel,
          sessionText(r.session),
          r.pick,
          r.bids,
          r.amount,
          r.payout,
          r.won,
          bidStatusText(r.status),
        ]),
      );
    });

  return (
    <Page title="Bidding Report">
      <ReportFilter
        title="Bidding Report"
        onSubmit={run}
        onCancel={cancel}
        onExport={doExport}
        busy={report.loading}
        exporting={exporting}
        canExport={!!data}
      >
        <Field label="Game Name">
          <GameSelect value={f.marketId} onChange={(v) => set('marketId', v)} opts={opts} />
        </Field>
        <Field label="Game Type">
          <GameTypeSelect value={f.gameType} onChange={(v) => set('gameType', v)} types={types} />
        </Field>
        <Field label="Game Session">
          <SessionSelect value={f.session} onChange={(v) => set('session', v)} disabled={!!kind && kind !== 'main'} />
        </Field>
        <Field label="Date">
          <input type="date" value={f.date} max={today()} onChange={(e) => set('date', e.target.value || today())} />
        </Field>
      </ReportFilter>

      <Card
        title={data ? `${data.market.name} · ${dateOnly(data.date)}` : undefined}
        actions={
          data && (
            <span className="muted" style={{ fontWeight: 700 }}>
              Result: <Chip tone={data.result ? 'info' : ''}>{data.result ?? 'Not declared'}</Chip>
            </span>
          )
        }
      >
        <LoadingLine show={report.loading} />
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => `${r.gameType}-${r.session}-${r.pick}`}
          footer={
            data && data.rows.length > 0 ? (
              <tr>
                <td colSpan={lead} className="right">
                  Total ({data.totals.numbers} numbers)
                </td>
                <td className="right">{data.totals.bids}</td>
                <td className="right">{amt(data.totals.amount)}</td>
                <td className="right">{amt(data.totals.payout)}</td>
                <td className="right">{amt(data.totals.won)}</td>
                <td>
                  P/L: <ProfitLoss value={data.totals.profit} />
                </td>
              </tr>
            ) : undefined
          }
        />
        <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>
          Winning Points is what the number pays if it wins (points × rate). Paid is what was actually credited.
          Refunded bids are left out.
        </p>
      </Card>
    </Page>
  );
}
