/* Bookie Corner (main markets only): house exposure per possible result before it is declared.
     OC Cutting Group     single digit + pana for one session, no bid counts (as in the reference)
     Cutting Group        the same with Bid Count / "View Bids Info (N)" and a Grand Total
     Final OC Cutting Group  the close-decided bets: Jodi 00–99 (with Red Brackets) and Half / Full Sangam */
import { useCallback, useMemo, useState } from 'react';
import { api } from '../../api';
import { amt, fmt, today } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import { Btn, Card, DataTable, ErrorCard, Field, FilterCard, Loading, Page, TitleCard, type Column } from '../../ui';
import { BidHistoryModal } from './BidHistoryModal';
import {
  type BetGroup,
  type BidQuery,
  type PnlReport,
  type PnlRow,
  type Session,
  ShowAllToggle,
  SummaryBox,
  marketOptions,
  pnlColumns,
  usePnlForm,
  usePnlMarkets,
} from './shared';

type Variant = 'oc' | 'final' | 'cutting';

const TITLE: Record<Variant, string> = {
  oc: 'OC Cutting Group',
  final: 'Final OC Cutting Group',
  cutting: 'Cutting Group',
};

interface SangamRow {
  key: 'half_sangam' | 'full_sangam';
  label: string;
  bids: number;
  amount: number;
  picks: number;
  maxPick: string | null;
  maxPay: number;
  worstNet: number;
}

type BookieReport = PnlReport & { sangam?: SangamRow[] };

interface BookieForm {
  marketId: string;
  date: string;
  session: Session;
}

export function BookieCorner({ variant }: { variant: 'oc' | 'final' | 'cutting' }) {
  // keyed so each Bookie Corner page starts with its own filters
  return <BookieView key={variant} variant={variant} />;
}

function BookieView({ variant }: { variant: Variant }) {
  const { nonce } = useRefresh();
  const markets = usePnlMarkets('main');
  const { form, query, set, submit } = usePnlForm<BookieForm>(markets.data?.markets, (marketId) => ({
    marketId,
    date: today(),
    session: 'open',
  }));
  const final = variant === 'final';

  const load = useCallback(async () => {
    if (!query) return null;
    const qs = new URLSearchParams({ marketId: query.marketId, date: query.date });
    if (!final) qs.set('session', query.session);
    return api<BookieReport>(`/pnl/bookie${final ? '/final' : ''}?${qs}`);
    // nonce: the top-bar Refresh button reloads the numbers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [final, query, nonce]);
  const report = useLoad(load);
  const data = report.data ?? null;

  const [bids, setBids] = useState<BidQuery | null>(null);
  const [allPannas, setAllPannas] = useState(false);

  const open = useCallback(
    (group: BetGroup, groupLabel: string, pick: string, label: string) => {
      if (!data) return;
      const perSession = group === 'digit' || group === 'panna';
      setBids({
        marketId: data.market.id,
        marketName: data.market.name,
        date: data.date,
        session: perSession ? data.session : undefined,
        group,
        groupLabel,
        pick,
        label,
      });
    },
    [data],
  );

  const session = data?.session;
  const withCount = variant === 'cutting';
  const digitCols = useMemo(
    () =>
      pnlColumns({
        session,
        amountLabel: 'Total Bid Amount',
        bidCount: withCount ? { onView: (r: PnlRow) => open('digit', 'Single Digit', r.pick, r.label) } : undefined,
      }),
    [session, withCount, open],
  );
  const pannaCols = useMemo(
    () =>
      pnlColumns({
        session,
        amountLabel: 'Total Bid Amount',
        bidCount: withCount ? { onView: (r: PnlRow) => open('panna', 'Pana', r.pick, r.label) } : undefined,
      }),
    [session, withCount, open],
  );
  const jodiCols = useMemo(
    () => pnlColumns({ digitsLabel: 'Jodi', bidCount: { onView: (r: PnlRow) => open('jodi', 'Jodi', r.pick, r.label) } }),
    [open],
  );
  const sangamCols = useMemo<Column<SangamRow>[]>(
    () => [
      { key: 'label', label: 'Type' },
      { key: 'bids', label: 'Bids', align: 'center', render: (s) => fmt(s.bids) },
      { key: 'amount', label: 'Total Bid Amount', align: 'center', render: (s) => amt(s.amount) },
      { key: 'picks', label: 'Picks Played', align: 'center', render: (s) => fmt(s.picks) },
      {
        key: 'maxPick',
        label: 'Costliest Pick',
        align: 'center',
        render: (s) =>
          s.maxPick ? (
            <Btn variant="link" onClick={() => open(s.key, s.label, s.maxPick!, s.maxPick!)}>
              {s.maxPick}
            </Btn>
          ) : (
            '--'
          ),
      },
      { key: 'maxPay', label: 'Amount To Pay', align: 'center', render: (s) => amt(s.maxPay) },
      {
        key: 'profit',
        label: 'Profit',
        align: 'center',
        value: (s) => Math.max(0, s.worstNet),
        render: (s) => <span className="profit">{amt(Math.max(0, s.worstNet))}</span>,
      },
      {
        key: 'loss',
        label: 'Loss',
        align: 'center',
        value: (s) => Math.max(0, -s.worstNet),
        render: (s) => <span className="loss">{amt(Math.max(0, -s.worstNet))}</span>,
      },
    ],
    [open],
  );

  const pannaRows = useMemo(
    () => (data?.tables.panna ?? []).filter((r) => allPannas || r.bids > 0),
    [data, allPannas],
  );
  const options = marketOptions(markets.data?.markets ?? []);

  return (
    <Page title={TITLE[variant]}>
      <TitleCard>{TITLE[variant]}</TitleCard>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <FilterCard onSubmit={submit} busy={report.loading && !!query}>
          <Field label="Start Date">
            <input type="date" value={form?.date ?? ''} onChange={(e) => set('date', e.target.value)} required />
          </Field>
          <Field label="Provider Name">
            <select value={form?.marketId ?? ''} onChange={(e) => set('marketId', e.target.value)} required>
              {options.length === 0 && <option value="">{markets.loading ? 'Loading…' : 'No providers'}</option>}
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.text}
                </option>
              ))}
            </select>
          </Field>
          {!final && (
            <Field label="Game Session">
              <select value={form?.session ?? 'open'} onChange={(e) => set('session', e.target.value as Session)}>
                <option value="open">Open</option>
                <option value="close">Close</option>
              </select>
            </Field>
          )}
        </FilterCard>
        <SummaryBox
          report={data}
          numbered={variant === 'oc'}
          order={final ? ['jodi', 'half_sangam', 'full_sangam'] : variant === 'oc' ? ['digit', 'panna'] : ['panna', 'digit']}
        />
      </div>

      {markets.error && <ErrorCard message={markets.error} />}
      {report.error && <ErrorCard message={report.error} />}
      {report.loading && !data && query && <Loading />}

      {data && !final && (
        <>
          <Card title="Single Digits">
            <DataTable
              columns={digitCols}
              rows={data.tables.digit ?? []}
              rowKey={(r) => r.pick}
              pageSize={10}
              initialSort={{ key: 'label', dir: 'asc' }}
            />
          </Card>
          <Card title="Panna Bids">
            <DataTable
              columns={pannaCols}
              rows={pannaRows}
              rowKey={(r) => r.pick}
              pageSize={50}
              initialSort={{ key: 'label', dir: 'asc' }}
              empty={allPannas ? 'No data available in table' : 'No pana bids for this provider, date and session'}
              toolbar={<ShowAllToggle checked={allPannas} onChange={setAllPannas} label="Show all panas" />}
            />
          </Card>
        </>
      )}

      {data && final && (
        <>
          <Card title="Jodi">
            <p className="muted" style={{ margin: '-6px 0 16px', lineHeight: 1.5 }}>
              Final OC Cutting Group covers the bets the close result decides for the whole day: Jodi (including Red
              Brackets) for every number 00–99, and Half / Full Sangam below. Open and close single digit and pana
              exposure is on OC Cutting Group and Cutting Group.
            </p>
            <DataTable
              columns={jodiCols}
              rows={data.tables.jodi ?? []}
              rowKey={(r) => r.pick}
              pageSize={50}
              initialSort={{ key: 'label', dir: 'asc' }}
            />
          </Card>
          <Card title="Sangam">
            <p className="muted" style={{ margin: '-6px 0 16px', lineHeight: 1.5 }}>
              The costliest pick is the one that would pay the most if it won; Profit / Loss is the group's total stake
              minus that payout.
            </p>
            <DataTable
              columns={sangamCols}
              rows={data.sangam ?? []}
              rowKey={(s) => s.key}
              paginate={false}
              searchable={false}
            />
          </Card>
        </>
      )}

      {bids && <BidHistoryModal query={bids} onClose={() => setBids(null)} />}
    </Page>
  );
}
