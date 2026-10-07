/* Andar Bahar bidding report: every Andar Bahar bid of one day (one row per
   number played), filtered by provider (time slot), player and status. */
import { useMemo, useState } from 'react';
import { api } from '../../api';
import { exportCsv } from '../../export';
import { amt, dateOnly, dt, today } from '../../format';
import { Card, DataTable, FilterCard, Page, ProfitLoss, Resource, srColumn, type Column } from '../../ui';
import {
  DateField,
  ExportButton,
  PendingNote,
  PlayerField,
  ProviderField,
  SelectField,
  StatusChip,
  SummaryTable,
  num,
  qs,
  statusLabel,
  useFilters,
  useMarkets,
  useProfile,
  useReport,
  type Player,
} from './r1Shared';

interface AbBid {
  id: number;
  userId: number;
  username: string;
  name: string;
  number: string;
  amount: number;
  rate: number;
  status: string;
  winAmount: number;
  marketId: number;
  marketName: string;
  createdAt: string;
}

interface AbBidsResponse {
  date: string;
  page: number;
  perPage: number;
  total: number;
  totals: { bids: number; players: number; refunded: number; pending: number; amount: number; win: number; profit: number };
  bids: AbBid[];
}

interface Filters {
  date: string;
  marketId: string;
  player: Player | null;
  status: string;
}

const STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'refunded', label: 'Refunded' },
];

export function AbBids() {
  const markets = useMarkets(['andarbahar']);
  const profile = useProfile();
  const { form, set, applied, run, submit, reset } = useFilters<Filters>(() => ({
    date: today(),
    marketId: '',
    player: null,
    status: 'all',
  }));
  const [paging, setPaging] = useState({ page: 1, pageSize: 10, search: '' });

  const query = qs({
    date: applied.date,
    marketId: applied.marketId,
    userId: applied.player?.id,
    status: applied.status,
    search: paging.search,
  });
  const state = useReport<AbBidsResponse>(`/reports/ab-bids?${query}&${qs({ page: paging.page, perPage: paging.pageSize })}`, run);

  const columns = useMemo<Column<AbBid>[]>(
    () => [
      srColumn('Sr.'),
      { key: 'username', label: 'Username', render: (r) => profile.link(r.userId, r.username) },
      { key: 'name', label: 'Name' },
      { key: 'number', label: 'Number', align: 'center' },
      { key: 'amount', label: 'Bidding Points', align: 'center', render: (r) => amt(r.amount) },
      { key: 'winAmount', label: 'Winning Points', align: 'center', render: (r) => amt(r.winAmount) },
      { key: 'marketName', label: 'Provider Name' },
      { key: 'status', label: 'Status', align: 'center', render: (r) => <StatusChip status={r.status} /> },
      { key: 'createdAt', label: 'Played On', render: (r) => dt(r.createdAt) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const doExport = async () => {
    const data = await api<AbBidsResponse>(`/reports/ab-bids?${query}&all=1`);
    exportCsv(
      `andar-bahar-bids-${data.date}`,
      ['Sr.', 'Username', 'Name', 'Number', 'Bidding Points', 'Winning Points', 'Provider Name', 'Status', 'Played On'],
      data.bids.map((b, i) => [
        i + 1,
        b.username,
        b.name,
        b.number,
        num(b.amount),
        num(b.winAmount),
        b.marketName,
        statusLabel(b.status),
        dt(b.createdAt),
      ]),
    );
  };

  return (
    <Page title="Andar Bahar Bidding Report">
      <FilterCard
        title="Andar Bahar Bidding Report"
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
        <DateField label="Date" value={form.date} onChange={(v) => set('date', v)} />
        <ProviderField markets={markets} value={form.marketId} onChange={(v) => set('marketId', v)} />
        <SelectField label="Status" value={form.status} onChange={(v) => set('status', v)} options={STATUSES} />
        <PlayerField value={form.player} onChange={(p) => set('player', p)} />
      </FilterCard>

      <Resource state={state}>
        {(data) => (
          <>
            <Card title={`Bids on ${dateOnly(data.date)}`}>
              <SummaryTable
                cells={[
                  { label: 'Total Bids', value: data.totals.bids },
                  { label: 'Players', value: data.totals.players },
                  { label: 'Bidding Points', value: amt(data.totals.amount) },
                  { label: 'Winning Points', value: amt(data.totals.win) },
                  { label: 'Profit/Loss', value: <ProfitLoss value={data.totals.profit} /> },
                ]}
              />
              <PendingNote pending={data.totals.pending} />
              {data.totals.refunded > 0 && (
                <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
                  {data.totals.refunded} refunded {data.totals.refunded === 1 ? 'bid is' : 'bids are'} listed but not
                  counted in the points.
                </p>
              )}
            </Card>

            <Card actions={<ExportButton onExport={doExport} disabled={data.total === 0} />}>
              <DataTable
                key={run}
                columns={columns}
                rows={data.bids}
                rowKey={(r) => r.id}
                empty="No Records Found"
                server={{
                  total: data.total,
                  page: paging.page,
                  pageSize: paging.pageSize,
                  search: paging.search,
                  onChange: setPaging,
                }}
              />
            </Card>
          </>
        )}
      </Resource>
      {profile.modal}
    </Page>
  );
}
