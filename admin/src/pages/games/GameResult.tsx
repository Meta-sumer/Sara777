import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { amt, dateOnly, dt, hhmm12, SESSION_LABEL, timeOnly, today } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import {
  Btn,
  Card,
  Chip,
  DataTable,
  Empty,
  Field,
  FilterCard,
  Modal,
  Page,
  Resource,
  srColumn,
  TitleCard,
  useAction,
  useConfirm,
  useToast,
  type Column,
} from '../../ui';
import { UserProfileModal } from '../users/UserProfileModal';
import {
  errorText,
  pannaDigit,
  pannaKind,
  PERM,
  TEXT,
  type BidCounts,
  type GameKind,
  type Provider,
  type ProvidersResponse,
  type ResultLine,
  type Session,
  type WinnerRow,
  type WinnersResponse,
} from './shared';

interface ResultsResponse {
  kind: GameKind;
  date: string;
  autoDeclare: boolean;
  results: ResultLine[];
}

interface PendingResponse {
  marketId: number;
  date: string;
  result: string;
  declared: { open: boolean; close: boolean };
  open: BidCounts;
  close: BidCounts | null;
  all: BidCounts;
}

interface DeclareResponse {
  marketName: string;
  session: Session;
  date: string;
  result: string;
  preview: { winners: number; winAmount: number; unpaid: number; unpaidAmount: number } | null;
}

/** What the winners popup is about. */
interface Target {
  marketId: number;
  marketName: string;
  date: string;
  session: Session;
}

const sessionText = (s: Session) => SESSION_LABEL[s] ?? s;

/** Time only when it happened on the result's own day, else the full date and time. */
const when = (iso: string | null, resultDate: string) =>
  iso && dateOnly(iso) === dateOnly(resultDate) ? timeOnly(iso) : dt(iso);

/**
 * Games / Starline / Andar Bahar → Result.
 * Declare (nothing is paid) → Get Winners List → Pay Winners & Settle → (Revert if wrong).
 */
export function GameResult({ kind }: { kind: GameKind }) {
  const { nonce } = useRefresh();
  const { can } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [, run] = useAction();
  const [searchDate, setSearchDate] = useState(today());
  const [target, setTarget] = useState<Target | null>(null);
  const [formNonce, setFormNonce] = useState(0);
  const main = kind === 'main';
  const canRevert = can(`${PERM[kind]}.revert`);
  const canRefund = main && can('games.refund');

  const loadProviders = useCallback(
    () => api<ProvidersResponse>(`/games/${kind}/providers`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, nonce],
  );
  const providers = useLoad(loadProviders);
  const loadResults = useCallback(
    () => api<ResultsResponse>(`/games/${kind}/results?date=${searchDate}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, searchDate, nonce],
  );
  const results = useLoad(loadResults);
  const autoDeclare = results.data?.autoDeclare;

  const changed = async () => {
    setFormNonce((n) => n + 1);
    await results.reload();
  };

  const revert = (l: ResultLine) =>
    run(async () => {
      const settledBids = l.bids.won + l.bids.lost;
      const ok = await confirm({
        title: 'Are you sure?',
        message: (
          <>
            Revert the {main ? `${sessionText(l.session)} ` : ''}result <strong>{l.display}</strong> of{' '}
            <strong>{l.marketName}</strong> for {dateOnly(l.resultDate)}?{' '}
            {l.bids.won > 0
              ? `${l.bids.won} winning bids (${amt(l.winAmount)}) are taken back from the players' wallets — a wallet may go negative. `
              : ''}
            {settledBids > 0 ? `All ${settledBids} settled bids go back to pending. ` : ''}
            The result is cleared so you can declare it again.
            {autoDeclare ? ' Auto declare is ON, so a new random result is declared at the next run.' : ''}
          </>
        ),
        confirmText: 'Yes, revert',
        danger: true,
      });
      if (!ok) return;
      const out = await api<{ message: string }>('/games/results/revert', {
        method: 'POST',
        body: { marketId: l.marketId, date: l.resultDate, session: l.session },
      });
      toast(out.message);
      await changed();
    });

  const remove = (l: ResultLine) =>
    run(async () => {
      const ok = await confirm({
        title: 'Are you sure?',
        message: `Remove the ${main ? `${sessionText(l.session)} ` : ''}result ${l.display} of ${l.marketName} for ${dateOnly(l.resultDate)}? No bids are settled against it, so nothing is paid or taken back.`,
        confirmText: 'Yes, remove',
        danger: true,
      });
      if (!ok) return;
      const out = await api<{ message: string }>('/games/results', {
        method: 'DELETE',
        body: { marketId: l.marketId, date: l.resultDate, session: l.session },
      });
      toast(out.message);
      await changed();
    });

  const refund = (marketId: number, marketName: string, date: string) =>
    run(async () => {
      const p = await api<PendingResponse>(`/games/results/pending?marketId=${marketId}&date=${date}`);
      if (p.all.pending === 0) {
        toast(`No pending bids on ${marketName} for ${dateOnly(date)}`, true);
        return;
      }
      const ok = await confirm({
        title: 'Are you sure?',
        message: `Refund ${p.all.pending} pending bids (${amt(p.all.pendingAmount)}) on ${marketName} for ${dateOnly(date)}? Every pending bid of that date goes back to the player's wallet. To stop new bids today, mark the day Closed in Game Settings.`,
        confirmText: 'Yes, refund',
        danger: true,
      });
      if (!ok) return;
      const out = await api<{ message: string }>('/games/results/refund', { method: 'POST', body: { marketId, date } });
      toast(out.message);
      await changed();
    });

  const columns: Column<ResultLine>[] = [
    srColumn('Sr.'),
    { key: 'marketName', label: 'Game Name', render: (l) => <strong>{l.marketName}</strong> },
  ];
  if (main) {
    columns.push({ key: 'session', label: 'Session', value: (l) => sessionText(l.session) });
  }
  columns.push(
    {
      key: 'resultDate',
      label: 'Result Date',
      value: (l) => l.declaredAt ?? l.resultDate,
      render: (l) => (
        <div>
          {dateOnly(l.resultDate)}
          <div className="muted text-[12px]">
            Declared {when(l.declaredAt, l.resultDate)}
            {l.declaredBy ? ` by ${l.declaredBy}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'display',
      label: 'Winning Digits',
      render: (l) => (
        <div>
          <strong className="font-mono text-[15px] text-[#323a46]">{l.display}</strong>
          {main && l.session === 'close' && <div className="muted text-[12px]">Full: {l.fullResult}</div>}
        </div>
      ),
    },
    {
      key: 'winners',
      label: 'Winners',
      align: 'center',
      render: (l) => (
        <div>
          {l.winners}
          <div className="muted text-[12px]">{amt(l.winAmount)}</div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      value: (l) => l.status,
      render: (l) =>
        l.status === 'pending' ? (
          <div>
            <Chip tone="pending">Pending payout</Chip>
            <div className="muted text-[12px]">{l.bids.pending} bids to settle</div>
          </div>
        ) : l.status === 'settled' ? (
          <div>
            <Chip tone="ok">Settled</Chip>
            <div className="muted text-[12px]">{when(l.settledAt, l.resultDate)}</div>
          </div>
        ) : (
          <Chip tone="info">No bids to settle</Chip>
        ),
    },
    {
      key: 'getWinners',
      label: 'Get Winners',
      align: 'center',
      sortable: false,
      render: (l) => (
        <Btn
          variant="indigo"
          sm
          icon="winners"
          onClick={() => setTarget({ marketId: l.marketId, marketName: l.marketName, date: l.resultDate, session: l.session })}
        >
          Get Winners List
        </Btn>
      ),
    },
    {
      // settled results are reverted (winnings taken back); unsettled ones are simply removed
      key: 'actions',
      label: 'Revert / Remove',
      align: 'center',
      sortable: false,
      render: (l) => {
        const settled = l.bids.won + l.bids.lost > 0;
        const blocked = l.closeDeclared ? 'Revert or remove the Close result first' : undefined;
        return (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {settled && canRevert && (
              <Btn variant="warning" sm icon="history" disabled={!!blocked} title={blocked} onClick={() => void revert(l)}>
                Revert
              </Btn>
            )}
            {!settled && (
              <Btn variant="danger" sm icon="trash" disabled={!!blocked} title={blocked} onClick={() => void remove(l)}>
                Remove
              </Btn>
            )}
            {canRefund && l.bids.pending > 0 && (
              <Btn variant="dark" sm onClick={() => void refund(l.marketId, l.marketName, l.resultDate)}>
                Refund
              </Btn>
            )}
          </div>
        );
      },
    },
  );

  return (
    <Page title={TEXT[kind].result}>
      <TitleCard>{TEXT[kind].resultCard}</TitleCard>
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <Resource state={providers}>
          {(data) => (
            <DeclareCard
              kind={kind}
              providers={data.providers.filter((p) => p.isActive)}
              formNonce={formNonce}
              canRefund={canRefund}
              onRefund={refund}
              onDeclared={async (date) => {
                setSearchDate(date);
                await changed();
              }}
              onWinners={setTarget}
            />
          )}
        </Resource>
        <SearchCard date={searchDate} onSearch={setSearchDate} />
      </div>

      <Card title={`Result History — ${dateOnly(searchDate)}`}>
        {autoDeclare !== undefined && (
          <p className="muted mb-4 mt-0 flex flex-wrap items-center gap-2">
            <Chip tone={autoDeclare ? 'warn' : 'info'}>Auto declare {autoDeclare ? 'ON' : 'OFF'}</Chip>
            {autoDeclare
              ? 'Results are declared and paid automatically at each result time; a result you revert is declared again at the next run. Switch it off in Others → General Settings to declare by hand.'
              : 'Results are only declared from this page. Winners are paid when you settle them from Get Winners List.'}
          </p>
        )}
        <Resource state={results}>
          {(data) => (
            <DataTable
              columns={columns}
              rows={data.results}
              rowKey={(l) => `${l.marketId}-${l.session}`}
              empty={`No results declared for ${dateOnly(data.date)}`}
            />
          )}
        </Resource>
      </Card>

      {target && (
        <WinnersModal kind={kind} target={target} onClose={() => setTarget(null)} onChanged={changed} />
      )}
    </Page>
  );
}

/* ----------------------------------------------------------- declaration */

function DeclareCard({
  kind,
  providers,
  formNonce,
  canRefund,
  onRefund,
  onDeclared,
  onWinners,
}: {
  kind: GameKind;
  providers: Provider[];
  formNonce: number;
  canRefund: boolean;
  onRefund: (marketId: number, marketName: string, date: string) => Promise<void>;
  onDeclared: (date: string) => Promise<void>;
  onWinners: (t: Target) => void;
}) {
  const toast = useToast();
  const main = kind === 'main';
  const ab = kind === 'andarbahar';
  const [marketId, setMarketId] = useState<number>(providers[0]?.id ?? 0);
  const [session, setSession] = useState<Session>('open');
  const [date, setDate] = useState(today());
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<PendingResponse | null>(null);
  const [last, setLast] = useState<(DeclareResponse & { marketId: number }) | null>(null);
  const [localNonce, setLocalNonce] = useState(0);
  const market = providers.find((p) => p.id === marketId);

  // keep a valid provider selected when the list changes
  useEffect(() => {
    if (!providers.some((p) => p.id === marketId)) setMarketId(providers[0]?.id ?? 0);
  }, [providers, marketId]);

  // current result + pending bids of the chosen provider and date
  useEffect(() => {
    if (!marketId || !date) return;
    let alive = true;
    api<PendingResponse>(`/games/results/pending?marketId=${marketId}&date=${date}`)
      .then((p) => {
        if (!alive) return;
        setPending(p);
        // main markets: once the open half is out, the next one to declare is close
        if (kind === 'main') setSession(p.declared.open && !p.declared.close ? 'close' : 'open');
      })
      .catch(() => alive && setPending(null));
    return () => {
      alive = false;
    };
  }, [kind, marketId, date, formNonce, localNonce]);

  const digit = ab ? '' : pannaDigit(value);

  const reset = () => {
    setValue('');
    setError('');
    setDate(today());
    setLast(null);
  };

  const submit = async () => {
    setError('');
    if (!market) return setError('Choose a provider');
    if (ab ? !/^\d{2}$/.test(value) : !/^\d{3}$/.test(value)) {
      return setError(ab ? 'Enter the 2 digit winning number (00-99)' : 'Enter the 3 digit winning panna');
    }
    setBusy(true);
    try {
      const out = await api<DeclareResponse>('/games/results', {
        method: 'POST',
        body: { marketId: market.id, date, session: main ? session : 'open', value },
      });
      setLast({ ...out, marketId: market.id });
      setValue('');
      toast(`${out.marketName}: ${out.result} declared`);
      setLocalNonce((n) => n + 1);
      await onDeclared(out.date);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (providers.length === 0) {
    return (
      <Card>
        <p className="card-sub">Enter Your Game Result</p>
        <Empty>No active providers — add or activate one on the Provider page.</Empty>
      </Card>
    );
  }

  const optionLabel = (p: Provider) =>
    main || p.name.includes(hhmm12(p.openTime)) ? p.name : `${p.name} (${hhmm12(p.today.openResultTime)})`;

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="card-sub">Enter Your Game Result</p>
      <div
        className={`grid grid-cols-1 items-end gap-4 sm:grid-cols-2 ${
          main
            ? 'xl:grid-cols-[1.5fr_1fr_1.3fr_1.1fr_0.8fr]'
            : ab
              ? 'xl:grid-cols-[1.6fr_1.3fr_1.1fr]'
              : 'xl:grid-cols-[1.6fr_1.3fr_1.1fr_0.8fr]'
        }`}
      >
      <Field label="Provider Name">
        <select value={marketId} onChange={(e) => setMarketId(Number(e.target.value))}>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {optionLabel(p)}
            </option>
          ))}
        </select>
      </Field>
      {main && (
        <Field label="Session">
          <select value={session} onChange={(e) => setSession(e.target.value as Session)}>
            <option value="open">Open</option>
            <option value="close">Close</option>
          </select>
        </Field>
      )}
      <Field label="Result Date">
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label={ab ? 'Winning Digit' : 'Winning Panna'}>
        <input
          value={value}
          inputMode="numeric"
          maxLength={ab ? 2 : 3}
          placeholder={ab ? '00-99' : 'e.g. 123'}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, ab ? 2 : 3))}
        />
      </Field>
      {!ab && (
        <Field label="Winning Digit">
          <input
            readOnly
            tabIndex={-1}
            value={digit}
            placeholder="Auto"
            title="Last digit of the sum of the panna's three digits"
            className="bg-[#f4f5f7] font-bold"
          />
        </Field>
      )}
      </div>

      <div className="mt-3 text-[13px]">
        {!ab && digit && (
          <div className="muted">
            {value.split('').join(' + ')} = {value.split('').reduce((s, d) => s + Number(d), 0)} → digit{' '}
            <strong className="text-[#323a46]">{digit}</strong> · {pannaKind(value)}
          </div>
        )}
        {pending && market && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              Current result: <strong className="font-mono">{pending.result}</strong>
            </span>
            <span className="muted">
              Pending bids:{' '}
              {main && pending.close
                ? `Open ${pending.open.pending} (${amt(pending.open.pendingAmount)}) · Close ${pending.close.pending} (${amt(pending.close.pendingAmount)})`
                : `${pending.open.pending} (${amt(pending.open.pendingAmount)})`}
            </span>
            {canRefund && pending.all.pending > 0 && (
              <Btn variant="link" className="text-[13px]" onClick={() => void onRefund(market.id, market.name, date)}>
                Refund pending bids
              </Btn>
            )}
          </div>
        )}
        {last && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-[#e3f8ee] bg-[#f3fcf7] px-3 py-2">
            <span>
              <strong>{last.marketName}</strong> {main ? `${sessionText(last.session)} ` : ''}
              <strong className="font-mono">{last.result}</strong> declared ·{' '}
              {last.preview ? `${last.preview.winners} winners, ${amt(last.preview.winAmount)} to pay` : 'settled'} · nothing
              is paid until you settle.
            </span>
            <Btn
              variant="indigo"
              sm
              icon="winners"
              onClick={() =>
                onWinners({ marketId: last.marketId, marketName: last.marketName, date: last.date, session: last.session })
              }
            >
              Get Winners List
            </Btn>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>
      <div className="form-actions">
        <Btn variant="danger" onClick={reset}>
          Cancel
        </Btn>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : 'Submit'}
        </button>
      </div>
    </form>
  );
}

function SearchCard({ date, onSearch }: { date: string; onSearch: (d: string) => void }) {
  const [value, setValue] = useState(date);
  useEffect(() => setValue(date), [date]);
  return (
    <FilterCard title="Search Result" onSubmit={() => value && onSearch(value)}>
      <Field label="Result Date">
        <input type="date" value={value} max={today()} onChange={(e) => setValue(e.target.value)} />
      </Field>
    </FilterCard>
  );
}

/* --------------------------------------------------------------- winners */

function WinnersModal({
  kind,
  target,
  onClose,
  onChanged,
}: {
  kind: GameKind;
  target: Target;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, run] = useAction();
  const [profile, setProfile] = useState<number | null>(null);
  const main = kind === 'main';
  const load = useCallback(
    () =>
      api<WinnersResponse>(
        `/games/results/winners?marketId=${target.marketId}&date=${target.date}&session=${target.session}`,
      ),
    [target],
  );
  const state = useLoad(load);
  const data = state.data;

  const settle = () =>
    run(async () => {
      if (!data) return;
      const t = data.totals;
      const ok = await confirm({
        title: 'Are you sure?',
        message:
          t.unpaid > 0
            ? `Pay ${amt(t.unpaidAmount)} to ${t.unpaid} winning bids and settle ${data.bids.pending} pending bids of ${data.market.name}? The amount is credited to the players' wallets; losing bids are marked lost.`
            : `There are no winners to pay. Settle ${data.bids.pending} pending bids of ${data.market.name} as lost?`,
        confirmText: 'Yes',
      });
      if (!ok) return;
      const out = await api<{ message: string }>('/games/results/settle', {
        method: 'POST',
        body: { marketId: target.marketId, date: target.date, session: target.session },
      });
      toast(out.message);
      await state.reload();
      await onChanged();
    });

  const columns: Column<WinnerRow>[] = [
    srColumn('Sr.'),
    {
      key: 'userName',
      label: 'User',
      render: (w) => (
        <Btn variant="link" onClick={() => setProfile(w.userId)}>
          {w.userName || '--'}
        </Btn>
      ),
    },
    {
      key: 'username',
      label: 'Username / Mobile',
      value: (w) => `${w.username} ${w.mobile}`,
      render: (w) => (
        <div>
          {w.username || '--'}
          {w.mobile && w.mobile !== w.username && <div className="muted text-[12px]">{w.mobile}</div>}
        </div>
      ),
    },
    { key: 'gameLabel', label: 'Game Type' },
  ];
  if (main) columns.push({ key: 'session', label: 'Session', value: (w) => sessionText(w.session) });
  columns.push(
    { key: 'pick', label: 'Pick', render: (w) => <strong className="font-mono">{w.pick}</strong> },
    { key: 'amount', label: 'Bid Amount', align: 'right', render: (w) => amt(w.amount) },
    {
      key: 'winAmount',
      label: 'Win Amount',
      align: 'right',
      render: (w) => (
        <div>
          <span className="profit">{amt(w.winAmount)}</span>
          <div className="muted text-[12px]">×{amt(w.rate)}</div>
        </div>
      ),
    },
    {
      key: 'paid',
      label: 'Paid',
      align: 'center',
      value: (w) => (w.paid ? 'Paid' : 'Unpaid'),
      render: (w) => <Chip tone={w.paid ? 'ok' : 'pending'}>{w.paid ? 'Paid' : 'Not paid'}</Chip>,
    },
  );

  const canSettle = !!data && data.declared && data.bids.pending > 0;
  const footer = data && (
    <>
      <span className="muted mr-auto self-center text-[13px]">
        {data.settledAt && data.bids.pending === 0
          ? `Settled on ${dt(data.settledAt)}`
          : `${data.bids.pending} bids waiting to be settled`}
      </span>
      <Btn variant="ghost" onClick={onClose}>
        Close
      </Btn>
      {canSettle && (
        <Btn variant="success" icon="check" disabled={busy} onClick={() => void settle()}>
          {data.totals.unpaid > 0 ? `Pay Winners & Settle (${amt(data.totals.unpaidAmount)})` : 'Settle (no winners)'}
        </Btn>
      )}
    </>
  );

  return (
    <>
      <Modal
        title={`Winners — ${target.marketName}${main ? ` · ${sessionText(target.session)}` : ''} · ${dateOnly(target.date)}`}
        onClose={onClose}
        size="xl"
        footer={footer}
      >
        <Resource state={state}>
          {(d) => (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                <span>
                  Result: <strong className="font-mono text-[15px] text-[#323a46]">{d.result}</strong>
                </span>
                <span>
                  Winners: <strong>{d.totals.winners}</strong>
                </span>
                <span>
                  Total bid: <strong>{amt(d.totals.bidAmount)}</strong>
                </span>
                <span>
                  Total win: <strong className="profit">{amt(d.totals.winAmount)}</strong>
                </span>
                <span>
                  Unpaid: <strong>{amt(d.totals.unpaidAmount)}</strong>
                </span>
                {d.settledAt && d.bids.pending === 0 ? (
                  <Chip tone="ok">Settled</Chip>
                ) : (
                  <Chip tone="pending">Pending payout</Chip>
                )}
              </div>
              {main && (
                <p className="muted mb-3 mt-0 text-[13px]">
                  {d.session === 'open'
                    ? 'The Open result settles open-session Single Digit and Panna bids.'
                    : 'The Close result settles close-session Single Digit and Panna bids plus Jodi, Red Brackets and Sangam bids.'}
                </p>
              )}
              <DataTable
                columns={columns}
                rows={d.winners}
                rowKey={(w) => w.bidId}
                empty={d.declared ? 'No winning bids for this result' : 'This result is not declared'}
                footer={
                  d.winners.length > 0 ? (
                    <tr>
                      <td colSpan={main ? 6 : 5} className="right">
                        Total ({d.totals.winners} winners)
                      </td>
                      <td className="right">{amt(d.totals.bidAmount)}</td>
                      <td className="right">{amt(d.totals.winAmount)}</td>
                      <td />
                    </tr>
                  ) : undefined
                }
              />
            </>
          )}
        </Resource>
      </Modal>
      {profile !== null && <UserProfileModal userId={profile} onClose={() => setProfile(null)} />}
    </>
  );
}
