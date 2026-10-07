/* All Users, user profile, block, deleted users (mounted at /api/admin/users)
 *
 * Also owns the opt-in "auto delete" rule from the reference panel: users whose
 * wallet has been 0 with no transaction or bid for N days are soft-deleted
 * (is_deleted = 1) with the reason "Wallet Balance 0 Since Last N Days".
 * Settings: auto_delete_zero_balance ('0' | '1'), auto_delete_days ('7').
 */
import { Router, type Request } from 'express';
import { all, db, get, getSetting, localDate, nowIso, scalar, setSetting, tx } from '../../db.js';
import { requirePerm } from '../../auth.js';
import { ALL_PERMISSIONS } from '../../permissions.js';
import { onSchedulerTick } from '../../results.js';
import { money } from '../../wallet.js';
import { badRequest, log, qPage, str } from './util.js';

export const usersRouter = Router();

/* ------------------------------------------------------------- list helpers */

interface UserListRow {
  id: number;
  name: string;
  username: string;
  mobile: string;
  balance: number;
  is_active: number;
  device_name: string | null;
  device_id: string | null;
  created_at: string;
  last_login_at: string | null;
  last_seen_at: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
}

function listItem(u: UserListRow) {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    mobile: u.mobile,
    balance: money(Number(u.balance)),
    isActive: !!u.is_active,
    deviceName: u.device_name,
    deviceId: u.device_id,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
    lastSeenAt: u.last_seen_at,
    deletedAt: u.deleted_at,
    deleteReason: u.delete_reason,
  };
}

/**
 * Search box: name, username or mobile; a date typed as DD/MM/YYYY (or
 * YYYY-MM-DD) matches the sign-up day instead.
 */
function searchClause(q: string, dateColumn: string): { sql: string; params: string[] } {
  if (!q) return { sql: '', params: [] };
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(q);
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(q);
  if (dmy || ymd) {
    const date = dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : q;
    return { sql: `AND ${localDate(dateColumn)} = ?`, params: [date] };
  }
  const like = `%${q}%`;
  return { sql: 'AND (u.name LIKE ? OR u.username LIKE ? OR u.mobile LIKE ?)', params: [like, like, like] };
}

function pagedUsers(req: Request, where: string, order: string, dateColumn: string) {
  const { page, perPage, offset } = qPage(req, 50, 500);
  const search = searchClause(str(req.query.q), dateColumn);
  const clause = `${where} ${search.sql}`;
  const total = scalar(`SELECT COUNT(*) FROM users u WHERE ${clause}`, ...search.params);
  const rows = all<UserListRow>(
    `SELECT u.* FROM users u WHERE ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`,
    ...search.params,
    perPage,
    offset,
  );
  return { page, perPage, total, users: rows.map(listItem) };
}

function userId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid user id');
  return id;
}

/* -------------------------------------------------------------- auto delete */

const AUTO_DELETE_EVERY_MS = 60 * 60 * 1000;
const GRACE_KEY = 'auto_delete_grace';
const LAST_RUN_KEY = 'auto_delete_last_run';

function clampDays(v: number) {
  return Number.isFinite(v) ? Math.min(365, Math.max(1, Math.floor(v))) : 7;
}

export function autoDeleteSettings() {
  return {
    enabled: getSetting('auto_delete_zero_balance', '0') === '1',
    days: clampDays(Number(getSetting('auto_delete_days', '7'))),
  };
}

/** Restored users get N days' grace before the rule can delete them again: { userId: restoredAt }. */
function graceMap(): Record<string, string> {
  try {
    const v = JSON.parse(getSetting(GRACE_KEY, '{}')) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** WHERE clause for users the rule would delete now. */
function eligibleWhere(days: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - days * 864e5).toISOString();
  const grace = Object.entries(graceMap())
    .filter(([, at]) => at >= cutoff)
    .map(([id]) => Number(id));
  const sql = `u.is_deleted = 0 AND u.balance = 0 AND u.created_at < ?
    AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = u.id AND t.created_at >= ?)
    AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.user_id = u.id AND (b.created_at >= ? OR b.status = 'pending'))
    AND NOT EXISTS (SELECT 1 FROM fund_requests f WHERE f.user_id = u.id AND f.status = 'pending')
    ${grace.length ? `AND u.id NOT IN (${grace.map(() => '?').join(',')})` : ''}`;
  return { sql, params: [cutoff, cutoff, cutoff, ...grace], cutoff };
}

function lastRun(): { at: string; deleted: number; days: number } | null {
  try {
    return JSON.parse(getSetting(LAST_RUN_KEY, 'null')) as { at: string; deleted: number; days: number } | null;
  } catch {
    return null;
  }
}

/** Apply the rule. Runs from the scheduler at most once an hour, or right away when `force`. */
export function runAutoDelete(now = new Date(), force = false): number {
  const { enabled, days } = autoDeleteSettings();
  if (!enabled) return 0;
  const prev = lastRun();
  if (!force && prev && now.getTime() - Date.parse(prev.at) < AUTO_DELETE_EVERY_MS) return 0;

  const reason = `Wallet Balance 0 Since Last ${days} Days`;
  const { sql, params, cutoff } = eligibleWhere(days, now);
  const deleted = tx(() => {
    const info = db
      .prepare(`UPDATE users SET is_deleted = 1, deleted_at = ?, delete_reason = ? WHERE id IN (SELECT u.id FROM users u WHERE ${sql})`)
      .run(now.toISOString(), reason, ...params);
    const count = Number(info.changes);
    // drop grace entries that have run out
    const grace = Object.fromEntries(Object.entries(graceMap()).filter(([, at]) => at >= cutoff));
    setSetting(GRACE_KEY, JSON.stringify(grace));
    setSetting(LAST_RUN_KEY, JSON.stringify({ at: now.toISOString(), deleted: count, days }));
    if (count > 0) {
      db.prepare('INSERT INTO admin_log (action, detail, admin, created_at) VALUES (?, ?, ?, ?)').run(
        'users.auto_delete',
        JSON.stringify({ deleted: count, days }),
        'Auto',
        nowIso(),
      );
    }
    return count;
  });
  return deleted;
}

onSchedulerTick('auto-delete', (now) => {
  runAutoDelete(now);
});

function autoDeleteState() {
  const s = autoDeleteSettings();
  const { sql, params } = eligibleWhere(s.days);
  return {
    ...s,
    eligible: scalar(`SELECT COUNT(*) FROM users u WHERE ${sql}`, ...params),
    lastRun: lastRun(),
  };
}

/* ------------------------------------------------------------------ routes */

/** All Users, newest first: ?page&perPage&q&status=all|active|blocked (deleted users are listed separately). */
usersRouter.get('/', requirePerm('users'), (req, res) => {
  const status = str(req.query.status);
  const where =
    status === 'blocked' ? 'u.is_deleted = 0 AND u.is_active = 0' : status === 'active' ? 'u.is_deleted = 0 AND u.is_active = 1' : 'u.is_deleted = 0';
  res.json(pagedUsers(req, where, 'u.created_at DESC, u.id DESC', 'u.created_at'));
});

/** Deleted Users: ?page&perPage&q, newest deletion first. */
usersRouter.get('/deleted', requirePerm('deleted_users'), (req, res) => {
  res.json(pagedUsers(req, 'u.is_deleted = 1', 'u.deleted_at DESC, u.id DESC', 'u.created_at'));
});

usersRouter.get('/auto-delete', requirePerm('deleted_users'), (_req, res) => {
  res.json(autoDeleteState());
});

/** Save the rule: { enabled, days }. Turning it on applies it straight away. */
usersRouter.post('/auto-delete', requirePerm('deleted_users'), (req, res) => {
  const enabled = req.body?.enabled === true || req.body?.enabled === '1' || req.body?.enabled === 1;
  const days = Number(req.body?.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw badRequest('Days must be a whole number from 1 to 365');
  setSetting('auto_delete_zero_balance', enabled ? '1' : '0');
  setSetting('auto_delete_days', String(days));
  log(req, 'users.auto_delete_settings', { enabled, days });
  const deletedNow = enabled ? runAutoDelete(new Date(), true) : 0;
  res.json({ ...autoDeleteState(), deletedNow });
});

/**
 * Who may open the profile popup: it is shared by All Users and by the wallet,
 * report and bids pages, so any of those pages' permissions will do.
 */
const PROFILE_PERMS = [
  'users',
  'deleted_users',
  'declined',
  'others.bids',
  ...ALL_PERMISSIONS.filter((k) => /^(wallet|approved_debit|reports)\./.test(k)),
];

usersRouter.get(
  '/:id',
  requirePerm(...PROFILE_PERMS),
  (req, res) => {
    const id = userId(req);
    const u = get<UserListRow & { is_deleted: number }>('SELECT * FROM users WHERE id = ?', id);
    if (!u) return res.status(404).json({ message: 'User not found' });

    const bank = get<Record<string, string | null>>('SELECT * FROM banks WHERE user_id = ? ORDER BY id DESC LIMIT 1', id);
    const sum = (sql: string) => money(scalar(sql, id));
    const bids = get<{ c: number; amount: number; won: number }>(
      `SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS amount,
              COALESCE(SUM(CASE WHEN status = 'won' THEN win_amount ELSE 0 END), 0) AS won
       FROM bids WHERE user_id = ? AND status != 'refunded'`,
      id,
    )!;

    res.json({
      ...listItem(u),
      isDeleted: !!u.is_deleted,
      // the app does not collect a postal address yet
      address: null,
      city: null,
      pincode: null,
      bank: bank
        ? {
            holderName: bank.holder_name || null,
            accountNo: bank.account_no || null,
            bankName: bank.bank_name || null,
            ifsc: bank.ifsc || null,
            paytm: bank.paytm || null,
            phonepe: bank.phonepe || null,
            gpay: bank.gpay || null,
            updatedAt: bank.created_at,
            changes: scalar('SELECT COUNT(*) FROM banks WHERE user_id = ?', id),
          }
        : null,
      stats: {
        deposits: sum(
          `SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = ? AND (type = 'deposit' OR (type = 'adjust' AND amount > 0))`,
        ),
        withdrawals: sum(
          `SELECT COALESCE(SUM(amount), 0) FROM fund_requests WHERE user_id = ? AND type = 'withdraw' AND status IN ('approved', 'completed')`,
        ),
        pendingWithdraw: sum(
          `SELECT COALESCE(SUM(amount), 0) FROM fund_requests WHERE user_id = ? AND type = 'withdraw' AND status = 'pending'`,
        ),
        bidCount: Number(bids.c),
        bidAmount: money(Number(bids.amount)),
        winnings: money(Number(bids.won)),
      },
    });
  },
);

/** Block / unblock: { blocked: boolean }. A blocked user can't log in, bid or withdraw. */
usersRouter.post('/:id/block', requirePerm('users'), (req, res) => {
  const id = userId(req);
  const u = get<{ id: number; name: string; username: string; is_active: number }>(
    'SELECT id, name, username, is_active FROM users WHERE id = ?',
    id,
  );
  if (!u) return res.status(404).json({ message: 'User not found' });
  const blocked = typeof req.body?.blocked === 'boolean' ? (req.body.blocked as boolean) : !!u.is_active;
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(blocked ? 0 : 1, id);
  log(req, blocked ? 'users.block' : 'users.unblock', { id, username: u.username });
  res.json({ ok: true, id, isActive: !blocked });
});

/** Undo a soft delete. The auto-delete rule then leaves the user alone for N days. */
usersRouter.post('/:id/restore', requirePerm('deleted_users'), (req, res) => {
  const id = userId(req);
  const u = get<{ id: number; username: string; is_deleted: number }>(
    'SELECT id, username, is_deleted FROM users WHERE id = ?',
    id,
  );
  if (!u) return res.status(404).json({ message: 'User not found' });
  if (!u.is_deleted) throw badRequest('This user is not deleted');
  tx(() => {
    db.prepare('UPDATE users SET is_deleted = 0, deleted_at = NULL, delete_reason = NULL WHERE id = ?').run(id);
    setSetting(GRACE_KEY, JSON.stringify({ ...graceMap(), [id]: nowIso() }));
  });
  log(req, 'users.restore', { id, username: u.username });
  res.json({ ok: true, id });
});
