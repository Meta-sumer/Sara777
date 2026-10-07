import { useEffect, useState } from 'react';
import { api } from '../../api';
import { type Player, PlayerSelect } from '../../components/PlayerSelect';
import { exportCsv } from '../../export';
import { amt, dt, today } from '../../format';
import { Card, Chip, type Column, DataTable, Field, Page, ProfitLoss, srColumn, useAction } from '../../ui';
import { LoadingLine, type PagedResponse, ReportFilter, TotalsLine, useServerReport } from './r2Common';

interface TxnRow {
  id: number;
  userId: number;
  name: string;
  username: string;
  mobile: string;
  type: string;
  direction: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  particulars: string;
  description: string | null;
  mode: string | null;
  ref: string | null;
  addedBy: string;
  createdAt: string;
}

interface Resp extends PagedResponse {
  from: string;
  to: string;
  totals: { credits: number; credit: number; debits: number; debit: number; net: number };
  rows: TxnRow[];
}

const TYPE_LABEL: Record<string, string> = {
  deposit: 'Deposit',
  withdraw: 'Withdraw',
  bid: 'Bid Placed',
  win: 'Winning',
  refund: 'Refund',
  bonus: 'Bonus',
  adjust: 'Admin Adjustment',
  revert: 'Result Revert',
};

interface Filters {
  from: string;
  to: string;
  dir: string;
  admin: string;
  type: string;
}

const start = (): Filters => ({ from: today(), to: today(), dir: 'all', admin: 'all', type: 'all' });

/** Reports → Credit/Debit: every wallet credit and debit, by the user, the system or an admin. */
export function CreditDebit() {
  const [f, setF] = useState<Filters>(start);
  const [player, setPlayer] = useState<Player | null>(null);
  const [admins, setAdmins] = useState<string[]>([]);
  const report = useServerReport<Resp>('/reports/credit-debit');
  const [exporting, runExport] = useAction();
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    api<{ admins: string[] }>('/reports/r2-admins').then(
      (r) => setAdmins(r.admins),
      () => setAdmins([]),
    );
  }, []);

  const { submit } = report;
  useEffect(() => submit({ ...start() }), [submit]);

  const run = () => submit({ ...f, userId: player ? String(player.id) : '' });
  const cancel = () => {
    setF(start());
    setPlayer(null);
    submit({ ...start() });
  };

  const columns: Column<TxnRow>[] = [
    srColumn('Sr.'),
    {
      key: 'username',
      label: 'Name',
      render: (t) => (
        <>
          <strong>{t.username}</strong>
          {t.name !== t.username && <div className="muted" style={{ fontSize: 12.5 }}>{t.name}</div>}
        </>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      render: (t) => (
        <>
          <Chip tone={t.direction === 'credit' ? 'ok' : 'bad'}>{t.direction === 'credit' ? 'Credit' : 'Debit'}</Chip>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{TYPE_LABEL[t.type] ?? t.type}</div>
        </>
      ),
    },
    {
      key: 'particulars',
      label: 'Particular',
      render: (t) => (
        <>
          {t.particulars}
          {t.mode && <div className="muted" style={{ fontSize: 12.5 }}>{t.mode}</div>}
        </>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      className: 'wrap',
      render: (t) => <span style={{ display: 'inline-block', minWidth: 220 }}>{t.description || '--'}</span>,
    },
    { key: 'createdAt', label: 'Time', render: (t) => dt(t.createdAt) },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      render: (t) => (
        <span className={t.direction === 'credit' ? 'profit' : 'loss'}>
          {t.direction === 'credit' ? '+' : '−'}
          {amt(t.amount)}
        </span>
      ),
    },
    { key: 'balanceAfter', label: 'Balance After', align: 'right', render: (t) => amt(t.balanceAfter) },
    { key: 'addedBy', label: 'Added By', align: 'center' },
  ];

  const data = report.data;
  const totals = data?.totals;

  const doExport = () =>
    runExport(async () => {
      const all = await report.fetchAll();
      exportCsv(
        `credit-debit-${all.from}-to-${all.to}`,
        ['Sr.', 'Username', 'Name', 'Mobile', 'Credit/Debit', 'Type', 'Particular', 'Mode', 'Description', 'Time', 'Amount', 'Balance After', 'Added By', 'Reference'],
        all.rows.map((t, i) => [
          i + 1,
          t.username,
          t.name,
          t.mobile,
          t.direction === 'credit' ? 'Credit' : 'Debit',
          TYPE_LABEL[t.type] ?? t.type,
          t.particulars,
          t.mode,
          t.description,
          dt(t.createdAt),
          t.direction === 'credit' ? t.amount : -t.amount,
          t.balanceAfter,
          t.addedBy,
          t.ref,
        ]),
      );
    });

  return (
    <Page title="Credit/Debit Report">
      <ReportFilter
        title="Credit/Debit Report"
        onSubmit={run}
        onCancel={cancel}
        onExport={doExport}
        busy={report.loading}
        exporting={exporting}
        canExport={!!data}
      >
        <Field label="Start Date">
          <input type="date" value={f.from} max={today()} onChange={(e) => set('from', e.target.value || today())} />
        </Field>
        <Field label="End Date">
          <input type="date" value={f.to} max={today()} onChange={(e) => set('to', e.target.value || today())} />
        </Field>
        <Field label="Select Credit/Debit">
          <select value={f.dir} onChange={(e) => set('dir', e.target.value)}>
            <option value="all">All</option>
            <option value="credit">Credit</option>
            <option value="debit">Debit</option>
          </select>
        </Field>
        <Field label="Select Admin">
          <select value={f.admin} onChange={(e) => set('admin', e.target.value)}>
            <option value="all">All</option>
            <option value="Auto">Auto (system)</option>
            <option value="Self">Self (user)</option>
            <option value="staff">Any admin / staff</option>
            {admins.length > 0 && (
              <optgroup label="Admins">
                {admins.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
        <Field label="Transaction Type">
          <select value={f.type} onChange={(e) => set('type', e.target.value)}>
            <option value="all">All Types</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Player Name">
          <PlayerSelect value={player} onChange={setPlayer} placeholder="Type Username (optional)" />
        </Field>
      </ReportFilter>

      <Card>
        <LoadingLine show={report.loading} />
        <DataTable columns={columns} rows={data?.rows ?? []} rowKey={(t) => t.id} server={data ? report.server : undefined} />
        {totals && totals.credits + totals.debits > 0 && (
          <TotalsLine>
            Total Credit ({totals.credits}): <span className="profit">{amt(totals.credit)}</span>, Debit ({totals.debits}):{' '}
            <span className="loss">{amt(totals.debit)}</span>, Net: <ProfitLoss value={totals.net} />
          </TotalsLine>
        )}
      </Card>
    </Page>
  );
}
