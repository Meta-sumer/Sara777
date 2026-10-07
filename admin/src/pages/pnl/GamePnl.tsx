/* Starline and Andar Bahar Profit/Loss Calculations: for one slot and date, what
   the house keeps or pays out for every possible result. */
import { useCallback, useMemo, useState } from 'react';
import { api } from '../../api';
import { today } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import { Card, DataTable, ErrorCard, Field, FilterCard, Loading, Page, TitleCard } from '../../ui';
import { BidHistoryModal } from './BidHistoryModal';
import {
  type BetGroup,
  type BidQuery,
  type PnlReport,
  type PnlRow,
  ShowAllToggle,
  SummaryBox,
  marketOptions,
  pnlColumns,
  usePnlForm,
  usePnlMarkets,
} from './shared';

type GameKind = 'starline' | 'andarbahar';

const TEXT: Record<GameKind, { title: string; crumb: string }> = {
  starline: { title: 'Starline Profit/Loss Calculations', crumb: 'Starline Profit/Loss' },
  andarbahar: { title: 'Andar Bahar Profit/Loss Calculations', crumb: 'Andar Bahar Profit/Loss' },
};

export function GamePnl({ kind }: { kind: 'starline' | 'andarbahar' }) {
  // keyed so moving between the Starline and Andar Bahar pages starts with fresh filters
  return <GamePnlView key={kind} kind={kind} />;
}

function GamePnlView({ kind }: { kind: GameKind }) {
  const { nonce } = useRefresh();
  const markets = usePnlMarkets(kind);
  const { form, query, set, submit, reset } = usePnlForm(markets.data?.markets, (marketId) => ({
    marketId,
    date: today(),
  }));

  const load = useCallback(async () => {
    if (!query) return null;
    const qs = new URLSearchParams({ kind, marketId: query.marketId, date: query.date });
    return api<PnlReport>(`/pnl/game?${qs}`);
    // nonce: the top-bar Refresh button reloads the numbers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, query, nonce]);
  const report = useLoad(load);
  const data = report.data ?? null;

  const [bids, setBids] = useState<BidQuery | null>(null);
  const [allPannas, setAllPannas] = useState(false);

  const view = useCallback(
    (group: BetGroup, groupLabel: string) => (row: PnlRow) => {
      if (!data) return;
      setBids({
        marketId: data.market.id,
        marketName: data.market.name,
        date: data.date,
        group,
        groupLabel,
        pick: row.pick,
        label: row.label,
      });
    },
    [data],
  );

  const digitCols = useMemo(() => pnlColumns({ bidCount: { onView: view('digit', 'Single Digit') } }), [view]);
  const pannaCols = useMemo(() => pnlColumns({ bidCount: { onView: view('panna', 'Pana') } }), [view]);
  const abCols = useMemo(
    () => pnlColumns({ bidCount: { button: true, onView: view('ab', 'Jodi') }, formula: true }),
    [view],
  );
  const pannaRows = useMemo(
    () => (data?.tables.panna ?? []).filter((r) => allPannas || r.bids > 0),
    [data, allPannas],
  );

  const options = marketOptions(markets.data?.markets ?? []);

  return (
    <Page title={TEXT[kind].crumb}>
      <TitleCard>{TEXT[kind].title}</TitleCard>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <FilterCard onSubmit={submit} onCancel={reset} busy={report.loading && !!query}>
          <Field label="Start Date">
            <input
              type="date"
              value={form?.date ?? ''}
              onChange={(e) => set('date', e.target.value)}
              required
            />
          </Field>
          <Field label="Result Opening Time">
            <select value={form?.marketId ?? ''} onChange={(e) => set('marketId', e.target.value)} required>
              {options.length === 0 && <option value="">{markets.loading ? 'Loading…' : 'No providers'}</option>}
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.text}
                </option>
              ))}
            </select>
          </Field>
        </FilterCard>
        <SummaryBox report={data} order={kind === 'starline' ? ['panna', 'digit'] : ['ab']} />
      </div>

      {markets.error && <ErrorCard message={markets.error} />}
      {report.error && <ErrorCard message={report.error} />}
      {report.loading && !data && query && <Loading />}

      {data && kind === 'starline' && (
        <>
          <Card title="Single Digit">
            <DataTable
              columns={digitCols}
              rows={data.tables.digit ?? []}
              rowKey={(r) => r.pick}
              pageSize={10}
              initialSort={{ key: 'label', dir: 'asc' }}
            />
          </Card>
          <Card title="Pana">
            <DataTable
              columns={pannaCols}
              rows={pannaRows}
              rowKey={(r) => r.pick}
              pageSize={50}
              initialSort={{ key: 'label', dir: 'asc' }}
              empty={allPannas ? 'No data available in table' : 'No pana bids for this slot and date'}
              toolbar={<ShowAllToggle checked={allPannas} onChange={setAllPannas} label="Show all panas" />}
            />
          </Card>
        </>
      )}

      {data && kind === 'andarbahar' && (
        <Card title="Jodi">
          <DataTable
            columns={abCols}
            rows={data.tables.ab ?? []}
            rowKey={(r) => r.pick}
            pageSize={50}
            initialSort={{ key: 'label', dir: 'asc' }}
          />
        </Card>
      )}

      {bids && <BidHistoryModal query={bids} onClose={() => setBids(null)} />}
    </Page>
  );
}
