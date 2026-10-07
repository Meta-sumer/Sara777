import { useEffect, useMemo, useState } from 'react';
import { amt, dateOnly, dt, today } from '../../format';
import { exportCsv } from '../../export';
import { Card, type Column, DataTable, Field, Page, ProfitLoss, srColumn, useAction } from '../../ui';
import {
  BidStatus,
  GameSelect,
  GameTypeSelect,
  LoadingLine,
  type PagedResponse,
  ReportFilter,
  SessionSelect,
  bidStatusText,
  kindOfGame,
  sessionText,
  typesFor,
  useR2Options,
  useServerReport,
} from './r2Common';

interface BidRow {
  id: number;
  userId: number;
  name: string;
  username: string;
  mobile: string;
  market: string;
  kind: string;
  gameType: string;
  typeLabel: string;
  session: string | null;
  pick: string;
  amount: number;
  rate: number;
  winAmount: number;
  status: string;
  bidDate: string;
  createdAt: string;
}

interface Resp extends PagedResponse {
  date: string;
  totals: { bids: number; refunded: number; amount: number; win: number; profit: number };
  rows: BidRow[];
}

interface Filters {
  game: string;
  gameType: string;
  session: string;
  date: string;
}

const start = (): Filters => ({ game: '', gameType: 'all', session: 'all', date: today() });

/** Reports → Total Bids: every bid of a game / type / session on one day. */
export function TotalBids() {
  const opts = useR2Options();
  const [f, setF] = useState<Filters>(start);
  const report = useServerReport<Resp>('/reports/total-bids');
  const [exporting, runExport] = useAction();

  const kind = kindOfGame(f.game, opts);
  const types = useMemo(() => typesFor(opts, kind), [opts, kind]);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((s) => ({ ...s, [k]: v }));

  // a game type that the chosen market kind does not offer falls back to "All Types"
  useEffect(() => {
    if (f.gameType !== 'all' && opts && !types.some((t) => t.key === f.gameType)) set('gameType', 'all');
  }, [types, f.gameType, opts]);

  const { submit } = report;
  useEffect(() => submit({ ...start() }), [submit]);

  const run = () => submit({ ...f, session: kind && kind !== 'main' ? 'all' : f.session });

  const columns: Column<BidRow>[] = [
    srColumn('Sr'),
    {
      key: 'username',
      label: 'User',
      render: (b) => (
        <>
          <strong>{b.username}</strong>
          {b.name !== b.username && <div className="muted" style={{ fontSize: 12.5 }}>{b.name}</div>}
        </>
      ),
    },
    { key: 'market', label: 'Game' },
    { key: 'typeLabel', label: 'Type' },
    { key: 'session', label: 'Session', render: (b) => sessionText(b.session), align: 'center' },
    { key: 'pick', label: 'Bracket', align: 'center', render: (b) => <strong>{b.pick}</strong> },
    { key: 'amount', label: 'Bidding Points', align: 'right', render: (b) => amt(b.amount) },
    {
      key: 'winAmount',
      label: 'Winning Points',
      align: 'right',
      render: (b) => (b.status === 'won' ? <span className="profit">{amt(b.winAmount)}</span> : b.status === 'lost' ? '0' : '--'),
    },
    { key: 'status', label: 'Status', align: 'center', render: (b) => <BidStatus status={b.status} /> },
    { key: 'createdAt', label: 'Played On', render: (b) => dt(b.createdAt) },
  ];

  const data = report.data;
  const totals = data?.totals;

  const doExport = () =>
    runExport(async () => {
      const all = await report.fetchAll();
      exportCsv(
        `detailed-bidding-report-${all.date}`,
        ['Sr', 'Username', 'Name', 'Mobile', 'Game', 'Type', 'Session', 'Bracket', 'Bidding Points', 'Rate', 'Winning Points', 'Status', 'Game Date', 'Played On'],
        all.rows.map((b, i) => [
          i + 1,
          b.username,
          b.name,
          b.mobile,
          b.market,
          b.typeLabel,
          sessionText(b.session),
          b.pick,
          b.amount,
          b.rate,
          b.winAmount,
          bidStatusText(b.status),
          dateOnly(b.bidDate),
          dt(b.createdAt),
        ]),
      );
    });

  return (
    <Page title="Detailed Bidding Report">
      <ReportFilter
        title="Detailed Bidding Report"
        onSubmit={run}
        onExport={doExport}
        busy={report.loading}
        exporting={exporting}
        canExport={!!data}
      >
        <Field label="Game Name">
          <GameSelect value={f.game} onChange={(v) => set('game', v)} opts={opts} allLabel="All Games" kindOptions />
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

      <Card title={data ? `Bids on ${dateOnly(data.date)}` : undefined}>
        <LoadingLine show={report.loading} />
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(b) => b.id}
          server={data ? report.server : undefined}
          footer={
            totals && totals.bids > 0 ? (
              <tr>
                <td colSpan={6} className="right">
                  Total ({totals.bids - totals.refunded} bids{totals.refunded ? `, ${totals.refunded} refunded left out` : ''})
                </td>
                <td className="right">{amt(totals.amount)}</td>
                <td className="right">{amt(totals.win)}</td>
                <td colSpan={2}>
                  Profit/Loss: <ProfitLoss value={totals.profit} />
                </td>
              </tr>
            ) : undefined
          }
        />
      </Card>
    </Page>
  );
}
