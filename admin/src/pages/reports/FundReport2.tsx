/* Fund Report 2: deposit and withdraw *requests* (the queue behind the
   wallet), by request date, type and status, with status-wise totals. */
import { useMemo, useState } from 'react';
import { api } from '../../api';
import { exportCsv } from '../../export';
import { amt, dt, today } from '../../format';
import { Card, Chip, DataTable, FilterCard, Page, Resource, srColumn, type Column } from '../../ui';
import {
  REQUEST_STATUSES,
  StatusCell,
  StatusTotals,
  modeLabel,
  typeLabel,
  type RequestRow,
  type RequestsResponse,
} from './r1Requests';
import {
  DateField,
  ExportButton,
  PlayerField,
  SelectField,
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
  type: string;
  status: string;
  player: Player | null;
}

const TYPES = [
  { value: 'all', label: 'All' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdraw', label: 'Withdraw' },
];

export function FundReport2() {
  const profile = useProfile();
  const { form, set, applied, run, submit, reset } = useFilters<Filters>(() => ({
    from: today(),
    to: today(),
    type: 'all',
    status: 'all',
    player: null,
  }));
  const [paging, setPaging] = useState({ page: 1, pageSize: 50, search: '' });
  const query = qs({
    from: applied.from,
    to: applied.to,
    type: applied.type,
    status: applied.status,
    userId: applied.player?.id,
    search: paging.search,
  });
  const state = useReport<RequestsResponse>(`/reports/fund2?${query}&${qs({ page: paging.page, perPage: paging.pageSize })}`, run);

  const columns = useMemo<Column<RequestRow>[]>(
    () => [
      srColumn('Sr.'),
      { key: 'username', label: 'Username', render: (r) => profile.link(r.userId, r.username) },
      { key: 'name', label: 'Name' },
      {
        key: 'type',
        label: 'Type',
        align: 'center',
        render: (r) => <Chip tone={r.type === 'deposit' ? 'ok' : 'info'}>{typeLabel(r.type)}</Chip>,
      },
      { key: 'amount', label: 'Amount', align: 'center', render: (r) => amt(r.amount) },
      { key: 'mode', label: 'Mode', align: 'center', render: (r) => modeLabel(r.mode) },
      { key: 'utr', label: 'UTR / Ref', render: (r) => r.utr ?? r.pgRef ?? '--' },
      { key: 'status', label: 'Status', align: 'center', render: (r) => <StatusCell row={r} /> },
      { key: 'processedBy', label: 'Processed By', align: 'center', render: (r) => r.processedBy ?? '--' },
      { key: 'createdAt', label: 'Requested At', render: (r) => dt(r.createdAt) },
      { key: 'updatedAt', label: 'Updated At', render: (r) => dt(r.updatedAt) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const doExport = async () => {
    const data = await api<RequestsResponse>(`/reports/fund2?${query}&all=1`);
    exportCsv(
      `fund-report-2-${data.from}-to-${data.to}`,
      ['Sr.', 'Request', 'Username', 'Name', 'Mobile', 'Type', 'Amount', 'Mode', 'UTR / Ref', 'Status', 'Remark', 'Processed By', 'Requested At', 'Updated At'],
      data.rows.map((r, i) => [
        i + 1,
        r.id,
        r.username,
        r.name,
        r.mobile,
        typeLabel(r.type),
        num(r.amount),
        modeLabel(r.mode),
        r.utr ?? r.pgRef ?? '',
        statusLabel(r.status),
        r.remark ?? '',
        r.processedBy ?? '',
        dt(r.createdAt),
        dt(r.updatedAt),
      ]),
    );
  };

  return (
    <Page title="Fund Report 2">
      <FilterCard
        title="Fund Report 2"
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
        <SelectField label="Request Type" value={form.type} onChange={(v) => set('type', v)} options={TYPES} />
        <SelectField label="Status" value={form.status} onChange={(v) => set('status', v)} options={REQUEST_STATUSES} />
        <PlayerField value={form.player} onChange={(p) => set('player', p)} />
      </FilterCard>

      <Resource state={state}>
        {(data) => (
          <>
            <Card title="Status Wise Totals">
              <StatusTotals
                rows={data.totals.byStatus}
                kinds={applied.type === 'deposit' ? ['deposit'] : applied.type === 'withdraw' ? ['withdraw'] : ['deposit', 'withdraw']}
              />
            </Card>

            <Card title="Fund Requests" actions={<ExportButton onExport={doExport} disabled={data.total === 0} />}>
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
                    <TotalRow
                      colSpan={columns.length}
                      items={
                        applied.type === 'all'
                          ? [
                              { label: 'Total Deposit', value: data.totals.depositAmount },
                              { label: 'Total Withdraw', value: data.totals.withdrawAmount },
                            ]
                          : [{ label: 'Total Amount', value: data.totals.amount }]
                      }
                    />
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
