/* Dashboard stats (mounted at /api/admin/dashboard)
 *
 * Definitions (soft-deleted users are left out of every user count except
 * "Deleted Users"):
 *   deposits   = app deposits (transactions.type 'deposit')
 *              + manual adds (admin credits: type 'adjust' with a positive amount)
 *   withdrawals = withdraw requests that were approved or completed
 *              + admin debits (type 'adjust' with a negative amount)
 *   amount paid = winnings currently paid on won bids (a reverted result sets
 *                 its bids back to pending, so reverts are already netted out)
 */
import { Router } from 'express';
import { all, get, localDate, scalar } from '../../db.js';
import { requirePerm } from '../../auth.js';
import { addDays, todayStr } from '../../game.js';
import { money } from '../../wallet.js';
import { str } from './util.js';

export const dashboardRouter = Router();

/** App sessions are JWTs signed for 90 days at login (auth.ts → signToken). */
const SESSION_DAYS = 90;

const daysAgoIso = (days: number) => new Date(Date.now() - days * 864e5).toISOString();

/** Monday of the week that contains `date` (YYYY-MM-DD). */
function weekStart(date: string): string {
  const dow = new Date(`${date}T12:00:00`).getDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

const ADMIN_CREDIT = `t.type = 'adjust' AND t.amount > 0`;
const ADMIN_DEBIT = `t.type = 'adjust' AND t.amount < 0`;
const DONE_WITHDRAW = `f.type = 'withdraw' AND f.status IN ('approved', 'completed')`;

function deposits(where = '1 = 1', ...params: string[]) {
  return money(
    scalar(
      `SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
       WHERE (t.type = 'deposit' OR (${ADMIN_CREDIT})) AND ${where}`,
      ...params,
    ),
  );
}

function withdrawals(range?: { from: string; to: string }) {
  const reqWhere = range
    ? `AND ${localDate('COALESCE(f.completed_at, f.updated_at, f.created_at)')} BETWEEN ? AND ?`
    : '';
  const txnWhere = range ? `AND ${localDate('t.created_at')} BETWEEN ? AND ?` : '';
  const p = range ? [range.from, range.to] : [];
  const requests = scalar(`SELECT COALESCE(SUM(f.amount), 0) FROM fund_requests f WHERE ${DONE_WITHDRAW} ${reqWhere}`, ...p);
  const debits = scalar(`SELECT COALESCE(SUM(-t.amount), 0) FROM transactions t WHERE ${ADMIN_DEBIT} ${txnWhere}`, ...p);
  return money(requests + debits);
}

/** Closing wallet total of yesterday: the midnight snapshot, else rebuilt from today's ledger. */
function yesterdayWallet(today: string, walletNow: number) {
  const snap = get<{ total_balance: number; created_at: string }>(
    'SELECT total_balance, created_at FROM wallet_snapshots WHERE snap_date = ?',
    today,
  );
  const date = addDays(today, -1);
  if (snap) return { amount: money(Number(snap.total_balance)), at: snap.created_at, date, source: 'snapshot' as const };
  const movedToday = scalar(
    `SELECT COALESCE(SUM(t.amount), 0) FROM transactions t JOIN users u ON u.id = t.user_id
     WHERE u.is_deleted = 0 AND ${localDate('t.created_at')} = ?`,
    today,
  );
  return { amount: money(walletNow - movedToday), at: null, date, source: 'computed' as const };
}

dashboardRouter.get('/', requirePerm('dashboard'), (_req, res) => {
  const today = todayStr();
  const yesterday = addDays(today, -1);
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);
  const thisMonth = monthStart(today);
  const lastMonth = monthStart(addDays(thisMonth, -1));
  const created = localDate('created_at');

  const users = get<Record<string, number>>(
    `SELECT
       COUNT(*) AS allUsers,
       COALESCE(SUM(balance), 0) AS wallet,
       SUM(CASE WHEN is_active = 1 AND last_login_at >= ? THEN 1 ELSE 0 END) AS loggedIn,
       SUM(CASE WHEN balance <= 0 THEN 1 ELSE 0 END) AS zeroBalance,
       SUM(CASE WHEN balance <= 0 AND (${created} = ? OR ${localDate('last_login_at')} = ? OR ${localDate('last_seen_at')} = ?)
                THEN 1 ELSE 0 END) AS todayZero,
       SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS banned,
       SUM(CASE WHEN ${created} = ? THEN 1 ELSE 0 END) AS regToday,
       SUM(CASE WHEN ${created} = ? THEN 1 ELSE 0 END) AS regYesterday,
       SUM(CASE WHEN ${created} >= ? THEN 1 ELSE 0 END) AS regThisWeek,
       SUM(CASE WHEN ${created} >= ? AND ${created} < ? THEN 1 ELSE 0 END) AS regLastWeek,
       SUM(CASE WHEN ${created} >= ? THEN 1 ELSE 0 END) AS regThisMonth,
       SUM(CASE WHEN ${created} >= ? AND ${created} < ? THEN 1 ELSE 0 END) AS regLastMonth,
       SUM(CASE WHEN last_seen_at >= ?
                  OR EXISTS (SELECT 1 FROM bids b WHERE b.user_id = users.id AND b.bid_date = ?)
                THEN 1 ELSE 0 END) AS active
     FROM users WHERE is_deleted = 0`,
    daysAgoIso(SESSION_DAYS),
    today, today, today,
    today,
    yesterday,
    thisWeek,
    lastWeek, thisWeek,
    thisMonth,
    lastMonth, thisMonth,
    daysAgoIso(1),
    today,
  )!;
  const n = (k: string) => Number(users[k] ?? 0);

  const walletNow = money(n('wallet'));
  const totalDeposits = deposits();
  const totalWithdraw = withdrawals();
  const todayDeposits = deposits(`${localDate('t.created_at')} = ?`, today);
  const todayWithdraw = withdrawals({ from: today, to: today });

  // today's deposits by mode, then the admin's manual adds
  const byMode = all<{ mode: string | null; amount: number; count: number }>(
    `SELECT t.mode, COALESCE(SUM(t.amount), 0) AS amount, COUNT(*) AS count FROM transactions t
     WHERE t.type = 'deposit' AND ${localDate('t.created_at')} = ?
     GROUP BY t.mode ORDER BY amount DESC`,
    today,
  );
  const manual = get<{ amount: number; count: number }>(
    `SELECT COALESCE(SUM(t.amount), 0) AS amount, COUNT(*) AS count FROM transactions t
     WHERE ${ADMIN_CREDIT} AND ${localDate('t.created_at')} = ?`,
    today,
  )!;
  const depositLog = [
    ...byMode.map((r) => ({
      label: `${(r.mode || 'App').toUpperCase()} DEPOSIT`,
      amount: money(Number(r.amount)),
      count: Number(r.count),
    })),
    { label: 'MANUAL ADD AMOUNT', amount: money(Number(manual.amount)), count: Number(manual.count) },
  ];

  res.json({
    today,
    cards: {
      allUsers: n('allUsers'),
      totalBids: money(scalar(`SELECT COALESCE(SUM(amount), 0) FROM bids WHERE status != 'refunded'`)),
      walletAmount: walletNow,
      amountPaid: money(scalar(`SELECT COALESCE(SUM(win_amount), 0) FROM bids WHERE status = 'won'`)),
      loggedInUsers: n('loggedIn'),
      zeroBalanceUsers: n('zeroBalance'),
      todayZeroBalance: n('todayZero'),
      bannedUsers: n('banned'),
      totalDeposits,
      totalWithdraw,
      yesterdayWallet: yesterdayWallet(today, walletNow),
    },
    registrations: {
      today: n('regToday'),
      yesterday: n('regYesterday'),
      thisWeek: n('regThisWeek'),
      lastWeek: n('regLastWeek'),
      thisMonth: n('regThisMonth'),
      lastMonth: n('regLastMonth'),
      deleted: scalar('SELECT COUNT(*) FROM users WHERE is_deleted = 1'),
      active: n('active'),
    },
    depositLog,
    depositTotal: todayDeposits,
    funds: {
      todayDeposits,
      todayWithdraw,
      todayNet: money(todayDeposits - todayWithdraw),
      totalDeposits,
      totalWithdraw,
      grandTotal: money(totalDeposits - totalWithdraw),
    },
  });
});

/**
 * "Today Register With Balance / Zero Balance": users who signed up today.
 * ?balance=with (balance > 0) | zero (balance <= 0).
 * Amount Credit is what reached the wallet since sign-up (bonus, deposits, admin adds).
 */
dashboardRouter.get('/registered-today', requirePerm('dashboard'), (req, res) => {
  const withBalance = str(req.query.balance) !== 'zero';
  const today = todayStr();
  const rows = all<{
    id: number;
    name: string;
    username: string;
    mobile: string;
    balance: number;
    created_at: string;
    credit: number;
  }>(
    `SELECT u.id, u.name, u.username, u.mobile, u.balance, u.created_at,
            (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
              WHERE t.user_id = u.id AND (t.type IN ('bonus', 'deposit') OR (${ADMIN_CREDIT}))) AS credit
     FROM users u
     WHERE u.is_deleted = 0 AND ${localDate('u.created_at')} = ? AND ${withBalance ? 'u.balance > 0' : 'u.balance <= 0'}
     ORDER BY u.id DESC`,
    today,
  );
  const list = rows.map((r) => ({
    id: r.id,
    name: r.name,
    username: r.username,
    mobile: r.mobile,
    createdAt: r.created_at,
    amountCredit: money(Number(r.credit)),
    balance: money(Number(r.balance)),
  }));
  res.json({
    date: today,
    balance: withBalance ? 'with' : 'zero',
    users: list,
    totalBalance: money(list.reduce((s, r) => s + r.balance, 0)),
    totalCredit: money(list.reduce((s, r) => s + r.amountCredit, 0)),
  });
});
