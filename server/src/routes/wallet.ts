import { Router } from 'express';
import { db, getSetting, nowIso } from '../db.js';
import { type AuthedRequest, requireAuth } from '../auth.js';
import { saveDataUri, uploadUrl } from '../uploads.js';
import { applyTxn, notify } from '../wallet.js';

export const walletRouter = Router();

const MIN_DEPOSIT = 100;
const MIN_WITHDRAW = 500;

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

  const info = db
    .prepare(
      `INSERT INTO fund_requests (user_id, type, amount, method, status, utr, proof_file, created_at, updated_at)
       VALUES (?, 'deposit', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      req.user!.id,
      amount,
      method,
      autoApprove ? 'approved' : 'pending',
      utr || null,
      proofFile,
      nowIso(),
      nowIso(),
    );

  if (autoApprove) {
    applyTxn({
      userId: req.user!.id,
      type: 'deposit',
      delta: amount,
      particulars: 'Coins added',
      note: `Request #${info.lastInsertRowid} (${method})`,
    });
    notify(req.user!.id, 'Coins added', `${amount} coins have been added to your wallet.`);
  }

  const balance = (db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user!.id) as { balance: number })
    .balance;
  res.status(201).json({
    ok: true,
    id: Number(info.lastInsertRowid),
    status: autoApprove ? 'approved' : 'pending',
    message: autoApprove ? 'Coins added to your wallet' : 'Request submitted, waiting for approval',
    balance,
  });
});

walletRouter.post('/withdraw', requireAuth, (req: AuthedRequest, res) => {
  const amount = Math.floor(Number(req.body?.amount));
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAW) {
    return res.status(400).json({ message: `Minimum withdraw amount is ${MIN_WITHDRAW} coins` });
  }
  const bank = db.prepare('SELECT * FROM banks WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user!.id);
  if (!bank) return res.status(400).json({ message: 'Please add your payout details first' });

  const balance = (db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user!.id) as { balance: number })
    .balance;
  if (amount > balance) return res.status(400).json({ message: 'Insufficient balance' });

  const info = db
    .prepare(
      `INSERT INTO fund_requests (user_id, type, amount, method, status, created_at, updated_at)
       VALUES (?, 'withdraw', ?, 'bank', 'pending', ?, ?)`,
    )
    .run(req.user!.id, amount, nowIso(), nowIso());

  // hold the amount until an operator approves or rejects
  applyTxn({
    userId: req.user!.id,
    type: 'withdraw',
    delta: -amount,
    particulars: 'Withdraw request',
    note: `Request #${info.lastInsertRowid} on hold`,
  });

  res.status(201).json({
    ok: true,
    id: Number(info.lastInsertRowid),
    status: 'pending',
    message: 'Withdraw request submitted',
  });
});

walletRouter.get('/requests', requireAuth, (req: AuthedRequest, res) => {
  const type = req.query.type === 'withdraw' ? 'withdraw' : 'deposit';
  const rows = db
    .prepare('SELECT * FROM fund_requests WHERE user_id = ? AND type = ? ORDER BY id DESC LIMIT 100')
    .all(req.user!.id, type) as Array<Record<string, unknown>>;
  res.json({
    requests: rows.map((r) => ({
      id: r.id,
      type: r.type,
      amount: r.amount,
      method: r.method,
      status: r.status,
      utr: r.utr,
      proofUrl: uploadUrl(r.proof_file as string | null),
      remark: r.remark,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
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
