/* Starline + Andar Bahar profit/loss, Bookie Corner, bid history popup (mounted at /api/admin/pnl)
 *
 * Every table answers "what if this outcome wins?" for one market, date and session:
 *   Amount To Pay(x) = Σ amount × rate of the bids on x (each bid keeps the rate it was placed at)
 *   Net(x)           = total stake of the bet group − Amount To Pay(x)
 *   Profit = Net when it is ≥ 0, Loss = −Net when it is < 0.
 * Single, double and triple pannas share one "Pana" group. Refunded bids are left out
 * (pending, won and lost bids all count).
 */
import { Router, type Request } from 'express';
import { all } from '../../db.js';
import { type AdminRequest, requirePerm } from '../../auth.js';
import {
  ALL_PANNAS,
  type GameTypeKey,
  type Kind,
  PANNA_TYPES,
  type Session,
  formatTime12,
  gameType,
  pannaDigit,
  pannaType,
} from '../../game.js';
import { allRates } from '../../rates.js';
import { type MarketRow, formatResult, getMarket, getResult } from '../../results.js';
import { money } from '../../wallet.js';
import { badRequest, qDate, str } from './util.js';

export const pnlRouter = Router();

const ALL_KEYS = ['starline.pnl', 'andarbahar.pnl', 'bookie.oc', 'bookie.final', 'bookie.cutting'];

/** Bet groups a P&L table is built from. */
type Group = 'digit' | 'panna' | 'jodi' | 'ab' | 'half_sangam' | 'full_sangam';

const GROUPS: Record<Group, { label: string; types: GameTypeKey[]; kinds: Kind[]; perSession: boolean }> = {
  digit: { label: 'Single Digit', types: ['single_digit'], kinds: ['main', 'starline'], perSession: true },
  panna: { label: 'Pana', types: PANNA_TYPES, kinds: ['main', 'starline'], perSession: true },
  jodi: { label: 'Jodi', types: ['jodi_digit', 'red_bracket'], kinds: ['main'], perSession: false },
  ab: { label: 'Jodi', types: ['ab_jodi'], kinds: ['andarbahar'], perSession: false },
  half_sangam: { label: 'Half Sangam', types: ['half_sangam'], kinds: ['main'], perSession: false },
  full_sangam: { label: 'Full Sangam', types: ['full_sangam'], kinds: ['main'], perSession: false },
};

const DIGITS = Array.from({ length: 10 }, (_, i) => String(i));
const NUMBERS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));
const PANNAS = [...ALL_PANNAS].sort();

/* --------------------------------------------------------------- helpers */

function assertPerm(req: Request, ...keys: string[]) {
  const admin = (req as AdminRequest).admin;
  if (admin && (admin.isSuper || keys.some((k) => admin.permissions.has(k)))) return;
  throw badRequest('You do not have permission for this page', 403);
}

/** The permission keys that open a group's numbers for a market kind. */
function permsFor(kind: Kind, group: Group): string[] {
  if (kind === 'starline') return ['starline.pnl'];
  if (kind === 'andarbahar') return ['andarbahar.pnl'];
  return group === 'digit' || group === 'panna' ? ['bookie.oc', 'bookie.cutting'] : ['bookie.final'];
}

function reqDate(req: Request): string {
  const raw = str(req.query.date);
  if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw badRequest('Date must be YYYY-MM-DD');
  return qDate(req);
}

function reqSession(req: Request): Session {
  const s = str(req.query.session) || 'open';
  if (s !== 'open' && s !== 'close') throw badRequest('Game session must be open or close');
  return s;
}

function reqMarket(req: Request, kind: Kind): MarketRow {
  const id = Number(req.query.marketId);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Choose a provider');
  const m = getMarket(id);
  if (!m || m.kind !== kind) throw badRequest('Provider not found', 404);
  return m;
}

/** Current rate per game type for a kind: the rate shown in formulas of rows nobody bet on. */
function currentRates(kind: Kind): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of allRates(kind)) map.set(r.key, r.rate);
  return map;
}

function rateFor(rates: Map<string, number>, kind: Kind, type: GameTypeKey): number {
  return rates.get(type) ?? gameType(type)?.rates[kind] ?? 0;
}

interface Agg {
  pick: string;
  type: GameTypeKey;
  rate: number;
  bids: number;
  amount: number;
}

/** One grouped query: bid count and stake per pick and rate for a group. */
function aggregate(m: MarketRow, date: string, group: Group, session: Session | null): Agg[] {
  const g = GROUPS[group];
  const where = ['market_id = ?', 'bid_date = ?', `status <> 'refunded'`, `game_type IN (${g.types.map(() => '?').join(',')})`];
  const params: Array<string | number> = [m.id, date, ...g.types];
  if (g.perSession && session) {
    where.push('session = ?');
    params.push(session);
  }
  return all<Agg>(
    `SELECT pick, game_type AS type, rate, COUNT(*) AS bids, COALESCE(SUM(amount), 0) AS amount
     FROM bids WHERE ${where.join(' AND ')}
     GROUP BY pick, game_type, rate ORDER BY pick`,
    ...params,
  ).map((a) => ({ ...a, rate: Number(a.rate), bids: Number(a.bids), amount: Number(a.amount) }));
}

export interface PnlRow {
  pick: string;
  /** what the Digits column shows: "5", "123-6", "07" */
  label: string;
  bids: number;
  amount: number;
  toPay: number;
  /** "1750*100", or "1000*100 + 750*90" when the rate changed during the day */
  formula: string;
  net: number;
  profit: number;
  loss: number;
}

/** Rows for every candidate outcome (plus any other pick that has bids). */
function buildRows(
  aggs: Agg[],
  candidates: string[],
  label: (pick: string) => string,
  emptyRate: (pick: string) => number,
): { rows: PnlRow[]; bids: number; amount: number } {
  const byPick = new Map<string, { bids: number; amount: number; toPay: number; parts: string[] }>();
  let bids = 0;
  let amount = 0;
  for (const a of aggs) {
    const cur = byPick.get(a.pick) ?? { bids: 0, amount: 0, toPay: 0, parts: [] };
    cur.bids += a.bids;
    cur.amount += a.amount;
    cur.toPay += a.amount * a.rate;
    cur.parts.push(`${money(a.amount)}*${a.rate}`);
    byPick.set(a.pick, cur);
    bids += a.bids;
    amount += a.amount;
  }
  const total = money(amount);
  const picks = [...candidates, ...[...byPick.keys()].filter((p) => !candidates.includes(p)).sort()];
  const rows = picks.map((pick) => {
    const cur = byPick.get(pick);
    const toPay = money(cur?.toPay ?? 0);
    const net = money(total - toPay);
    return {
      pick,
      label: label(pick),
      bids: cur?.bids ?? 0,
      amount: money(cur?.amount ?? 0),
      toPay,
      formula: cur ? cur.parts.join(' + ') : `0*${emptyRate(pick)}`,
      net,
      profit: net >= 0 ? net : 0,
      loss: net < 0 ? money(-net) : 0,
    };
  });
  return { rows, bids, amount: total };
}

function digitRows(m: MarketRow, date: string, session: Session | null, rates: Map<string, number>) {
  return buildRows(aggregate(m, date, 'digit', session), DIGITS, (p) => p, () => rateFor(rates, m.kind, 'single_digit'));
}

function pannaRows(m: MarketRow, date: string, session: Session | null, rates: Map<string, number>) {
  const typeOf = (p: string): GameTypeKey => `${pannaType(p)}_panna` as GameTypeKey;
  return buildRows(
    aggregate(m, date, 'panna', session),
    PANNAS,
    (p) => (/^\d{3}$/.test(p) ? `${p}-${pannaDigit(p)}` : p),
    (p) => rateFor(rates, m.kind, typeOf(p)),
  );
}

function numberRows(m: MarketRow, date: string, group: 'ab' | 'jodi', rates: Map<string, number>) {
  return buildRows(aggregate(m, date, group, null), NUMBERS, (p) => p, () =>
    rateFor(rates, m.kind, group === 'ab' ? 'ab_jodi' : 'jodi_digit'),
  );
}

function marketInfo(m: MarketRow) {
  return { id: m.id, name: m.name, kind: m.kind, time: m.open_time, timeLabel: formatTime12(m.open_time) };
}

/** The declared result for context ("--" parts when only half is out), or null before any result. */
function resultText(m: MarketRow, date: string): string | null {
  const r = getResult(m.id, date);
  if (!r || (!r.open_panna && !r.close_panna && !r.number)) return null;
  return formatResult(r, m.kind);
}

/* ---------------------------------------------------------------- routes */

/** Providers for the search panels: ?kind=main|starline|andarbahar */
pnlRouter.get('/markets', requirePerm(...ALL_KEYS), (req, res) => {
  const kind = str(req.query.kind) as Kind;
  if (kind === 'starline') assertPerm(req, 'starline.pnl');
  else if (kind === 'andarbahar') assertPerm(req, 'andarbahar.pnl');
  else if (kind === 'main') assertPerm(req, 'bookie.oc', 'bookie.final', 'bookie.cutting');
  else throw badRequest('Unknown game kind');
  const order = kind === 'main' ? 'sort_order, id' : 'open_time, sort_order, id';
  const rows = all<MarketRow>(`SELECT * FROM markets WHERE kind = ? ORDER BY ${order}`, kind);
  res.json({ markets: rows.map((m) => ({ ...marketInfo(m), isActive: !!m.is_active })) });
});

/**
 * Starline / Andar Bahar profit and loss for one slot and date.
 *   ?kind=starline|andarbahar&marketId=&date=YYYY-MM-DD
 * Starline: Single Digit (0–9) and Pana (all 220 pannas; `bids` = 0 where nobody bet).
 * Andar Bahar: Jodi 00–99.
 */
pnlRouter.get('/game', requirePerm('starline.pnl', 'andarbahar.pnl'), (req, res) => {
  const kind = str(req.query.kind);
  if (kind !== 'starline' && kind !== 'andarbahar') throw badRequest('Kind must be starline or andarbahar');
  assertPerm(req, `${kind}.pnl`);
  const m = reqMarket(req, kind);
  const date = reqDate(req);
  const rates = currentRates(kind);

  if (kind === 'andarbahar') {
    const ab = numberRows(m, date, 'ab', rates);
    return res.json({
      market: marketInfo(m),
      date,
      result: resultText(m, date),
      summary: [{ key: 'ab', label: 'Jodi', bids: ab.bids, amount: ab.amount }],
      total: { bids: ab.bids, amount: ab.amount },
      tables: { ab: ab.rows },
    });
  }

  const digit = digitRows(m, date, null, rates);
  const panna = pannaRows(m, date, null, rates);
  res.json({
    market: marketInfo(m),
    date,
    result: resultText(m, date),
    summary: [
      { key: 'panna', label: 'Pana', bids: panna.bids, amount: panna.amount },
      { key: 'digit', label: 'Single Digit', bids: digit.bids, amount: digit.amount },
    ],
    total: { bids: digit.bids + panna.bids, amount: money(digit.amount + panna.amount) },
    tables: { digit: digit.rows, panna: panna.rows },
  });
});

/**
 * Bookie Corner (OC) Cutting Group: one main market, date and session.
 *   ?marketId=&date=&session=open|close
 */
pnlRouter.get('/bookie', requirePerm('bookie.oc', 'bookie.cutting'), (req, res) => {
  const m = reqMarket(req, 'main');
  const date = reqDate(req);
  const session = reqSession(req);
  const rates = currentRates('main');
  const digit = digitRows(m, date, session, rates);
  const panna = pannaRows(m, date, session, rates);
  res.json({
    market: marketInfo(m),
    date,
    session,
    result: resultText(m, date),
    summary: [
      { key: 'digit', label: 'Single Digit', bids: digit.bids, amount: digit.amount },
      { key: 'panna', label: 'Pana', bids: panna.bids, amount: panna.amount },
    ],
    total: { bids: digit.bids + panna.bids, amount: money(digit.amount + panna.amount) },
    tables: { digit: digit.rows, panna: panna.rows },
  });
});

/**
 * Final OC Cutting Group: the bets the close result decides for one main market and date.
 *   ?marketId=&date=
 * Jodi table 00–99 over jodi + red bracket bids, plus a half / full sangam summary
 * with the biggest payout a single pick could cost.
 */
pnlRouter.get('/bookie/final', requirePerm('bookie.final'), (req, res) => {
  const m = reqMarket(req, 'main');
  const date = reqDate(req);
  const rates = currentRates('main');
  const jodi = numberRows(m, date, 'jodi', rates);

  const sangam = (['half_sangam', 'full_sangam'] as const).map((group) => {
    const out = buildRows(aggregate(m, date, group, null), [], (p) => p, () => 0);
    const top = out.rows.reduce<PnlRow | null>((best, r) => (!best || r.toPay > best.toPay ? r : best), null);
    return {
      key: group,
      label: GROUPS[group].label,
      bids: out.bids,
      amount: out.amount,
      picks: out.rows.length,
      maxPick: top?.label ?? null,
      maxPay: top?.toPay ?? 0,
      /** stake of the group minus the biggest single-pick payout */
      worstNet: top ? top.net : out.amount,
    };
  });

  const summary = [{ key: 'jodi', label: 'Jodi', bids: jodi.bids, amount: jodi.amount }, ...sangam.map((s) => ({
    key: s.key,
    label: s.label,
    bids: s.bids,
    amount: s.amount,
  }))];
  res.json({
    market: marketInfo(m),
    date,
    result: resultText(m, date),
    summary,
    total: {
      bids: summary.reduce((n, s) => n + s.bids, 0),
      amount: money(summary.reduce((n, s) => n + s.amount, 0)),
    },
    tables: { jodi: jodi.rows },
    sangam,
  });
});

/**
 * Bid History popup: the bids behind one row.
 *   ?marketId=&date=&group=digit|panna|jodi|ab|half_sangam|full_sangam&pick=&session=open|close
 * `session` only applies to single digit and pana bids of a main market.
 */
pnlRouter.get('/bids', requirePerm(...ALL_KEYS), (req, res) => {
  const group = str(req.query.group) as Group;
  if (!(group in GROUPS)) throw badRequest('Unknown bet group');
  const id = Number(req.query.marketId);
  const m = Number.isInteger(id) && id > 0 ? getMarket(id) : undefined;
  if (!m) throw badRequest('Provider not found', 404);
  const g = GROUPS[group];
  if (!g.kinds.includes(m.kind)) throw badRequest(`${g.label} is not played on this provider`);
  assertPerm(req, ...permsFor(m.kind, group));
  const date = reqDate(req);
  const pick = str(req.query.pick);
  if (!pick || pick.length > 20) throw badRequest('Choose a digit, pana or number');

  const where = ['b.market_id = ?', 'b.bid_date = ?', 'b.pick = ?', `b.status <> 'refunded'`];
  const params: Array<string | number> = [m.id, date, pick];
  where.push(`b.game_type IN (${g.types.map(() => '?').join(',')})`);
  params.push(...g.types);
  if (g.perSession && m.kind === 'main') {
    where.push('b.session = ?');
    params.push(reqSession(req));
  }

  const rows = all<{
    id: number;
    user_id: number;
    username: string | null;
    name: string;
    game_type: GameTypeKey;
    session: Session;
    pick: string;
    amount: number;
    rate: number;
    status: string;
    win_amount: number;
    created_at: string;
  }>(
    `SELECT b.id, b.user_id, u.username, u.name, b.game_type, b.session, b.pick, b.amount, b.rate, b.status,
            b.win_amount, b.created_at
     FROM bids b JOIN users u ON u.id = b.user_id
     WHERE ${where.join(' AND ')} ORDER BY b.created_at, b.id LIMIT 5000`,
    ...params,
  );

  res.json({
    market: marketInfo(m),
    date,
    group,
    pick,
    bids: rows.map((b, i) => ({
      sno: i + 1,
      id: b.id,
      userId: b.user_id,
      userName: b.username || b.name,
      name: b.name,
      gameType: b.game_type,
      gameLabel: gameType(b.game_type)?.label ?? b.game_type,
      session: b.session,
      pick: b.pick,
      amount: Number(b.amount),
      rate: Number(b.rate),
      status: b.status,
      winStatus: b.status === 'won' ? 'Win' : b.status === 'lost' ? 'Loss' : 'Pending',
      winAmount: Number(b.win_amount),
      createdAt: b.created_at,
    })),
  });
});
