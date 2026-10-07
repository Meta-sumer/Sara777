import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type Player, PlayerSelect } from '../../components/PlayerSelect';
import { exportCsv } from '../../export';
import { amt, dateOnly, today } from '../../format';
import { Card, type Column, DataTable, Field, Page, srColumn, useAction } from '../../ui';
import {
  GameSelect,
  LoadingLine,
  type PagedResponse,
  ReportFilter,
  Signed,
  Tabs,
  TotalsLine,
  UserLink,
  useR2Options,
  useReport,
  useServerReport,
} from './r2Common';

type Tab = 'top' | 'deposit' | 'bidding';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'top', label: 'Top Users' },
  { key: 'deposit', label: 'Max Deposit/Withdraw' },
  { key: 'bidding', label: 'Max Bidding/Winning' },
];

interface UserRow {
  userId: number;
  date?: string;
  name: string;
  username: string;
  mobile: string;
  deposit: number;
  withdraw: number;
  bid: number;
  win: number;
  profit: number;
}

interface Totals {
  deposit: number;
  withdraw: number;
  bid: number;
  win: number;
  profit: number;
}

interface TopResp extends PagedResponse {
  from: string;
  to: string;
  rows: UserRow[];
  totals: Totals;
}

interface ListResp {
  from: string;
  to: string;
  rows: UserRow[];
  totals: Totals;
}

/** Reports → User Reports: Top Users, Max Deposit/Withdraw, Max Bidding/Winning. */
export function UserReport() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'top') as Tab;
  return (
    <Page title="User Report">
      <Tabs tabs={TABS} value={tab} onChange={(k) => setParams({ tab: k }, { replace: true })} />
      {tab === 'top' && <TopUsers />}
      {tab === 'deposit' && <UserMoneyList tab="deposit" />}
      {tab === 'bidding' && <UserMoneyList tab="bidding" />}
    </Page>
  );
}

interface Filters {
  from: string;
  to: string;
  marketId: string;
}

const start = (): Filters => ({ from: today(), to: today(), marketId: '' });

function money(value: number) {
  return <Signed value={value} text={amt(value)} />;
}

const userCol: Column<UserRow> = {
  key: 'username',
  label: 'UserName',
  render: (r) => <UserLink id={r.userId} username={r.username} name={r.name} />,
};

function TopUsers() {
  const opts = useR2Options();
  const [f, setF] = useState<Filters>(start);
  const [player, setPlayer] = useState<Player | null>(null);
  const report = useServerReport<TopResp>('/reports/user-report');
  const [exporting, runExport] = useAction();

  const { submit } = report;
  useEffect(() => submit({ tab: 'top', ...start() }), [submit]);

  const run = () => submit({ tab: 'top', ...f, userId: player ? String(player.id) : '' });
  const cancel = () => {
    setF(start());
    setPlayer(null);
    submit({ tab: 'top', ...start() });
  };

  const columns: Column<UserRow>[] = [
    srColumn('Sr.'),
    { key: 'date', label: 'Date', render: (r) => dateOnly(r.date) },
    userCol,
    { key: 'mobile', label: 'Mobile' },
    { key: 'deposit', label: 'Deposit', align: 'right', render: (r) => amt(r.deposit) },
    { key: 'withdraw', label: 'Withdraw', align: 'right', render: (r) => amt(r.withdraw) },
    { key: 'bid', label: 'Bid Amount', align: 'right', render: (r) => amt(r.bid) },
    { key: 'win', label: 'Win Amount', align: 'right', render: (r) => amt(r.win) },
    { key: 'profit', label: 'Profit', align: 'right', render: (r) => money(r.profit) },
  ];

  const data = report.data;
  const t = data?.totals;

  const doExport = () =>
    runExport(async () => {
      const all = await report.fetchAll();
      exportCsv(
        `top-users-${all.from}-to-${all.to}`,
        ['Sr.', 'Date', 'UserName', 'Name', 'Mobile', 'Deposit', 'Withdraw', 'Bid Amount', 'Win Amount', 'Profit'],
        [
          ...all.rows.map((r, i) => [i + 1, dateOnly(r.date), r.username, r.name, r.mobile, r.deposit, r.withdraw, r.bid, r.win, r.profit]),
          ['', 'Total', '', '', '', all.totals.deposit, all.totals.withdraw, all.totals.bid, all.totals.win, all.totals.profit],
        ],
      );
    });

  return (
    <>
      <ReportFilter
        title="Top Users"
        attached
        onSubmit={run}
        onCancel={cancel}
        onExport={doExport}
        busy={report.loading}
        exporting={exporting}
        canExport={!!data}
      >
        <DateFields f={f} setF={setF} />
        <Field label="Provider Name">
          <GameSelect value={f.marketId} onChange={(v) => setF((s) => ({ ...s, marketId: v }))} opts={opts} allLabel="All" />
        </Field>
        <Field label="Player Name">
          <PlayerSelect value={player} onChange={setPlayer} placeholder="Type Username" />
        </Field>
      </ReportFilter>

      <Card>
        <LoadingLine show={report.loading} />
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => `${r.userId}-${r.date}`}
          server={data ? report.server : undefined}
        />
        {t && data && data.total > 0 && (
          <TotalsLine>
            Total Deposit: {amt(t.deposit)}, Withdraw: {amt(t.withdraw)}, Bid: {amt(t.bid)}, Win: {amt(t.win)}, Profit:{' '}
            {money(t.profit)}
          </TotalsLine>
        )}
      </Card>
    </>
  );
}

/** Max Deposit/Withdraw and Max Bidding/Winning: one row per user over the range, biggest net winners first. */
function UserMoneyList({ tab }: { tab: 'deposit' | 'bidding' }) {
  const opts = useR2Options();
  const [f, setF] = useState<Filters>(start);
  const [player, setPlayer] = useState<Player | null>(null);
  const report = useReport<ListResp>('/reports/user-report');
  const [exporting, runExport] = useAction();
  const isDeposit = tab === 'deposit';

  const { submit } = report;
  useEffect(() => submit({ tab, ...start() }), [submit, tab]);

  const run = () => submit({ tab, ...f, marketId: isDeposit ? '' : f.marketId, userId: player ? String(player.id) : '' });
  const cancel = () => {
    setF(start());
    setPlayer(null);
    submit({ tab, ...start() });
  };

  const columns: Column<UserRow>[] = [
    srColumn('Sr.'),
    userCol,
    { key: 'mobile', label: 'Mobile' },
    ...(isDeposit
      ? ([
          { key: 'deposit', label: 'Deposit', align: 'right', render: (r) => amt(r.deposit) },
          { key: 'withdraw', label: 'Withdraw', align: 'right', render: (r) => amt(r.withdraw) },
        ] as Column<UserRow>[])
      : ([
          { key: 'bid', label: 'Bid Amount', align: 'right', render: (r) => amt(r.bid) },
          { key: 'win', label: 'Win Amount', align: 'right', render: (r) => amt(r.win) },
        ] as Column<UserRow>[])),
    { key: 'profit', label: 'Profit', align: 'right', render: (r) => money(r.profit) },
  ];

  const data = report.data;
  const t = data?.totals;
  const title = isDeposit ? 'User Report For Deposit and Withdraw' : 'User Report For Bidding and Winning';

  const doExport = () =>
    runExport(async () => {
      if (!data || !t) return;
      const [a, b] = isDeposit ? (['Deposit', 'Withdraw'] as const) : (['Bid Amount', 'Win Amount'] as const);
      exportCsv(
        `${isDeposit ? 'max-deposit-withdraw' : 'max-bidding-winning'}-${data.from}-to-${data.to}`,
        ['Sr.', 'UserName', 'Name', 'Mobile', a, b, 'Profit'],
        [
          ...data.rows.map((r, i) => [
            i + 1,
            r.username,
            r.name,
            r.mobile,
            isDeposit ? r.deposit : r.bid,
            isDeposit ? r.withdraw : r.win,
            r.profit,
          ]),
          ['', 'Total', '', '', isDeposit ? t.deposit : t.bid, isDeposit ? t.withdraw : t.win, t.profit],
        ],
      );
    });

  return (
    <>
      <ReportFilter
        title={title}
        attached
        onSubmit={run}
        onCancel={cancel}
        onExport={doExport}
        busy={report.loading}
        exporting={exporting}
        canExport={!!data}
      >
        <DateFields f={f} setF={setF} />
        {!isDeposit && (
          <Field label="Provider Name">
            <GameSelect value={f.marketId} onChange={(v) => setF((s) => ({ ...s, marketId: v }))} opts={opts} allLabel="All" />
          </Field>
        )}
        <Field label="Player Name">
          <PlayerSelect value={player} onChange={setPlayer} placeholder="Type Username" />
        </Field>
      </ReportFilter>

      <Card>
        <LoadingLine show={report.loading} />
        <DataTable columns={columns} rows={data?.rows ?? []} rowKey={(r) => r.userId} />
        {t && data && data.rows.length > 0 && (
          <TotalsLine>
            {isDeposit
              ? <>Total Deposit: {amt(t.deposit)}, Withdraw: {amt(t.withdraw)}, Profit: {money(t.profit)}</>
              : <>Total Bid: {amt(t.bid)}, Win: {amt(t.win)}, Profit: {money(t.profit)}</>}
          </TotalsLine>
        )}
        <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>
          {isDeposit
            ? 'Profit = Deposit − Withdraw (approved or completed requests). Users who took the most out come first.'
            : 'Profit = Bid Amount − Win Amount, refunded bids left out. The biggest net winners come first.'}
        </p>
      </Card>
    </>
  );
}

function DateFields({ f, setF }: { f: Filters; setF: (fn: (s: Filters) => Filters) => void }) {
  return (
    <>
      <Field label="Start Date">
        <input type="date" value={f.from} max={today()} onChange={(e) => setF((s) => ({ ...s, from: e.target.value || today() }))} />
      </Field>
      <Field label="End Date">
        <input type="date" value={f.to} max={today()} onChange={(e) => setF((s) => ({ ...s, to: e.target.value || today() }))} />
      </Field>
    </>
  );
}
