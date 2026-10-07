import { useEffect, useState } from 'react';
import { exportCsv } from '../../export';
import { addDays, amt, dateOnly, fmt, today } from '../../format';
import { Card, type Column, DataTable, Field, Page, ProfitLoss, StatCard, useAction } from '../../ui';
import { LoadingLine, ReportFilter, useReport } from './r2Common';

interface DayRow {
  date: string;
  registrations: number;
  bettors: number;
  bids: number;
  depositors: number;
  deposit: number;
  withdrawers: number;
  withdraw: number;
  bidAmount: number;
  winAmount: number;
  profit: number;
}

interface Resp {
  from: string;
  to: string;
  rows: DayRow[];
  totals: Omit<DayRow, 'date'>;
}

const start = () => ({ from: addDays(today(), -6), to: today() });

/**
 * Reports → User Analysis (no reference screenshot): day-by-day player activity
 * and money flow over a date range, with the house profit/loss.
 */
export function UserAnalysis() {
  const [f, setF] = useState(start);
  const report = useReport<Resp>('/reports/user-analysis');
  const [exporting, runExport] = useAction();

  const { submit } = report;
  useEffect(() => submit(start()), [submit]);

  const cancel = () => {
    setF(start());
    submit(start());
  };

  const columns: Column<DayRow>[] = [
    { key: 'date', label: 'Date', render: (r) => dateOnly(r.date), value: (r) => r.date },
    { key: 'registrations', label: 'New Registrations', align: 'right', className: 'wrap', render: (r) => fmt(r.registrations) },
    { key: 'bettors', label: 'Active Bettors', align: 'right', className: 'wrap', render: (r) => fmt(r.bettors) },
    { key: 'bids', label: 'Bids', align: 'right', className: 'wrap', render: (r) => fmt(r.bids) },
    { key: 'depositors', label: 'Depositors', align: 'right', className: 'wrap', render: (r) => fmt(r.depositors) },
    { key: 'deposit', label: 'Deposit Amount', align: 'right', className: 'wrap', render: (r) => amt(r.deposit) },
    { key: 'withdrawers', label: 'Withdrawers', align: 'right', className: 'wrap', render: (r) => fmt(r.withdrawers) },
    { key: 'withdraw', label: 'Withdraw Amount', align: 'right', className: 'wrap', render: (r) => amt(r.withdraw) },
    { key: 'bidAmount', label: 'Bid Amount', align: 'right', className: 'wrap', render: (r) => amt(r.bidAmount) },
    { key: 'winAmount', label: 'Win Amount', align: 'right', className: 'wrap', render: (r) => amt(r.winAmount) },
    { key: 'profit', label: 'House P/L', align: 'right', className: 'wrap', render: (r) => <ProfitLoss value={r.profit} /> },
  ];

  const data = report.data;
  const t = data?.totals;

  const doExport = () =>
    runExport(async () => {
      if (!data || !t) return;
      const head = ['Date', 'New Registrations', 'Active Bettors', 'Bids', 'Depositors', 'Deposit Amount', 'Withdrawers', 'Withdraw Amount', 'Bid Amount', 'Win Amount', 'House P/L'];
      const line = (label: string, r: Omit<DayRow, 'date'>) => [
        label,
        r.registrations,
        r.bettors,
        r.bids,
        r.depositors,
        r.deposit,
        r.withdrawers,
        r.withdraw,
        r.bidAmount,
        r.winAmount,
        r.profit,
      ];
      exportCsv(`user-analysis-${data.from}-to-${data.to}`, head, [
        ...data.rows.map((r) => line(dateOnly(r.date), r)),
        line('Total', t),
      ]);
    });

  return (
    <Page title="User Analysis">
      <ReportFilter
        title="User Analysis"
        onSubmit={() => submit(f)}
        onCancel={cancel}
        onExport={doExport}
        busy={report.loading}
        exporting={exporting}
        canExport={!!data}
      >
        <Field label="Start Date">
          <input type="date" value={f.from} max={today()} onChange={(e) => setF((s) => ({ ...s, from: e.target.value || today() }))} />
        </Field>
        <Field label="End Date">
          <input type="date" value={f.to} max={today()} onChange={(e) => setF((s) => ({ ...s, to: e.target.value || today() }))} />
        </Field>
      </ReportFilter>

      {t && (
        <div className="stats">
          <StatCard label="New Registrations" value={fmt(t.registrations)} sub={`${fmt(t.bettors)} unique bettors`} icon="users" color="var(--c-info)" />
          <StatCard label="Deposits" value={amt(t.deposit)} sub={`${fmt(t.depositors)} unique depositors`} icon="wallet" color="var(--c-success)" />
          <StatCard label="Withdrawals" value={amt(t.withdraw)} sub={`${fmt(t.withdrawers)} unique withdrawers`} icon="download" color="var(--c-danger)" />
          <StatCard
            label="House Profit/Loss"
            value={<ProfitLoss value={t.profit} />}
            sub={`Bid ${amt(t.bidAmount)} · Win ${amt(t.winAmount)}`}
            icon="trend"
            color="var(--c-indigo)"
          />
        </div>
      )}

      <Card title={data ? `${dateOnly(data.from)} to ${dateOnly(data.to)}` : undefined}>
        <LoadingLine show={report.loading} />
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => r.date}
          pageSize={31}
          pageSizes={[7, 31, 100, 400]}
          footer={
            t ? (
              <tr>
                <td>Total</td>
                <td className="right">{fmt(t.registrations)}</td>
                <td className="right" title="Unique players over the range">{fmt(t.bettors)}*</td>
                <td className="right">{fmt(t.bids)}</td>
                <td className="right" title="Unique players over the range">{fmt(t.depositors)}*</td>
                <td className="right">{amt(t.deposit)}</td>
                <td className="right" title="Unique players over the range">{fmt(t.withdrawers)}*</td>
                <td className="right">{amt(t.withdraw)}</td>
                <td className="right">{amt(t.bidAmount)}</td>
                <td className="right">{amt(t.winAmount)}</td>
                <td className="right">
                  <ProfitLoss value={t.profit} />
                </td>
              </tr>
            ) : undefined
          }
        />
        <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>
          * Unique players over the whole range, so a player active on several days counts once. Deposits are wallet
          credits; withdrawals are approved or completed requests, by request date. Bids are by game date and leave out
          refunded bids. House P/L = Bid Amount − Win Amount.
        </p>
      </Card>
    </Page>
  );
}
