/* Results and settlement.
 *
 * Flow on the Game Result pages:
 *   1. declareResult()   saves the panna (or Andar Bahar number) for a session.
 *                        Nothing is paid yet; bids stay pending.
 *   2. winnersFor()      "Get Winners List" — who wins and what they get.
 *   3. settleMarket()    "Are you sure? → Yes" — credits winners, marks losers.
 *   4. revertResult()    takes winnings back, reopens the bids and clears the result.
 *
 * The auto-declare engine (Settings → auto results) declares and settles in one go.
 */
import { db, getSetting, nowIso, tx } from './db.js';
import { config } from './config.js';
import {
  BOTH_SESSION_TYPES,
  type GameTypeKey,
  type Kind,
  type ResultRow,
  type Session,
  gameType,
  isWinner,
  canonPanna,
  pannaDigit,
  randomJodi,
  randomPanna,
  todayStr,
  toMinutes,
} from './game.js';
import { type MarketRow, getSchedule } from './schedule.js';
import { BY_AUTO, applyTxn, money, notify } from './wallet.js';

export type { MarketRow } from './schedule.js';

export interface BidRow {
  id: number;
  user_id: number;
  market_id: number;
  market_name: string;
  kind: Kind;
  game_type: GameTypeKey;
  session: Session;
  pick: string;
  amount: number;
  rate: number;
  status: string;
  win_amount: number;
  bid_date: string;
  created_at: string;
  settled_at: string | null;
}

export interface StoredResult extends ResultRow {
  id: number;
  market_id: number;
  result_date: string;
  number: string | null;
  open_declared_at: string | null;
  close_declared_at: string | null;
  open_settled_at: string | null;
  close_settled_at: string | null;
  declared_by: string | null;
}

export class ResultError extends Error {
  status = 400;
}

export function getMarket(marketId: number): MarketRow | undefined {
  return db.prepare('SELECT * FROM markets WHERE id = ?').get(marketId) as unknown as MarketRow | undefined;
}

export function getResult(marketId: number, date: string) {
  return db
    .prepare('SELECT * FROM results WHERE market_id = ? AND result_date = ?')
    .get(marketId, date) as unknown as StoredResult | undefined;
}

/**
 * "123-64-580" for a main market (partial: "123-6*-***"), "123-6" for
 * starline, "06" for andar bahar.
 */
export function formatResult(r: ResultRow | undefined, kind: string): string {
  if (kind === 'andarbahar') return r?.number ?? '**';
  if (!r) return kind === 'starline' ? '***-*' : '***-**-***';
  if (kind === 'starline') {
    return r.open_panna ? `${r.open_panna}-${r.open_digit}` : '***-*';
  }
  const op = r.open_panna ?? '***';
  const od = r.open_digit ?? '*';
  const cd = r.close_digit ?? '*';
  const cp = r.close_panna ?? '***';
  return `${op}-${od}${cd}-${cp}`;
}

/* ----------------------------------------------------------------- scopes */

/**
 * Which bids a session's result decides.
 *   open   single digit / panna bids of the open session
 *   close  close-session bids plus jodi, red bracket and sangam (need both halves)
 * Starline and Andar Bahar only have the open session.
 */
function scopeClause(session: Session | 'all'): { sql: string; params: string[] } {
  if (session === 'all') return { sql: '1 = 1', params: [] };
  const both = BOTH_SESSION_TYPES.map(() => '?').join(',');
  if (session === 'open') {
    return { sql: `(session = 'open' AND game_type NOT IN (${both}))`, params: [...BOTH_SESSION_TYPES] };
  }
  return { sql: `(session = 'close' OR game_type IN (${both}))`, params: [...BOTH_SESSION_TYPES] };
}

function bidsInScope(marketId: number, date: string, session: Session | 'all', statuses: string[]) {
  const scope = scopeClause(session);
  const st = statuses.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT * FROM bids WHERE market_id = ? AND bid_date = ? AND status IN (${st}) AND ${scope.sql} ORDER BY id`,
    )
    .all(marketId, date, ...statuses, ...scope.params) as unknown as BidRow[];
}

/* ---------------------------------------------------------------- declare */

/**
 * Save one half of a market's result (or the andar bahar number).
 * `value` is a 3-digit panna, or a 2-digit number for andar bahar.
 * With `settle: true` winners are paid immediately (auto-declare).
 */
export function declareResult(
  marketId: number,
  date: string,
  session: Session,
  value: string,
  opts: { by?: string; settle?: boolean } = {},
) {
  const market = getMarket(marketId);
  if (!market) throw new ResultError('Market not found');
  const by = opts.by ?? BY_AUTO;
  const now = nowIso();
  const existing = getResult(marketId, date);

  if (market.kind === 'andarbahar') {
    if (!/^\d{2}$/.test(value)) throw new ResultError('Andar Bahar result must be 2 digits (00-99)');
    if (existing?.open_settled_at) throw new ResultError('Result already settled — revert it before changing');
    if (existing) {
      db.prepare('UPDATE results SET number = ?, open_declared_at = ?, declared_by = ? WHERE id = ?').run(
        value,
        now,
        by,
        existing.id,
      );
    } else {
      db.prepare(
        `INSERT INTO results (market_id, result_date, number, open_declared_at, declared_by) VALUES (?, ?, ?, ?, ?)`,
      ).run(marketId, date, value, now, by);
    }
  } else {
    if (!/^\d{3}$/.test(value)) throw new ResultError('Panna must be 3 digits');
    // stored in standard matka order (typed 321 → 123), like bid picks
    const panna = canonPanna(value);
    const half: Session = market.kind === 'starline' ? 'open' : session;
    if (half === 'open' && existing?.open_settled_at) {
      throw new ResultError('Open result already settled — revert it before changing');
    }
    if (half === 'open' && existing?.close_settled_at) {
      throw new ResultError('Close result already settled — revert it before changing the open result');
    }
    if (half === 'close' && existing?.close_settled_at) {
      throw new ResultError('Close result already settled — revert it before changing');
    }
    if (half === 'close' && !existing?.open_panna) {
      throw new ResultError('Declare the open result first');
    }
    const digit = pannaDigit(panna);
    if (!existing) {
      db.prepare(
        `INSERT INTO results (market_id, result_date, open_panna, open_digit, open_declared_at, declared_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(marketId, date, panna, digit, now, by);
    } else if (half === 'open') {
      db.prepare(
        'UPDATE results SET open_panna = ?, open_digit = ?, open_declared_at = ?, declared_by = ? WHERE id = ?',
      ).run(panna, digit, now, by, existing.id);
    } else {
      db.prepare(
        'UPDATE results SET close_panna = ?, close_digit = ?, close_declared_at = ?, declared_by = ? WHERE id = ?',
      ).run(panna, digit, now, by, existing.id);
    }
  }

  const sessionForScope: Session = market.kind === 'main' ? session : 'open';
  const settlement = opts.settle ? settleMarket(marketId, date, sessionForScope, by) : null;
  return {
    result: formatResult(getResult(marketId, date), market.kind),
    settlement,
    preview: settlement ? null : winnersFor(marketId, date, sessionForScope).totals,
  };
}

/* ---------------------------------------------------------------- winners */

export interface WinnerRow {
  bidId: number;
  userId: number;
  userName: string;
  username: string;
  mobile: string;
  gameType: GameTypeKey;
  gameLabel: string;
  session: Session;
  pick: string;
  amount: number;
  rate: number;
  winAmount: number;
  /** true once the winnings were credited */
  paid: boolean;
  createdAt: string;
}

/**
 * Winners of a market/date/session against the declared result: bids that will
 * win (still pending) and bids already paid.
 */
export function winnersFor(marketId: number, date: string, session: Session) {
  const result = getResult(marketId, date);
  const out: WinnerRow[] = [];
  if (result) {
    const bids = bidsInScope(marketId, date, session, ['pending', 'won']);
    const users = new Map<number, { name: string; username: string; mobile: string }>();
    for (const bid of bids) {
      const paid = bid.status === 'won';
      if (!paid && isWinner(bid.game_type, bid.session, bid.pick, result) !== true) continue;
      if (!users.has(bid.user_id)) {
        users.set(
          bid.user_id,
          db.prepare('SELECT name, username, mobile FROM users WHERE id = ?').get(bid.user_id) as unknown as {
            name: string;
            username: string;
            mobile: string;
          },
        );
      }
      const u = users.get(bid.user_id)!;
      out.push({
        bidId: bid.id,
        userId: bid.user_id,
        userName: u?.name ?? '',
        username: u?.username ?? '',
        mobile: u?.mobile ?? '',
        gameType: bid.game_type,
        gameLabel: gameType(bid.game_type)?.label ?? bid.game_type,
        session: bid.session,
        pick: bid.pick,
        amount: Number(bid.amount),
        rate: Number(bid.rate),
        winAmount: paid ? Number(bid.win_amount) : money(bid.amount * bid.rate),
        paid,
        createdAt: bid.created_at,
      });
    }
  }
  const pending = out.filter((w) => !w.paid);
  return {
    winners: out,
    totals: {
      winners: out.length,
      bidAmount: money(out.reduce((s, w) => s + w.amount, 0)),
      winAmount: money(out.reduce((s, w) => s + w.winAmount, 0)),
      unpaid: pending.length,
      unpaidAmount: money(pending.reduce((s, w) => s + w.winAmount, 0)),
    },
  };
}

/* ----------------------------------------------------------------- settle */

/**
 * Settle the still-pending bids a session decides: credit winners, mark losers.
 * `session: 'all'` settles everything decidable (used by the auto engine and
 * the legacy re-settle endpoint).
 */
export function settleMarket(marketId: number, date: string, session: Session | 'all' = 'all', by = BY_AUTO) {
  const result = getResult(marketId, date);
  const market = getMarket(marketId);
  if (!result || !market) return { settled: 0, won: 0, payout: 0 };

  return tx(() => {
    const bids = bidsInScope(marketId, date, session, ['pending']);
    const now = nowIso();
    let settled = 0;
    let won = 0;
    let payout = 0;

    for (const bid of bids) {
      const verdict = isWinner(bid.game_type, bid.session, bid.pick, result);
      if (verdict === null) continue;

      if (verdict) {
        const winAmount = money(bid.amount * bid.rate);
        const label = gameType(bid.game_type)?.label ?? bid.game_type;
        db.prepare(`UPDATE bids SET status = 'won', win_amount = ?, settled_at = ? WHERE id = ?`).run(
          winAmount,
          now,
          bid.id,
        );
        applyTxn({
          userId: bid.user_id,
          type: 'win',
          delta: winAmount,
          particulars: `${bid.market_name} winning`,
          note: `Amount added to wallet for ${bid.market_name} (${label} Game Win: ${bid.pick})`,
          addedBy: by,
          ref: `bid:${bid.id}`,
        });
        notify(bid.user_id, 'You won!', `${bid.market_name} ${bid.pick} — you won ${winAmount}.`);
        won += 1;
        payout += winAmount;
      } else {
        db.prepare(`UPDATE bids SET status = 'lost', settled_at = ? WHERE id = ?`).run(now, bid.id);
      }
      settled += 1;
    }

    const stamp = (half: Session) => {
      const ready = half === 'open' ? result.open_panna || result.number : result.close_panna;
      if (ready) db.prepare(`UPDATE results SET ${half}_settled_at = ? WHERE id = ?`).run(now, result.id);
    };
    if (session === 'all') {
      stamp('open');
      if (market.kind === 'main') stamp('close');
    } else {
      stamp(market.kind === 'main' ? session : 'open');
    }

    return { settled, won, payout: money(payout) };
  });
}

/* ----------------------------------------------------------------- revert */

/**
 * Undo a session's result: take back winnings already paid (the wallet may go
 * negative), set its bids back to pending and clear that half of the result.
 * Reverting the open half of a main market needs the close half reverted first.
 */
export function revertResult(marketId: number, date: string, session: Session, by: string) {
  const market = getMarket(marketId);
  const result = getResult(marketId, date);
  if (!market || !result) throw new ResultError('No result declared for this market and date');
  const half: Session = market.kind === 'main' ? session : 'open';
  if (half === 'open' && market.kind === 'main' && result.close_panna) {
    throw new ResultError('Revert the close result first');
  }

  return tx(() => {
    const bids = bidsInScope(marketId, date, half, ['won', 'lost']);
    let reverted = 0;
    let recovered = 0;
    for (const bid of bids) {
      if (bid.status === 'won' && bid.win_amount > 0) {
        applyTxn({
          userId: bid.user_id,
          type: 'revert',
          delta: -bid.win_amount,
          particulars: `${bid.market_name} result reverted`,
          note: `Winning of ${bid.win_amount} taken back (${gameType(bid.game_type)?.label ?? bid.game_type} ${bid.pick})`,
          addedBy: by,
          ref: `bid:${bid.id}`,
          allowNegative: true,
        });
        recovered += Number(bid.win_amount);
      }
      db.prepare(`UPDATE bids SET status = 'pending', win_amount = 0, settled_at = NULL WHERE id = ?`).run(bid.id);
      reverted += 1;
    }

    if (market.kind === 'andarbahar') {
      db.prepare('DELETE FROM results WHERE id = ?').run(result.id);
    } else if (half === 'open') {
      db.prepare('DELETE FROM results WHERE id = ?').run(result.id);
    } else {
      db.prepare(
        `UPDATE results SET close_panna = NULL, close_digit = NULL, close_declared_at = NULL, close_settled_at = NULL
         WHERE id = ?`,
      ).run(result.id);
    }
    return { reverted, recovered: money(recovered) };
  });
}

/**
 * "Remove History": delete a declared result. Only allowed while none of the
 * bids it decides are settled — use revertResult for settled results.
 * Without `session` the whole day's row goes. With a session on a main market
 * only that half goes: 'close' clears the close half, 'open' needs the close
 * half removed first.
 */
export function deleteResult(marketId: number, date: string, session?: Session) {
  const result = getResult(marketId, date);
  if (!result) throw new ResultError('No result for this market/date');
  const market = getMarket(marketId);
  const half = market?.kind === 'main' ? session : undefined;

  if (half === 'open' && result.close_panna) throw new ResultError('Remove or revert the close result first');
  const settled = half
    ? bidsInScope(marketId, date, half, ['won', 'lost']).length
    : (
        db
          .prepare(`SELECT COUNT(*) AS c FROM bids WHERE market_id = ? AND bid_date = ? AND status IN ('won','lost')`)
          .get(marketId, date) as { c: number }
      ).c;
  if (settled > 0) {
    throw new ResultError(`${settled} bids are already settled against this result — revert it instead`);
  }
  if (half === 'close') {
    db.prepare(
      `UPDATE results SET close_panna = NULL, close_digit = NULL, close_declared_at = NULL, close_settled_at = NULL
       WHERE id = ?`,
    ).run(result.id);
  } else {
    db.prepare('DELETE FROM results WHERE id = ?').run(result.id);
  }
  return { ok: true };
}

/** Bid counts and stakes a session's result decides (Game Result page, refund preview). */
export function bidCounts(marketId: number, date: string, session: Session | 'all') {
  const scope = scopeClause(session);
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) AS c, COALESCE(SUM(amount), 0) AS amount FROM bids
       WHERE market_id = ? AND bid_date = ? AND ${scope.sql} GROUP BY status`,
    )
    .all(marketId, date, ...scope.params) as Array<{ status: string; c: number; amount: number }>;
  const of = (status: string) => rows.find((r) => r.status === status);
  return {
    pending: Number(of('pending')?.c ?? 0),
    pendingAmount: money(Number(of('pending')?.amount ?? 0)),
    won: Number(of('won')?.c ?? 0),
    lost: Number(of('lost')?.c ?? 0),
    refunded: Number(of('refunded')?.c ?? 0),
  };
}

/** Refund every pending bid of a market/date (used when a market is cancelled). */
export function cancelMarketDay(marketId: number, date: string, reason = 'Market cancelled', by = BY_AUTO) {
  return tx(() => {
    const bids = db
      .prepare(`SELECT * FROM bids WHERE market_id = ? AND bid_date = ? AND status = 'pending'`)
      .all(marketId, date) as unknown as BidRow[];
    for (const bid of bids) {
      db.prepare(`UPDATE bids SET status = 'refunded', settled_at = ? WHERE id = ?`).run(nowIso(), bid.id);
      applyTxn({
        userId: bid.user_id,
        type: 'refund',
        delta: bid.amount,
        particulars: `${bid.market_name} refund`,
        note: reason,
        addedBy: by,
        ref: `bid:${bid.id}`,
      });
    }
    return bids.length;
  });
}

/* ------------------------------------------------------------ auto engine */

/**
 * Demo result engine: once a market's result time has passed, publish a
 * random result and pay winners, so the app has live data without an operator.
 * Switch it off in Settings (auto_declare) and declare from the admin panel.
 */
export function autoDeclareEnabled() {
  return getSetting('auto_declare', config.autoDeclare ? '1' : '0') === '1';
}

export function runAutoDeclare(now = new Date()) {
  if (!autoDeclareEnabled()) return;
  const date = todayStr(now);
  const mins = now.getHours() * 60 + now.getMinutes();
  const markets = db.prepare('SELECT * FROM markets WHERE is_active = 1').all() as unknown as MarketRow[];

  for (const m of markets) {
    const s = getSchedule(m, now.getDay());
    if (s.is_closed) continue;
    const r = getResult(m.id, date);

    if (m.kind === 'andarbahar') {
      if (mins >= toMinutes(s.open_result_time) && !r?.number) {
        declareResult(m.id, date, 'open', randomJodi(), { settle: true });
      }
      continue;
    }
    if (mins >= toMinutes(s.open_result_time) && !r?.open_panna) {
      declareResult(m.id, date, 'open', randomPanna(), { settle: true });
    }
    if (m.kind === 'main' && s.close_result_time && mins >= toMinutes(s.close_result_time)) {
      const after = getResult(m.id, date);
      if (after?.open_panna && !after.close_panna) declareResult(m.id, date, 'close', randomPanna(), { settle: true });
    }
  }
}

/** Record yesterday's closing wallet total once a day (Dashboard → Yesterday Wallet Balance). */
export function snapshotWallets(now = new Date()) {
  const date = todayStr(now);
  const have = db.prepare('SELECT 1 FROM wallet_snapshots WHERE snap_date = ?').get(date);
  if (have) return;
  const row = db
    .prepare('SELECT COALESCE(SUM(balance), 0) AS total, COUNT(*) AS users FROM users WHERE is_deleted = 0')
    .get() as { total: number; users: number };
  db.prepare('INSERT INTO wallet_snapshots (snap_date, total_balance, users, created_at) VALUES (?, ?, ?, ?)').run(
    date,
    money(Number(row.total)),
    row.users,
    nowIso(),
  );
}

/** Jobs other modules register to run on the scheduler tick (e.g. auto-delete users). */
const tickJobs: Array<{ name: string; run: (now: Date) => void }> = [];
export function onSchedulerTick(name: string, run: (now: Date) => void) {
  tickJobs.push({ name, run });
}

export function startScheduler() {
  const tick = () => {
    const now = new Date();
    for (const job of [{ name: 'auto-declare', run: runAutoDeclare }, { name: 'wallet-snapshot', run: snapshotWallets }, ...tickJobs]) {
      try {
        job.run(now);
      } catch (err) {
        console.error(`[scheduler:${job.name}]`, err);
      }
    }
  };
  tick();
  setInterval(tick, 30_000);
  console.log(`[scheduler] auto-declare ${autoDeclareEnabled() ? 'enabled' : 'disabled'} (${nowIso()})`);
}
