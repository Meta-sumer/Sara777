/* Sales Summary: bidding vs winning points per day over a range, for one
   market type (or all), optionally one provider and one player. */
import { useMemo } from 'react';
import { exportCsv } from '../../export';
import { addDays, amt, dateOnly, today } from '../../format';
import { Btn, Card, DataTable, FilterCard, Page, ProfitLoss, Resource, srColumn, type Column } from '../../ui';
import {
  DateField,
  PendingNote,
  PlayerField,
  ProviderField,
  SelectField,
  num,
  qs,
  rangeLabel,
  useFilters,
  useMarkets,
  useReport,
  type Player,
  type Sales,
} from './r1Shared';

interface DayRow extends Sales {
  date: string;
}

interface SummaryResponse {
  kind: string;
  from: string;
  to: string;
  total: Sales;
  days: DayRow[];
}

interface Filters {
  from: string;
  to: string;
  kind: string;
  marketId: string;
  player: Player | null;
}

const KINDS = [
  { value: 'main', label: 'Main Market' },
  { value: 'starline', label: 'Starline' },
  { value: 'andarbahar', label: 'Andar Bahar' },
  { value: 'all', label: 'All Games' },
];

export function SalesSummary() {
  const allMarkets = useMarkets(['main', 'starline', 'andarbahar']);
  const { form, set, applied, run, submit, reset } = useFilters<Filters>(() => ({
    from: addDays(today(), -6),
    to: today(),
    kind: 'main',
    marketId: '',
    player: null,
  }));
  const markets = useMemo(() => allMarkets.filter((m) => m.kind === form.kind), [allMarkets, form.kind]);

  const state = useReport<SummaryResponse>(
    `/reports/sales-summary?${qs({
      from: applied.from,
      to: applied.to,
      kind: applied.kind,
      marketId: applied.kind === 'all' ? '' : applied.marketId,
      userId: applied.player?.id,
    })}`,
    run,
  );

  const columns = useMemo<Column<DayRow>[]>(
    () => [
      srColumn('Sr.'),
      { key: 'date', label: 'Date', align: 'center', render: (r) => dateOnly(r.date) },
      { key: 'bids', label: 'Total Bids', align: 'center' },
      { key: 'amount', label: 'Bidding Points', align: 'center', render: (r) => amt(r.amount) },
      { key: 'win', label: 'Winning Points', align: 'center', render: (r) => amt(r.win) },
      { key: 'profit', label: 'Profit/Loss', align: 'center', render: (r) => <ProfitLoss value={r.profit} /> },
    ],
    [],
  );

  const doExport = (data: SummaryResponse) =>
    exportCsv(
      `sales-summary-${data.from}-to-${data.to}`,
      ['Date', 'Total Bids', 'Bidding Points', 'Winning Points', 'Profit/Loss'],
      [
        ...data.days.map((d) => [dateOnly(d.date), d.bids, num(d.amount), num(d.win), num(d.profit)]),
        ['Total', data.total.bids, num(data.total.amount), num(data.total.win), num(data.total.profit)],
      ],
    );

  return (
    <Page title="Sales Summary">
      <FilterCard title="Sales Summary" onSubmit={submit} onCancel={reset} busy={state.loading}>
        <DateField label="Start Date" value={form.from} onChange={(v) => set('from', v)} />
        <DateField label="End Date" value={form.to} onChange={(v) => set('to', v)} />
        <SelectField
          label="Market Type"
          value={form.kind}
          options={KINDS}
          onChange={(v) => {
            set('kind', v);
            set('marketId', '');
          }}
        />
        <ProviderField
          markets={markets}
          value={form.marketId}
          onChange={(v) => set('marketId', v)}
          disabled={form.kind === 'all'}
        />
        <PlayerField value={form.player} onChange={(p) => set('player', p)} />
      </FilterCard>

      <Resource state={state}>
        {(data) => (
          <Card
            title={rangeLabel(data.from, data.to)}
            actions={
              <Btn variant="success" icon="download" disabled={data.days.length === 0} onClick={() => doExport(data)}>
                Export
              </Btn>
            }
          >
            <DataTable
              columns={columns}
              rows={data.days}
              rowKey={(r) => r.date}
              paginate={false}
              searchable={false}
              empty="No Records Found"
              footer={
                data.days.length > 0 ? (
                  <tr>
                    <td colSpan={2} className="center">
                      Total
                    </td>
                    <td className="center">{data.total.bids}</td>
                    <td className="center">{amt(data.total.amount)}</td>
                    <td className="center">{amt(data.total.win)}</td>
                    <td className="center">
                      <ProfitLoss value={data.total.profit} />
                    </td>
                  </tr>
                ) : undefined
              }
            />
            <PendingNote pending={data.total.pending} />
          </Card>
        )}
      </Resource>
    </Page>
  );
}
