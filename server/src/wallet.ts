import { db, nowIso } from './db.js';

export type TxnType =
  | 'bonus'
  | 'deposit'
  | 'withdraw'
  | 'bid'
  | 'win'
  | 'refund'
  | 'adjust';

export interface TxnRow {
  id: number;
  user_id: number;
  type: TxnType;
  amount: number;
  balance_after: number;
  particulars: string;
  note: string | null;
  created_at: string;
}

export function getBalance(userId: number): number {
  const row = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId) as { balance: number } | undefined;
  return row?.balance ?? 0;
}

/**
 * Apply a signed delta to a user's wallet and write the passbook entry.
 * Throws when the balance would go negative.
 */
export function applyTxn(opts: {
  userId: number;
  type: TxnType;
  delta: number;
  particulars: string;
  note?: string;
}): TxnRow {
  const { userId, type, delta, particulars, note } = opts;
  const current = getBalance(userId);
  const next = current + delta;
  if (next < 0) {
    const err = new Error('Insufficient balance');
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(next, userId);
  const created = nowIso();
  db.prepare(
    `INSERT INTO transactions (user_id, type, amount, balance_after, particulars, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, type, delta, next, particulars, note ?? null, created);

  return db
    .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(userId) as unknown as TxnRow;
}

export function notify(userId: number | null, title: string, body: string) {
  db.prepare('INSERT INTO notifications (user_id, title, body, created_at) VALUES (?, ?, ?, ?)').run(
    userId,
    title,
    body,
    nowIso(),
  );
}
