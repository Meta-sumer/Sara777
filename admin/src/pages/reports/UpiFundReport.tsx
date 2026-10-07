/* UPI Fund Report: UPI deposit requests with the UTR and payment screenshot
   the player submitted, by request date and status. */
import { useMemo, useState } from 'react';
import { api } from '../../api';
import { exportCsv } from '../../export';
import { amt, dt, today } from '../../format';
import { Card, DataTable, FilterCard, Page, Resource, srColumn, type Column } from '../../ui';
import { REQUEST_STATUSES, StatusCell, StatusTotals, type RequestRow, type RequestsResponse } from './r1Requests';
import {
  DateField,
  ExportButton,
  PlayerField,
  SelectField,
  TotalLine,
  TotalRow,
  num,
  qs,
  statusLabel,
  useFilters,
  useProfile,
  useReport,
  type Player,
} from './r1Shared';

interface Filters {
  from: string;
  to: string;
  status: string;
  player: Player | null;
}

function Proof({ url }: { url: string | null }) {
  if (!url) return <span className="muted">--</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Open payment screenshot">
      <img className="proof-thumb" src={url} alt="Payment proof" style={{ margin: '0 auto' }} />
    </a>
  );
}

export function UpiFundReport() {
  const profile = useProfile();
  const { form, set, applied, run, submit, reset } = useFilters<Filters>(() => ({
    from: today(),
    to: today(),
    status: 'all',
    player: null,
  }));
  const [paging, setPaging] = useState({ page: 1, pageSize: 50, search: '' });
  const query = qs({
    from: applied.from,
    to: applied.to,
    status: applied.status,
    userId: applied.player?.id,
    search: paging.search,
  });
  const state = useReport<RequestsResponse>(`/reports/upi-fund?${query}&${qs({ page: paging.page, perPage: paging.pageSize })}`, run);

  const columns = useMemo<Column<RequestRow>[]>(
    () => [
      srColumn('Sr.'),
      { key: 'username', label: 'Username', render: (r) => profile.link(r.userId, r.username) },
      { key: 'name', label: 'Name' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'amount', label: 'Amount', align: 'center', render: (r) => amt(r.amount) },
      { key: 'utr', label: 'UTR', render: (r) => r.utr ?? '--' },
      { key: 'proofUrl', label: 'Screenshot', align: 'center', render: (r) => <Proof url={r.proofUrl} /> },
      { key: 'status', label: 'Status', align: 'center', render: (r) => <StatusCell row={r} /> },
      { key: 'processedBy', label: 'Processed By', align: 'center', render: (r) => r.processedBy ?? '--' },
      { key: 'createdAt', label: 'Requested At', render: (r) => dt(r.createdAt) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const doExport = async () => {
    const data = await api<RequestsResponse>(`/reports/upi-fund?${query}&all=1`);
    const origin = window.location.origin;
    exportCsv(
      `upi-fund-report-${data.from}-to-${data.to}`,
      ['Sr.', 'Request', 'Username', 'Name', 'Mobile', 'Amount', 'UTR', 'Screenshot', 'Status', 'Remark', 'Processed By', 'Requested At'],
      data.rows.map((r, i) => [
        i + 1,
        r.id,
        r.username,
        r.name,
        r.mobile,
        num(r.amount),
        r.utr ?? '',
        r.proofUrl ? origin + r.proofUrl : '',
        statusLabel(r.status),
        r.remark ?? '',
        r.processedBy ?? '',
        dt(r.createdAt),
      ]),
    );
  };

  return (
    <Page title="UPI Fund Report">
      <FilterCard
        title="UPI Fund Report"
        onSubmit={() => {
          setPaging((p) => ({ ...p, page: 1 }));
          submit();
        }}
        onCancel={() => {
          setPaging((p) => ({ ...p, page: 1, search: '' }));
          reset();
        }}
        busy={state.loading}
      >
        <DateField label="Start Date" value={form.from} onChange={(v) => set('from', v)} />
        <DateField label="End Date" value={form.to} onChange={(v) => set('to', v)} />
        <SelectField label="Status" value={form.status} onChange={(v) => set('status', v)} options={REQUEST_STATUSES} />
        <PlayerField value={form.player} onChange={(p) => set('player', p)} />
      </FilterCard>

      <Resource state={state}>
        {(data) => (
          <>
            <Card title="Status Wise Totals">
              <StatusTotals rows={data.totals.byStatus} kinds={['deposit']} />
              <div style={{ marginTop: 16 }}>
                <TotalLine items={[{ label: 'Total Approved Amount', value: data.totals.approvedAmount ?? 0, tone: 'profit' }]} />
              </div>
            </Card>

            <Card title="UPI Deposit Requests" actions={<ExportButton onExport={doExport} disabled={data.total === 0} />}>
              <DataTable
                key={run}
                columns={columns}
                rows={data.rows}
                rowKey={(r) => r.id}
                empty="No Records Found"
                server={{
                  total: data.total,
                  page: paging.page,
                  pageSize: paging.pageSize,
                  search: paging.search,
                  onChange: setPaging,
                }}
                footer={
                  data.total > 0 ? (
                    <TotalRow colSpan={columns.length} items={[{ label: 'Total Amount', value: data.totals.amount }]} />
                  ) : undefined
                }
              />
            </Card>
          </>
        )}
      </Resource>
      {profile.modal}
    </Page>
  );
}
