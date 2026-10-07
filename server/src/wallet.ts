import { db, nowIso } from './db.js';

export type TxnType =
  | 'bonus'
  | 'deposit'
  | 'withdraw'
  | 'bid'
  | 'win'
  | 'refund'
  | 'adjust'
  | 'revert';

export interface TxnRow {
  id: number;
  user_id: number;
  type: TxnType;
  amount: number;
  balance_after: number;
  particulars: string;
  note: string | null;
  added_by: string;
  mode: string | null;
  ref: string | null;
  created_at: string;
}

/** Who made a ledger entry: the system, the user themself, or an admin username. */
export const BY_AUTO = 'Auto';
export const BY_SELF = 'Self';

export function getBalance(userId: number): number {
  const row = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId) as { balance: number } | undefined;
  return Number(row?.balance ?? 0);
}

/** Money is kept to 2 decimals: rates like 9.5x make half-rupee amounts. */
export function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Apply a signed delta to a user's wallet and write the passbook entry.
 * Throws when the balance would go negative, unless `allowNegative` (used when
 * an admin reverts a result whose winnings were already spent).
 */
export function applyTxn(opts: {
  userId: number;
  type: TxnType;
  delta: number;
  particulars: string;
  note?: string;
  /** 'Auto', 'Self' or the admin username — defaults to 'Auto' */
  addedBy?: string;
  /** particular / payment mode: Cash, UPI, Bank, IP, PG … */
  mode?: string;
  /** gateway transaction id / UTR / request reference */
  ref?: string;
  allowNegative?: boolean;
}): TxnRow {
  const { userId, type, particulars, note } = opts;
  const delta = money(opts.delta);
  const current = getBalance(userId);
  const next = money(current + delta);
  if (next < 0 && !opts.allowNegative) {
    const err = new Error('Insufficient balance');
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(next, userId);
  const info = db
    .prepare(
      `INSERT INTO transactions (user_id, type, amount, balance_after, particulars, note, added_by, mode, ref, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      type,
      delta,
      next,
      particulars,
      note ?? null,
      opts.addedBy ?? BY_AUTO,
      opts.mode ?? null,
      opts.ref ?? null,
      nowIso(),
    );

  return db.prepare('SELECT * FROM transactions WHERE id = ?').get(info.lastInsertRowid) as unknown as TxnRow;
}

export function notify(userId: number | null, title: string, body: string, kind = 'general') {
  db.prepare('INSERT INTO notifications (user_id, title, body, kind, created_at) VALUES (?, ?, ?, ?, ?)').run(
    userId,
    title,
    body,
    kind,
    nowIso(),
  );
}
