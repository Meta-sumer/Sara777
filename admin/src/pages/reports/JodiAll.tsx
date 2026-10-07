/* Jodi All Report: every main-market jodi bet (jodi digit and red brackets;
   Starline has no jodi) over a date range, with a provider-wise breakdown. */
import { useMemo } from 'react';
import { exportCsv } from '../../export';
import { amt, today } from '../../format';
import { Btn, Card, DataTable, FilterCard, Page, ProfitLoss, Resource, srColumn, type Column } from '../../ui';
import {
  DateField,
  PendingNote,
  ProviderField,
  SelectField,
  SummaryTable,
  num,
  qs,
  useFilters,
  useMarkets,
  useReport,
  type MarketSales,
  type Sales,
} from './r1Shared';

interface JodiResponse {
  from: string;
  to: string;
  marketId: number | null;
  total: Sales;
  markets: MarketSales[];
}

const GAME_TYPES = [
  { value: 'all', label: 'All Jodi' },
  { value: 'jodi_digit', label: 'Jodi Digit' },
  { value: 'red_bracket', label: 'Red Brackets' },
];

export function JodiAll() {
  const markets = useMarkets(['main']);
  const { form, set, applied, run, submit, reset } = useFilters(() => ({
    from: today(),
    to: today(),
    marketId: '',
    gameType: 'all',
  }));
  const state = useReport<JodiResponse>(`/reports/jodi-all?${qs(applied)}`, run);

  const columns = useMemo<Column<MarketSales>[]>(
    () => [
      srColumn('Sr.'),
      { key: 'marketName', label: 'Provider Name' },
      { key: 'bids', label: 'Total Jodi Bid', align: 'center' },
      { key: 'players', label: 'Players', align: 'center' },
      { key: 'winners', label: 'Winning Bids', align: 'center' },
      { key: 'amount', label: 'Total Bid Amount', align: 'center', render: (r) => amt(r.amount) },
      { key: 'win', label: 'Win Bid Amount', align: 'center', render: (r) => amt(r.win) },
      { key: 'profit', label: 'Profit/Loss', align: 'center', render: (r) => <ProfitLoss value={r.profit} /> },
    ],
    [],
  );

  const doExport = (data: JodiResponse) =>
    exportCsv(
      `jodi-all-${data.from}-to-${data.to}`,
      ['Provider Name', 'Total Jodi Bid', 'Players', 'Winning Bids', 'Total Bid Amount', 'Win Bid Amount', 'Profit/Loss'],
      [
        ...data.markets.map((m) => [m.marketName, m.bids, m.players, m.winners, num(m.amount), num(m.win), num(m.profit)]),
        ['Total', data.total.bids, data.total.players, data.total.winners, num(data.total.amount), num(data.total.win), num(data.total.profit)],
      ],
    );

  return (
    <Page title="Jodi All Report">
      <FilterCard title="Jodi All Report" onSubmit={submit} onCancel={reset} busy={state.loading}>
        <DateField label="Start Date" value={form.from} onChange={(v) => set('from', v)} />
        <DateField label="End Date" value={form.to} onChange={(v) => set('to', v)} />
        <ProviderField markets={markets} value={form.marketId} onChange={(v) => set('marketId', v)} />
        <SelectField label="Game Type" value={form.gameType} onChange={(v) => set('gameType', v)} options={GAME_TYPES} />
      </FilterCard>

      <Resource state={state}>
        {(data) => (
          <>
            <Card>
              <SummaryTable
                empty={data.total.bids === 0}
                cells={[
                  { label: 'Total Jodi Bid', value: data.total.bids },
                  { label: 'Total Bid Amount', value: amt(data.total.amount) },
                  { label: 'Win Bid Amount', value: amt(data.total.win) },
                  { label: 'Profit/Loss', value: <ProfitLoss value={data.total.profit} /> },
                ]}
              />
              <PendingNote pending={data.total.pending} />
            </Card>

            {data.markets.length > 0 && (
              <Card
                title="Provider Wise Jodi Bids"
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
                    data.markets.length > 1 ? (
                      <tr>
                        <td colSpan={2} className="center">
                          Total
                        </td>
                        <td className="center">{data.total.bids}</td>
                        <td className="center">{data.total.players}</td>
                        <td className="center">{data.total.winners}</td>
                        <td className="center">{amt(data.total.amount)}</td>
                        <td className="center">{amt(data.total.win)}</td>
                        <td className="center">
                          <ProfitLoss value={data.total.profit} />
                        </td>
                      </tr>
                    ) : undefined
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
