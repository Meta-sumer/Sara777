/* Wallet module (mounted at /api/admin/wallet): fund requests and the withdraw
 * payout lifecycle, debit reports, Process Bulk PG Payment, approved / declined
 * requests, View Wallet (ledger + manual credit/debit), Search Account, Bank
 * History and the weekday withdraw ON/OFF switch.
 *
 * Withdraw lifecycle (the amount is held from the wallet when the app creates the request):
 *   pending  → approved  (queued for payout)      | rejected (hold refunded)
 *   approved → completed (paid, optional UTR/ref) | failed (attempts + 1) | rejected
 *   failed   → approved  (retry) | completed | rejected
 * Deposits: pending → approved (wallet credited) | rejected.
 */
import { type NextFunction, type Request, type Response, Router } from 'express';
import { all, db, get, localDate, nowIso, scalar, tx } from '../../db.js';
import { type AdminRequest, adminName, requirePerm } from '../../auth.js';
import { uploadUrl } from '../../uploads.js';
import { applyTxn, money, notify } from '../../wallet.js';
import {
  type BankRow,
  type BankSnapshot,
  DAY_NAMES,
  WITHDRAW_OFF_MESSAGE,
  WITHDRAW_ON_MESSAGE,
  ensureWithdrawSchedule,
  latestBank,
  toSnapshot,
} from '../wallet.js';
import { badRequest, log, qDate, qPage, qRange, str } from './util.js';

export const walletRouter = Router();

type SqlParam = string | number | null;

/* ================================================================ helpers */

const ACCOUNT_RE = /^\d{6,20}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PAYTM_RE = /^[6-9]\d{9}$/;

interface FundSql {
  id: number;
  user_id: number;
  type: 'deposit' | 'withdraw';
  amount: number;
  method: string | null;
  status: string;
  remark: string | null;
  created_at: string;
  updated_at: string | null;
  attempts: number;
  processed_by: string | null;
  completed_at: string | null;
  payout_mode: string | null;
  bank_snapshot: string | null;
  pg_status: string | null;
  pg_ref: string | null;
  utr: string | null;
  proof_file: string | null;
  name: string;
  username: string;
  mobile: string;
  balance: number;
  is_active: number;
  is_deleted: number;
  held: number;
  address: string | null;
  city: string | null;
}

/** Address / city come from the user profile when the users table has them. */
function profileCols(): string {
  const cols = new Set(all<{ name: string }>('PRAGMA table_info(users)').map((c) => c.name));
  return [
    cols.has('address') ? 'u.address AS address' : 'NULL AS address',
    cols.has('city') ? 'u.city AS city' : 'NULL AS city',
  ].join(', ');
}

/** Amount still held from the wallet for a withdraw request (hold minus refunds). */
const HELD_SQL = `CASE WHEN f.type = 'withdraw' THEN -COALESCE((
    SELECT SUM(t.amount) FROM transactions t
    WHERE t.user_id = f.user_id AND t.type IN ('withdraw', 'refund')
      AND (t.ref = 'wd:' || f.id OR t.note = 'Request #' || f.id || ' on hold')), 0) ELSE 0 END`;

function selectFunds(where: string[], params: SqlParam[], order = 'f.id DESC', limit = 5000): FundSql[] {
  return all<FundSql>(
    `SELECT f.*, u.name, u.username, u.mobile, u.balance, u.is_active, u.is_deleted, ${profileCols()},
            ${HELD_SQL} AS held
     FROM fund_requests f JOIN users u ON u.id = f.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${order} LIMIT ${limit}`,
    ...params,
  );
}

function parseSnapshot(raw: string | null): BankSnapshot | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<BankSnapshot>;
    return {
      holderName: s.holderName ?? '',
      accountNo: s.accountNo ?? '',
      ifsc: s.ifsc ?? '',
      bankName: s.bankName ?? '',
      paytm: s.paytm ?? '',
    };
  } catch {
    return null;
  }
}

const sameBank = (a: BankSnapshot | null, b: BankSnapshot | null) =>
  !!a && !!b && a.accountNo === b.accountNo && a.ifsc === b.ifsc && a.paytm === b.paytm;

function payoutMode(r: Pick<FundSql, 'type' | 'payout_mode' | 'method'>): string {
  if (r.type === 'deposit') return (r.method ?? 'upi').toUpperCase();
  return r.payout_mode ?? (r.method === 'paytm' ? 'paytm' : 'bank');
}

/** Why a withdraw request cannot be paid as it stands (empty = valid). */
function withdrawIssues(r: FundSql, bank: BankSnapshot | null, mode: string): string[] {
  const issues: string[] = [];
  if (r.is_deleted) issues.push('User deleted');
  else if (!r.is_active) issues.push('User blocked');
  if (['pending', 'approved', 'failed'].includes(r.status) && money(r.held) < money(r.amount)) {
    issues.push(`Only ${money(r.held)} held for this request`);
  }
  if (mode === 'paytm') {
    if (!bank?.paytm) issues.push('No Paytm number');
    else if (!PAYTM_RE.test(bank.paytm)) issues.push('Invalid Paytm number');
  } else if (!bank || (!bank.accountNo && !bank.ifsc)) {
    issues.push('No bank details');
  } else {
    if (!bank.holderName.trim()) issues.push('Account holder missing');
    if (!ACCOUNT_RE.test(bank.accountNo)) issues.push('Invalid account number');
    if (!IFSC_RE.test(bank.ifsc.toUpperCase())) issues.push('Invalid IFSC');
  }
  return issues;
}

function mapFunds(rows: FundSql[]) {
  const latest = new Map<number, BankSnapshot | null>();
  const current = (userId: number) => {
    if (!latest.has(userId)) {
      latest.set(userId, toSnapshot(latestBank(userId)));
    }
    return latest.get(userId) ?? null;
  };

  return rows.map((r) => {
    const now = current(r.user_id);
    const bank = r.type === 'withdraw' ? (parseSnapshot(r.bank_snapshot) ?? now) : now;
    const mode = payoutMode(r);
    const issues = r.type === 'withdraw' ? withdrawIssues(r, bank, mode) : [];
    return {
      id: r.id,
      userId: r.user_id,
      name: r.name,
      username: r.username,
      mobile: r.mobile,
      type: r.type,
      amount: Number(r.amount),
      mode,
      status: r.status,
      attempts: r.attempts ?? 0,
      remark: r.remark,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      processedBy: r.processed_by,
      completedAt: r.completed_at,
      pgStatus: r.pg_status,
      pgRef: r.pg_ref,
      utr: r.utr,
      proofUrl: uploadUrl(r.proof_file),
      balance: Number(r.balance),
      held: money(r.held),
      bank,
      bankChanged: r.type === 'withdraw' && !!r.bank_snapshot && !!now && !sameBank(bank, now),
      address: r.address,
      city: r.city,
      isBlocked: !r.is_active,
      isDeleted: !!r.is_deleted,
      valid: issues.length === 0,
      issues,
    };
  });
}

function listResponse(rows: FundSql[]) {
  const list = mapFunds(rows);
  return {
    rows: list,
    total: list.length,
    totalAmount: money(list.reduce((s, r) => s + r.amount, 0)),
    valid: list.filter((r) => r.valid).length,
    invalid: list.filter((r) => !r.valid).length,
  };
}

/** Local-date range filter on a timestamp column, only when ?from / ?to were sent. */
function optionalRange(req: Request, column: string, where: string[], params: SqlParam[]) {
  if (!req.query.from && !req.query.to) return;
  const { from, to } = qRange(req);
  where.push(`${localDate(column)} BETWEEN ? AND ?`);
  params.push(from, to);
}

function hasPerm(req: Request, keys: string[]) {
  const a = (req as AdminRequest).admin;
  return !!a && (a.isSuper || keys.some((k) => a.permissions.has(k)));
}

/* ================================================== request state changes */

type Action = 'approve' | 'reject' | 'complete' | 'fail' | 'retry';
const ACTIONS: Action[] = ['approve', 'reject', 'complete', 'fail', 'retry'];

/** Which pages may run each action. */
const ACTION_PERMS: Record<Action, string[]> = {
  approve: ['wallet.fund_request', 'wallet.export_debit'],
  reject: ['wallet.fund_request', 'wallet.bulk_pg'],
  complete: ['wallet.fund_request', 'wallet.bulk_pg', 'approved_debit.paytm', 'approved_debit.bank'],
  fail: ['wallet.fund_request', 'wallet.bulk_pg', 'approved_debit.paytm', 'approved_debit.bank'],
  retry: ['wallet.fund_request', 'wallet.bulk_pg'],
};

interface ActOptions {
  remark?: string;
  ref?: string;
  message?: string;
  /** bulk "Approve valid": refuse requests with payout problems */
  onlyValid?: boolean;
}

function loadRequest(id: number): FundSql {
  const row = selectFunds(['f.id = ?'], [id])[0];
  if (!row) throw badRequest(`Request #${id} not found`, 404);
  return row;
}

const modeLabel = (mode: string) => (mode === 'paytm' ? 'Paytm' : 'Bank');

/** Run one action on one request inside a transaction; returns a short result line. */
function act(req: Request, id: number, action: Action, opts: ActOptions): string {
  const by = adminName(req);
  return tx(() => {
    const r = loadRequest(id);
    const now = nowIso();
    const amount = Number(r.amount);
    const mode = payoutMode(r);

    if (r.type === 'deposit') {
      if (!hasPerm(req, ['wallet.fund_request'])) throw badRequest('You do not have permission for deposits', 403);
      if (r.status !== 'pending') throw badRequest(`Deposit #${id} is already ${r.status}`);
      if (action === 'approve') {
        applyTxn({
          userId: r.user_id,
          type: 'deposit',
          delta: amount,
          particulars: 'Coins added',
          note: `${amount.toFixed(2)} added to wallet by UPI${r.utr ? `, UTR : ${r.utr}` : ''}`,
          addedBy: by,
          mode: 'UPI',
          ref: r.utr ?? `dep:${id}`,
        });
        db.prepare(
          `UPDATE fund_requests SET status = 'approved', processed_by = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
        ).run(by, now, now, id);
        notify(r.user_id, 'Coins added', `${amount} coins have been added to your wallet.`, 'wallet');
        return `Deposit #${id} approved`;
      }
      if (action === 'reject') {
        const remark = opts.remark || 'Payment not received';
        db.prepare(
          `UPDATE fund_requests SET status = 'rejected', remark = ?, processed_by = ?, updated_at = ? WHERE id = ?`,
        ).run(remark, by, now, id);
        notify(r.user_id, 'Deposit declined', `Your add-coins request of ${amount} was declined: ${remark}`, 'wallet');
        return `Deposit #${id} declined`;
      }
      throw badRequest('Deposits can only be approved or declined');
    }

    switch (action) {
      case 'approve': {
        if (r.status !== 'pending') throw badRequest(`Request #${id} is ${r.status}, not pending`);
        const issues = withdrawIssues(r, parseSnapshot(r.bank_snapshot) ?? toSnapshot(latestBank(r.user_id)), mode);
        if (money(r.held) < money(amount)) throw badRequest(`Request #${id}: the amount is not held, decline it instead`);
        if (opts.onlyValid && issues.length) throw badRequest(`Request #${id}: ${issues.join(', ')}`);
        db.prepare(
          `UPDATE fund_requests SET status = 'approved', processed_by = ?, remark = COALESCE(?, remark), updated_at = ?
           WHERE id = ?`,
        ).run(by, opts.remark || null, now, id);
        notify(
          r.user_id,
          'Withdraw approved',
          `Your withdraw request of ${amount} coins was approved and will be paid to your ${modeLabel(mode)} shortly.`,
          'wallet',
        );
        return `Request #${id} approved`;
      }

      case 'reject': {
        if (!['pending', 'approved', 'failed'].includes(r.status)) {
          throw badRequest(`Request #${id} is already ${r.status}`);
        }
        const remark = opts.remark || 'Declined by admin';
        const refund = Math.min(money(r.held), money(amount));
        if (refund > 0) {
          applyTxn({
            userId: r.user_id,
            type: 'refund',
            delta: refund,
            particulars: 'Withdraw declined',
            note: `Request #${id} declined: ${remark}`,
            addedBy: by,
            mode: modeLabel(mode),
            ref: `wd:${id}`,
          });
        }
        db.prepare(
          `UPDATE fund_requests SET status = 'rejected', remark = ?, processed_by = ?, updated_at = ? WHERE id = ?`,
        ).run(remark, by, now, id);
        notify(
          r.user_id,
          'Withdraw declined',
          `Your withdraw request of ${amount} coins was declined: ${remark}. ${refund > 0 ? 'The coins are back in your wallet.' : ''}`.trim(),
          'wallet',
        );
        return `Request #${id} declined${refund > 0 ? `, ${refund} refunded` : ''}`;
      }

      case 'complete': {
        if (r.status === 'completed') throw badRequest(`Request #${id} is already paid`);
        if (!['approved', 'failed'].includes(r.status)) {
          throw badRequest(`Request #${id} is ${r.status}; approve it before marking it paid`);
        }
        const ref = (opts.ref ?? '').slice(0, 60) || null;
        db.prepare(
          `UPDATE fund_requests SET status = 'completed', attempts = attempts + 1, pg_status = 'success',
                  pg_ref = COALESCE(?, pg_ref), remark = COALESCE(?, remark), processed_by = ?, completed_at = ?,
                  updated_at = ?
           WHERE id = ?`,
        ).run(ref, opts.remark || null, by, now, now, id);
        notify(
          r.user_id,
          'Withdraw paid',
          `${amount} coins were sent to your ${modeLabel(mode)}${ref ? ` (Ref ${ref})` : ''}.`,
          'wallet',
        );
        return `Request #${id} marked paid`;
      }

      case 'fail': {
        if (r.status !== 'approved') throw badRequest(`Request #${id} is ${r.status}; only approved requests can fail`);
        const message = (opts.message || opts.remark || 'Payout failed').slice(0, 200);
        db.prepare(
          `UPDATE fund_requests SET status = 'failed', attempts = attempts + 1, pg_status = ?, processed_by = ?,
                  updated_at = ?
           WHERE id = ?`,
        ).run(message, by, now, id);
        return `Request #${id} marked failed`;
      }

      case 'retry': {
        if (r.status !== 'failed') throw badRequest(`Request #${id} is ${r.status}; only failed requests can be retried`);
        db.prepare(`UPDATE fund_requests SET status = 'approved', processed_by = ?, updated_at = ? WHERE id = ?`).run(
          by,
          now,
          id,
        );
        return `Request #${id} queued for payout again`;
      }
    }
  });
}

function actionPerm(action: Action) {
  return requirePerm(...ACTION_PERMS[action]);
}

function readOptions(body: Record<string, unknown> | undefined): ActOptions {
  const opts: ActOptions = {};
  if (str(body?.remark)) opts.remark = str(body?.remark).slice(0, 200);
  if (str(body?.ref)) opts.ref = str(body?.ref);
  if (str(body?.message)) opts.message = str(body?.message);
  if (body?.onlyValid === true) opts.onlyValid = true;
  return opts;
}

for (const action of ACTIONS) {
  walletRouter.post(`/requests/:id/${action}`, actionPerm(action), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid request id');
    const opts = readOptions(req.body);
    const message = act(req, id, action, opts);
    log(req, `wallet.${action}`, { id, ...opts });
    res.json({ ok: true, message });
  });
}

/** Same actions for many rows: { ids: number[], action, remark?, ref?, message?, onlyValid? }. */
walletRouter.post('/requests/bulk', (req: Request, res: Response, next: NextFunction) => {
  const action = str(req.body?.action) as Action;
  if (!ACTIONS.includes(action)) return res.status(400).json({ message: 'Unknown action' });
  return actionPerm(action)(req as AdminRequest, res, next);
}, (req, res) => {
  const action = str(req.body?.action) as Action;
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : [])
    .map(Number)
    .filter((n: number) => Number.isInteger(n) && n > 0) as number[];
  if (ids.length === 0) throw badRequest('Select at least one request');
  if (ids.length > 500) throw badRequest('Select at most 500 requests at a time');
  const opts = readOptions(req.body);

  const failed: Array<{ id: number; message: string }> = [];
  let done = 0;
  for (const id of [...new Set(ids)]) {
    try {
      act(req, id, action, opts);
      done += 1;
    } catch (err) {
      failed.push({ id, message: (err as Error).message });
    }
  }
  log(req, `wallet.bulk_${action}`, { ids, done, failed: failed.length, ...opts });
  res.json({
    ok: true,
    done,
    failed,
    message: `${done} request${done === 1 ? '' : 's'} updated${failed.length ? `, ${failed.length} skipped` : ''}`,
  });
});

/* ============================================================ list pages */

/**
 * Fund Requests tabs:
 *   pending   withdraws waiting for approval       approved  approved + failed payouts
 *   rejected  declined withdraws (?from&to)          completed paid withdraws (?from&to)
 *   deposits  deposit requests waiting for approval
 */
walletRouter.get('/fund-requests', requirePerm('wallet.fund_request'), (req, res) => {
  const tab = str(req.query.tab) || 'pending';
  const where: string[] = [];
  const params: SqlParam[] = [];
  let order = 'f.id DESC';
  switch (tab) {
    case 'pending':
      where.push(`f.type = 'withdraw'`, `f.status = 'pending'`);
      order = 'f.id ASC';
      break;
    case 'approved':
      where.push(`f.type = 'withdraw'`, `f.status IN ('approved', 'failed')`);
      order = 'f.updated_at ASC, f.id ASC';
      break;
    case 'rejected':
      where.push(`f.type = 'withdraw'`, `f.status = 'rejected'`);
      optionalRange(req, 'COALESCE(f.updated_at, f.created_at)', where, params);
      order = 'f.updated_at DESC, f.id DESC';
      break;
    case 'completed':
      where.push(`f.type = 'withdraw'`, `f.status = 'completed'`);
      optionalRange(req, 'COALESCE(f.completed_at, f.updated_at)', where, params);
      order = 'f.completed_at DESC, f.id DESC';
      break;
    case 'deposits':
      where.push(`f.type = 'deposit'`, `f.status = 'pending'`);
      order = 'f.id ASC';
      break;
    default:
      throw badRequest('Unknown tab');
  }
  const counts = {
    pending: scalar(`SELECT COUNT(*) FROM fund_requests WHERE type = 'withdraw' AND status = 'pending'`),
    approved: scalar(`SELECT COUNT(*) FROM fund_requests WHERE type = 'withdraw' AND status IN ('approved', 'failed')`),
    deposits: scalar(`SELECT COUNT(*) FROM fund_requests WHERE type = 'deposit' AND status = 'pending'`),
  };
  res.json({ ...listResponse(selectFunds(where, params, order)), counts });
});

/**
 * Export Debit Report: ?searchType=pending (every pending request up to the report date)
 * or approved (requests approved on the report date, waiting for payout), ?date=YYYY-MM-DD.
 */
walletRouter.get('/debit-report', requirePerm('wallet.export_debit'), (req, res) => {
  const searchType = str(req.query.searchType) || 'pending';
  const date = qDate(req);
  const where = [`f.type = 'withdraw'`];
  const params: SqlParam[] = [date];
  if (searchType === 'pending') {
    where.push(`f.status = 'pending'`, `${localDate('f.created_at')} <= ?`);
  } else if (searchType === 'approved') {
    where.push(`f.status = 'approved'`, `${localDate('COALESCE(f.updated_at, f.created_at)')} = ?`);
  } else {
    throw badRequest('Unknown search type');
  }
  res.json({ date, searchType, ...listResponse(selectFunds(where, params, 'f.id ASC')) });
});

/** Process Bulk PG Payment: ?status=failed (default) | approved | all, ?mode=bank|paytm. */
walletRouter.get('/bulk-pg', requirePerm('wallet.bulk_pg'), (req, res) => {
  const status = str(req.query.status) || 'failed';
  const mode = str(req.query.mode);
  const where = [`f.type = 'withdraw'`];
  const params: SqlParam[] = [];
  if (status === 'failed') where.push(`f.status = 'failed'`);
  else if (status === 'approved') where.push(`f.status = 'approved'`);
  else where.push(`f.status IN ('approved', 'failed')`);
  if (mode === 'bank' || mode === 'paytm') {
    where.push(`COALESCE(f.payout_mode, CASE WHEN f.method = 'paytm' THEN 'paytm' ELSE 'bank' END) = ?`);
    params.push(mode);
  }
  res.json(listResponse(selectFunds(where, params, 'f.updated_at ASC, f.id ASC')));
});

/**
 * Download Debit Report: ?status=all (approved + paid) | approved | completed and the
 * date the request was approved / paid in ?from&to.
 */
walletRouter.get('/debit-download', requirePerm('wallet.download_debit'), (req, res) => {
  const status = str(req.query.status) || 'all';
  const { from, to } = qRange(req);
  const where = [`f.type = 'withdraw'`];
  const params: SqlParam[] = [];
  if (status === 'approved') where.push(`f.status = 'approved'`);
  else if (status === 'completed') where.push(`f.status = 'completed'`);
  else where.push(`f.status IN ('approved', 'completed')`);
  where.push(`${localDate(`COALESCE(f.completed_at, f.updated_at, f.created_at)`)} BETWEEN ? AND ?`);
  params.push(from, to);
  res.json({ from, to, status, ...listResponse(selectFunds(where, params, 'f.id ASC')) });
});

/** Approved Debit → Paytm Request / Bank Account Request: approved withdraws waiting for payout. */
walletRouter.get(
  '/approved/:mode',
  (req: Request, res: Response, next: NextFunction) => {
    const mode = req.params.mode;
    if (mode !== 'paytm' && mode !== 'bank') return res.status(404).json({ message: 'Unknown payout mode' });
    return requirePerm(`approved_debit.${mode}`)(req as AdminRequest, res, next);
  },
  (req, res) => {
    const where = [
      `f.type = 'withdraw'`,
      `f.status = 'approved'`,
      `COALESCE(f.payout_mode, CASE WHEN f.method = 'paytm' THEN 'paytm' ELSE 'bank' END) = ?`,
    ];
    const params: SqlParam[] = [req.params.mode];
    optionalRange(req, 'COALESCE(f.updated_at, f.created_at)', where, params);
    res.json(listResponse(selectFunds(where, params, 'f.updated_at ASC, f.id ASC')));
  },
);

/** Declined Requests: ?type=withdraw|deposit, declined between ?from&to. */
walletRouter.get('/declined', requirePerm('declined'), (req, res) => {
  const type = str(req.query.type) === 'deposit' ? 'deposit' : 'withdraw';
  const { from, to } = qRange(req);
  const where = [`f.type = ?`, `f.status = 'rejected'`, `${localDate('COALESCE(f.updated_at, f.created_at)')} BETWEEN ? AND ?`];
  res.json({ from, to, type, ...listResponse(selectFunds(where, [type, from, to], 'f.updated_at DESC, f.id DESC')) });
});

/* ============================================================ View Wallet */

walletRouter.get('/users', requirePerm('wallet.view'), (req, res) => {
  const { page, perPage, offset } = qPage(req, 50, 500);
  const q = str(req.query.q);
  const where = ['u.is_deleted = 0'];
  const params: SqlParam[] = [];
  if (q) {
    where.push('(u.name LIKE ? OR u.username LIKE ? OR u.mobile LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const clause = where.join(' AND ');
  const total = scalar(`SELECT COUNT(*) FROM users u WHERE ${clause}`, ...params);
  const totalBalance = scalar(`SELECT COALESCE(SUM(u.balance), 0) FROM users u WHERE ${clause}`, ...params);
  const rows = all<{
    id: number;
    name: string;
    username: string;
    mobile: string;
    balance: number;
    is_active: number;
    last_login_at: string | null;
    last_txn_at: string | null;
  }>(
    `SELECT u.id, u.name, u.username, u.mobile, u.balance, u.is_active, u.last_login_at,
            (SELECT t.created_at FROM transactions t WHERE t.user_id = u.id ORDER BY t.id DESC LIMIT 1) AS last_txn_at
     FROM users u WHERE ${clause}
     ORDER BY u.balance DESC, u.id ASC LIMIT ? OFFSET ?`,
    ...params,
    perPage,
    offset,
  );
  res.json({
    page,
    perPage,
    total,
    totalBalance: money(totalBalance),
    rows: rows.map((u) => {
      const stamps = [u.last_txn_at, u.last_login_at].filter((s): s is string => !!s).sort();
      return {
        id: u.id,
        name: u.name,
        username: u.username,
        mobile: u.mobile,
        balance: Number(u.balance),
        isBlocked: !u.is_active,
        lastUpdated: stamps.length ? stamps[stamps.length - 1] : null,
      };
    }),
  });
});

interface TxnSql {
  id: number;
  type: string;
  amount: number;
  balance_after: number;
  particulars: string;
  note: string | null;
  added_by: string;
  mode: string | null;
  ref: string | null;
  created_at: string;
}

const REQUEST_STAGE: Record<string, string> = {
  pending: 'pending',
  approved: 'approved, waiting for payout',
  failed: 'payout failed, retrying',
  completed: 'paid',
  rejected: 'declined',
};

/** The passbook line shown as "Description". */
function describe(t: TxnSql, reqId: number, reqStatus: string | undefined): string {
  if (reqId && t.type === 'withdraw') {
    const mode = t.mode ? ` to ${t.mode}` : '';
    return `Withdraw request #${reqId}${mode}${reqStatus ? ` (${REQUEST_STAGE[reqStatus] ?? reqStatus})` : ''}`;
  }
  if (reqId && t.type === 'refund') {
    const reason = /declined: (.+)$/.exec(t.note ?? '')?.[1];
    return `Refund of declined withdraw request #${reqId}${reason ? `: ${reason}` : ''}`;
  }
  if (!t.note) return t.particulars;
  if (['bid', 'win', 'deposit', 'bonus'].includes(t.type)) return t.note;
  return `${t.particulars}: ${t.note}`;
}

const TXN_FILTERS: Record<string, string> = {
  all: '1 = 1',
  // [D] money out: withdraw holds and manual debits
  debit: `(t.type = 'withdraw' OR (t.type = 'adjust' AND t.amount < 0))`,
  // [PG] deposits credited from the payment flow, with gateway / UTR references
  pg: `t.type = 'deposit'`,
};

/** A user's ledger: ?filter=all|debit|pg, ?q, ?page&perPage. */
walletRouter.get('/users/:id/transactions', requirePerm('wallet.view'), (req, res) => {
  const userId = Number(req.params.id);
  const user = get<{ id: number; name: string; username: string; mobile: string; balance: number }>(
    'SELECT id, name, username, mobile, balance FROM users WHERE id = ?',
    userId,
  );
  if (!user) throw badRequest('User not found', 404);
  const filter = TXN_FILTERS[str(req.query.filter)] ? str(req.query.filter) : 'all';
  const { page, perPage, offset } = qPage(req, 50, 500);
  const q = str(req.query.q);
  const where = ['t.user_id = ?', TXN_FILTERS[filter]];
  const params: SqlParam[] = [userId];
  if (q) {
    where.push('(t.particulars LIKE ? OR t.note LIKE ? OR t.ref LIKE ? OR t.added_by LIKE ? OR t.mode LIKE ?)');
    params.push(...Array(5).fill(`%${q}%`));
  }
  const clause = where.join(' AND ');
  const total = scalar(`SELECT COUNT(*) FROM transactions t WHERE ${clause}`, ...params);
  const sums = get<{ credit: number; debit: number }>(
    `SELECT COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount END), 0) AS credit,
            COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount END), 0) AS debit
     FROM transactions t WHERE ${clause}`,
    ...params,
  );
  const rows = all<TxnSql>(
    `SELECT t.* FROM transactions t WHERE ${clause} ORDER BY t.id DESC LIMIT ? OFFSET ?`,
    ...params,
    perPage,
    offset,
  );

  // withdraw lines show where their request stands now
  const requestId = (t: TxnSql) =>
    Number(/^wd:(\d+)$/.exec(t.ref ?? '')?.[1] ?? /^Request #(\d+) (on hold|rejected)$/.exec(t.note ?? '')?.[1] ?? 0);
  const reqIds = [...new Set(rows.map(requestId).filter((n) => n > 0))];
  const requests = new Map<number, { status: string; processed_by: string | null; pg_ref: string | null; payout_mode: string | null }>();
  if (reqIds.length) {
    for (const r of all<{ id: number; status: string; processed_by: string | null; pg_ref: string | null; payout_mode: string | null }>(
      `SELECT id, status, processed_by, pg_ref, payout_mode FROM fund_requests WHERE id IN (${reqIds.map(() => '?').join(',')})`,
      ...reqIds,
    )) {
      requests.set(r.id, r);
    }
  }

  res.json({
    user: { id: user.id, name: user.name, username: user.username, mobile: user.mobile, balance: Number(user.balance) },
    filter,
    page,
    perPage,
    total,
    totalCredit: money(sums?.credit ?? 0),
    totalDebit: money(sums?.debit ?? 0),
    rows: rows.map((t) => {
      const reqId = requestId(t);
      const fr = reqId ? requests.get(reqId) : undefined;
      return {
        id: t.id,
        type: t.type,
        previous: money(t.balance_after - t.amount),
        amount: money(Math.abs(t.amount)),
        signed: money(t.amount),
        current: money(t.balance_after),
        description: describe(t, reqId, fr?.status),
        createdAt: t.created_at,
        status: 'Success',
        addedBy: t.added_by,
        mode: t.mode,
        ref: t.ref,
        request: fr
          ? { id: reqId, status: fr.status, processedBy: fr.processed_by, payoutRef: fr.pg_ref, mode: fr.payout_mode }
          : null,
      };
    }),
  });
});

const PARTICULARS = ['Cash', 'UPI', 'Bank', 'Bonus', 'Other'];

/** "Update Wallet Balance": { type: 'credit'|'debit', amount, particular, comments }. */
walletRouter.post('/users/:id/adjust', requirePerm('wallet.view'), (req, res) => {
  const userId = Number(req.params.id);
  const type = str(req.body?.type).toLowerCase();
  const amount = money(Number(req.body?.amount));
  const particular = str(req.body?.particular) || 'Cash';
  const comments = str(req.body?.comments).slice(0, 200);

  if (type !== 'credit' && type !== 'debit') throw badRequest('Choose Credit or Debit');
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest('Enter an amount greater than 0');
  if (amount > 10_000_000) throw badRequest('Amount is too large');
  if (!PARTICULARS.includes(particular)) throw badRequest('Choose a valid particular');

  const user = get<{ id: number; balance: number; is_deleted: number }>(
    'SELECT id, balance, is_deleted FROM users WHERE id = ?',
    userId,
  );
  if (!user) throw badRequest('User not found', 404);
  if (user.is_deleted) throw badRequest('This user is deleted');
  if (type === 'debit' && amount > Number(user.balance)) {
    throw badRequest(`Cannot debit ${amount}: the balance is only ${Number(user.balance)}`);
  }

  const by = adminName(req);
  const txn = tx(() => {
    const t = applyTxn({
      userId,
      type: 'adjust',
      delta: type === 'credit' ? amount : -amount,
      particulars: type === 'credit' ? 'Coins credited by admin' : 'Coins debited by admin',
      note: comments || `${particular} ${type}`,
      addedBy: by,
      mode: particular,
    });
    notify(
      userId,
      type === 'credit' ? 'Coins credited' : 'Coins debited',
      `${amount} coins were ${type === 'credit' ? 'added to' : 'deducted from'} your wallet by admin${comments ? `: ${comments}` : '.'}`,
      'wallet',
    );
    return t;
  });
  log(req, `wallet.${type}`, { userId, amount, particular, comments, balance: txn.balance_after });
  res.json({ ok: true, balance: Number(txn.balance_after), message: `Wallet ${type === 'credit' ? 'credited' : 'debited'}` });
});

/* ========================================================= Search Account */

interface BankVersion extends BankRow {
  username: string;
  name: string;
  replaced_at: string | null;
}

const BANK_VERSION_SQL = `SELECT b.*, u.username, u.name,
    (SELECT MIN(n.created_at) FROM banks n WHERE n.user_id = b.user_id AND n.id > b.id) AS replaced_at
  FROM banks b JOIN users u ON u.id = b.user_id`;

function mapVersion(b: BankVersion) {
  return {
    id: b.id,
    userId: b.user_id,
    username: b.username,
    name: b.name,
    holderName: b.holder_name ?? '',
    accountNo: b.account_no ?? '',
    ifsc: b.ifsc ?? '',
    bankName: b.bank_name ?? '',
    paytm: b.paytm ?? '',
    phonepe: b.phonepe ?? '',
    gpay: b.gpay ?? '',
    savedAt: b.created_at,
    changedOn: b.replaced_at,
    current: !b.replaced_at,
  };
}

/**
 * ?q = account number or username (or mobile). Current details: every user whose
 * latest payout details use that account, or the user with that username.
 * Old details: earlier versions of those users' details, plus anyone who used the account before.
 */
walletRouter.get('/search-account', requirePerm('wallet.search_account'), (req, res) => {
  const q = str(req.query.q);
  if (!q) throw badRequest('Enter an account number or username');

  const byAccount = all<{ user_id: number }>(
    `SELECT b.user_id FROM banks b WHERE b.account_no = ? AND b.id = (SELECT MAX(id) FROM banks WHERE user_id = b.user_id)`,
    q,
  ).map((r) => r.user_id);
  const byUser = all<{ id: number }>(
    'SELECT id FROM users WHERE username = ? COLLATE NOCASE OR mobile = ?',
    q,
    q,
  ).map((r) => r.id);
  const userIds = [...new Set([...byAccount, ...byUser])];

  const current = userIds.map((id) => {
    const u = get<{ id: number; username: string; name: string; mobile: string; balance: number }>(
      'SELECT id, username, name, mobile, balance FROM users WHERE id = ?',
      id,
    )!;
    const b = get<BankRow>('SELECT * FROM banks WHERE user_id = ? ORDER BY id DESC LIMIT 1', id);
    return {
      userId: u.id,
      username: u.username,
      name: u.name,
      mobile: u.mobile,
      balance: Number(u.balance),
      holderName: b?.holder_name ?? '',
      accountNo: b?.account_no ?? '',
      ifsc: b?.ifsc ?? '',
      bankName: b?.bank_name ?? '',
      paytm: b?.paytm ?? '',
      savedAt: b?.created_at ?? null,
    };
  });

  const placeholders = userIds.map(() => '?').join(',');
  const old = all<BankVersion>(
    `${BANK_VERSION_SQL}
     WHERE EXISTS (SELECT 1 FROM banks n WHERE n.user_id = b.user_id AND n.id > b.id)
       AND (${userIds.length ? `b.user_id IN (${placeholders}) OR ` : ''}b.account_no = ?)
     ORDER BY b.user_id, b.id DESC`,
    ...userIds,
    q,
  ).map(mapVersion);

  res.json({ q, current, old });
});

/* =========================================================== Bank History */

/** Users with payout details: ?q, ?changed=1 (only users who changed them), ?page&perPage. */
walletRouter.get('/bank-history', requirePerm('wallet.bank_history'), (req, res) => {
  const { page, perPage, offset } = qPage(req, 25, 500);
  const q = str(req.query.q);
  const where = ['b.id = (SELECT MAX(id) FROM banks WHERE user_id = u.id)'];
  const params: SqlParam[] = [];
  if (q) {
    where.push(
      '(u.username LIKE ? OR u.name LIKE ? OR u.mobile LIKE ? OR b.account_no LIKE ? OR b.ifsc LIKE ? OR b.bank_name LIKE ? OR b.holder_name LIKE ? OR b.paytm LIKE ?)',
    );
    params.push(...Array(8).fill(`%${q}%`));
  }
  if (str(req.query.changed) === '1') where.push('(SELECT COUNT(*) FROM banks c WHERE c.user_id = u.id) > 1');
  const from = `FROM users u JOIN banks b ON b.user_id = u.id WHERE ${where.join(' AND ')}`;
  const total = scalar(`SELECT COUNT(*) ${from}`, ...params);
  const rows = all<BankRow & { username: string; name: string; versions: number }>(
    `SELECT b.*, u.username, u.name, (SELECT COUNT(*) FROM banks c WHERE c.user_id = u.id) AS versions
     ${from} ORDER BY b.id DESC LIMIT ? OFFSET ?`,
    ...params,
    perPage,
    offset,
  );
  res.json({
    page,
    perPage,
    total,
    rows: rows.map((b) => ({
      userId: b.user_id,
      username: b.username,
      name: b.name,
      holderName: b.holder_name ?? '',
      accountNo: b.account_no ?? '',
      ifsc: b.ifsc ?? '',
      bankName: b.bank_name ?? '',
      paytm: b.paytm ?? '',
      phonepe: b.phonepe ?? '',
      gpay: b.gpay ?? '',
      updatedAt: b.created_at,
      changes: Number(b.versions) - 1,
    })),
  });
});

/** Every version of a user's payout details, newest first. */
walletRouter.get('/bank-history/:userId', requirePerm('wallet.bank_history', 'wallet.search_account'), (req, res) => {
  const userId = Number(req.params.userId);
  const user = get<{ id: number; username: string; name: string }>(
    'SELECT id, username, name FROM users WHERE id = ?',
    userId,
  );
  if (!user) throw badRequest('User not found', 404);
  const versions = all<BankVersion>(`${BANK_VERSION_SQL} WHERE b.user_id = ? ORDER BY b.id DESC`, userId).map(
    mapVersion,
  );
  res.json({ user, versions });
});

/* ==================================================== Withdraw ON / OFF */

/** Monday first, as on the reference page. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

walletRouter.get('/withdraw-schedule', requirePerm('wallet.request_onoff'), (_req, res) => {
  const rows = ensureWithdrawSchedule();
  const today = new Date().getDay();
  res.json({
    days: WEEK_ORDER.map((d) => {
      const r = rows.find((x) => x.day === d)!;
      return {
        day: d,
        dayName: DAY_NAMES[d],
        isOn: r.is_on === 1,
        message: r.message,
        updatedAt: r.updated_at,
        today: d === today,
      };
    }),
  });
});

/** { isOn: boolean, message } for one weekday (0 = Sunday … 6 = Saturday). */
walletRouter.put('/withdraw-schedule/:day', requirePerm('wallet.request_onoff'), (req, res) => {
  const day = Number(req.params.day);
  if (!Number.isInteger(day) || day < 0 || day > 6) throw badRequest('Invalid day');
  if (typeof req.body?.isOn !== 'boolean') throw badRequest('Choose ON or OFF');
  const isOn: boolean = req.body.isOn;
  const message = str(req.body?.message).slice(0, 200) || (isOn ? WITHDRAW_ON_MESSAGE : WITHDRAW_OFF_MESSAGE);
  ensureWithdrawSchedule();
  db.prepare('UPDATE withdraw_schedule SET is_on = ?, message = ?, updated_at = ? WHERE day = ?').run(
    isOn ? 1 : 0,
    message,
    nowIso(),
    day,
  );
  log(req, 'wallet.withdraw_schedule', { day: DAY_NAMES[day], isOn, message });
  res.json({ ok: true, message: `${DAY_NAMES[day]}: withdraw requests ${isOn ? 'ON' : 'OFF'}` });
});
