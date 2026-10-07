import { Router } from 'express';
import { all, db, get, getSetting, nowIso, tx } from '../db.js';
import { type AuthedRequest, requireAuth } from '../auth.js';
import { saveDataUri, uploadUrl } from '../uploads.js';
import { BY_AUTO, BY_SELF, applyTxn, notify } from '../wallet.js';

export const walletRouter = Router();

const MIN_DEPOSIT = 100;
const MIN_WITHDRAW = 500;

/* -------------------------------------------- withdraw on/off per weekday */

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WITHDRAW_ON_MESSAGE = 'Withdraw requests are open today';
export const WITHDRAW_OFF_MESSAGE = 'Withdraw requests are closed today. Please try again tomorrow.';

export interface WithdrawDay {
  day: number;
  is_on: number;
  message: string;
  updated_at: string | null;
}

/** One row per weekday (0 = Sunday), created ON the first time anyone asks. */
export function ensureWithdrawSchedule(): WithdrawDay[] {
  const rows = all<WithdrawDay>('SELECT * FROM withdraw_schedule ORDER BY day');
  if (rows.length === 7) return rows;
  const ins = db.prepare(
    'INSERT OR IGNORE INTO withdraw_schedule (day, is_on, message, updated_at) VALUES (?, 1, ?, ?)',
  );
  for (let d = 0; d < 7; d++) ins.run(d, WITHDRAW_ON_MESSAGE, nowIso());
  return all<WithdrawDay>('SELECT * FROM withdraw_schedule ORDER BY day');
}

/** Whether users may place a withdraw request right now, with the message for the app. */
export function withdrawStatus(at = new Date()) {
  const day = at.getDay();
  const row = ensureWithdrawSchedule().find((r) => r.day === day);
  const open = !row || row.is_on === 1;
  const message = row?.message?.trim() || (open ? WITHDRAW_ON_MESSAGE : WITHDRAW_OFF_MESSAGE);
  return { open, message, day, dayName: DAY_NAMES[day] };
}

/* ----------------------------------------------------------- payout details */

export interface BankRow {
  id: number;
  user_id: number;
  holder_name: string | null;
  account_no: string | null;
  ifsc: string | null;
  bank_name: string | null;
  paytm: string | null;
  phonepe: string | null;
  gpay: string | null;
  created_at: string;
}

/** The payout details a withdraw request is paid to (stored on the request as JSON). */
export interface BankSnapshot {
  holderName: string;
  accountNo: string;
  ifsc: string;
  bankName: string;
  paytm: string;
}

export function latestBank(userId: number): BankRow | undefined {
  return get<BankRow>('SELECT * FROM banks WHERE user_id = ? ORDER BY id DESC LIMIT 1', userId);
}

export function toSnapshot(b: BankRow | undefined): BankSnapshot | null {
  if (!b) return null;
  return {
    holderName: b.holder_name ?? '',
    accountNo: b.account_no ?? '',
    ifsc: b.ifsc ?? '',
    bankName: b.bank_name ?? '',
    paytm: b.paytm ?? '',
  };
}

const hasBankAccount = (s: BankSnapshot | null) => !!(s && s.accountNo && s.ifsc);
const hasPaytm = (s: BankSnapshot | null) => !!(s && s.paytm);

/* ------------------------------------------------------------------ balance */

walletRouter.get('/balance', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user!.id) as { balance: number };
  res.json({ balance: row.balance });
});

walletRouter.get('/passbook', requireAuth, (req: AuthedRequest, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(Number(req.query.perPage ?? 20), 100);
  const total = (
    db.prepare('SELECT COUNT(*) AS c FROM transactions WHERE user_id = ?').get(req.user!.id) as { c: number }
  ).c;
  const rows = db
    .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?')
    .all(req.user!.id, perPage, (page - 1) * perPage) as Array<Record<string, unknown>>;

  res.json({
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    entries: rows.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balance_after,
      particulars: t.particulars,
      note: t.note,
      createdAt: t.created_at,
    })),
  });
});

/* -------------------------------------------------------------- fund flows */

walletRouter.post('/deposit', requireAuth, (req: AuthedRequest, res) => {
  const amount = Math.floor(Number(req.body?.amount));
  const method = String(req.body?.method ?? 'upi');
  const utr = String(req.body?.utr ?? '').trim();
  const proof = typeof req.body?.proof === 'string' ? req.body.proof : '';

  if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) {
    return res.status(400).json({ message: `Minimum add amount is ${MIN_DEPOSIT} coins` });
  }

  const autoApprove = getSetting('auto_approve_deposit', '0') === '1';
  const needsProof = !autoApprove && getSetting('require_deposit_proof', '1') === '1';

  if (needsProof) {
    if (!/^[A-Za-z0-9]{6,30}$/.test(utr)) {
      return res.status(400).json({ message: 'Enter the UTR / reference number from your payment' });
    }
    const duplicate = db.prepare('SELECT id FROM fund_requests WHERE utr = ?').get(utr);
    if (duplicate) {
      return res.status(409).json({ message: 'This UTR has already been submitted' });
    }
    if (!proof) {
      return res.status(400).json({ message: 'Attach a screenshot of your payment' });
    }
  }

  let proofFile: string | null = null;
  if (proof) {
    try {
      proofFile = saveDataUri(proof, 'deposit');
    } catch (err) {
      return res.status(400).json({ message: (err as Error).message });
    }
  }

  const id = tx(() => {
    const info = db
      .prepare(
        `INSERT INTO fund_requests (user_id, type, amount, method, status, utr, proof_file, processed_by,
                                    completed_at, created_at, updated_at)
         VALUES (?, 'deposit', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        req.user!.id,
        amount,
        method,
        autoApprove ? 'approved' : 'pending',
        utr || null,
        proofFile,
        autoApprove ? BY_AUTO : null,
        autoApprove ? nowIso() : null,
        nowIso(),
        nowIso(),
      );
    const reqId = Number(info.lastInsertRowid);
    if (autoApprove) {
      applyTxn({
        userId: req.user!.id,
        type: 'deposit',
        delta: amount,
        particulars: 'Coins added',
        note: `${amount.toFixed(2)} added to wallet by UPI${utr ? `, UTR : ${utr}` : ''}`,
        addedBy: BY_AUTO,
        mode: 'UPI',
        ref: utr || `dep:${reqId}`,
      });
      notify(req.user!.id, 'Coins added', `${amount} coins have been added to your wallet.`, 'wallet');
    }
    return reqId;
  });

  const balance = (db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user!.id) as { balance: number })
    .balance;
  res.status(201).json({
    ok: true,
    id,
    status: autoApprove ? 'approved' : 'pending',
    message: autoApprove ? 'Coins added to your wallet' : 'Request submitted, waiting for approval',
    balance,
  });
});

/** Is withdrawing open today? The app shows `message` when it is not. */
walletRouter.get('/withdraw-status', requireAuth, (_req: AuthedRequest, res) => {
  res.json({ ...withdrawStatus(), minWithdraw: MIN_WITHDRAW });
});

/**
 * Place a withdraw request. The amount is held (debited) now; an operator then
 * approves it for payout and marks it paid, or declines it and the hold is refunded.
 * Optional body.mode: 'bank' | 'paytm' (default bank, or paytm when the user only has a Paytm number).
 */
walletRouter.post('/withdraw', requireAuth, (req: AuthedRequest, res) => {
  const amount = Math.floor(Number(req.body?.amount));
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAW) {
    return res.status(400).json({ message: `Minimum withdraw amount is ${MIN_WITHDRAW} coins` });
  }

  const status = withdrawStatus();
  if (!status.open) return res.status(400).json({ message: status.message, withdrawOpen: false });

  const snapshot = toSnapshot(latestBank(req.user!.id));
  if (!snapshot || (!hasBankAccount(snapshot) && !hasPaytm(snapshot))) {
    return res.status(400).json({ message: 'Please add your payout details first' });
  }

  const asked = String(req.body?.mode ?? '').toLowerCase();
  let mode: 'bank' | 'paytm';
  if (asked === 'paytm') {
    if (!hasPaytm(snapshot)) return res.status(400).json({ message: 'Add your Paytm number first' });
    mode = 'paytm';
  } else if (asked === 'bank') {
    if (!hasBankAccount(snapshot)) return res.status(400).json({ message: 'Add your bank account details first' });
    mode = 'bank';
  } else {
    mode = hasBankAccount(snapshot) ? 'bank' : 'paytm';
  }

  const balance = (db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user!.id) as { balance: number })
    .balance;
  if (amount > balance) return res.status(400).json({ message: 'Insufficient balance' });

  const id = tx(() => {
    const info = db
      .prepare(
        `INSERT INTO fund_requests (user_id, type, amount, method, status, attempts, payout_mode, bank_snapshot,
                                    created_at, updated_at)
         VALUES (?, 'withdraw', ?, ?, 'pending', 0, ?, ?, ?, ?)`,
      )
      .run(req.user!.id, amount, mode, mode, JSON.stringify(snapshot), nowIso(), nowIso());
    const reqId = Number(info.lastInsertRowid);

    // hold the amount until an operator pays it out or declines it
    applyTxn({
      userId: req.user!.id,
      type: 'withdraw',
      delta: -amount,
      particulars: 'Withdraw request',
      note: `Request #${reqId} on hold`,
      addedBy: BY_SELF,
      mode: mode === 'paytm' ? 'Paytm' : 'Bank',
      ref: `wd:${reqId}`,
    });
    return reqId;
  });

  res.status(201).json({
    ok: true,
    id,
    status: 'pending',
    payoutMode: mode,
    message: 'Withdraw request submitted',
  });
});

/** The app knows pending / approved / rejected; the finer admin stages map onto those. */
const APP_STATUS: Record<string, string> = {
  pending: 'pending',
  approved: 'approved',
  completed: 'approved',
  failed: 'pending',
  rejected: 'rejected',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  completed: 'Paid',
  failed: 'Processing',
  rejected: 'Declined',
};

walletRouter.get('/requests', requireAuth, (req: AuthedRequest, res) => {
  const type = req.query.type === 'withdraw' ? 'withdraw' : 'deposit';
  const rows = db
    .prepare('SELECT * FROM fund_requests WHERE user_id = ? AND type = ? ORDER BY id DESC LIMIT 100')
    .all(req.user!.id, type) as Array<Record<string, unknown>>;
  res.json({
    requests: rows.map((r) => {
      const stage = String(r.status);
      return {
        id: r.id,
        type: r.type,
        amount: r.amount,
        method: r.method,
        status: APP_STATUS[stage] ?? stage,
        stage,
        statusLabel: STATUS_LABEL[stage] ?? stage,
        payoutMode: r.payout_mode ?? null,
        utr: r.utr,
        payoutRef: r.pg_ref ?? null,
        proofUrl: uploadUrl(r.proof_file as string | null),
        remark: r.remark,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        completedAt: r.completed_at ?? null,
      };
    }),
  });
});

/* ------------------------------------------------------------ bank details */

walletRouter.get('/bank', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT * FROM banks WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user!.id) as
    | Record<string, unknown>
    | undefined;
  res.json({ bank: row ? mapBank(row) : null });
});

walletRouter.post('/bank', requireAuth, (req: AuthedRequest, res) => {
  const holder = String(req.body?.holderName ?? '').trim();
  const accountNo = String(req.body?.accountNo ?? '').trim();
  const ifsc = String(req.body?.ifsc ?? '').trim().toUpperCase();
  const bankName = String(req.body?.bankName ?? '').trim();
  const paytm = String(req.body?.paytm ?? '').trim();
  const phonepe = String(req.body?.phonepe ?? '').trim();
  const gpay = String(req.body?.gpay ?? '').trim();

  const hasBank = holder && accountNo && ifsc && bankName;
  const hasUpi = paytm || phonepe || gpay;
  if (!hasBank && !hasUpi) {
    return res.status(400).json({ message: 'Fill bank details or at least one UPI number' });
  }
  if (accountNo && !/^\d{6,20}$/.test(accountNo)) {
    return res.status(400).json({ message: 'Enter a valid account number' });
  }
  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    return res.status(400).json({ message: 'Enter a valid IFSC code' });
  }

  db.prepare(
    `INSERT INTO banks (user_id, holder_name, account_no, ifsc, bank_name, paytm, phonepe, gpay, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(req.user!.id, holder, accountNo, ifsc, bankName, paytm, phonepe, gpay, nowIso());

  notify(req.user!.id, 'Payout details updated', 'Your payout details were saved successfully.');
  const row = db.prepare('SELECT * FROM banks WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user!.id) as Record<
    string,
    unknown
  >;
  res.status(201).json({ ok: true, message: 'Details saved', bank: mapBank(row) });
});

walletRouter.get('/bank/history', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM banks WHERE user_id = ? ORDER BY id DESC LIMIT 50')
    .all(req.user!.id) as Array<Record<string, unknown>>;
  res.json({ history: rows.map(mapBank) });
});

function mapBank(r: Record<string, unknown>) {
  return {
    id: r.id,
    holderName: r.holder_name,
    accountNo: r.account_no,
    ifsc: r.ifsc,
    bankName: r.bank_name,
    paytm: r.paytm,
    phonepe: r.phonepe,
    gpay: r.gpay,
    createdAt: r.created_at,
  };
}
