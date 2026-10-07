/* Reports part 1 (mounted at /api/admin/reports, shared with reports2):
 *   GET /jodi-all          main-market jodi bets: totals and one row per market
 *   GET /sales             main-market bidding vs winning for a range
 *   GET /starline-sales    the same for Starline
 *   GET /ab-sales          the same for Andar Bahar
 *   GET /sales-summary     the same, one row per day
 *   GET /ab-bids           Andar Bahar bids of one day (paged)
 *   GET /fund              wallet money movements (paged) with totals
 *   GET /fund2             deposit / withdraw requests with totals per status
 *   GET /upi-fund          UPI deposit requests with UTR and payment proof
 *   GET /r1-fund-options   dropdown values for the Fund Report
 *
 * Profit/Loss is always the house's: bidding − winning. Refunded bids are not
 * sales, so every bid query leaves them out. Totals are computed here over the
 * whole filtered set, never from one page of rows.
 */
import { Router, type Request, type Response } from 'express';
import { config } from '../../config.js';
import { all, get } from '../../db.js';
import { addDays, type Kind } from '../../game.js';
import { requirePerm } from '../../auth.js';
import { uploadUrl } from '../../uploads.js';
import { money } from '../../wallet.js';
import { badRequest, qDate, qPage, qRange, str } from './util.js';

export const reports1Router = Router();

type Param = string | number | null;

/** AND-ed WHERE clauses with their bound values. */
class Where {
  private parts: string[] = [];
  readonly params: Param[] = [];

  add(clause: string, ...params: Param[]) {
    this.parts.push(clause);
    this.params.push(...params);
    return this;
  }

  get sql() {
    return this.parts.length ? this.parts.join(' AND ') : '1 = 1';
  }
}

const MAX_RANGE_DAYS = 366;
/** rows an Export may pull in one go */
const EXPORT_CAP = 50_000;

function rangeOf(req: Request) {
  const range = qRange(req);
  if (range.from < addDays(range.to, -(MAX_RANGE_DAYS - 1))) {
    throw badRequest(`Choose a date range of at most ${MAX_RANGE_DAYS} days`);
  }
  return range;
}

/**
 * UTC ISO bounds of a local-date range, so `created_at` filters can use the
 * column's index: created_at >= start AND created_at < end.
 */
function isoBounds(from: string, to: string): [string, string] {
  return [new Date(`${from}T00:00:00`).toISOString(), new Date(`${addDays(to, 1)}T00:00:00`).toISOString()];
}

/** Optional positive integer id from the query (400 when malformed). */
function qId(req: Request, key: string, label: string): number | null {
  const raw = str(req.query[key]);
  if (!raw || raw === 'all') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Invalid ${label}`);
  return n;
}

/** ?marketId= checked against the market kind(s) the report covers. */
function qMarket(req: Request, kinds: Kind[]): number | null {
  const id = qId(req, 'marketId', 'provider');
  if (id === null) return null;
  const m = get<{ kind: string }>('SELECT kind FROM markets WHERE id = ?', id);
  if (!m || !kinds.includes(m.kind as Kind)) throw badRequest('Provider not found');
  return id;
}

function qUser(req: Request): number | null {
  const id = qId(req, 'userId', 'player');
  if (id === null) return null;
  if (!get('SELECT 1 FROM users WHERE id = ?', id)) throw badRequest('Player not found');
  return id;
}

/** ?page/perPage, or every row (capped) when ?all=1 for Export. */
function paging(req: Request) {
  if (str(req.query.all) === '1') return { page: 1, perPage: EXPORT_CAP, offset: 0 };
  return qPage(req, 50, 500);
}

const like = (s: string) => `%${s.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

/* ------------------------------------------------------------ bid totals */

/** SELECT list shared by every sales-style aggregate (alias b = bids). */
const SALES_COLS = `
  COUNT(*) AS bids,
  COUNT(DISTINCT b.user_id) AS players,
  COALESCE(SUM(b.amount), 0) AS amount,
  COALESCE(SUM(CASE WHEN b.status = 'won' THEN b.win_amount ELSE 0 END), 0) AS win,
  COALESCE(SUM(CASE WHEN b.status = 'won' THEN 1 ELSE 0 END), 0) AS winners,
  COALESCE(SUM(CASE WHEN b.status = 'pending' THEN 1 ELSE 0 END), 0) AS pending`;

interface SalesRaw {
  bids: number;
  players: number;
  amount: number;
  win: number;
  winners: number;
  pending: number;
}

function salesOut(r: SalesRaw | undefined) {
  const amount = money(Number(r?.amount ?? 0));
  const win = money(Number(r?.win ?? 0));
  return {
    bids: Number(r?.bids ?? 0),
    players: Number(r?.players ?? 0),
    amount,
    win,
    profit: money(amount - win),
    winners: Number(r?.winners ?? 0),
    /** bids still waiting for a result: their winnings are not in `win` yet */
    pending: Number(r?.pending ?? 0),
  };
}

/** Totals plus one row per market for bids matching `where`. */
function salesByMarket(where: Where) {
  const total = get<SalesRaw>(`SELECT ${SALES_COLS} FROM bids b WHERE ${where.sql}`, ...where.params);
  const rows = all<SalesRaw & { market_id: number; market_name: string; kind: string }>(
    `SELECT b.market_id, COALESCE(m.name, MAX(b.market_name)) AS market_name, MAX(b.kind) AS kind, ${SALES_COLS}
     FROM bids b LEFT JOIN markets m ON m.id = b.market_id
     WHERE ${where.sql}
     GROUP BY b.market_id
     ORDER BY COALESCE(m.sort_order, 0), b.market_id`,
    ...where.params,
  );
  return {
    total: salesOut(total),
    markets: rows.map((r) => ({ marketId: r.market_id, marketName: r.market_name, kind: r.kind, ...salesOut(r) })),
  };
}

/** Base filter for a sales report over bids of `kinds`. */
function salesWhere(req: Request, kinds: Kind[]) {
  const { from, to } = rangeOf(req);
  const marketId = qMarket(req, kinds);
  const userId = qUser(req);
  const where = new Where()
    .add(`b.kind IN (${kinds.map(() => '?').join(',')})`, ...kinds)
    .add(`b.status <> 'refunded'`)
    .add('b.bid_date BETWEEN ? AND ?', from, to);
  if (marketId) where.add('b.market_id = ?', marketId);
  if (userId) where.add('b.user_id = ?', userId);
  return { where, from, to, marketId, userId };
}

/* --------------------------------------------------------------- jodi all */

/** Jodi game types counted by "Jodi All" (red brackets are jodis too). */
const JODI_TYPES = ['jodi_digit', 'red_bracket'];

reports1Router.get('/jodi-all', requirePerm('reports.jodi_all'), (req, res) => {
  const { where, from, to, marketId } = salesWhere(req, ['main']);
  const type = str(req.query.gameType);
  if (type && type !== 'all' && !JODI_TYPES.includes(type)) throw badRequest('Invalid game type');
  const types = type && type !== 'all' ? [type] : JODI_TYPES;
  where.add(`b.game_type IN (${types.map(() => '?').join(',')})`, ...types);
  res.json({ from, to, marketId, gameType: type || 'all', ...salesByMarket(where) });
});

/* ---------------------------------------------------------- sales reports */

function salesRoute(kind: Kind) {
  return (req: Request, res: Response) => {
    const { where, from, to, marketId, userId } = salesWhere(req, [kind]);
    res.json({ kind, from, to, marketId, userId, ...salesByMarket(where) });
  };
}

reports1Router.get('/sales', requirePerm('reports.sales'), salesRoute('main'));
reports1Router.get('/starline-sales', requirePerm('reports.starline_sales'), salesRoute('starline'));
reports1Router.get('/ab-sales', requirePerm('reports.ab_sales'), salesRoute('andarbahar'));

/** Day-wise sales. ?kind=main|starline|andarbahar|all (default main). */
reports1Router.get('/sales-summary', requirePerm('reports.sales_summary'), (req, res) => {
  const k = str(req.query.kind) || 'main';
  if (k !== 'all' && !['main', 'starline', 'andarbahar'].includes(k)) throw badRequest('Invalid market type');
  const kinds: Kind[] = k === 'all' ? ['main', 'starline', 'andarbahar'] : [k as Kind];
  const { where, from, to, marketId, userId } = salesWhere(req, kinds);

  const total = get<SalesRaw>(`SELECT ${SALES_COLS} FROM bids b WHERE ${where.sql}`, ...where.params);
  const days = all<SalesRaw & { bid_date: string }>(
    `SELECT b.bid_date, ${SALES_COLS} FROM bids b WHERE ${where.sql} GROUP BY b.bid_date ORDER BY b.bid_date`,
    ...where.params,
  );
  res.json({
    kind: k,
    from,
    to,
    marketId,
    userId,
    total: salesOut(total),
    days: days.map((d) => ({ date: d.bid_date, ...salesOut(d) })),
  });
});

/* ---------------------------------------------------- andar bahar bids */

reports1Router.get('/ab-bids', requirePerm('reports.ab_bids'), (req, res) => {
  const date = qDate(req);
  const marketId = qMarket(req, ['andarbahar']);
  const userId = qUser(req);
  const status = str(req.query.status);
  if (status && status !== 'all' && !['pending', 'won', 'lost', 'refunded'].includes(status)) {
    throw badRequest('Invalid status');
  }
  const search = str(req.query.search);
  const { page, perPage, offset } = paging(req);

  const where = new Where().add(`b.kind = 'andarbahar'`).add('b.bid_date = ?', date);
  if (marketId) where.add('b.market_id = ?', marketId);
  if (userId) where.add('b.user_id = ?', userId);
  if (status && status !== 'all') where.add('b.status = ?', status);
  if (search) {
    const q = like(search);
    where.add(
      `(u.username LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.mobile LIKE ? ESCAPE '\\' OR b.pick = ? OR COALESCE(m.name, b.market_name) LIKE ? ESCAPE '\\')`,
      q,
      q,
      q,
      search,
      q,
    );
  }
  const from = 'FROM bids b JOIN users u ON u.id = b.user_id LEFT JOIN markets m ON m.id = b.market_id';

  const t = get<{ c: number; refunded: number; players: number; amount: number; win: number; pending: number }>(
    `SELECT COUNT(*) AS c,
            COALESCE(SUM(CASE WHEN b.status = 'refunded' THEN 1 ELSE 0 END), 0) AS refunded,
            COUNT(DISTINCT b.user_id) AS players,
            COALESCE(SUM(CASE WHEN b.status <> 'refunded' THEN b.amount ELSE 0 END), 0) AS amount,
            COALESCE(SUM(CASE WHEN b.status = 'won' THEN b.win_amount ELSE 0 END), 0) AS win,
            COALESCE(SUM(CASE WHEN b.status = 'pending' THEN 1 ELSE 0 END), 0) AS pending
     ${from} WHERE ${where.sql}`,
    ...where.params,
  );
  const rows = all<Record<string, unknown>>(
    `SELECT b.id, b.user_id, u.username, u.name, b.pick, b.amount, b.rate, b.status, b.win_amount,
            b.market_id, COALESCE(m.name, b.market_name) AS market_name, b.created_at
     ${from} WHERE ${where.sql}
     ORDER BY b.created_at, b.id LIMIT ? OFFSET ?`,
    ...where.params,
    perPage,
    offset,
  );
  const amount = money(Number(t?.amount ?? 0));
  const win = money(Number(t?.win ?? 0));
  res.json({
    date,
    page,
    perPage,
    total: Number(t?.c ?? 0),
    totals: {
      bids: Number(t?.c ?? 0),
      players: Number(t?.players ?? 0),
      refunded: Number(t?.refunded ?? 0),
      pending: Number(t?.pending ?? 0),
      amount,
      win,
      profit: money(amount - win),
    },
    bids: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      username: r.username,
      name: r.name,
      number: r.pick,
      amount: Number(r.amount),
      rate: Number(r.rate),
      status: r.status,
      winAmount: Number(r.win_amount),
      marketId: r.market_id,
      marketName: r.market_name,
      createdAt: r.created_at,
    })),
  });
});

/* ------------------------------------------------------------ fund report */

/** Ledger types that move money in or out of a wallet (bids and wins are sales, not funds). */
const FUND_TYPES = ['deposit', 'withdraw', 'adjust', 'bonus', 'refund'];
const NO_MODE = '__none';

reports1Router.get('/r1-fund-options', requirePerm('reports.fund'), (_req, res) => {
  const ph = FUND_TYPES.map(() => '?').join(',');
  const modes = all<{ mode: string }>(
    `SELECT DISTINCT mode FROM transactions WHERE type IN (${ph}) AND mode IS NOT NULL AND mode <> ''`,
    ...FUND_TYPES,
  ).map((r) => r.mode);
  const hasNoMode = !!get(`SELECT 1 FROM transactions WHERE type IN (${ph}) AND (mode IS NULL OR mode = '') LIMIT 1`, ...FUND_TYPES);
  const uniq = (list: string[]) => [...new Set(list.filter(Boolean))];
  const particulars = uniq([...['UPI', 'IP', 'Bank', 'Paytm', 'Cash', 'Bonus'], ...modes]);

  const used = all<{ added_by: string }>(
    `SELECT DISTINCT added_by FROM transactions WHERE type IN (${ph})`,
    ...FUND_TYPES,
  ).map((r) => r.added_by);
  const staff = all<{ username: string }>('SELECT username FROM admins ORDER BY username').map((r) => r.username);
  const others = uniq([config.adminUser, ...staff, ...used])
    .filter((n) => n !== 'Auto' && n !== 'Self')
    .sort((a, b) => a.localeCompare(b));

  res.json({
    particulars: particulars.map((p) => ({ value: p, label: p })).concat(hasNoMode ? [{ value: NO_MODE, label: 'Not set' }] : []),
    admins: ['Auto', 'Self', ...others],
  });
});

reports1Router.get('/fund', requirePerm('reports.fund'), (req, res) => {
  const { from, to } = rangeOf(req);
  const dir = str(req.query.dir) || 'all';
  if (!['all', 'credit', 'debit'].includes(dir)) throw badRequest('Invalid Credit/Debit value');
  const mode = str(req.query.mode);
  const addedBy = str(req.query.addedBy);
  const search = str(req.query.search);
  const { page, perPage, offset } = paging(req);

  const [start, end] = isoBounds(from, to);
  const where = new Where()
    .add(`t.type IN (${FUND_TYPES.map(() => '?').join(',')})`, ...FUND_TYPES)
    .add('t.created_at >= ? AND t.created_at < ?', start, end);
  if (dir === 'credit') where.add('t.amount > 0');
  if (dir === 'debit') where.add('t.amount < 0');
  if (mode === NO_MODE) where.add(`(t.mode IS NULL OR t.mode = '')`);
  else if (mode && mode !== 'all') where.add('LOWER(t.mode) = LOWER(?)', mode);
  if (addedBy && addedBy !== 'all') where.add('t.added_by = ?', addedBy);
  if (search) {
    const q = like(search);
    where.add(
      `(u.username LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.mobile LIKE ? ESCAPE '\\'
        OR t.particulars LIKE ? ESCAPE '\\' OR t.note LIKE ? ESCAPE '\\' OR t.ref LIKE ? ESCAPE '\\')`,
      q,
      q,
      q,
      q,
      q,
      q,
    );
  }
  const fromSql = 'FROM transactions t JOIN users u ON u.id = t.user_id';

  const t = get<{ c: number; credit: number; debit: number; credits: number; debits: number }>(
    `SELECT COUNT(*) AS c,
            COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) AS credit,
            COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0) AS debit,
            COALESCE(SUM(CASE WHEN t.amount > 0 THEN 1 ELSE 0 END), 0) AS credits,
            COALESCE(SUM(CASE WHEN t.amount < 0 THEN 1 ELSE 0 END), 0) AS debits
     ${fromSql} WHERE ${where.sql}`,
    ...where.params,
  );
  const rows = all<Record<string, unknown>>(
    `SELECT t.id, t.user_id, u.username, u.name, u.mobile, t.type, t.amount, t.balance_after, t.particulars,
            t.note, t.added_by, t.mode, t.ref, t.created_at
     ${fromSql} WHERE ${where.sql}
     ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`,
    ...where.params,
    perPage,
    offset,
  );
  const credit = money(Number(t?.credit ?? 0));
  const debit = money(Number(t?.debit ?? 0));
  res.json({
    from,
    to,
    dir,
    page,
    perPage,
    total: Number(t?.c ?? 0),
    totals: {
      count: Number(t?.c ?? 0),
      credits: Number(t?.credits ?? 0),
      debits: Number(t?.debits ?? 0),
      credit,
      debit,
      net: money(credit - debit),
    },
    rows: rows.map((r) => {
      const amount = Number(r.amount);
      return {
        id: r.id,
        userId: r.user_id,
        username: r.username,
        name: r.name,
        mobile: r.mobile,
        type: r.type,
        direction: amount >= 0 ? 'credit' : 'debit',
        amount: money(Math.abs(amount)),
        balanceAfter: Number(r.balance_after),
        particulars: r.particulars,
        note: r.note,
        mode: r.mode || null,
        ref: r.ref,
        addedBy: r.added_by,
        createdAt: r.created_at,
      };
    }),
  });
});

/* ------------------------------------------------- fund requests reports */

const REQUEST_STATUSES = ['pending', 'approved', 'completed', 'rejected', 'failed'];

interface RequestFilter {
  where: Where;
  /** same filter without the status, for the per-status totals */
  base: Where;
  page: number;
  perPage: number;
  offset: number;
  from: string;
  to: string;
}

/** Shared filter for /fund2 and /upi-fund. `scope` fixes extra conditions. */
function requestFilter(req: Request, scope: (w: Where) => void, allowType: boolean): RequestFilter {
  const { from, to } = rangeOf(req);
  const status = str(req.query.status);
  if (status && status !== 'all' && !REQUEST_STATUSES.includes(status)) throw badRequest('Invalid status');
  const type = allowType ? str(req.query.type) : '';
  if (type && type !== 'all' && !['deposit', 'withdraw'].includes(type)) throw badRequest('Invalid type');
  const userId = qUser(req);
  const search = str(req.query.search);
  const [start, end] = isoBounds(from, to);

  const build = (withStatus: boolean) => {
    const w = new Where().add('f.created_at >= ? AND f.created_at < ?', start, end);
    scope(w);
    if (type && type !== 'all') w.add('f.type = ?', type);
    if (userId) w.add('f.user_id = ?', userId);
    if (search) {
      const q = like(search);
      w.add(
        `(u.username LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.mobile LIKE ? ESCAPE '\\'
          OR f.utr LIKE ? ESCAPE '\\' OR f.pg_ref LIKE ? ESCAPE '\\' OR CAST(f.id AS TEXT) = ?)`,
        q,
        q,
        q,
        q,
        q,
        search,
      );
    }
    if (withStatus && status && status !== 'all') w.add('f.status = ?', status);
    return w;
  };
  return { where: build(true), base: build(false), from, to, ...paging(req) };
}

const REQ_FROM = 'FROM fund_requests f JOIN users u ON u.id = f.user_id';

function requestRows(f: RequestFilter) {
  return all<Record<string, unknown>>(
    `SELECT f.*, u.username, u.name, u.mobile ${REQ_FROM} WHERE ${f.where.sql}
     ORDER BY f.created_at DESC, f.id DESC LIMIT ? OFFSET ?`,
    ...f.where.params,
    f.perPage,
    f.offset,
  ).map((r) => ({
    id: r.id,
    userId: r.user_id,
    username: r.username,
    name: r.name,
    mobile: r.mobile,
    type: r.type,
    amount: Number(r.amount),
    /** deposit: how the user paid (upi…); withdraw: where the payout goes (bank / paytm) */
    mode: (r.type === 'withdraw' ? r.payout_mode ?? r.method : r.method) ?? null,
    utr: r.utr ?? null,
    pgRef: r.pg_ref ?? null,
    proofUrl: uploadUrl(r.proof_file as string | null),
    status: r.status,
    remark: r.remark ?? null,
    processedBy: r.processed_by ?? null,
    createdAt: r.created_at,
    updatedAt: r.completed_at ?? r.updated_at ?? null,
  }));
}

/** Count and amount per type + status over the filter without its status. */
function requestTotals(f: RequestFilter) {
  const total = get<{ c: number; amount: number; dep: number; wd: number }>(
    `SELECT COUNT(*) AS c, COALESCE(SUM(f.amount), 0) AS amount,
            COALESCE(SUM(CASE WHEN f.type = 'deposit' THEN f.amount ELSE 0 END), 0) AS dep,
            COALESCE(SUM(CASE WHEN f.type = 'withdraw' THEN f.amount ELSE 0 END), 0) AS wd
     ${REQ_FROM} WHERE ${f.where.sql}`,
    ...f.where.params,
  );
  const groups = all<{ type: string; status: string; c: number; amount: number }>(
    `SELECT f.type, f.status, COUNT(*) AS c, COALESCE(SUM(f.amount), 0) AS amount
     ${REQ_FROM} WHERE ${f.base.sql} GROUP BY f.type, f.status`,
    ...f.base.params,
  );
  const byStatus = REQUEST_STATUSES.map((status) => {
    const of = (type: string) => groups.find((g) => g.type === type && g.status === status);
    const dep = of('deposit');
    const wd = of('withdraw');
    return {
      status,
      deposits: Number(dep?.c ?? 0),
      depositAmount: money(Number(dep?.amount ?? 0)),
      withdraws: Number(wd?.c ?? 0),
      withdrawAmount: money(Number(wd?.amount ?? 0)),
    };
  });
  return {
    count: Number(total?.c ?? 0),
    amount: money(Number(total?.amount ?? 0)),
    /** amounts of the listed (status-filtered) requests per type */
    depositAmount: money(Number(total?.dep ?? 0)),
    withdrawAmount: money(Number(total?.wd ?? 0)),
    byStatus,
  };
}

reports1Router.get('/fund2', requirePerm('reports.fund2'), (req, res) => {
  const f = requestFilter(req, () => {}, true);
  const totals = requestTotals(f);
  res.json({ from: f.from, to: f.to, page: f.page, perPage: f.perPage, total: totals.count, totals, rows: requestRows(f) });
});

reports1Router.get('/upi-fund', requirePerm('reports.upi_fund'), (req, res) => {
  const f = requestFilter(req, (w) => w.add(`f.type = 'deposit'`).add(`LOWER(COALESCE(f.method, '')) = 'upi'`), false);
  const totals = requestTotals(f);
  const approved = totals.byStatus
    .filter((s) => s.status === 'approved' || s.status === 'completed')
    .reduce((sum, s) => sum + s.depositAmount, 0);
  res.json({
    from: f.from,
    to: f.to,
    page: f.page,
    perPage: f.perPage,
    total: totals.count,
    totals: { ...totals, approvedAmount: money(approved) },
    rows: requestRows(f),
  });
});
