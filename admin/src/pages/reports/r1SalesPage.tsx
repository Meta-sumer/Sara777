/* Sales Report, Starline Sales Report and Andar Bahar Sales Report: bidding vs
   winning points for one market kind over a date range, as one range row (as
   in the reference) plus a provider-wise breakdown when "All" is selected. */
import { useMemo } from 'react';
import { exportCsv } from '../../export';
import { amt, today } from '../../format';
import { Btn, Card, DataTable, FilterCard, Page, ProfitLoss, Resource, srColumn, type Column } from '../../ui';
import {
  DateField,
  PendingNote,
  PlayerField,
  ProviderField,
  SummaryTable,
  num,
  qs,
  rangeLabel,
  useFilters,
  useMarkets,
  useReport,
  type MarketSales,
  type Player,
  type Sales,
} from './r1Shared';

interface SalesResponse {
  from: string;
  to: string;
  marketId: number | null;
  total: Sales;
  markets: MarketSales[];
}

interface Filters {
  from: string;
  to: string;
  marketId: string;
  player: Player | null;
}

export function SalesPage({
  kind,
  endpoint,
  title,
  exportName,
}: {
  kind: 'main' | 'starline' | 'andarbahar';
  endpoint: string;
  title: string;
  exportName: string;
}) {
  const markets = useMarkets([kind]);
  const { form, set, applied, run, submit, reset } = useFilters<Filters>(() => ({
    from: today(),
    to: today(),
    marketId: '',
    player: null,
  }));
  const path = `/reports/${endpoint}?${qs({
    from: applied.from,
    to: applied.to,
    marketId: applied.marketId,
    userId: applied.player?.id,
  })}`;
  const state = useReport<SalesResponse>(path, run);

  const columns = useMemo<Column<MarketSales>[]>(
    () => [
      srColumn('Sr.'),
      { key: 'marketName', label: 'Provider Name' },
      { key: 'bids', label: 'Total Bids', align: 'center' },
      { key: 'players', label: 'Players', align: 'center' },
      { key: 'amount', label: 'Bidding Points', align: 'center', render: (r) => amt(r.amount) },
      { key: 'win', label: 'Winning Points', align: 'center', render: (r) => amt(r.win) },
      { key: 'profit', label: 'Profit/Loss', align: 'center', render: (r) => <ProfitLoss value={r.profit} /> },
    ],
    [],
  );

  const doExport = (data: SalesResponse) =>
    exportCsv(
      `${exportName}-${data.from}-to-${data.to}`,
      ['Provider Name', 'Total Bids', 'Players', 'Bidding Points', 'Winning Points', 'Profit/Loss'],
      [
        ...data.markets.map((m) => [m.marketName, m.bids, m.players, num(m.amount), num(m.win), num(m.profit)]),
        ['Total', data.total.bids, data.total.players, num(data.total.amount), num(data.total.win), num(data.total.profit)],
      ],
    );

  return (
    <Page title={title}>
      <FilterCard title={title} onSubmit={submit} onCancel={reset} busy={state.loading}>
        <DateField label="Start Date" value={form.from} onChange={(v) => set('from', v)} />
        <DateField label="End Date" value={form.to} onChange={(v) => set('to', v)} />
        <ProviderField markets={markets} value={form.marketId} onChange={(v) => set('marketId', v)} />
        <PlayerField value={form.player} onChange={(p) => set('player', p)} />
      </FilterCard>

      <Resource state={state}>
        {(data) => (
          <>
            <Card>
              <SummaryTable
                empty={data.total.bids === 0}
                cells={[
                  { label: 'Sr.', value: 1 },
                  { label: 'Date', value: rangeLabel(data.from, data.to) },
                  { label: 'Bidding Points', value: amt(data.total.amount) },
                  { label: 'Winning Points', value: amt(data.total.win) },
                  { label: 'Profit/Loss', value: <ProfitLoss value={data.total.profit} /> },
                ]}
              />
              <PendingNote pending={data.total.pending} />
            </Card>

            {!data.marketId && data.markets.length > 0 && (
              <Card
                title="Provider Wise Sales"
                actions={
                  <Btn variant="success" icon="download" onClick={() => doExport(data)}>
                    Export
                  </Btn>
                }
              >
                <DataTable
                  columns={columns}
                  rows={data.markets}
                  rowKey={(r) => r.marketId}
                  paginate={false}
                  searchable={false}
                  footer={
                    <tr>
                      <td colSpan={2} className="center">
                        Total
                      </td>
                      <td className="center">{data.total.bids}</td>
                      <td className="center">{data.total.players}</td>
                      <td className="center">{amt(data.total.amount)}</td>
                      <td className="center">{amt(data.total.win)}</td>
                      <td className="center">
                        <ProfitLoss value={data.total.profit} />
                      </td>
                    </tr>
                  }
                />
              </Card>
            )}
          </>
        )}
      </Resource>
    </Page>
  );
}
