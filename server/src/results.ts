import { db, getSetting, nowIso } from './db.js';
import { config } from './config.js';
import {
  type GameTypeKey,
  type ResultRow,
  type Session,
  isWinner,
  pannaDigit,
  randomPanna,
  todayStr,
  toMinutes,
} from './game.js';
import { applyTxn, notify } from './wallet.js';

export interface MarketRow {
  id: number;
  name: string;
  kind: 'main' | 'starline';
  open_time: string;
  close_time: string;
  days: string;
  is_active: number;
  sort_order: number;
}

export interface BidRow {
  id: number;
  user_id: number;
  market_id: number;
  market_name: string;
  kind: string;
  game_type: GameTypeKey;
  session: Session;
  pick: string;
  amount: number;
  rate: number;
  status: string;
  win_amount: number;
  bid_date: string;
  created_at: string;
}

export function getResult(marketId: number, date: string) {
  return db
    .prepare('SELECT * FROM results WHERE market_id = ? AND result_date = ?')
    .get(marketId, date) as (ResultRow & { id: number; market_id: number; result_date: string }) | undefined;
}

/** "123-64-580" for a main market, "123-6" for starline / partial results */
export function formatResult(r: ResultRow | undefined, kind: string): string {
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

/**
 * Declare (or correct) one half of a market's result and settle every bid that
 * becomes decidable because of it.
 */
export function declareResult(marketId: number, date: string, session: Session, panna: string) {
  const digit = pannaDigit(panna);
  const existing = getResult(marketId, date);

  if (!existing) {
    db.prepare(
      `INSERT INTO results (market_id, result_date, open_panna, open_digit, close_panna, close_digit)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      marketId,
      date,
      session === 'open' ? panna : null,
      session === 'open' ? digit : null,
      session === 'close' ? panna : null,
      session === 'close' ? digit : null,
    );
  } else if (session === 'open') {
    db.prepare('UPDATE results SET open_panna = ?, open_digit = ? WHERE id = ?').run(panna, digit, existing.id);
  } else {
    db.prepare('UPDATE results SET close_panna = ?, close_digit = ? WHERE id = ?').run(panna, digit, existing.id);
  }

  return settleMarket(marketId, date);
}

/** Settle all still-pending bids for a market/date against the declared result. */
export function settleMarket(marketId: number, date: string) {
  const result = getResult(marketId, date);
  if (!result) return { settled: 0, won: 0, payout: 0 };

  const bids = db
    .prepare(`SELECT * FROM bids WHERE market_id = ? AND bid_date = ? AND status = 'pending'`)
    .all(marketId, date) as unknown as BidRow[];

  let settled = 0;
  let won = 0;
  let payout = 0;

  for (const bid of bids) {
    const verdict = isWinner(bid.game_type, bid.session, bid.pick, result);
    if (verdict === null) continue;

    if (verdict) {
      const winAmount = bid.amount * bid.rate;
      db.prepare(`UPDATE bids SET status = 'won', win_amount = ? WHERE id = ?`).run(winAmount, bid.id);
      applyTxn({
        userId: bid.user_id,
        type: 'win',
        delta: winAmount,
        particulars: `${bid.market_name} winning`,
        note: `${bid.game_type} ${bid.pick} (${bid.session})`,
      });
      notify(
        bid.user_id,
        'You won!',
        `${bid.market_name} ${bid.pick} — you won ${winAmount} coins.`,
      );
      won += 1;
      payout += winAmount;
    } else {
      db.prepare(`UPDATE bids SET status = 'lost' WHERE id = ?`).run(bid.id);
    }
    settled += 1;
  }

  return { settled, won, payout };
}

/** Refund every pending bid of a market/date (used when a market is cancelled). */
export function cancelMarketDay(marketId: number, date: string, reason = 'Market cancelled') {
  const bids = db
    .prepare(`SELECT * FROM bids WHERE market_id = ? AND bid_date = ? AND status = 'pending'`)
    .all(marketId, date) as unknown as BidRow[];
  for (const bid of bids) {
    db.prepare(`UPDATE bids SET status = 'refunded' WHERE id = ?`).run(bid.id);
    applyTxn({
      userId: bid.user_id,
      type: 'refund',
      delta: bid.amount,
      particulars: `${bid.market_name} refund`,
      note: reason,
    });
  }
  return bids.length;
}

/**
 * Demo result engine: once a market's open/close time has passed, publish a
 * random panna so the app has live data without a human operator.
 * Disable with AUTO_DECLARE=0 and use the admin routes instead.
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
    const allowed = m.days.split(',').map(Number);
    if (!allowed.includes(now.getDay())) continue;

    const r = getResult(m.id, date);
    if (mins >= toMinutes(m.open_time) && !r?.open_panna) {
      declareResult(m.id, date, 'open', randomPanna());
    }
    if (m.kind === 'main' && mins >= toMinutes(m.close_time)) {
      const after = getResult(m.id, date);
      if (!after?.close_panna) declareResult(m.id, date, 'close', randomPanna());
    }
  }
}

export function startScheduler() {
  runAutoDeclare();
  setInterval(() => {
    try {
      runAutoDeclare();
    } catch (err) {
      console.error('[scheduler]', err);
    }
  }, 30_000);
  console.log(`[scheduler] auto-declare ${autoDeclareEnabled() ? 'enabled' : 'disabled'} (${nowIso()})`);
}
