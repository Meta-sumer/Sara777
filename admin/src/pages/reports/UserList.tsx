import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { exportCsv } from '../../export';
import { amt, dateOnly, dt, today } from '../../format';
import { Btn, Card, type Column, DataTable, Field, Page, srColumn, useAction } from '../../ui';
import {
  CheckField,
  LoadingLine,
  ReportFilter,
  RequestStatus,
  Tabs,
  UserLink,
  UserStatus,
  userStatusText,
  useReport,
} from './r2Common';

type Tab = 'zero' | 'first-withdraw' | 'multiple';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'zero', label: 'Zero Balance Users' },
  { key: 'first-withdraw', label: 'First Time Withdraw' },
  { key: 'multiple', label: 'Users With Multiple Accounts' },
];

/** Reports → List Of Users ("User Lists"). */
export function UserList() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'zero') as Tab;
  return (
    <Page title="User Lists">
      <Tabs tabs={TABS} value={tab} onChange={(k) => setParams({ tab: k }, { replace: true })} />
      {tab === 'zero' && <ZeroBalance />}
      {tab === 'first-withdraw' && <FirstWithdraw />}
      {tab === 'multiple' && <MultipleAccounts />}
    </Page>
  );
}

interface RangeFilters {
  from: string;
  to: string;
  allDates: boolean;
}

const start = (): RangeFilters => ({ from: today(), to: today(), allDates: false });
const asQuery = (tab: Tab, f: RangeFilters) => ({ tab, from: f.from, to: f.to, allDates: f.allDates ? '1' : '' });

function RangeFields({ f, setF }: { f: RangeFilters; setF: (fn: (s: RangeFilters) => RangeFilters) => void }) {
  return (
    <>
      <Field label="Start Date">
        <input
          type="date"
          value={f.from}
          max={today()}
          disabled={f.allDates}
          onChange={(e) => setF((s) => ({ ...s, from: e.target.value || today() }))}
        />
      </Field>
      <Field label="End Date">
        <input
          type="date"
          value={f.to}
          max={today()}
          disabled={f.allDates}
          onChange={(e) => setF((s) => ({ ...s, to: e.target.value || today() }))}
        />
      </Field>
      <CheckField label="Get all users" checked={f.allDates} onChange={(v) => setF((s) => ({ ...s, allDates: v }))} />
    </>
  );
}

const fileSuffix = (f: RangeFilters) => (f.allDates ? 'all' : `${f.from}-to-${f.to}`);

/* ------------------------------------------------------------ zero balance */

interface ZeroRow {
  userId: number;
  name: string;
  username: string;
  mobile: string;
  createdAt: string;
  lastSeenAt: string | null;
  deposits: number;
  status: string;
}

function ZeroBalance() {
  const [f, setF] = useState<RangeFilters>(start);
  const report = useReport<{ rows: ZeroRow[] }>('/reports/user-list');
  const [exporting, runExport] = useAction();
  const [ran, setRan] = useState<RangeFilters>(start);

  const { submit } = report;
  useEffect(() => submit(asQuery('zero', start())), [submit]);
  const run = () => {
    setRan(f);
    submit(asQuery('zero', f));
  };
  const cancel = () => {
    setF(start());
    setRan(start());
    submit(asQuery('zero', start()));
  };

  const columns: Column<ZeroRow>[] = [
    srColumn('Sr.'),
    { key: 'createdAt', label: 'Date', render: (r) => dateOnly(r.createdAt), value: (r) => r.createdAt },
    { key: 'name', label: 'User' },
    { key: 'username', label: 'User Name', render: (r) => <UserLink id={r.userId} username={r.username} /> },
    { key: 'mobile', label: 'Mobile' },
    { key: 'deposits', label: 'Deposits Made', align: 'center' },
    { key: 'lastSeenAt', label: 'Last Seen', render: (r) => dt(r.lastSeenAt) },
    { key: 'status', label: 'Status', align: 'center', render: (r) => <UserStatus status={r.status} /> },
  ];

  const rows = report.data?.rows;
  const doExport = () =>
    runExport(async () => {
      if (!rows) return;
      exportCsv(
        `zero-balance-users-${fileSuffix(ran)}`,
        ['Sr.', 'Registered On', 'User', 'User Name', 'Mobile', 'Deposits Made', 'Last Seen', 'Status'],
        rows.map((r, i) => [i + 1, dateOnly(r.createdAt), r.name, r.username, r.mobile, r.deposits, dt(r.lastSeenAt), userStatusText(r.status)]),
      );
    });

  return (
    <>
      <ReportFilter
        title="Zero(0) Balance Users"
        attached
        onSubmit={run}
        onCancel={cancel}
        onExport={doExport}
        busy={report.loading}
        exporting={exporting}
        canExport={!!rows}
      >
        <RangeFields f={f} setF={setF} />
      </ReportFilter>
      <Card>
        <LoadingLine show={report.loading} />
        <DataTable columns={columns} rows={rows ?? []} rowKey={(r) => r.userId} />
        <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>
          Users who registered in the range and have a zero wallet balance now. Deleted users are left out.
        </p>
      </Card>
    </>
  );
}

/* ------------------------------------------------------- first withdraw */

interface FirstRow {
  requestId: number;
  userId: number;
  requestedAt: string;
  amount: number;
  status: string;
  mode: string | null;
  fullName: string | null;
  name: string;
  username: string;
  mobile: string;
}

function FirstWithdraw() {
  const [f, setF] = useState<RangeFilters>(start);
  const [ran, setRan] = useState<RangeFilters>(start);
  const report = useReport<{ rows: FirstRow[] }>('/reports/user-list');
  const [exporting, runExport] = useAction();

  const { submit } = report;
  useEffect(() => submit(asQuery('first-withdraw', start())), [submit]);
  const run = () => {
    setRan(f);
    submit(asQuery('first-withdraw', f));
  };
  const cancel = () => {
    setF(start());
    setRan(start());
    submit(asQuery('first-withdraw', start()));
  };

  const columns: Column<FirstRow>[] = [
    srColumn('Sr.no'),
    { key: 'requestedAt', label: 'Requested At', render: (r) => dt(r.requestedAt), value: (r) => r.requestedAt },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => amt(r.amount) },
    { key: 'fullName', label: 'Full Name', render: (r) => r.fullName ?? '--' },
    { key: 'username', label: 'User Name', render: (r) => <UserLink id={r.userId} username={r.username} /> },
    { key: 'mobile', label: 'Mobile' },
    { key: 'mode', label: 'Mode', render: (r) => (r.mode ? r.mode.charAt(0).toUpperCase() + r.mode.slice(1) : '--') },
    { key: 'status', label: 'Status', align: 'center', render: (r) => <RequestStatus status={r.status} /> },
  ];

  const rows = report.data?.rows;
  const doExport = () =>
    runExport(async () => {
      if (!rows) return;
      exportCsv(
        `first-time-withdraw-${fileSuffix(ran)}`,
        ['Sr.no', 'Requested At', 'Amount', 'Full Name', 'User Name', 'Name', 'Mobile', 'Mode', 'Status'],
        rows.map((r, i) => [i + 1, dt(r.requestedAt), r.amount, r.fullName, r.username, r.name, r.mobile, r.mode, r.status]),
      );
    });

  return (
    <>
      <ReportFilter
        title="First Time Withdraw Users"
        attached
        onSubmit={run}
        onCancel={cancel}
        onExport={doExport}
        busy={report.loading}
        exporting={exporting}
        canExport={!!rows}
      >
        <RangeFields f={f} setF={setF} />
      </ReportFilter>
      <Card>
        <LoadingLine show={report.loading} />
        <DataTable columns={columns} rows={rows ?? []} rowKey={(r) => r.requestId} />
        <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>
          Each user's first ever withdraw request, listed when it falls in the range. Full Name is the account holder
          name on the request's payout details.
        </p>
      </Card>
    </>
  );
}

/* ---------------------------------------------------- multiple accounts */

interface MultiRow {
  accountNo: string;
  fullNames: string[];
  users: Array<{ id: number; username: string; name: string }>;
  totalAccounts: number;
  createdAt: string;
  updatedAt: string | null;
}

function MultipleAccounts() {
  const report = useReport<{ rows: MultiRow[] }>('/reports/user-list');
  const [exporting, runExport] = useAction();
  const { submit } = report;
  useEffect(() => submit({ tab: 'multiple' }), [submit]);

  const columns: Column<MultiRow>[] = [
    srColumn('Sr.'),
    { key: 'accountNo', label: 'Account No', render: (r) => <strong>{r.accountNo}</strong> },
    { key: 'fullNames', label: 'Full Name', className: 'wrap', value: (r) => r.fullNames.join(', ') },
    {
      key: 'users',
      label: 'User Names',
      className: 'wrap',
      value: (r) => r.users.map((u) => `${u.username} ${u.name}`).join(' '),
      render: (r) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', minWidth: 200 }}>
          {r.users.map((u) => (
            <span key={u.id}>
              <UserLink id={u.id} username={u.username} />
            </span>
          ))}
        </div>
      ),
    },
    { key: 'totalAccounts', label: 'Total Accounts', align: 'center' },
    { key: 'createdAt', label: 'Created', render: (r) => dt(r.createdAt), value: (r) => r.createdAt },
    { key: 'updatedAt', label: 'Updated', render: (r) => dt(r.updatedAt), value: (r) => r.updatedAt },
  ];

  const rows = report.data?.rows;
  const doExport = () =>
    runExport(async () => {
      if (!rows) return;
      exportCsv(
        'users-with-multiple-accounts',
        ['Sr.', 'Account No', 'Full Name', 'User Names', 'Total Accounts', 'Created', 'Updated'],
        rows.map((r, i) => [
          i + 1,
          r.accountNo,
          r.fullNames.join(', '),
          r.users.map((u) => u.username).join(', '),
          r.totalAccounts,
          dt(r.createdAt),
          r.updatedAt ? dt(r.updatedAt) : '',
        ]),
      );
    });

  return (
    <Card
      className="!rounded-tl-none"
      actions={
        <Btn variant="success" icon="download" onClick={doExport} disabled={!rows || exporting}>
          {exporting ? 'Exporting…' : 'Export'}
        </Btn>
      }
    >
      <LoadingLine show={report.loading} />
      <DataTable
        columns={columns}
        rows={rows ?? []}
        rowKey={(r) => r.accountNo}
        initialSort={{ key: 'totalAccounts', dir: 'desc' }}
      />
      <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>
        Bank account numbers saved by more than one app account, including older payout details from the bank change
        history. Created is when the number was first saved, Updated when it was last saved by any of these accounts.
      </p>
    </Card>
  );
}
