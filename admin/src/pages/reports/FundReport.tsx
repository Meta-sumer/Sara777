/* Fund Report: wallet money movements (deposits, withdraw holds, refunds,
   admin adjustments, bonuses; not bids or winnings) over a date range, with
   the total of the whole filtered result computed by the server. */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { exportCsv } from '../../export';
import { amt, dt, today } from '../../format';
import { Card, Chip, DataTable, FilterCard, Page, Resource, srColumn, useToast, type Column } from '../../ui';
import {
  DateField,
  ExportButton,
  ParticularBadge,
  SelectField,
  TimeBadge,
  TotalRow,
  num,
  qs,
  useFilters,
  useProfile,
  useReport,
} from './r1Shared';

interface FundRow {
  id: number;
  userId: number;
  username: string;
  name: string;
  mobile: string;
  type: string;
  direction: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  particulars: string;
  note: string | null;
  mode: string | null;
  ref: string | null;
  addedBy: string;
  createdAt: string;
}

interface FundResponse {
  from: string;
  to: string;
  dir: string;
  page: number;
  perPage: number;
  total: number;
  totals: { count: number; credits: number; debits: number; credit: number; debit: number; net: number };
  rows: FundRow[];
}

interface Options {
  particulars: Array<{ value: string; label: string }>;
  admins: string[];
}

const DIRECTIONS = [
  { value: 'all', label: 'All' },
  { value: 'credit', label: 'Credit' },
  { value: 'debit', label: 'Debit' },
];

export function FundReport() {
  const toast = useToast();
  const profile = useProfile();
  const [options, setOptions] = useState<Options>({ particulars: [], admins: [] });
  useEffect(() => {
    api<Options>('/reports/r1-fund-options')
      .then(setOptions)
      .catch((err: Error) => toast(err.message, true));
  }, [toast]);

  const { form, set, applied, run, submit, reset } = useFilters(() => ({
    from: today(),
    to: today(),
    dir: 'all',
    mode: 'all',
    addedBy: 'all',
  }));
  const [paging, setPaging] = useState({ page: 1, pageSize: 50, search: '' });
  const query = qs({ ...applied, search: paging.search });
  const state = useReport<FundResponse>(`/reports/fund?${query}&${qs({ page: paging.page, perPage: paging.pageSize })}`, run);

  const columns = useMemo<Column<FundRow>[]>(
    () => [
      srColumn('Sr.'),
      { key: 'username', label: 'Username', render: (r) => profile.link(r.userId, r.username) },
      { key: 'name', label: 'Name' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'amount', label: 'Amount', align: 'center', render: (r) => amt(r.amount) },
      {
        key: 'direction',
        label: 'Credit/Debit',
        align: 'center',
        render: (r) => <Chip tone={r.direction === 'credit' ? 'ok' : 'bad'}>{r.direction === 'credit' ? 'Credit' : 'Debit'}</Chip>,
      },
      { key: 'mode', label: 'Particular', align: 'center', render: (r) => <ParticularBadge value={r.mode} /> },
      {
        key: 'note',
        label: 'Description',
        className: 'wrap',
        render: (r) => (
          <div style={{ minWidth: 220, maxWidth: 360 }}>
            <div style={{ fontWeight: 700, color: 'var(--heading)' }}>{r.particulars}</div>
            {r.note && <div className="muted" style={{ fontSize: 12.5 }}>{r.note}</div>}
          </div>
        ),
      },
      { key: 'addedBy', label: 'Added By', align: 'center' },
      { key: 'createdAt', label: 'Time', align: 'center', render: (r) => <TimeBadge>{dt(r.createdAt)}</TimeBadge> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const doExport = async () => {
    const data = await api<FundResponse>(`/reports/fund?${query}&all=1`);
    exportCsv(
      `fund-report-${data.from}-to-${data.to}`,
      ['Sr.', 'Username', 'Name', 'Mobile', 'Amount', 'Credit/Debit', 'Particular', 'Description', 'Note', 'Added By', 'Time'],
      [
        ...data.rows.map((r, i) => [
          i + 1,
          r.username,
          r.name,
          r.mobile,
          num(r.amount),
          r.direction === 'credit' ? 'Credit' : 'Debit',
          r.mode ?? '',
          r.particulars,
          r.note ?? '',
          r.addedBy,
          dt(r.createdAt),
        ]),
        [],
        ['', 'Total Credit', '', '', num(data.totals.credit)],
        ['', 'Total Debit', '', '', num(data.totals.debit)],
      ],
    );
  };

  const totalItems = ({ dir, totals: t }: FundResponse) => {
    if (dir === 'credit') return [{ label: 'Total Amount', value: t.credit }];
    if (dir === 'debit') return [{ label: 'Total Amount', value: t.debit }];
    return [
      { label: 'Total Credit', value: t.credit, tone: 'profit' as const },
      { label: 'Total Debit', value: t.debit, tone: 'loss' as const },
      { label: 'Net', value: t.net },
    ];
  };

  return (
    <Page title="Fund Report">
      <FilterCard
        title="Fund Report"
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
        <SelectField label="Select Credit/Debit" value={form.dir} onChange={(v) => set('dir', v)} options={DIRECTIONS} />
        <SelectField
          label="Particular"
          value={form.mode}
          onChange={(v) => set('mode', v)}
          options={[{ value: 'all', label: 'All' }, ...options.particulars]}
        />
        <SelectField
          label="Select Admin"
          value={form.addedBy}
          onChange={(v) => set('addedBy', v)}
          options={[{ value: 'all', label: 'All' }, ...options.admins.map((a) => ({ value: a, label: a }))]}
        />
      </FilterCard>

      <Resource state={state}>
        {(data) => (
          <Card actions={<ExportButton onExport={doExport} disabled={data.total === 0} />}>
            <DataTable
              key={run}
              columns={columns}
              rows={data.rows}
              rowKey={(r) => r.id}
              pageSizes={[10, 25, 50, 100]}
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
                  <TotalRow colSpan={columns.length} items={totalItems(data)} />
                ) : undefined
              }
            />
          </Card>
        )}
      </Resource>
      {profile.modal}
    </Page>
  );
}
