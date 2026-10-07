import { useState } from 'react';
import { type Player, PlayerSelect } from '../../components/PlayerSelect';
import { exportCsv } from '../../export';
import { KIND_LABEL, amt, dateOnly, dt, fmt } from '../../format';
import { Btn, Card, type Column, DataTable, Field, Page, ProfitLoss, TitleCard, srColumn, useAction, useToast } from '../../ui';
import {
  BidStatus,
  LoadingLine,
  type PagedResponse,
  ReportFilter,
  UserStatus,
  bidStatusText,
  sessionText,
  useServerReport,
} from './r2Common';

interface SummaryRow {
  market: string;
  kind: string;
  gameType: string;
  typeLabel: string;
  bids: number;
  amount: number;
  win: number;
  profit: number;
}

interface BidRow {
  id: number;
  pick: string;
  amount: number;
  rate: number;
  market: string;
  kind: string;
  gameType: string;
  typeLabel: string;
  session: string | null;
  bidDate: string;
  createdAt: string;
  status: string;
  winAmount: number;
}

interface Resp extends PagedResponse {
  kind: string;
  from: string | null;
  to: string | null;
  user: {
    id: number;
    name: string;
    username: string;
    mobile: string;
    balance: number;
    createdAt: string;
    lastSeenAt: string | null;
    status: string;
  };
  stats: {
    won: number;
    lost: number;
    pending: number;
    pendingAmount: number;
    refunded: number;
    firstDate: string | null;
    lastDate: string | null;
  };
  summary: SummaryRow[];
  totals: { bids: number; amount: number; win: number; profit: number };
  rows: BidRow[];
}

interface Filters {
  kind: string;
  from: string;
  to: string;
}

const start = (): Filters => ({ kind: 'main', from: '', to: '' });

/** Reports → All User Bids: one player's bids with profit/loss per provider and game type. */
export function AllUserBids() {
  const [f, setF] = useState<Filters>(start);
  const [player, setPlayer] = useState<Player | null>(null);
  const report = useServerReport<Resp>('/reports/all-user-bids', 50);
  const [exporting, runExport] = useAction();
  const toast = useToast();
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((s) => ({ ...s, [k]: v }));

  const run = () => {
    if (!player) {
      toast('Select a player first', true);
      return;
    }
    if ((f.from && !f.to) || (!f.from && f.to)) {
      toast('Fill both dates, or leave both empty for all dates', true);
      return;
    }
    report.submit({ userId: String(player.id), ...f });
  };
  const cancel = () => {
    setF(start());
    setPlayer(null);
    report.clear();
  };

  const data = report.data;

  const summaryCols: Column<SummaryRow>[] = [
    { key: 'market', label: 'Provider' },
    { key: 'typeLabel', label: 'Type' },
    { key: 'bids', label: 'Bids', align: 'right' },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => amt(r.amount) },
    { key: 'win', label: 'Win', align: 'right', render: (r) => amt(r.win) },
    { key: 'profit', label: 'P/L', align: 'right', render: (r) => <ProfitLoss value={r.profit} /> },
  ];

  const columns: Column<BidRow>[] = [
    srColumn('Sr.'),
    { key: 'pick', label: 'Bracket', align: 'center', render: (b) => <strong>{b.pick}</strong> },
    { key: 'amount', label: 'Amount', align: 'right', render: (b) => amt(b.amount) },
    { key: 'market', label: 'Provider' },
    { key: 'typeLabel', label: 'Type' },
    { key: 'session', label: 'Session', align: 'center', render: (b) => sessionText(b.session) },
    { key: 'bidDate', label: 'Game Date', render: (b) => dateOnly(b.bidDate) },
    { key: 'createdAt', label: 'Played on', render: (b) => dt(b.createdAt) },
    {
      key: 'status',
      label: 'Win Status',
      align: 'center',
      render: (b) => (
        <>
          <BidStatus status={b.status} />
          {b.status === 'won' && <div className="profit" style={{ fontSize: 12.5, marginTop: 3 }}>{amt(b.winAmount)}</div>}
        </>
      ),
    },
  ];

  const doExport = () =>
    runExport(async () => {
      const all = await report.fetchAll();
      exportCsv(
        `user-bids-${all.user.username}-${all.kind}`,
        ['Sr.', 'Bracket', 'Amount', 'Provider', 'Type', 'Session', 'Game Date', 'Played on', 'Win Status', 'Win Amount'],
        all.rows.map((b, i) => [
          i + 1,
          b.pick,
          b.amount,
          b.market,
          b.typeLabel,
          sessionText(b.session),
          dateOnly(b.bidDate),
          dt(b.createdAt),
          bidStatusText(b.status),
          b.winAmount,
        ]),
      );
    });

  return (
    <Page title="All User Bids">
      <div className="grid-halves" style={{ marginBottom: 20 }}>
        <div>
          <ReportFilter title="Users Bids" onSubmit={run} onCancel={cancel} busy={report.loading}>
            <Field label="Player Name">
              <PlayerSelect value={player} onChange={setPlayer} />
            </Field>
            <Field label="Market">
              <select value={f.kind} onChange={(e) => set('kind', e.target.value)}>
                <option value="main">{KIND_LABEL.main}</option>
                <option value="starline">{KIND_LABEL.starline}</option>
                <option value="andarbahar">{KIND_LABEL.andarbahar}</option>
                <option value="all">All Markets</option>
              </select>
            </Field>
            <Field label="Start Date (optional)">
              <input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} />
            </Field>
            <Field label="End Date (optional)">
              <input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} />
            </Field>
          </ReportFilter>

          {data && (
            <Card title="Player">
              <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 18px', margin: 0 }}>
                <dt className="muted">Name</dt>
                <dd style={{ margin: 0 }}>
                  <strong>{data.user.name}</strong> ({data.user.username})
                </dd>
                <dt className="muted">Mobile</dt>
                <dd style={{ margin: 0 }}>{data.user.mobile}</dd>
                <dt className="muted">Wallet Balance</dt>
                <dd style={{ margin: 0 }}>
                  <strong>{amt(data.user.balance)}</strong>
                </dd>
                <dt className="muted">Status</dt>
                <dd style={{ margin: 0 }}>
                  <UserStatus status={data.user.status} />
                </dd>
                <dt className="muted">Registered</dt>
                <dd style={{ margin: 0 }}>{dt(data.user.createdAt)}</dd>
                <dt className="muted">Market</dt>
                <dd style={{ margin: 0 }}>
                  {data.kind === 'all' ? 'All Markets' : KIND_LABEL[data.kind]}
                  {data.from && data.to ? `, ${dateOnly(data.from)} to ${dateOnly(data.to)}` : ', all dates'}
                </dd>
                <dt className="muted">Bids</dt>
                <dd style={{ margin: 0 }}>
                  {fmt(data.stats.won)} won · {fmt(data.stats.lost)} lost · {fmt(data.stats.pending)} pending
                  {data.stats.pending > 0 && ` (${amt(data.stats.pendingAmount)})`}
                  {data.stats.refunded > 0 && ` · ${fmt(data.stats.refunded)} refunded`}
                </dd>
                <dt className="muted">Played</dt>
                <dd style={{ margin: 0 }}>
                  {data.stats.firstDate ? `${dateOnly(data.stats.firstDate)} to ${dateOnly(data.stats.lastDate)}` : '--'}
                </dd>
              </dl>
            </Card>
          )}
        </div>

        <div>
          <TitleCard>Profit/Loss Calculations</TitleCard>
          <Card>
            <DataTable
              columns={summaryCols}
              rows={data?.summary ?? []}
              rowKey={(r) => `${r.market}-${r.gameType}`}
              paginate={false}
              searchable={false}
              empty={data ? 'No bids for this filter' : 'Select a player and press Submit'}
              footer={
                data && data.summary.length > 0 ? (
                  <tr>
                    <td colSpan={2}>Total</td>
                    <td className="right">{fmt(data.totals.bids)}</td>
                    <td className="right">{amt(data.totals.amount)}</td>
                    <td className="right">{amt(data.totals.win)}</td>
                    <td className="right">
                      <ProfitLoss value={data.totals.profit} />
                    </td>
                  </tr>
                ) : undefined
              }
            />
            <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>
              P/L is the house's: Amount − Win. Refunded bids are left out.
            </p>
          </Card>
        </div>
      </div>

      <Card
        title={data ? `Bids of ${data.user.username}` : 'Bids'}
        actions={
          <Btn variant="success" icon="download" onClick={doExport} disabled={!data || exporting}>
            {exporting ? 'Exporting…' : 'Export'}
          </Btn>
        }
      >
        <LoadingLine show={report.loading} />
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(b) => b.id}
          pageSize={50}
          server={data ? report.server : undefined}
        />
      </Card>
    </Page>
  );
}
