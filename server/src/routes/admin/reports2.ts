/* Reports part 2 (mounted at /api/admin/reports): Total Bids (the "Detailed
 * Bidding Report"), Credit/Debit, Daily Report, Bidding Report, User Analysis,
 * User Reports, User Lists, Customer Balance and All User Bids.
 *
 * Conventions shared by every report in this file:
 *   - Profit/Loss is from the house's side: bids − winnings, deposits − withdrawals.
 *   - Refunded bids are left out of every money total.
 *   - Deposit  = wallet credits of type 'deposit', dated by when they were credited.
 *   - Withdraw = withdraw requests that were approved or completed, dated by when
 *                they were requested.
 *   - Bid figures are dated by the game date (bids.bid_date).
 * Long lists are paged on the server (?page&perPage&q); ?all=1 returns every row
 * for the Export buttons.
 */
import { type Request, Router } from 'express';
import { requirePerm } from '../../auth.js';
import { config } from '../../config.js';
import { all, get, localDate } from '../../db.js';
import { BOTH_SESSION_TYPES, KINDS, type Kind, addDays, gameType } from '../../game.js';
import { allRates } from '../../rates.js';
import { formatResult, getResult } from '../../results.js';
import { BY_AUTO, money } from '../../wallet.js';
import { badRequest, qDate, qPage, qRange, str } from './util.js';

export const reports2Router = Router();

type P = string | number | null;
type Row = Record<string, unknown>;

const PERM = {
  totalBids: 'reports.total_bids',
  creditDebit: 'reports.credit_debit',
  daily: 'reports.daily',
  bidding: 'reports.bidding',
  userAnalysis: 'reports.user_analysis',
  userReport: 'reports.user_report',
  userList: 'reports.user_list',
  customerBalance: 'reports.customer_balance',
  allUserBids: 'reports.all_user_bids',
} as const;
const ANY_REPORT = Object.values(PERM);

/* ----------------------------------------------------------------- helpers */

const num = (v: unknown) => money(Number(v ?? 0));

/** UTC ISO bounds [start, end) of the local days from..to, for indexed created_at filters. */
function utcBounds(from: string, to: string): [string, string] {
  return [new Date(`${from}T00:00:00`).toISOString(), new Date(`${addDays(to, 1)}T00:00:00`).toISOString()];
}

/** Searchable text column for the server-side "Search:" box. */
function qcat(...cols: string[]) {
  return `(${cols.map((c) => `COALESCE(${c}, '')`).join(` || ' ' || `)})`;
}

const USER_Q = ['u.username', 'u.name', 'u.mobile'];

/** Game-type label as configured on the Game Rates pages for that kind. */
function typeLabeler() {
  const map = new Map<string, string>();
  for (const r of allRates()) map.set(`${r.kind}:${r.key}`, r.label);
  return (kind: unknown, key: unknown) =>
    map.get(`${String(kind)}:${String(key)}`) ?? gameType(String(key))?.label ?? String(key);
}

const BOTH = new Set<string>(BOTH_SESSION_TYPES);
const BOTH_IN = BOTH_SESSION_TYPES.map(() => '?').join(',');

/**
 * Session shown for a bid: main-market jodi / red bracket / sangam bids are
 * decided by the close result, so they read "close". Starline and Andar Bahar
 * have no sessions (null).
 */
function sessionOf(kind: unknown, type: unknown, session: unknown): 'open' | 'close' | null {
  if (kind !== 'main') return null;
  return BOTH.has(String(type)) ? 'close' : session === 'close' ? 'close' : 'open';
}

/** Bids a "Game Session" filter selects (main markets only). */
function sessionScope(session: string, a = 'b'): { sql: string; params: P[] } | null {
  if (session === 'open') {
    return {
      sql: `(${a}.kind = 'main' AND ${a}.session = 'open' AND ${a}.game_type NOT IN (${BOTH_IN}))`,
      params: [...BOTH_SESSION_TYPES],
    };
  }
  if (session === 'close') {
    return {
      sql: `(${a}.kind = 'main' AND (${a}.session = 'close' OR ${a}.game_type IN (${BOTH_IN})))`,
      params: [...BOTH_SESSION_TYPES],
    };
  }
  return null;
}

/** ?game= '' (all), 'kind:main|starline|andarbahar', or a market id. */
function gameScope(value: string, a = 'b'): { sql: string; params: P[]; marketId: number | null; kind: Kind | null } {
  if (value.startsWith('kind:')) {
    const kind = value.slice(5) as Kind;
    if (!KINDS.includes(kind)) throw badRequest('Unknown market type');
    return { sql: `${a}.kind = ?`, params: [kind], marketId: null, kind };
  }
  if (value && value !== 'all') {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Choose a valid game');
    const m = get<{ kind: Kind }>('SELECT kind FROM markets WHERE id = ?', id);
    if (!m) throw badRequest('Game not found');
    return { sql: `${a}.market_id = ?`, params: [id], marketId: id, kind: m.kind };
  }
  return { sql: '1 = 1', params: [], marketId: null, kind: null };
}

/** Optional ?userId= that must point at an existing user. */
function qUser(req: Request, required = false): number | null {
  const raw = str(req.query.userId);
  if (!raw) {
    if (required) throw badRequest('Select a player');
    return null;
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0 || !get('SELECT 1 AS x FROM users WHERE id = ?', id)) {
    throw badRequest('Player not found');
  }
  return id;
}

const EXPORT_LIMIT = 100_000;

/**
 * Page a report query. `base` must expose a `_q` column (search text);
 * `totals` are extra aggregate expressions computed over the whole filtered set.
 */
function pageQuery(
  req: Request,
  o: { base: string; params: P[]; order: string; totals?: string; perPage?: number },
) {
  const q = str(req.query.q);
  const where = q ? ' WHERE _q LIKE ?' : '';
  const params = q ? [...o.params, `%${q}%`] : o.params;
  const head =
    get<Row>(`SELECT COUNT(*) AS total${o.totals ? `, ${o.totals}` : ''} FROM (${o.base})${where}`, ...params) ?? {};
  const exportAll = req.query.all === '1';
  const { page, perPage, offset } = qPage(req, o.perPage ?? 10, 500);
  const rows = all<Row>(
    `SELECT * FROM (${o.base})${where} ORDER BY ${o.order} LIMIT ? OFFSET ?`,
    ...params,
    exportAll ? EXPORT_LIMIT : perPage,
    exportAll ? 0 : offset,
  );
  return { page: exportAll ? 1 : page, perPage: exportAll ? rows.length : perPage, total: Number(head.total ?? 0), head, rows };
}

function userStatus(u: Row): 'deleted' | 'blocked' | 'active' {
  return u.is_deleted ? 'deleted' : u.is_active ? 'active' : 'blocked';
}

/** Indian-grouped money for sentences: 1,23,456.5 */
function amtText(n: unknown) {
  return Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/* ------------------------------------------------------- filter options */

/** Markets and game types for the report filters. */
reports2Router.get('/r2-options', requirePerm(...ANY_REPORT), (_req, res) => {
  const markets = all<{ id: number; name: string; kind: string; is_active: number }>(
    'SELECT id, name, kind, is_active FROM markets ORDER BY sort_order, id',
  );
  res.json({
    markets: markets.map((m) => ({ id: m.id, name: m.name, kind: m.kind, isActive: !!m.is_active })),
    gameTypes: allRates().map((r) => ({ kind: r.kind, key: r.key, label: r.label })),
  });
});

/** "Select Admin" choices: every staff name that ever touched a wallet, plus current staff. */
reports2Router.get('/r2-admins', requirePerm(PERM.creditDebit), (_req, res) => {
  const names = new Set<string>([config.adminUser]);
  for (const r of all<{ name: string }>(
    `SELECT DISTINCT added_by AS name FROM transactions WHERE added_by NOT IN ('Auto', 'Self')
     UNION SELECT username FROM admins`,
  )) {
    if (r.name) names.add(r.name);
  }
  res.json({ admins: [...names].sort((a, b) => a.localeCompare(b)) });
});

/* ------------------------------------------- Total Bids (Detailed Bidding) */

reports2Router.get('/total-bids', requirePerm(PERM.totalBids), (req, res) => {
  const date = qDate(req);
  const game = gameScope(str(req.query.game));
  const where = ['b.bid_date = ?', game.sql];
  const params: P[] = [date, ...game.params];
  const type = str(req.query.gameType);
  if (type && type !== 'all') {
    if (!gameType(type)) throw badRequest('Unknown game type');
    where.push('b.game_type = ?');
    params.push(type);
  }
  const scope = sessionScope(str(req.query.session));
  if (scope) {
    where.push(scope.sql);
    params.push(...scope.params);
  }

  const base = `
    SELECT b.id, b.user_id, u.name, u.username, u.mobile, b.market_id, b.market_name, b.kind, b.game_type,
           b.session, b.pick, b.amount, b.rate, b.status, b.win_amount, b.bid_date, b.created_at,
           ${qcat(...USER_Q, 'b.market_name', 'b.pick', 'b.status')} AS _q
    FROM bids b JOIN users u ON u.id = b.user_id
    WHERE ${where.join(' AND ')}`;
  const r = pageQuery(req, {
    base,
    params,
    order: 'created_at DESC, id DESC',
    totals: `COALESCE(SUM(CASE WHEN status != 'refunded' THEN amount END), 0) AS amount,
             COALESCE(SUM(win_amount), 0) AS win,
             COUNT(CASE WHEN status = 'refunded' THEN 1 END) AS refunded`,
  });
  const label = typeLabeler();
  const amount = num(r.head.amount);
  const win = num(r.head.win);
  res.json({
    date,
    page: r.page,
    perPage: r.perPage,
    total: r.total,
    totals: { bids: r.total, refunded: Number(r.head.refunded ?? 0), amount, win, profit: money(amount - win) },
    rows: r.rows.map((b) => ({
      id: b.id,
      userId: b.user_id,
      name: b.name,
      username: b.username,
      mobile: b.mobile,
      market: b.market_name,
      kind: b.kind,
      gameType: b.game_type,
      typeLabel: label(b.kind, b.game_type),
      session: sessionOf(b.kind, b.game_type, b.session),
      pick: b.pick,
      amount: num(b.amount),
      rate: Number(b.rate),
      winAmount: num(b.win_amount),
      status: b.status,
      bidDate: b.bid_date,
      createdAt: b.created_at,
    })),
  });
});

/* --------------------------------------------------- Credit/Debit Report */

const TXN_TYPES = ['bonus', 'deposit', 'withdraw', 'bid', 'win', 'refund', 'adjust', 'revert'];

reports2Router.get('/credit-debit', requirePerm(PERM.creditDebit), (req, res) => {
  const { from, to } = qRange(req);
  const [start, end] = utcBounds(from, to);
  const where = ['t.created_at >= ?', 't.created_at < ?'];
  const params: P[] = [start, end];

  const dir = str(req.query.dir);
  if (dir === 'credit') where.push('t.amount > 0');
  else if (dir === 'debit') where.push('t.amount < 0');

  const by = str(req.query.admin);
  if (by === 'staff') where.push(`t.added_by NOT IN ('Auto', 'Self')`);
  else if (by && by !== 'all') {
    where.push('t.added_by = ?');
    params.push(by);
  }

  const type = str(req.query.type);
  if (type && type !== 'all') {
    if (!TXN_TYPES.includes(type)) throw badRequest('Unknown transaction type');
    where.push('t.type = ?');
    params.push(type);
  }
  const userId = qUser(req);
  if (userId) {
    where.push('t.user_id = ?');
    params.push(userId);
  }

  const base = `
    SELECT t.id, t.user_id, u.name, u.username, u.mobile, t.type, t.amount, t.balance_after, t.particulars,
           t.note, t.added_by, t.mode, t.ref, t.created_at,
           ${qcat(...USER_Q, 't.particulars', 't.note', 't.added_by', 't.mode')} AS _q
    FROM transactions t JOIN users u ON u.id = t.user_id
    WHERE ${where.join(' AND ')}`;
  const r = pageQuery(req, {
    base,
    params,
    order: 'created_at DESC, id DESC',
    totals: `COUNT(CASE WHEN amount > 0 THEN 1 END) AS credits,
             COALESCE(SUM(CASE WHEN amount > 0 THEN amount END), 0) AS credit,
             COUNT(CASE WHEN amount < 0 THEN 1 END) AS debits,
             COALESCE(SUM(CASE WHEN amount < 0 THEN -amount END), 0) AS debit`,
  });
  const credit = num(r.head.credit);
  const debit = num(r.head.debit);
  res.json({
    from,
    to,
    page: r.page,
    perPage: r.perPage,
    total: r.total,
    totals: {
      credits: Number(r.head.credits ?? 0),
      credit,
      debits: Number(r.head.debits ?? 0),
      debit,
      net: money(credit - debit),
    },
    rows: r.rows.map((t) => ({
      id: t.id,
      userId: t.user_id,
      name: t.name,
      username: t.username,
      mobile: t.mobile,
      type: t.type,
      direction: Number(t.amount) >= 0 ? 'credit' : 'debit',
      amount: Math.abs(num(t.amount)),
      balanceAfter: num(t.balance_after),
      particulars: t.particulars,
      description: t.note,
      mode: t.mode,
      ref: t.ref,
      addedBy: t.added_by,
      createdAt: t.created_at,
    })),
  });
});

/* ------------------------------------------------------------ Daily Report */

const DAILY_TYPES: Record<string, string> = {
  all: 'All Activity',
  play: 'Play Game',
  win: 'Win',
  deposit: 'Deposit',
  withdraw_request: 'Withdraw Request',
  withdraw_paid: 'Withdraw Paid',
  register: 'Register',
  admin: 'Admin Credit/Debit',
  bank: 'Bank Change',
};

/**
 * One SELECT per activity type, all with the same columns
 * (at, tag, user_id, username, name, mobile, info JSON, _q) so "All" can UNION them.
 */
function dailySource(tag: string, userId: number | null): { sql: string; params: P[] } {
  const who = 'u.username, u.name, u.mobile';
  const q = qcat(...USER_Q);
  const forUser = (col: string) => (userId ? ` AND ${col} = ?` : '');
  const params: P[] = userId ? [userId] : [];
  switch (tag) {
    case 'play':
      return {
        sql: `SELECT b.created_at AS at, 'play' AS tag, b.user_id, ${who},
                json_object('market', b.market_name, 'kind', b.kind, 'type', b.game_type, 'session', b.session,
                            'pick', b.pick, 'amount', b.amount, 'status', b.status, 'win', b.win_amount) AS info,
                ${qcat(...USER_Q, 'b.market_name', 'b.pick')} AS _q
              FROM bids b JOIN users u ON u.id = b.user_id
              WHERE b.created_at >= ? AND b.created_at < ?${forUser('b.user_id')}`,
        params,
      };
    case 'win':
      return {
        sql: `SELECT COALESCE(b.settled_at, b.created_at) AS at, 'win' AS tag, b.user_id, ${who},
                json_object('market', b.market_name, 'kind', b.kind, 'type', b.game_type, 'session', b.session,
                            'pick', b.pick, 'amount', b.amount, 'win', b.win_amount, 'rate', b.rate) AS info,
                ${qcat(...USER_Q, 'b.market_name', 'b.pick')} AS _q
              FROM bids b JOIN users u ON u.id = b.user_id
              WHERE b.status = 'won' AND COALESCE(b.settled_at, b.created_at) >= ?
                AND COALESCE(b.settled_at, b.created_at) < ?${forUser('b.user_id')}`,
        params,
      };
    case 'deposit':
    case 'withdraw_request':
      return {
        sql: `SELECT f.created_at AS at, '${tag}' AS tag, f.user_id, ${who},
                json_object('id', f.id, 'amount', f.amount, 'method', COALESCE(f.payout_mode, f.method),
                            'status', f.status, 'utr', f.utr, 'by', f.processed_by, 'remark', f.remark) AS info,
                ${qcat(...USER_Q, 'f.utr', 'f.status')} AS _q
              FROM fund_requests f JOIN users u ON u.id = f.user_id
              WHERE f.type = '${tag === 'deposit' ? 'deposit' : 'withdraw'}'
                AND f.created_at >= ? AND f.created_at < ?${forUser('f.user_id')}`,
        params,
      };
    case 'withdraw_paid':
      return {
        sql: `SELECT COALESCE(f.completed_at, f.updated_at, f.created_at) AS at, 'withdraw_paid' AS tag, f.user_id, ${who},
                json_object('id', f.id, 'amount', f.amount, 'method', COALESCE(f.payout_mode, f.method),
                            'status', f.status, 'by', f.processed_by) AS info,
                ${q} AS _q
              FROM fund_requests f JOIN users u ON u.id = f.user_id
              WHERE f.type = 'withdraw' AND f.status IN ('approved', 'completed')
                AND COALESCE(f.completed_at, f.updated_at, f.created_at) >= ?
                AND COALESCE(f.completed_at, f.updated_at, f.created_at) < ?${forUser('f.user_id')}`,
        params,
      };
    case 'register':
      return {
        sql: `SELECT u.created_at AS at, 'register' AS tag, u.id AS user_id, ${who},
                json_object('device', u.device_name) AS info, ${q} AS _q
              FROM users u
              WHERE u.created_at >= ? AND u.created_at < ?${forUser('u.id')}`,
        params,
      };
    case 'admin':
      return {
        sql: `SELECT t.created_at AS at, 'admin' AS tag, t.user_id, ${who},
                json_object('amount', t.amount, 'by', t.added_by, 'type', t.type, 'particulars', t.particulars,
                            'note', t.note, 'mode', t.mode) AS info,
                ${qcat(...USER_Q, 't.added_by', 't.particulars')} AS _q
              FROM transactions t JOIN users u ON u.id = t.user_id
              WHERE t.added_by NOT IN ('Auto', 'Self') AND t.type NOT IN ('bid', 'win', 'refund', 'revert')
                AND t.created_at >= ? AND t.created_at < ?${forUser('t.user_id')}`,
        params,
      };
    case 'bank':
      return {
        sql: `SELECT k.created_at AS at, 'bank' AS tag, k.user_id, ${who},
                json_object('holder', k.holder_name, 'account', k.account_no, 'ifsc', k.ifsc, 'bank', k.bank_name,
                            'paytm', k.paytm, 'phonepe', k.phonepe, 'gpay', k.gpay,
                            'prevCount', (SELECT COUNT(*) FROM banks p WHERE p.user_id = k.user_id AND p.id < k.id),
                            'prevAccount', (SELECT p.account_no FROM banks p WHERE p.user_id = k.user_id AND p.id < k.id
                                            ORDER BY p.id DESC LIMIT 1),
                            'prevBank', (SELECT p.bank_name FROM banks p WHERE p.user_id = k.user_id AND p.id < k.id
                                         ORDER BY p.id DESC LIMIT 1)) AS info,
                ${qcat(...USER_Q, 'k.account_no', 'k.bank_name')} AS _q
              FROM banks k JOIN users u ON u.id = k.user_id
              WHERE k.created_at >= ? AND k.created_at < ?${forUser('k.user_id')}`,
        params,
      };
    default:
      throw badRequest('Unknown report type');
  }
}

const STATUS_WORD: Record<string, string> = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  completed: 'completed',
  failed: 'failed',
};

const METHOD_NAME: Record<string, string> = {
  upi: 'UPI',
  bank: 'Bank',
  paytm: 'Paytm',
  phonepe: 'PhonePe',
  gpay: 'GPay',
  ip: 'IP',
  pg: 'PG',
  cash: 'Cash',
};

/** The human sentence for one Daily Report row. */
function dailySentence(row: Row, label: (kind: unknown, key: unknown) => string): string {
  let i: Record<string, unknown> = {};
  try {
    i = JSON.parse(String(row.info ?? '{}')) as Record<string, unknown>;
  } catch {
    i = {};
  }
  const who = String(row.username || row.name || `User #${row.user_id}`);
  const sess = () => {
    if (i.kind !== 'main' || BOTH.has(String(i.type))) return '';
    return i.session === 'close' ? ' (Close)' : ' (Open)';
  };
  const method = (m: unknown) => {
    const s = String(m ?? '').trim();
    return METHOD_NAME[s.toLowerCase()] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  };
  const status = (s: unknown, by: unknown, remark?: unknown) => {
    const word = STATUS_WORD[String(s)] ?? String(s ?? '');
    const parts = [word];
    if (by === BY_AUTO && word !== 'pending') parts.push('automatically');
    else if (by && word !== 'pending') parts.push(`by ${String(by)}`);
    if (remark && (s === 'rejected' || s === 'failed')) parts.push(`(${String(remark)})`);
    return parts.join(' ');
  };

  switch (row.tag) {
    case 'play': {
      const base = `${who} played ${label(i.kind, i.type)} ${String(i.pick)} on ${String(i.market)}${sess()} for ${amtText(i.amount)}`;
      if (i.status === 'won') return `${base}, won ${amtText(i.win)}`;
      if (i.status === 'lost') return `${base}, lost`;
      if (i.status === 'refunded') return `${base}, refunded`;
      return `${base}, result pending`;
    }
    case 'win':
      return `${who} won ${amtText(i.win)} on ${String(i.market)}${sess()} with ${label(i.kind, i.type)} ${String(i.pick)} (played ${amtText(i.amount)} at ${String(i.rate)}x)`;
    case 'deposit': {
      const via = method(i.method);
      const utr = i.utr ? `, UTR ${String(i.utr)}` : '';
      return `${who} requested a deposit of ${amtText(i.amount)}${via ? ` by ${via}` : ''}${utr}: ${status(i.status, i.by, i.remark)}`;
    }
    case 'withdraw_request': {
      const via = method(i.method);
      return `${who} requested a withdrawal of ${amtText(i.amount)}${via ? ` to ${via}` : ''}: ${status(i.status, i.by, i.remark)}`;
    }
    case 'withdraw_paid': {
      const via = method(i.method);
      return `Withdrawal of ${amtText(i.amount)} paid to ${who}${via ? ` by ${via}` : ''} (request #${String(i.id)}, ${status(i.status, i.by)})`;
    }
    case 'register':
      return `${who} registered (${String(row.name ?? '')}, mobile ${String(row.mobile ?? '')}${i.device ? `, ${String(i.device)}` : ''})`;
    case 'admin': {
      const amount = Number(i.amount ?? 0);
      const verb = amount >= 0 ? `credited ${amtText(amount)} to` : `debited ${amtText(-amount)} from`;
      const mode = i.mode ? ` (${String(i.mode)})` : '';
      const note = i.note ? `, ${String(i.note)}` : '';
      return `${String(i.by)} ${verb} ${who}'s wallet${mode}: ${String(i.particulars ?? '')}${note}`;
    }
    case 'bank': {
      const parts: string[] = [];
      if (i.account) {
        parts.push(
          [i.bank, `A/c ${String(i.account)}`, i.ifsc ? `IFSC ${String(i.ifsc)}` : '', i.holder ? `holder ${String(i.holder)}` : '']
            .filter(Boolean)
            .map(String)
            .join(', '),
        );
      }
      if (i.paytm) parts.push(`Paytm ${String(i.paytm)}`);
      if (i.phonepe) parts.push(`PhonePe ${String(i.phonepe)}`);
      if (i.gpay) parts.push(`GPay ${String(i.gpay)}`);
      const detail = parts.join('; ') || 'no details';
      if (!Number(i.prevCount)) return `${who} added payout details: ${detail}`;
      const was = i.prevAccount
        ? ` (was A/c ${String(i.prevAccount)}${i.prevBank ? `, ${String(i.prevBank)}` : ''})`
        : '';
      return `${who} changed payout details to ${detail}${was}`;
    }
    default:
      return '';
  }
}

reports2Router.get('/daily', requirePerm(PERM.daily), (req, res) => {
  const { from, to } = qRange(req);
  const [start, end] = utcBounds(from, to);
  const type = str(req.query.type) || 'play';
  if (!DAILY_TYPES[type]) throw badRequest('Unknown report type');
  const userId = qUser(req);

  const tags = type === 'all' ? Object.keys(DAILY_TYPES).filter((t) => t !== 'all') : [type];
  const parts = tags.map((t) => dailySource(t, userId));
  const base = parts.map((p) => p.sql).join('\nUNION ALL\n');
  const params = parts.flatMap((p) => [start, end, ...p.params]);

  const r = pageQuery(req, { base, params, order: 'at DESC' });
  const label = typeLabeler();
  res.json({
    from,
    to,
    type,
    typeLabel: DAILY_TYPES[type],
    page: r.page,
    perPage: r.perPage,
    total: r.total,
    rows: r.rows.map((row) => ({
      at: row.at,
      tag: row.tag,
      userId: row.user_id,
      username: row.username,
      notification: dailySentence(row, label),
    })),
  });
});

/* ---------------------------------------------------------- Bidding Report */

reports2Router.get('/bidding', requirePerm(PERM.bidding), (req, res) => {
  const date = qDate(req);
  const marketId = Number(req.query.marketId);
  if (!Number.isInteger(marketId) || marketId <= 0) throw badRequest('Select a game');
  const market = get<{ id: number; name: string; kind: Kind }>('SELECT id, name, kind FROM markets WHERE id = ?', marketId);
  if (!market) throw badRequest('Game not found');

  const where = ['b.market_id = ?', 'b.bid_date = ?', `b.status != 'refunded'`];
  const params: P[] = [marketId, date];
  const type = str(req.query.gameType);
  if (type && type !== 'all') {
    if (!gameType(type)) throw badRequest('Unknown game type');
    where.push('b.game_type = ?');
    params.push(type);
  }
  const scope = market.kind === 'main' ? sessionScope(str(req.query.session)) : null;
  if (scope) {
    where.push(scope.sql);
    params.push(...scope.params);
  }

  const rows = all<Row>(
    `SELECT b.bid_date, b.game_type,
            CASE WHEN b.kind != 'main' THEN NULL WHEN b.game_type IN (${BOTH_IN}) THEN 'close' ELSE b.session END AS sess,
            b.pick, COUNT(*) AS bids, SUM(b.amount) AS amount, SUM(b.amount * b.rate) AS payout,
            SUM(b.win_amount) AS won,
            COUNT(CASE WHEN b.status = 'won' THEN 1 END) AS won_n,
            COUNT(CASE WHEN b.status = 'pending' THEN 1 END) AS pending_n
     FROM bids b
     WHERE ${where.join(' AND ')}
     GROUP BY b.bid_date, b.game_type, sess, b.pick
     ORDER BY amount DESC, b.pick`,
    ...BOTH_SESSION_TYPES,
    ...params,
  );
  const label = typeLabeler();
  const list = rows.map((r) => ({
    date: r.bid_date,
    gameType: r.game_type,
    typeLabel: label(market.kind, r.game_type),
    session: r.sess ?? null,
    pick: r.pick,
    bids: Number(r.bids),
    amount: num(r.amount),
    payout: num(r.payout),
    won: num(r.won),
    status: Number(r.won_n) > 0 ? 'won' : Number(r.pending_n) > 0 ? 'pending' : 'lost',
  }));
  const sum = (k: 'bids' | 'amount' | 'payout' | 'won') => money(list.reduce((s, r) => s + r[k], 0));
  const result = getResult(marketId, date);
  res.json({
    date,
    market: { id: market.id, name: market.name, kind: market.kind },
    result: result ? formatResult(result, market.kind) : null,
    rows: list,
    totals: {
      numbers: list.length,
      bids: sum('bids'),
      amount: sum('amount'),
      payout: sum('payout'),
      won: sum('won'),
      profit: money(sum('amount') - sum('won')),
    },
  });
});

/* ----------------------------------------------------------- User Analysis */

reports2Router.get('/user-analysis', requirePerm(PERM.userAnalysis), (req, res) => {
  const { from, to } = qRange(req);
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days.push(d);
    if (days.length > 400) throw badRequest('Choose a range of 400 days or less');
  }
  const [start, end] = utcBounds(from, to);
  const day = (col: string) => localDate(col);

  const byDay = <T extends Row>(rows: T[]) => new Map(rows.map((r) => [String(r.d), r]));
  const regs = byDay(
    all(`SELECT ${day('created_at')} AS d, COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ? GROUP BY d`, start, end),
  );
  const bids = byDay(
    all(
      `SELECT bid_date AS d, COUNT(DISTINCT user_id) AS users, COUNT(*) AS n, SUM(amount) AS amount, SUM(win_amount) AS win
       FROM bids WHERE bid_date BETWEEN ? AND ? AND status != 'refunded' GROUP BY bid_date`,
      from,
      to,
    ),
  );
  const deps = byDay(
    all(
      `SELECT ${day('created_at')} AS d, COUNT(DISTINCT user_id) AS users, SUM(amount) AS amount
       FROM transactions WHERE type = 'deposit' AND created_at >= ? AND created_at < ? GROUP BY d`,
      start,
      end,
    ),
  );
  const wds = byDay(
    all(
      `SELECT ${day('created_at')} AS d, COUNT(DISTINCT user_id) AS users, SUM(amount) AS amount
       FROM fund_requests WHERE type = 'withdraw' AND status IN ('approved', 'completed')
         AND created_at >= ? AND created_at < ? GROUP BY d`,
      start,
      end,
    ),
  );

  const rows = days.map((d) => {
    const b = bids.get(d);
    const bid = num(b?.amount);
    const win = num(b?.win);
    return {
      date: d,
      registrations: Number(regs.get(d)?.n ?? 0),
      bettors: Number(b?.users ?? 0),
      bids: Number(b?.n ?? 0),
      depositors: Number(deps.get(d)?.users ?? 0),
      deposit: num(deps.get(d)?.amount),
      withdrawers: Number(wds.get(d)?.users ?? 0),
      withdraw: num(wds.get(d)?.amount),
      bidAmount: bid,
      winAmount: win,
      profit: money(bid - win),
    };
  });

  // unique people over the whole range (a user active on 3 days counts once)
  const unique = {
    bettors: Number(
      get<Row>(`SELECT COUNT(DISTINCT user_id) AS n FROM bids WHERE bid_date BETWEEN ? AND ? AND status != 'refunded'`, from, to)?.n ?? 0,
    ),
    depositors: Number(
      get<Row>(
        `SELECT COUNT(DISTINCT user_id) AS n FROM transactions WHERE type = 'deposit' AND created_at >= ? AND created_at < ?`,
        start,
        end,
      )?.n ?? 0,
    ),
    withdrawers: Number(
      get<Row>(
        `SELECT COUNT(DISTINCT user_id) AS n FROM fund_requests WHERE type = 'withdraw' AND status IN ('approved', 'completed')
         AND created_at >= ? AND created_at < ?`,
        start,
        end,
      )?.n ?? 0,
    ),
  };
  const sum = (k: 'registrations' | 'bids' | 'deposit' | 'withdraw' | 'bidAmount' | 'winAmount' | 'profit') =>
    money(rows.reduce((s, r) => s + r[k], 0));
  res.json({
    from,
    to,
    rows: rows.reverse(),
    totals: {
      registrations: sum('registrations'),
      bettors: unique.bettors,
      bids: sum('bids'),
      depositors: unique.depositors,
      deposit: sum('deposit'),
      withdrawers: unique.withdrawers,
      withdraw: sum('withdraw'),
      bidAmount: sum('bidAmount'),
      winAmount: sum('winAmount'),
      profit: sum('profit'),
    },
  });
});

/* ------------------------------------------------------------ User Reports */

/** Per-user (and per-day) money movements as one UNION ALL source: user_id, d, dep, wd, bid, win. */
function moneySource(
  from: string,
  to: string,
  parts: { deposits?: boolean; withdraws?: boolean; bids?: boolean },
  marketId: number | null,
): { sql: string; params: P[] } {
  const [start, end] = utcBounds(from, to);
  const sql: string[] = [];
  const params: P[] = [];
  if (parts.deposits) {
    sql.push(
      `SELECT user_id, ${localDate('created_at')} AS d, amount AS dep, 0 AS wd, 0 AS bid, 0 AS win
       FROM transactions WHERE type = 'deposit' AND created_at >= ? AND created_at < ?`,
    );
    params.push(start, end);
  }
  if (parts.withdraws) {
    sql.push(
      `SELECT user_id, ${localDate('created_at')} AS d, 0 AS dep, amount AS wd, 0 AS bid, 0 AS win
       FROM fund_requests WHERE type = 'withdraw' AND status IN ('approved', 'completed') AND created_at >= ? AND created_at < ?`,
    );
    params.push(start, end);
  }
  if (parts.bids) {
    sql.push(
      `SELECT user_id, bid_date AS d, 0 AS dep, 0 AS wd, amount AS bid, win_amount AS win
       FROM bids WHERE status != 'refunded' AND bid_date BETWEEN ? AND ?${marketId ? ' AND market_id = ?' : ''}`,
    );
    params.push(from, to);
    if (marketId) params.push(marketId);
  }
  return { sql: sql.join('\nUNION ALL\n'), params };
}

function optMarket(req: Request): number | null {
  const v = str(req.query.marketId);
  if (!v || v === 'all') return null;
  const id = Number(v);
  if (!Number.isInteger(id) || !get('SELECT 1 AS x FROM markets WHERE id = ?', id)) throw badRequest('Provider not found');
  return id;
}

const USER_TOTALS = `COALESCE(SUM(dep), 0) AS dep, COALESCE(SUM(wd), 0) AS wd,
                     COALESCE(SUM(bid), 0) AS bid, COALESCE(SUM(win), 0) AS win`;

function userTotals(h: Row) {
  const deposit = num(h.dep);
  const withdraw = num(h.wd);
  const bid = num(h.bid);
  const win = num(h.win);
  return { deposit, withdraw, bid, win };
}

reports2Router.get('/user-report', requirePerm(PERM.userReport), (req, res) => {
  const { from, to } = qRange(req);
  const tab = str(req.query.tab) || 'top';
  const userId = qUser(req);
  const marketId = tab === 'deposit' ? null : optMarket(req);
  const userWhere = userId ? ' WHERE x.user_id = ?' : '';
  const userParam: P[] = userId ? [userId] : [];

  if (tab === 'top') {
    // one row per user per day; with a provider chosen only users who played it
    const src = moneySource(from, to, { deposits: true, withdraws: true, bids: true }, marketId);
    const base = `
      SELECT g.user_id, g.d, g.dep, g.wd, g.bid, g.win, g.bid - g.win AS profit, u.name, u.username, u.mobile,
             ${qcat(...USER_Q)} AS _q
      FROM (SELECT x.user_id, x.d, SUM(x.dep) AS dep, SUM(x.wd) AS wd, SUM(x.bid) AS bid, SUM(x.win) AS win
            FROM (${src.sql}) x${userWhere} GROUP BY x.user_id, x.d) g
      JOIN users u ON u.id = g.user_id
      ${marketId ? 'WHERE g.bid > 0' : ''}`;
    const r = pageQuery(req, {
      base,
      params: [...src.params, ...userParam],
      order: 'bid DESC, d DESC, user_id',
      totals: USER_TOTALS,
    });
    const t = userTotals(r.head);
    return res.json({
      tab,
      from,
      to,
      page: r.page,
      perPage: r.perPage,
      total: r.total,
      totals: { ...t, profit: money(t.bid - t.win) },
      rows: r.rows.map((g) => ({
        userId: g.user_id,
        date: g.d,
        name: g.name,
        username: g.username,
        mobile: g.mobile,
        deposit: num(g.dep),
        withdraw: num(g.wd),
        bid: num(g.bid),
        win: num(g.win),
        profit: num(g.profit),
      })),
    });
  }

  if (tab !== 'deposit' && tab !== 'bidding') throw badRequest('Unknown report tab');
  const src =
    tab === 'deposit'
      ? moneySource(from, to, { deposits: true, withdraws: true }, null)
      : moneySource(from, to, { bids: true }, marketId);
  const profit = tab === 'deposit' ? 'g.dep - g.wd' : 'g.bid - g.win';
  const rows = all<Row>(
    `SELECT g.*, ${profit} AS profit, u.name, u.username, u.mobile
     FROM (SELECT x.user_id, SUM(x.dep) AS dep, SUM(x.wd) AS wd, SUM(x.bid) AS bid, SUM(x.win) AS win
           FROM (${src.sql}) x${userWhere} GROUP BY x.user_id) g
     JOIN users u ON u.id = g.user_id
     ORDER BY profit ASC, u.username`,
    ...src.params,
    ...userParam,
  );
  const list = rows.map((g) => ({
    userId: g.user_id,
    name: g.name,
    username: g.username,
    mobile: g.mobile,
    deposit: num(g.dep),
    withdraw: num(g.wd),
    bid: num(g.bid),
    win: num(g.win),
    profit: num(g.profit),
  }));
  const sum = (k: 'deposit' | 'withdraw' | 'bid' | 'win') => money(list.reduce((s, r) => s + r[k], 0));
  const totals = { deposit: sum('deposit'), withdraw: sum('withdraw'), bid: sum('bid'), win: sum('win') };
  res.json({
    tab,
    from,
    to,
    rows: list,
    totals: {
      ...totals,
      profit: tab === 'deposit' ? money(totals.deposit - totals.withdraw) : money(totals.bid - totals.win),
    },
  });
});

/* -------------------------------------------------------------- User Lists */

reports2Router.get('/user-list', requirePerm(PERM.userList), (req, res) => {
  const tab = str(req.query.tab) || 'zero';
  const { from, to } = qRange(req);
  const [start, end] = utcBounds(from, to);
  const everyone = req.query.allDates === '1';

  if (tab === 'zero') {
    // users registered in the range who have nothing in their wallet now
    const rows = all<Row>(
      `SELECT u.id, u.name, u.username, u.mobile, u.created_at, u.last_seen_at, u.is_active, u.is_deleted,
              (SELECT COUNT(*) FROM transactions t WHERE t.user_id = u.id AND t.type = 'deposit') AS deposits
       FROM users u
       WHERE ROUND(u.balance, 2) = 0 AND u.is_deleted = 0${everyone ? '' : ' AND u.created_at >= ? AND u.created_at < ?'}
       ORDER BY u.created_at DESC`,
      ...(everyone ? [] : [start, end]),
    );
    return res.json({
      tab,
      rows: rows.map((u) => ({
        userId: u.id,
        name: u.name,
        username: u.username,
        mobile: u.mobile,
        createdAt: u.created_at,
        lastSeenAt: u.last_seen_at,
        deposits: Number(u.deposits),
        status: userStatus(u),
      })),
    });
  }

  if (tab === 'first-withdraw') {
    // each user's first ever withdraw request, kept when it falls in the range
    const rows = all<Row>(
      `SELECT f.id, f.user_id, f.amount, f.status, f.created_at, f.payout_mode, f.method,
              COALESCE(json_extract(f.bank_snapshot, '$.holderName'),
                       (SELECT k.holder_name FROM banks k WHERE k.user_id = f.user_id ORDER BY k.id DESC LIMIT 1)) AS holder,
              u.name, u.username, u.mobile
       FROM (SELECT fr.*, ROW_NUMBER() OVER (PARTITION BY fr.user_id ORDER BY fr.created_at, fr.id) AS n
             FROM fund_requests fr WHERE fr.type = 'withdraw') f
       JOIN users u ON u.id = f.user_id
       WHERE f.n = 1${everyone ? '' : ' AND f.created_at >= ? AND f.created_at < ?'}
       ORDER BY f.created_at DESC`,
      ...(everyone ? [] : [start, end]),
    );
    return res.json({
      tab,
      rows: rows.map((f) => ({
        requestId: f.id,
        userId: f.user_id,
        requestedAt: f.created_at,
        amount: num(f.amount),
        status: f.status,
        mode: f.payout_mode ?? f.method,
        fullName: f.holder || null,
        name: f.name,
        username: f.username,
        mobile: f.mobile,
      })),
    });
  }

  if (tab === 'multiple') {
    // one bank account number used by more than one app account (change history included)
    const groups = all<Row>(
      `SELECT TRIM(k.account_no) AS account, COUNT(DISTINCT k.user_id) AS accounts,
              MIN(k.created_at) AS created, MAX(k.created_at) AS updated
       FROM banks k WHERE TRIM(COALESCE(k.account_no, '')) != ''
       GROUP BY TRIM(k.account_no) HAVING COUNT(DISTINCT k.user_id) > 1
       ORDER BY accounts DESC, created`,
    );
    const members = groups.length
      ? all<Row>(
          `SELECT DISTINCT TRIM(k.account_no) AS account, k.holder_name, u.id, u.username, u.name
           FROM banks k JOIN users u ON u.id = k.user_id
           WHERE TRIM(k.account_no) IN (${groups.map(() => '?').join(',')})
           ORDER BY u.username`,
          ...groups.map((g) => String(g.account)),
        )
      : [];
    return res.json({
      tab,
      rows: groups.map((g) => {
        const mine = members.filter((m) => m.account === g.account);
        const users = new Map<number, { id: number; username: string; name: string }>();
        for (const m of mine) users.set(Number(m.id), { id: Number(m.id), username: String(m.username), name: String(m.name) });
        return {
          accountNo: g.account,
          fullNames: [...new Set(mine.map((m) => String(m.holder_name ?? '').trim()).filter(Boolean))],
          users: [...users.values()],
          totalAccounts: Number(g.accounts),
          createdAt: g.created,
          updatedAt: g.updated !== g.created ? g.updated : null,
        };
      }),
    });
  }

  throw badRequest('Unknown list');
});

/* -------------------------------------------------------- Customer Balance */

reports2Router.get('/customer-balance', requirePerm(PERM.customerBalance), (req, res) => {
  const where: string[] = [];
  const params: P[] = [];
  const amount = (key: string) => {
    const v = str(req.query[key]);
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) throw badRequest(`${key === 'min' ? 'Minimum' : 'Maximum'} balance must be a number`);
    return n;
  };
  const min = amount('min');
  const max = amount('max');
  if (min !== null && max !== null && min > max) throw badRequest('Minimum balance is more than the maximum');
  if (min !== null) {
    where.push('u.balance >= ?');
    params.push(min);
  }
  if (max !== null) {
    where.push('u.balance <= ?');
    params.push(max);
  }
  if (req.query.hideZero !== '0') where.push('ROUND(u.balance, 2) != 0');
  if (req.query.deleted !== '1') where.push('u.is_deleted = 0');
  const status = str(req.query.status);
  if (status === 'active') where.push('u.is_active = 1 AND u.is_deleted = 0');
  else if (status === 'blocked') where.push('u.is_active = 0 AND u.is_deleted = 0');

  const base = `
    SELECT u.id, u.name, u.username, u.mobile, u.balance, u.created_at, u.is_active, u.is_deleted, u.last_seen_at,
           (SELECT t.created_at FROM transactions t WHERE t.user_id = u.id ORDER BY t.id DESC LIMIT 1) AS last_txn,
           ${qcat(...USER_Q)} AS _q
    FROM users u${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
  const r = pageQuery(req, {
    base,
    params,
    order: 'balance DESC, id',
    totals: 'COALESCE(SUM(balance), 0) AS balance',
  });
  const wallets = get<Row>('SELECT COUNT(*) AS n, COALESCE(SUM(balance), 0) AS total FROM users WHERE is_deleted = 0') ?? {};
  res.json({
    page: r.page,
    perPage: r.perPage,
    total: r.total,
    totals: { users: r.total, balance: num(r.head.balance) },
    overall: { users: Number(wallets.n ?? 0), balance: num(wallets.total) },
    rows: r.rows.map((u) => ({
      userId: u.id,
      name: u.name,
      username: u.username,
      mobile: u.mobile,
      balance: num(u.balance),
      lastTxnAt: u.last_txn,
      lastSeenAt: u.last_seen_at,
      createdAt: u.created_at,
      status: userStatus(u),
    })),
  });
});

/* ----------------------------------------------------------- All User Bids */

reports2Router.get('/all-user-bids', requirePerm(PERM.allUserBids), (req, res) => {
  const userId = qUser(req, true)!;
  const kindParam = str(req.query.kind) || 'main';
  if (kindParam !== 'all' && !KINDS.includes(kindParam as Kind)) throw badRequest('Unknown market');

  const where = ['b.user_id = ?'];
  const params: P[] = [userId];
  if (kindParam !== 'all') {
    where.push('b.kind = ?');
    params.push(kindParam);
  }
  const hasRange = !!(str(req.query.from) || str(req.query.to));
  const range = hasRange ? qRange(req) : null;
  if (range) {
    where.push('b.bid_date BETWEEN ? AND ?');
    params.push(range.from, range.to);
  }
  const clause = where.join(' AND ');

  const u = get<Row>(
    `SELECT id, name, username, mobile, balance, created_at, last_seen_at, is_active, is_deleted FROM users WHERE id = ?`,
    userId,
  )!;
  const label = typeLabeler();

  const groups = all<Row>(
    `SELECT b.market_name, b.kind, b.game_type, COUNT(*) AS bids, SUM(b.amount) AS amount, SUM(b.win_amount) AS win
     FROM bids b WHERE ${clause} AND b.status != 'refunded'
     GROUP BY b.market_id, b.market_name, b.kind, b.game_type
     ORDER BY b.market_name, b.game_type`,
    ...params,
  );
  const counts =
    get<Row>(
      `SELECT COUNT(CASE WHEN status = 'won' THEN 1 END) AS won, COUNT(CASE WHEN status = 'lost' THEN 1 END) AS lost,
              COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending,
              COALESCE(SUM(CASE WHEN status = 'pending' THEN amount END), 0) AS pending_amount,
              COUNT(CASE WHEN status = 'refunded' THEN 1 END) AS refunded,
              MIN(bid_date) AS first_date, MAX(bid_date) AS last_date
       FROM bids b WHERE ${clause}`,
      ...params,
    ) ?? {};

  const summary = groups.map((g) => {
    const amount = num(g.amount);
    const win = num(g.win);
    return {
      market: g.market_name,
      kind: g.kind,
      gameType: g.game_type,
      typeLabel: label(g.kind, g.game_type),
      bids: Number(g.bids),
      amount,
      win,
      profit: money(amount - win),
    };
  });
  const sum = (k: 'bids' | 'amount' | 'win') => money(summary.reduce((s, r) => s + r[k], 0));

  const base = `
    SELECT b.id, b.pick, b.amount, b.rate, b.market_name, b.kind, b.game_type, b.session, b.bid_date, b.created_at,
           b.status, b.win_amount, ${qcat('b.market_name', 'b.pick', 'b.status', 'b.game_type')} AS _q
    FROM bids b WHERE ${clause}`;
  const r = pageQuery(req, { base, params, order: 'bid_date DESC, created_at DESC, id DESC', perPage: 50 });

  res.json({
    kind: kindParam,
    from: range?.from ?? null,
    to: range?.to ?? null,
    user: {
      id: u.id,
      name: u.name,
      username: u.username,
      mobile: u.mobile,
      balance: num(u.balance),
      createdAt: u.created_at,
      lastSeenAt: u.last_seen_at,
      status: userStatus(u),
    },
    stats: {
      won: Number(counts.won ?? 0),
      lost: Number(counts.lost ?? 0),
      pending: Number(counts.pending ?? 0),
      pendingAmount: num(counts.pending_amount),
      refunded: Number(counts.refunded ?? 0),
      firstDate: counts.first_date ?? null,
      lastDate: counts.last_date ?? null,
    },
    summary,
    totals: { bids: sum('bids'), amount: sum('amount'), win: sum('win'), profit: money(sum('amount') - sum('win')) },
    page: r.page,
    perPage: r.perPage,
    total: r.total,
    rows: r.rows.map((b) => ({
      id: b.id,
      pick: b.pick,
      amount: num(b.amount),
      rate: Number(b.rate),
      market: b.market_name,
      kind: b.kind,
      gameType: b.game_type,
      typeLabel: label(b.kind, b.game_type),
      session: sessionOf(b.kind, b.game_type, b.session),
      bidDate: b.bid_date,
      createdAt: b.created_at,
      status: b.status,
      winAmount: num(b.win_amount),
    })),
  });
});
