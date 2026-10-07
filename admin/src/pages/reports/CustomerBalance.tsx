import { useEffect, useState } from 'react';
import { exportCsv } from '../../export';
import { amt, dt, fmt } from '../../format';
import { Card, type Column, DataTable, Field, Page, srColumn, useAction } from '../../ui';
import {
  CheckField,
  LoadingLine,
  type PagedResponse,
  ReportFilter,
  TotalsLine,
  UserLink,
  UserStatus,
  userStatusText,
  useServerReport,
} from './r2Common';

interface BalanceRow {
  userId: number;
  name: string;
  username: string;
  mobile: string;
  balance: number;
  lastTxnAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  status: string;
}

interface Resp extends PagedResponse {
  totals: { users: number; balance: number };
  overall: { users: number; balance: number };
  rows: BalanceRow[];
}

interface Filters {
  min: string;
  max: string;
  status: string;
  hideZero: boolean;
  deleted: boolean;
}

const start = (): Filters => ({ min: '', max: '', status: 'all', hideZero: true, deleted: false });
const asQuery = (f: Filters) => ({
  min: f.min.trim(),
  max: f.max.trim(),
  status: f.status,
  hideZero: f.hideZero ? '1' : '0',
  deleted: f.deleted ? '1' : '0',
});

/**
 * Reports → Customer Balance (no reference screenshot): every wallet, largest
 * first, with the total the house owes its players.
 */
export function CustomerBalance() {
  const [f, setF] = useState<Filters>(start);
  const report = useServerReport<Resp>('/reports/customer-balance', 25);
  const [exporting, runExport] = useAction();
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((s) => ({ ...s, [k]: v }));

  const { submit } = report;
  useEffect(() => submit(asQuery(start())), [submit]);
  const cancel = () => {
    setF(start());
    submit(asQuery(start()));
  };

  const columns: Column<BalanceRow>[] = [
    srColumn('Sr.'),
    { key: 'username', label: 'User Name', render: (r) => <UserLink id={r.userId} username={r.username} /> },
    { key: 'name', label: 'Name' },
    { key: 'mobile', label: 'Mobile' },
    { key: 'balance', label: 'Balance', align: 'right', render: (r) => <strong>{amt(r.balance)}</strong> },
    { key: 'lastTxnAt', label: 'Last Transaction', render: (r) => dt(r.lastTxnAt) },
    { key: 'lastSeenAt', label: 'Last Seen', render: (r) => dt(r.lastSeenAt) },
    { key: 'createdAt', label: 'Registered', render: (r) => dt(r.createdAt) },
    { key: 'status', label: 'Status', align: 'center', render: (r) => <UserStatus status={r.status} /> },
  ];

  const data = report.data;

  const doExport = () =>
    runExport(async () => {
      const all = await report.fetchAll();
      exportCsv(
        'customer-balance',
        ['Sr.', 'User Name', 'Name', 'Mobile', 'Balance', 'Last Transaction', 'Last Seen', 'Registered', 'Status'],
        [
          ...all.rows.map((r, i) => [
            i + 1,
            r.username,
            r.name,
            r.mobile,
            r.balance,
            dt(r.lastTxnAt),
            dt(r.lastSeenAt),
            dt(r.createdAt),
            userStatusText(r.status),
          ]),
          ['', 'Total', '', '', all.totals.balance, '', '', '', ''],
        ],
      );
    });

  return (
    <Page title="Customer Balance">
      <ReportFilter
        title="Customer Balance"
        onSubmit={() => submit(asQuery(f))}
        onCancel={cancel}
        onExport={doExport}
        busy={report.loading}
        exporting={exporting}
        canExport={!!data}
      >
        <Field label="Minimum Balance">
          <input type="number" min={0} step="any" value={f.min} placeholder="Any" onChange={(e) => set('min', e.target.value)} />
        </Field>
        <Field label="Maximum Balance">
          <input type="number" min={0} step="any" value={f.max} placeholder="Any" onChange={(e) => set('max', e.target.value)} />
        </Field>
        <Field label="Status">
          <select value={f.status} onChange={(e) => set('status', e.target.value)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
          </select>
        </Field>
        <CheckField label="Hide zero balances" checked={f.hideZero} onChange={(v) => set('hideZero', v)} />
        <CheckField label="Include deleted users" checked={f.deleted} onChange={(v) => set('deleted', v)} />
      </ReportFilter>

      <Card>
        <LoadingLine show={report.loading} />
        <DataTable columns={columns} rows={data?.rows ?? []} rowKey={(r) => r.userId} server={data ? report.server : undefined} />
        {data && (
          <TotalsLine>
            {fmt(data.totals.users)} users, Total Balance: {amt(data.totals.balance)}
            <span className="muted" style={{ fontWeight: 600 }}>
              {' '}
              (all wallets: {amt(data.overall.balance)} across {fmt(data.overall.users)} users)
            </span>
          </TotalsLine>
        )}
      </Card>
    </Page>
  );
}
