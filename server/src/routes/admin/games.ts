/* Providers, weekly settings, rates and results for main / starline / andar bahar
 * (mounted at /api/admin/games).
 *
 * Every route checks the permission of the market kind it touches:
 *   main → games.*   starline → starline.*   andarbahar → andarbahar.*
 * with .provider .setting .rates .result .revert (and games.refund).
 *
 *   GET    /:kind/providers                list (+ today's result and timings)
 *   POST   /:kind/providers                add a provider, with a 7-day timetable
 *   PATCH  /providers/:id                  edit name / default times / status
 *   DELETE /providers/:id                  delete (or disable when it has bids)
 *   POST   /andarbahar/module              Andar Bahar ON/OFF for the app
 *   GET    /:kind/schedule                 weekly matrix
 *   PUT    /providers/:id/schedule         set times for one or more weekdays
 *   GET|POST /:kind/rates, PATCH|DELETE /:kind/rates/:key
 *   GET    /:kind/results?date=            declared results of a day
 *   POST   /results                        declare (no payout yet)
 *   GET    /results/winners                winners of a market/date/session
 *   GET    /results/pending                pending bids of a market/date
 *   POST   /results/settle | revert | refund
 *   DELETE /results                        "Remove History"
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { all, db, scalar, setSetting, tx } from '../../db.js';
import { adminName, requirePerm } from '../../auth.js';
import { KINDS, type Kind, type Session, gameType, toMinutes, todayStr } from '../../game.js';
import { allRates, missingRates, removeRate, setRate } from '../../rates.js';
import {
  autoDeclareEnabled,
  bidCounts,
  cancelMarketDay,
  declareResult,
  deleteResult,
  formatResult,
  getMarket,
  getResult,
  revertResult,
  settleMarket,
  winnersFor,
  type StoredResult,
} from '../../results.js';
import {
  DAY_NAMES,
  type MarketRow,
  type ScheduleRow,
  type ScheduleTimes,
  andarBaharEnabled,
  checkTimes,
  defaultTimes,
  ensureSchedule,
  getWeek,
  marketState,
  setSchedule,
  slotOpensAt,
} from '../../schedule.js';
import { money, notify } from '../../wallet.js';
import { badRequest, log, qDate, str } from './util.js';

export const gamesRouter = Router();

const PREFIX: Record<Kind, string> = { main: 'games', starline: 'starline', andarbahar: 'andarbahar' };
const KIND_NAME: Record<Kind, string> = { main: 'Main market', starline: 'Starline', andarbahar: 'Andar Bahar' };

type Action = 'provider' | 'setting' | 'rates' | 'result' | 'revert' | 'refund';

/** Guard a /:kind/… route with that kind's permission (any of `actions`). */
function kindPerm(...actions: Action[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const kind = req.params.kind as Kind;
    if (!KINDS.includes(kind)) return res.status(400).json({ message: 'Unknown game type' });
    res.locals.kind = kind;
    return requirePerm(...actions.map((a) => `${PREFIX[kind]}.${a}`))(req, res, next);
  };
}

/** Guard a route about one market (:id, body.marketId or ?marketId) with its kind's permission. */
function marketPerm(...actions: Action[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = Number(req.params.id ?? req.body?.marketId ?? req.query.marketId);
    const market = Number.isInteger(id) && id > 0 ? getMarket(id) : undefined;
    if (!market) return res.status(404).json({ message: 'Provider not found' });
    res.locals.market = market;
    return requirePerm(...actions.map((a) => `${PREFIX[market.kind]}.${a}`))(req, res, next);
  };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function time(v: unknown, label: string): string {
  const s = str(v);
  if (!HHMM.test(s)) throw badRequest(`${label} must be a time in HH:MM (24 hour) format`);
  return s;
}

/** YYYY-MM-DD from a request body, today when empty; never in the future. */
function bodyDate(v: unknown): string {
  const s = str(v) || todayStr();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T12:00:00`))) {
    throw badRequest('Result date must be a valid date');
  }
  if (s > todayStr()) throw badRequest('Result date cannot be in the future');
  return s;
}

function sessionOf(market: MarketRow, v: unknown): Session {
  if (market.kind !== 'main') return 'open';
  const s = str(v).toLowerCase();
  if (s !== 'open' && s !== 'close') throw badRequest('Choose the session: Open or Close');
  return s;
}

/* -------------------------------------------------------------- providers */

function dayTimes(s: ScheduleRow) {
  return {
    day: s.day,
    dayName: DAY_NAMES[s.day],
    openBetTime: s.open_bet_time,
    closeBetTime: s.close_bet_time,
    openResultTime: s.open_result_time,
    closeResultTime: s.close_result_time,
    isClosed: !!s.is_closed,
  };
}

function providerRow(m: MarketRow, date: string, now: Date) {
  const state = marketState(m, now);
  return {
    id: m.id,
    name: m.name,
    kind: m.kind,
    isActive: !!m.is_active,
    sortOrder: m.sort_order,
    /** default times a timetable is built from: main = open / close result, slots = result */
    openTime: m.open_time,
    closeTime: m.close_time,
    today: dayTimes(state.schedule),
    status: state.status,
    statusLabel: state.label,
    result: formatResult(getResult(m.id, date), m.kind),
    bids: scalar('SELECT COUNT(*) FROM bids WHERE market_id = ?', m.id),
  };
}

function providersOf(kind: Kind) {
  return all<MarketRow>('SELECT * FROM markets WHERE kind = ? ORDER BY sort_order, id', kind);
}

/** Starline / andar bahar slots are listed by result time. */
function resortSlots(kind: Kind) {
  if (kind === 'main') return;
  const rows = all<{ id: number }>('SELECT id FROM markets WHERE kind = ? ORDER BY open_time, id', kind);
  const upd = db.prepare('UPDATE markets SET sort_order = ? WHERE id = ?');
  rows.forEach((r, i) => upd.run(i, r.id));
}

interface ProviderInput {
  name: string;
  openTime: string;
  closeTime: string;
  isActive: boolean;
}

/** Validate the Add / Edit provider form. `current` fills fields the request leaves out. */
function providerInput(kind: Kind, body: Record<string, unknown> | undefined, current?: MarketRow): ProviderInput {
  const b = body ?? {};
  const name = (b.name === undefined ? current?.name ?? '' : str(b.name)).replace(/\s+/g, ' ');
  if (name.length < 2) throw badRequest('Enter the game name');
  if (name.length > 60) throw badRequest('Game name is too long (60 characters at most)');
  const dup = db
    .prepare('SELECT id FROM markets WHERE kind = ? AND lower(name) = lower(?) AND id != ?')
    .get(kind, name, current?.id ?? 0);
  if (dup) throw badRequest(`A ${KIND_NAME[kind]} provider named "${name}" already exists`);

  const isActive = b.isActive === undefined ? !!(current?.is_active ?? 1) : b.isActive === true || b.isActive === 1 || b.isActive === '1';

  if (kind === 'main') {
    const openTime = b.openTime === undefined && current ? current.open_time : time(b.openTime, 'Open result time');
    const closeTime = b.closeTime === undefined && current ? current.close_time : time(b.closeTime, 'Close result time');
    if (toMinutes(openTime) < 10) throw badRequest('Open result time must be 12:10 AM or later (open bets close 10 minutes before it)');
    if (toMinutes(closeTime) - toMinutes(openTime) < 10) {
      throw badRequest('Close result time must be at least 10 minutes after the open result time');
    }
    return { name, openTime, closeTime, isActive };
  }
  const resultTime = b.openTime === undefined && current ? current.open_time : time(b.openTime, 'Result time');
  if (toMinutes(resultTime) < 10) throw badRequest('Result time must be 12:10 AM or later');
  return { name, openTime: resultTime, closeTime: resultTime, isActive };
}

/** When a slot starts taking bets: after the previous slot's result, if that leaves a betting window. */
function opensAtFor(kind: Kind, resultTime: string, marketId = 0) {
  const cutoff = toMinutes(resultTime) - 5;
  const opens = slotOpensAt(kind, resultTime, marketId);
  return toMinutes(opens) < cutoff ? opens : '00:01';
}

gamesRouter.get('/:kind/providers', kindPerm('provider', 'setting', 'result'), (_req, res) => {
  const kind = res.locals.kind as Kind;
  const now = new Date();
  const date = todayStr(now);
  res.json({
    kind,
    date,
    enabled: kind !== 'andarbahar' || andarBaharEnabled(),
    providers: providersOf(kind).map((m) => providerRow(m, date, now)),
  });
});

gamesRouter.post('/:kind/providers', kindPerm('provider'), (req, res) => {
  const kind = res.locals.kind as Kind;
  const input = providerInput(kind, req.body);
  const id = tx(() => {
    const sort = scalar('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM markets WHERE kind = ?', kind);
    const info = db
      .prepare(
        'INSERT INTO markets (name, kind, open_time, close_time, days, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(input.name, kind, input.openTime, input.closeTime, '0,1,2,3,4,5,6', input.isActive ? 1 : 0, sort);
    const market = getMarket(Number(info.lastInsertRowid))!;
    ensureSchedule(market, kind === 'main' ? undefined : opensAtFor(kind, input.openTime, market.id));
    resortSlots(kind);
    return market.id;
  });
  log(req, `${PREFIX[kind]}.provider.add`, { id, ...input });
  const now = new Date();
  res.status(201).json({ ok: true, provider: providerRow(getMarket(id)!, todayStr(now), now) });
});

gamesRouter.patch('/providers/:id', marketPerm('provider'), (req, res) => {
  const market = res.locals.market as MarketRow;
  const input = providerInput(market.kind, req.body, market);
  const timesChanged = input.openTime !== market.open_time || input.closeTime !== market.close_time;

  tx(() => {
    db.prepare('UPDATE markets SET name = ?, open_time = ?, close_time = ?, is_active = ? WHERE id = ?').run(
      input.name,
      input.openTime,
      input.closeTime,
      input.isActive ? 1 : 0,
      market.id,
    );
    if (!timesChanged) return;
    // new default times rebuild every weekday's times; closed days stay closed
    ensureSchedule(market);
    const opensAt = market.kind === 'main' ? undefined : opensAtFor(market.kind, input.openTime, market.id);
    for (const day of getWeek(market.id)) {
      setSchedule(market.id, day.day, {
        ...defaultTimes(market.kind, input.openTime, input.closeTime, opensAt),
        is_closed: day.is_closed,
      });
    }
    resortSlots(market.kind);
  });

  log(req, `${PREFIX[market.kind]}.provider.update`, { id: market.id, ...input, timesChanged });
  const now = new Date();
  res.json({ ok: true, timesChanged, provider: providerRow(getMarket(market.id)!, todayStr(now), now) });
});

gamesRouter.delete('/providers/:id', marketPerm('provider'), (req, res) => {
  const market = res.locals.market as MarketRow;
  const bids = scalar('SELECT COUNT(*) FROM bids WHERE market_id = ?', market.id);
  if (bids > 0) {
    // bids keep their market for history and reports, so the provider is only switched off
    db.prepare('UPDATE markets SET is_active = 0 WHERE id = ?').run(market.id);
    log(req, `${PREFIX[market.kind]}.provider.disable`, { id: market.id, name: market.name, bids });
    return res.json({
      ok: true,
      disabled: true,
      message: `${market.name} has ${bids} bids, so it was disabled instead of deleted`,
    });
  }
  tx(() => {
    db.prepare('DELETE FROM results WHERE market_id = ?').run(market.id);
    db.prepare('DELETE FROM market_schedule WHERE market_id = ?').run(market.id);
    db.prepare('DELETE FROM markets WHERE id = ?').run(market.id);
    resortSlots(market.kind);
  });
  log(req, `${PREFIX[market.kind]}.provider.delete`, { id: market.id, name: market.name });
  res.json({ ok: true, deleted: true, message: `${market.name} deleted` });
});

/** Andar Bahar ON/OFF: when off the app hides AB markets and rejects AB bids. */
gamesRouter.post('/andarbahar/module', requirePerm('andarbahar.provider'), (req, res) => {
  const v = req.body?.enabled;
  if (typeof v !== 'boolean') throw badRequest('enabled must be true or false');
  setSetting('andarbahar_enabled', v ? '1' : '0');
  log(req, 'andarbahar.module', { enabled: v });
  res.json({ ok: true, enabled: andarBaharEnabled() });
});

/* --------------------------------------------------------------- schedule */

gamesRouter.get('/:kind/schedule', kindPerm('setting'), (_req, res) => {
  const kind = res.locals.kind as Kind;
  res.json({
    kind,
    // Monday … Sunday, like the reference matrix
    dayOrder: [1, 2, 3, 4, 5, 6, 0],
    dayNames: DAY_NAMES,
    providers: providersOf(kind).map((m) => {
      let week = getWeek(m.id);
      if (week.length < 7) {
        ensureSchedule(m);
        week = getWeek(m.id);
      }
      return {
        id: m.id,
        name: m.name,
        isActive: !!m.is_active,
        openTime: m.open_time,
        closeTime: m.close_time,
        week: week.map(dayTimes),
      };
    }),
  });
});

gamesRouter.put('/providers/:id/schedule', marketPerm('setting'), (req, res) => {
  const market = res.locals.market as MarketRow;
  const b = req.body ?? {};
  const days: number[] = Array.isArray(b.days) ? [...new Set((b.days as unknown[]).map(Number))] : [];
  if (days.length === 0) throw badRequest('Select at least one day');
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw badRequest('Days must be 0 (Sunday) to 6 (Saturday)');

  const times: ScheduleTimes = {
    open_bet_time: str(b.openBetTime),
    close_bet_time: str(b.closeBetTime),
    open_result_time: str(b.openResultTime),
    close_result_time: market.kind === 'main' ? str(b.closeResultTime) : null,
    is_closed: b.isClosed === true || b.isClosed === 1 || b.isClosed === '1' ? 1 : 0,
  };
  const error = checkTimes(market.kind, times);
  if (error) throw badRequest(error);

  tx(() => {
    ensureSchedule(market);
    for (const day of days) setSchedule(market.id, day, times);
    // all seven days set at once: these become the provider's default times too
    if (days.length === 7) {
      db.prepare('UPDATE markets SET open_time = ?, close_time = ? WHERE id = ?').run(
        times.open_result_time,
        times.close_result_time ?? times.open_result_time,
        market.id,
      );
      resortSlots(market.kind);
    }
  });

  log(req, `${PREFIX[market.kind]}.setting.update`, {
    id: market.id,
    name: market.name,
    days: days.map((d) => DAY_NAMES[d]),
    ...times,
  });
  res.json({ ok: true, week: getWeek(market.id).map(dayTimes) });
});

/* ------------------------------------------------------------------ rates */

const MAX_RATE = 1_000_000;

function rateValue(v: unknown): number {
  const n = Number(v);
  if (v === '' || v === null || !Number.isFinite(n) || n <= 0) throw badRequest('Game price must be a number above 0');
  if (n > MAX_RATE) throw badRequest(`Game price must be ${MAX_RATE} or less`);
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) throw badRequest('Game price can have at most 2 decimals');
  return n;
}

function rateLabel(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  const s = str(v).replace(/\s+/g, ' ');
  if (!s) throw badRequest('Enter the game name');
  if (s.length > 40) throw badRequest('Game name is too long (40 characters at most)');
  return s;
}

function bool(v: unknown): boolean | undefined {
  if (v === undefined) return undefined;
  return v === true || v === 1 || v === '1';
}

gamesRouter.get('/:kind/rates', kindPerm('rates'), (_req, res) => {
  const kind = res.locals.kind as Kind;
  res.json({ kind, rates: allRates(kind), missing: missingRates(kind) });
});

gamesRouter.post('/:kind/rates', kindPerm('rates'), (req, res) => {
  const kind = res.locals.kind as Kind;
  const key = str(req.body?.key);
  const def = gameType(key);
  if (!missingRates(kind).some((g) => g.key === key)) {
    throw badRequest(
      def && allRates(kind).some((r) => r.key === key)
        ? `${def.label} is already in the list`
        : `This game is not offered for ${KIND_NAME[kind]}`,
    );
  }
  const patch = { rate: rateValue(req.body?.rate), label: rateLabel(req.body?.label), isActive: bool(req.body?.isActive) ?? true };
  if (!setRate(kind, key, patch)) throw badRequest('Could not save this game');
  log(req, `${PREFIX[kind]}.rates.add`, { key, ...patch });
  res.status(201).json({ ok: true, rates: allRates(kind) });
});

gamesRouter.patch('/:kind/rates/:key', kindPerm('rates'), (req, res) => {
  const kind = res.locals.kind as Kind;
  const key = req.params.key;
  if (!allRates(kind).some((r) => r.key === key)) return res.status(404).json({ message: 'Game not found' });
  const patch = {
    rate: req.body?.rate === undefined ? undefined : rateValue(req.body.rate),
    label: rateLabel(req.body?.label),
    isActive: bool(req.body?.isActive),
  };
  if (!setRate(kind, key, patch)) throw badRequest('Could not save this game');
  log(req, `${PREFIX[kind]}.rates.update`, { key, ...patch });
  res.json({ ok: true, rates: allRates(kind) });
});

gamesRouter.delete('/:kind/rates/:key', kindPerm('rates'), (req, res) => {
  const kind = res.locals.kind as Kind;
  const key = req.params.key;
  if (!removeRate(kind, key)) return res.status(404).json({ message: 'Game not found' });
  log(req, `${PREFIX[kind]}.rates.delete`, { key });
  res.json({ ok: true, rates: allRates(kind) });
});

/* ---------------------------------------------------------------- results */

/** One declared session of a result, as a row of the history table. */
function resultLine(m: { id: number; name: string; kind: Kind }, r: StoredResult, session: Session) {
  const isOpen = session === 'open';
  const value = m.kind === 'andarbahar' ? r.number : isOpen ? r.open_panna : r.close_panna;
  const digit = m.kind === 'andarbahar' ? null : isOpen ? r.open_digit : r.close_digit;
  const settledAt = isOpen ? r.open_settled_at : r.close_settled_at;
  const counts = bidCounts(m.id, r.result_date, session);
  const totals = winnersFor(m.id, r.result_date, session).totals;
  return {
    marketId: m.id,
    marketName: m.name,
    kind: m.kind,
    session,
    resultDate: r.result_date,
    value,
    digit,
    display: m.kind === 'andarbahar' ? value : `${value}-${digit}`,
    fullResult: formatResult(r, m.kind),
    declaredAt: isOpen ? r.open_declared_at : r.close_declared_at,
    declaredBy: r.declared_by,
    settledAt,
    /** pending: bids wait for "Pay Winners & Settle" · settled · empty: no bids to settle */
    status: counts.pending > 0 ? 'pending' : settledAt ? 'settled' : 'empty',
    bids: counts,
    winners: totals.winners,
    winAmount: totals.winAmount,
    unpaid: totals.unpaid,
    unpaidAmount: totals.unpaidAmount,
    /** main open half: the close half has to be reverted / removed first */
    closeDeclared: m.kind === 'main' && isOpen && !!r.close_panna,
  };
}

gamesRouter.get('/:kind/results', kindPerm('result'), (req, res) => {
  const kind = res.locals.kind as Kind;
  const date = qDate(req);
  const rows = all<StoredResult & { market_name: string }>(
    `SELECT r.*, m.name AS market_name FROM results r JOIN markets m ON m.id = r.market_id
     WHERE m.kind = ? AND r.result_date = ?`,
    kind,
    date,
  );
  const lines: Array<ReturnType<typeof resultLine>> = [];
  for (const r of rows) {
    const m = { id: r.market_id, name: r.market_name, kind };
    if (kind === 'andarbahar') {
      if (r.number) lines.push(resultLine(m, r, 'open'));
      continue;
    }
    if (r.open_panna) lines.push(resultLine(m, r, 'open'));
    if (kind === 'main' && r.close_panna) lines.push(resultLine(m, r, 'close'));
  }
  lines.sort((a, b) => String(b.declaredAt ?? '').localeCompare(String(a.declaredAt ?? '')));
  res.json({ kind, date, autoDeclare: autoDeclareEnabled(), results: lines });
});

gamesRouter.post('/results', marketPerm('result'), (req, res) => {
  const market = res.locals.market as MarketRow;
  const date = bodyDate(req.body?.date);
  const session = sessionOf(market, req.body?.session);
  const value = str(req.body?.value);
  if (market.kind === 'andarbahar') {
    if (!/^\d{2}$/.test(value)) throw badRequest('Winning number must be 2 digits (00-99)');
  } else if (!/^\d{3}$/.test(value)) {
    throw badRequest('Winning panna must be 3 digits');
  }
  const out = declareResult(market.id, date, session, value, { by: adminName(req) });
  log(req, `${PREFIX[market.kind]}.result.declare`, { marketId: market.id, name: market.name, date, session, value });
  res.status(201).json({ ok: true, marketName: market.name, session, date, ...out });
});

gamesRouter.get('/results/winners', marketPerm('result'), (req, res) => {
  const market = res.locals.market as MarketRow;
  const date = qDate(req);
  const session = sessionOf(market, req.query.session);
  const result = getResult(market.id, date);
  const half = market.kind === 'main' ? session : 'open';
  const { winners, totals } = winnersFor(market.id, date, half);
  res.json({
    market: { id: market.id, name: market.name, kind: market.kind },
    date,
    session: half,
    declared: !!(result && (market.kind === 'andarbahar' ? result.number : half === 'open' ? result.open_panna : result.close_panna)),
    result: formatResult(result, market.kind),
    settledAt: (half === 'open' ? result?.open_settled_at : result?.close_settled_at) ?? null,
    bids: bidCounts(market.id, date, half),
    winners,
    totals,
  });
});

gamesRouter.get('/results/pending', marketPerm('result'), (req, res) => {
  const market = res.locals.market as MarketRow;
  const date = qDate(req);
  const r = getResult(market.id, date);
  res.json({
    marketId: market.id,
    date,
    result: formatResult(r, market.kind),
    declared: {
      open: !!(r?.open_panna || r?.number),
      close: !!r?.close_panna,
    },
    open: bidCounts(market.id, date, 'open'),
    close: market.kind === 'main' ? bidCounts(market.id, date, 'close') : null,
    all: bidCounts(market.id, date, 'all'),
  });
});

gamesRouter.post('/results/settle', marketPerm('result'), (req, res) => {
  const market = res.locals.market as MarketRow;
  const date = bodyDate(req.body?.date);
  const session = sessionOf(market, req.body?.session);
  const r = getResult(market.id, date);
  const declared = market.kind === 'andarbahar' ? r?.number : session === 'open' ? r?.open_panna : r?.close_panna;
  if (!declared) throw badRequest('Declare the result before settling it');
  const out = settleMarket(market.id, date, session, adminName(req));
  log(req, `${PREFIX[market.kind]}.result.settle`, { marketId: market.id, name: market.name, date, session, ...out });
  res.json({
    ok: true,
    ...out,
    message:
      out.settled === 0
        ? 'Settled — there were no pending bids'
        : `Settled ${out.settled} bids: ${out.won} winners paid ${out.payout}`,
  });
});

gamesRouter.post('/results/revert', marketPerm('revert'), (req, res) => {
  const market = res.locals.market as MarketRow;
  const date = bodyDate(req.body?.date);
  const session = sessionOf(market, req.body?.session);
  const out = revertResult(market.id, date, session, adminName(req));
  log(req, `${PREFIX[market.kind]}.result.revert`, { marketId: market.id, name: market.name, date, session, ...out });
  res.json({
    ok: true,
    ...out,
    message: `Result reverted: ${out.reverted} bids back to pending, ${out.recovered} taken back from winners`,
  });
});

gamesRouter.delete('/results', marketPerm('result'), (req, res) => {
  const market = res.locals.market as MarketRow;
  const date = bodyDate(req.body?.date ?? req.query.date);
  const session = market.kind === 'main' ? sessionOf(market, req.body?.session ?? req.query.session) : undefined;
  deleteResult(market.id, date, session);
  log(req, `${PREFIX[market.kind]}.result.delete`, { marketId: market.id, name: market.name, date, session });
  res.json({ ok: true, message: 'Result removed' });
});

/** Main market "Refund": return every pending bid of a market/date to the players. */
gamesRouter.post('/results/refund', marketPerm('refund'), (req, res) => {
  const market = res.locals.market as MarketRow;
  if (market.kind !== 'main') throw badRequest('Refund is available for main market games only');
  const date = bodyDate(req.body?.date);
  const pending = bidCounts(market.id, date, 'all');
  if (pending.pending === 0) throw badRequest(`No pending bids on ${market.name} for this date`);
  const users = all<{ user_id: number; amount: number }>(
    `SELECT user_id, SUM(amount) AS amount FROM bids WHERE market_id = ? AND bid_date = ? AND status = 'pending' GROUP BY user_id`,
    market.id,
    date,
  );
  const reason = str(req.body?.reason) || `${market.name} cancelled — bid refunded`;
  const refunded = cancelMarketDay(market.id, date, reason, adminName(req));
  for (const u of users) {
    notify(u.user_id, 'Bids refunded', `${market.name}: ${money(Number(u.amount))} refunded to your wallet. ${reason}`);
  }
  log(req, 'games.result.refund', { marketId: market.id, name: market.name, date, refunded, amount: pending.pendingAmount });
  res.json({
    ok: true,
    refunded,
    amount: pending.pendingAmount,
    message: `${refunded} bids refunded (${pending.pendingAmount}) to ${users.length} players`,
  });
});
