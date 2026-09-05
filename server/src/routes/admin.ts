import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { db, getSetting, nowIso, setSetting } from '../db.js';
import { requireAdmin, signAdminToken } from '../auth.js';
import { type Session, formatTime12, marketStatus, todayStr, validatePick } from '../game.js';
import { allRates, setRate } from '../rates.js';
import {
  type MarketRow,
  autoDeclareEnabled,
  cancelMarketDay,
  declareResult,
  formatResult,
  getResult,
  settleMarket,
} from '../results.js';
import { removeUpload, saveDataUri, uploadUrl } from '../uploads.js';
import { applyTxn, notify } from '../wallet.js';

export const adminRouter = Router();

function log(action: string, detail: unknown) {
  db.prepare('INSERT INTO admin_log (action, detail, created_at) VALUES (?, ?, ?)').run(
    action,
    typeof detail === 'string' ? detail : JSON.stringify(detail),
    nowIso(),
  );
}

/* ------------------------------------------------------------------- login */

adminRouter.post('/login', (req, res) => {
  const username = String(req.body?.username ?? '');
  const password = String(req.body?.password ?? '');
  if (username !== config.adminUser || password !== config.adminPassword) {
    return res.status(401).json({ message: 'Wrong username or password' });
  }
  log('login', { username });
  res.json({ token: signAdminToken(username), username });
});

// everything below needs an admin session (or the x-admin-key header)
adminRouter.use(requireAdmin);

adminRouter.get('/me', (_req, res) => res.json({ ok: true, user: config.adminUser }));

/* --------------------------------------------------------------- dashboard */

adminRouter.get('/stats', (_req, res) => {
  const today = todayStr();
  const one = (sql: string, ...params: Array<string | number>) =>
    Number((db.prepare(sql).get(...params) as { v: number | null } | undefined)?.v ?? 0);

  const marketsToday = db
    .prepare(`SELECT * FROM markets WHERE is_active = 1 ORDER BY kind, sort_order, id`)
    .all() as unknown as MarketRow[];

  res.json({
    date: today,
    autoDeclare: autoDeclareEnabled(),
    users: {
      total: one('SELECT COUNT(*) AS v FROM users'),
      active: one('SELECT COUNT(*) AS v FROM users WHERE is_active = 1'),
      blocked: one('SELECT COUNT(*) AS v FROM users WHERE is_active = 0'),
      newToday: one(`SELECT COUNT(*) AS v FROM users WHERE substr(created_at, 1, 10) = ?`, today),
      balance: one('SELECT COALESCE(SUM(balance), 0) AS v FROM users'),
    },
    bids: {
      today: one('SELECT COUNT(*) AS v FROM bids WHERE bid_date = ?', today),
      todayAmount: one('SELECT COALESCE(SUM(amount), 0) AS v FROM bids WHERE bid_date = ?', today),
      todayPayout: one(
        `SELECT COALESCE(SUM(win_amount), 0) AS v FROM bids WHERE bid_date = ? AND status = 'won'`,
        today,
      ),
      pending: one(`SELECT COUNT(*) AS v FROM bids WHERE status = 'pending'`),
      total: one('SELECT COUNT(*) AS v FROM bids'),
    },
    funds: {
      pendingDeposits: one(`SELECT COUNT(*) AS v FROM fund_requests WHERE type='deposit' AND status='pending'`),
      pendingWithdraws: one(`SELECT COUNT(*) AS v FROM fund_requests WHERE type='withdraw' AND status='pending'`),
      depositedToday: one(
        `SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='deposit' AND substr(created_at,1,10)=?`,
        today,
      ),
    },
    markets: marketsToday.map((m) => {
      const result = getResult(m.id, today);
      return {
        id: m.id,
        name: m.name,
        kind: m.kind,
        status: marketStatus(m.open_time, m.close_time, m.days),
        result: formatResult(result, m.kind),
        bids: one('SELECT COUNT(*) AS v FROM bids WHERE market_id = ? AND bid_date = ?', m.id, today),
        amount: one(
          'SELECT COALESCE(SUM(amount),0) AS v FROM bids WHERE market_id = ? AND bid_date = ?',
          m.id,
          today,
        ),
        payout: one(
          `SELECT COALESCE(SUM(win_amount),0) AS v FROM bids WHERE market_id = ? AND bid_date = ? AND status='won'`,
          m.id,
          today,
        ),
      };
    }),
  });
});

/* ----------------------------------------------------------------- markets */

adminRouter.get('/markets', (req, res) => {
  const date = String(req.query.date ?? todayStr());
  const rows = db.prepare('SELECT * FROM markets ORDER BY kind, sort_order, id').all() as unknown as MarketRow[];
  res.json({
    date,
    markets: rows.map((m) => {
      const r = getResult(m.id, date);
      return {
        id: m.id,
        name: m.name,
        kind: m.kind,
        openTime: m.open_time,
        closeTime: m.close_time,
        openTimeLabel: formatTime12(m.open_time),
        closeTimeLabel: formatTime12(m.close_time),
        days: m.days,
        isActive: !!m.is_active,
        sortOrder: m.sort_order,
        status: marketStatus(m.open_time, m.close_time, m.days),
        result: formatResult(r, m.kind),
        openPanna: r?.open_panna ?? '',
        closePanna: r?.close_panna ?? '',
      };
    }),
  });
});

adminRouter.post('/markets', (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const kind = req.body?.kind === 'starline' ? 'starline' : 'main';
  const openTime = String(req.body?.openTime ?? '');
  const closeTime = String(req.body?.closeTime ?? openTime);
  const days = String(req.body?.days ?? '0,1,2,3,4,5,6');
  if (!name || !/^\d{2}:\d{2}$/.test(openTime) || !/^\d{2}:\d{2}$/.test(closeTime)) {
    return res.status(400).json({ message: 'name, openTime (HH:MM) and closeTime are required' });
  }
  const info = db
    .prepare('INSERT INTO markets (name, kind, open_time, close_time, days, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, kind, openTime, closeTime, days, Number(req.body?.sortOrder ?? 0));
  log('market.create', { name, kind, openTime, closeTime });
  res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
});

adminRouter.patch('/markets/:id', (req, res) => {
  const id = Number(req.params.id);
  const columns: Record<string, string> = {
    name: 'name',
    openTime: 'open_time',
    closeTime: 'close_time',
    days: 'days',
  };
  const sets: string[] = [];
  const params: Array<string | number> = [];
  for (const [key, column] of Object.entries(columns)) {
    if (req.body?.[key] !== undefined) {
      sets.push(`${column} = ?`);
      params.push(String(req.body[key]));
    }
  }
  if (req.body?.isActive !== undefined) {
    sets.push('is_active = ?');
    params.push(req.body.isActive ? 1 : 0);
  }
  if (req.body?.sortOrder !== undefined) {
    sets.push('sort_order = ?');
    params.push(Number(req.body.sortOrder));
  }
  if (sets.length === 0) return res.status(400).json({ message: 'Nothing to update' });
  params.push(id);
  db.prepare(`UPDATE markets SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  log('market.update', { id, body: req.body });
  res.json({ ok: true });
});

adminRouter.delete('/markets/:id', (req, res) => {
  const id = Number(req.params.id);
  const used = (db.prepare('SELECT COUNT(*) AS c FROM bids WHERE market_id = ?').get(id) as { c: number }).c;
  if (used > 0) {
    db.prepare('UPDATE markets SET is_active = 0 WHERE id = ?').run(id);
    log('market.disable', { id, reason: 'has bids' });
    return res.json({ ok: true, disabled: true, message: 'Market has bids, it was disabled instead of deleted' });
  }
  db.prepare('DELETE FROM results WHERE market_id = ?').run(id);
  db.prepare('DELETE FROM markets WHERE id = ?').run(id);
  log('market.delete', { id });
  res.json({ ok: true, deleted: true });
});

/* ----------------------------------------------------------------- results */

adminRouter.get('/results', (req, res) => {
  const date = String(req.query.date ?? todayStr());
  const rows = db
    .prepare('SELECT * FROM markets WHERE is_active = 1 ORDER BY kind, sort_order, id')
    .all() as unknown as MarketRow[];
  res.json({
    date,
    results: rows.map((m) => {
      const r = getResult(m.id, date);
      return {
        marketId: m.id,
        name: m.name,
        kind: m.kind,
        openTimeLabel: formatTime12(m.open_time),
        closeTimeLabel: formatTime12(m.close_time),
        openPanna: r?.open_panna ?? '',
        openDigit: r?.open_digit ?? '',
        closePanna: r?.close_panna ?? '',
        closeDigit: r?.close_digit ?? '',
        display: formatResult(r, m.kind),
        pendingBids: (
          db
            .prepare(`SELECT COUNT(*) AS c FROM bids WHERE market_id = ? AND bid_date = ? AND status='pending'`)
            .get(m.id, date) as { c: number }
        ).c,
      };
    }),
  });
});

adminRouter.post('/results', (req, res) => {
  const marketId = Number(req.body?.marketId);
  const session = (req.body?.session === 'close' ? 'close' : 'open') as Session;
  const panna = String(req.body?.panna ?? '').trim();
  const date = String(req.body?.date ?? todayStr());

  const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(marketId);
  if (!market) return res.status(404).json({ message: 'Market not found' });
  if (!/^\d{3}$/.test(panna)) return res.status(400).json({ message: 'Panna must be 3 digits' });

  const summary = declareResult(marketId, date, session, panna);
  log('result.declare', { marketId, session, panna, date, ...summary });
  res.json({ ok: true, ...summary });
});

adminRouter.delete('/results', (req, res) => {
  const marketId = Number(req.query.marketId);
  const date = String(req.query.date ?? todayStr());
  const existing = getResult(marketId, date);
  if (!existing) return res.status(404).json({ message: 'No result for this market/date' });
  const settled = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM bids WHERE market_id = ? AND bid_date = ? AND status IN ('won','lost')`)
      .get(marketId, date) as { c: number }
  ).c;
  if (settled > 0) {
    return res.status(400).json({
      message: `${settled} bids are already settled against this result — publish a correction instead of deleting it`,
    });
  }
  db.prepare('DELETE FROM results WHERE id = ?').run(existing.id);
  log('result.delete', { marketId, date });
  res.json({ ok: true });
});

adminRouter.post('/results/settle', (req, res) => {
  const marketId = Number(req.body?.marketId);
  const date = String(req.body?.date ?? todayStr());
  const summary = settleMarket(marketId, date);
  log('result.settle', { marketId, date, ...summary });
  res.json({ ok: true, ...summary });
});

adminRouter.post('/markets/cancel', (req, res) => {
  const marketId = Number(req.body?.marketId);
  const date = String(req.body?.date ?? todayStr());
  const reason = String(req.body?.reason ?? 'Market cancelled');
  const refunded = cancelMarketDay(marketId, date, reason);
  log('market.cancel', { marketId, date, refunded });
  res.json({ ok: true, refunded });
});

/* -------------------------------------------------------------------- bids */

adminRouter.get('/bids', (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(Number(req.query.perPage ?? 25), 200);
  const where: string[] = ['1 = 1'];
  const params: Array<string | number> = [];

  const add = (clause: string, value: string | number) => {
    where.push(clause);
    params.push(value);
  };
  if (req.query.marketId) add('b.market_id = ?', Number(req.query.marketId));
  if (req.query.userId) add('b.user_id = ?', Number(req.query.userId));
  if (req.query.date) add('b.bid_date = ?', String(req.query.date));
  if (req.query.status) add('b.status = ?', String(req.query.status));
  if (req.query.gameType) add('b.game_type = ?', String(req.query.gameType));
  if (req.query.kind) add('b.kind = ?', String(req.query.kind));
  if (req.query.mobile) add('u.mobile LIKE ?', `%${String(req.query.mobile)}%`);

  const clause = where.join(' AND ');
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS c, COALESCE(SUM(b.amount),0) AS amount, COALESCE(SUM(b.win_amount),0) AS payout
       FROM bids b JOIN users u ON u.id = b.user_id WHERE ${clause}`,
    )
    .get(...params) as { c: number; amount: number; payout: number };

  const rows = db
    .prepare(
      `SELECT b.*, u.name AS user_name, u.mobile AS user_mobile
       FROM bids b JOIN users u ON u.id = b.user_id
       WHERE ${clause} ORDER BY b.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, perPage, (page - 1) * perPage) as Array<Record<string, unknown>>;

  res.json({
    page,
    perPage,
    total: totals.c,
    totalPages: Math.max(1, Math.ceil(totals.c / perPage)),
    totalAmount: totals.amount,
    totalPayout: totals.payout,
    bids: rows.map((b) => ({
      id: b.id,
      userId: b.user_id,
      userName: b.user_name,
      userMobile: b.user_mobile,
      marketId: b.market_id,
      marketName: b.market_name,
      kind: b.kind,
      gameType: b.game_type,
      session: b.session,
      pick: b.pick,
      amount: b.amount,
      rate: b.rate,
      status: b.status,
      winAmount: b.win_amount,
      bidDate: b.bid_date,
      createdAt: b.created_at,
    })),
  });
});

/** Number-wise exposure for one market/date — what a payout would cost. */
adminRouter.get('/bids/summary', (req, res) => {
  const marketId = Number(req.query.marketId);
  const date = String(req.query.date ?? todayStr());
  const rows = db
    .prepare(
      `SELECT game_type, session, pick, COUNT(*) AS bids, SUM(amount) AS amount, SUM(amount * rate) AS liability
       FROM bids WHERE market_id = ? AND bid_date = ?
       GROUP BY game_type, session, pick ORDER BY liability DESC LIMIT 200`,
    )
    .all(marketId, date) as Array<Record<string, unknown>>;
  res.json({ marketId, date, rows });
});

/* ------------------------------------------------------------------- users */

adminRouter.get('/users', (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(Number(req.query.perPage ?? 25), 200);
  const search = String(req.query.search ?? '').trim();
  const where = search ? 'WHERE name LIKE ? OR mobile LIKE ?' : '';
  const params = search ? [`%${search}%`, `%${search}%`] : [];

  const total = (db.prepare(`SELECT COUNT(*) AS c FROM users ${where}`).get(...params) as { c: number }).c;
  const rows = db
    .prepare(
      `SELECT id, name, mobile, balance, is_active, created_at FROM users ${where}
       ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, perPage, (page - 1) * perPage) as Array<Record<string, unknown>>;

  res.json({
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    users: rows.map((u) => ({
      id: u.id,
      name: u.name,
      mobile: u.mobile,
      balance: u.balance,
      isActive: !!u.is_active,
      createdAt: u.created_at,
    })),
  });
});

adminRouter.get('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = db
    .prepare('SELECT id, name, mobile, balance, is_active, created_at FROM users WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  if (!user) return res.status(404).json({ message: 'User not found' });

  res.json({
    user: {
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      balance: user.balance,
      isActive: !!user.is_active,
      createdAt: user.created_at,
    },
    bids: db.prepare('SELECT * FROM bids WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(id),
    transactions: db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(id),
    requests: db.prepare('SELECT * FROM fund_requests WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(id),
    bank: db.prepare('SELECT * FROM banks WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(id) ?? null,
  });
});

adminRouter.post('/users/:id/balance', (req, res) => {
  const id = Number(req.params.id);
  const delta = Math.floor(Number(req.body?.delta));
  if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ message: 'delta is required' });
  const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ message: 'User not found' });

  const note = String(req.body?.note ?? '');
  const txn = applyTxn({
    userId: id,
    type: 'adjust',
    delta,
    particulars: delta > 0 ? 'Coins credited by admin' : 'Coins debited by admin',
    note,
  });
  notify(id, delta > 0 ? 'Coins credited' : 'Coins debited', `${Math.abs(delta)} coins. ${note}`.trim());
  log('user.balance', { id, delta, note });
  res.json({ ok: true, balance: txn.balance_after });
});

adminRouter.post('/users/:id/block', (req, res) => {
  const id = Number(req.params.id);
  const blocked = !!req.body?.blocked;
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(blocked ? 0 : 1, id);
  log('user.block', { id, blocked });
  res.json({ ok: true });
});

adminRouter.post('/users/:id/password', (req, res) => {
  const id = Number(req.params.id);
  const password = String(req.body?.password ?? '');
  if (password.length < 4) return res.status(400).json({ message: 'Password must be at least 4 characters' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), id);
  log('user.password', { id });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------- funds */

adminRouter.get('/fund-requests', (req, res) => {
  const status = String(req.query.status ?? 'pending');
  const type = req.query.type ? String(req.query.type) : null;
  const where = ['f.status = ?'];
  const params: Array<string | number> = [status];
  if (type) {
    where.push('f.type = ?');
    params.push(type);
  }
  const rows = db
    .prepare(
      `SELECT f.*, u.name AS user_name, u.mobile AS user_mobile, u.balance AS user_balance
       FROM fund_requests f JOIN users u ON u.id = f.user_id
       WHERE ${where.join(' AND ')} ORDER BY f.id DESC LIMIT 300`,
    )
    .all(...params) as Array<Record<string, unknown>>;
  res.json({
    requests: rows.map((r) => ({ ...r, proof_url: uploadUrl(r.proof_file as string | null) })),
  });
});

adminRouter.post('/fund-requests/:id', (req, res) => {
  const id = Number(req.params.id);
  const action = req.body?.action === 'reject' ? 'reject' : 'approve';
  const remark = String(req.body?.remark ?? '');
  const fr = db.prepare('SELECT * FROM fund_requests WHERE id = ?').get(id) as
    | { id: number; user_id: number; type: string; amount: number; status: string }
    | undefined;
  if (!fr) return res.status(404).json({ message: 'Request not found' });
  if (fr.status !== 'pending') return res.status(400).json({ message: 'Request already processed' });

  if (fr.type === 'deposit' && action === 'approve') {
    applyTxn({
      userId: fr.user_id,
      type: 'deposit',
      delta: fr.amount,
      particulars: 'Coins added',
      note: `Request #${fr.id} approved`,
    });
  }
  if (fr.type === 'withdraw' && action === 'reject') {
    // the hold was taken at request time, give it back
    applyTxn({
      userId: fr.user_id,
      type: 'refund',
      delta: fr.amount,
      particulars: 'Withdraw rejected',
      note: remark || `Request #${fr.id} rejected`,
    });
  }

  db.prepare('UPDATE fund_requests SET status = ?, remark = ?, updated_at = ? WHERE id = ?').run(
    action === 'approve' ? 'approved' : 'rejected',
    remark,
    nowIso(),
    id,
  );
  notify(
    fr.user_id,
    `Request ${action === 'approve' ? 'approved' : 'rejected'}`,
    `Your ${fr.type} request of ${fr.amount} coins was ${action === 'approve' ? 'approved' : 'rejected'}.`,
  );
  log('fund.decide', { id, action, remark });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------- rates */

adminRouter.get('/rates', (_req, res) => res.json({ rates: allRates() }));

adminRouter.post('/rates', (req, res) => {
  const list = Array.isArray(req.body?.rates) ? req.body.rates : [req.body];
  let updated = 0;
  for (const item of list) {
    const key = String(item?.key ?? '');
    const rate = Number(item?.rate);
    if (!key || !Number.isFinite(rate) || rate < 1) continue;
    if (setRate(key, rate, item?.isActive !== false)) updated += 1;
  }
  if (updated === 0) return res.status(400).json({ message: 'Nothing valid to update' });
  log('rates.update', list);
  res.json({ ok: true, updated, rates: allRates() });
});

/* ------------------------------------------------- notifications & content */

adminRouter.get('/notifications', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT n.*, u.mobile AS user_mobile FROM notifications n
       LEFT JOIN users u ON u.id = n.user_id ORDER BY n.id DESC LIMIT 100`,
    )
    .all();
  res.json({ notifications: rows });
});

adminRouter.post('/notifications', (req, res) => {
  const title = String(req.body?.title ?? '').trim();
  const body = String(req.body?.body ?? '').trim();
  if (!title || !body) return res.status(400).json({ message: 'title and body are required' });
  notify(req.body?.userId ? Number(req.body.userId) : null, title, body);
  log('notification.send', { title, userId: req.body?.userId ?? null });
  res.status(201).json({ ok: true });
});

adminRouter.get('/ideas', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT i.*, u.name AS user_name, u.mobile AS user_mobile FROM ideas i
       JOIN users u ON u.id = i.user_id ORDER BY i.id DESC LIMIT 200`,
    )
    .all();
  res.json({ ideas: rows });
});

/* ----------------------------------------------------------- support inbox */

adminRouter.get('/support', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT s.user_id, u.name, u.mobile, COUNT(*) AS messages, MAX(s.created_at) AS last_at,
              (SELECT text FROM support_messages WHERE user_id = s.user_id ORDER BY id DESC LIMIT 1) AS last_text
       FROM support_messages s JOIN users u ON u.id = s.user_id
       GROUP BY s.user_id ORDER BY last_at DESC LIMIT 100`,
    )
    .all();
  res.json({ threads: rows });
});

adminRouter.get('/support/:userId', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM support_messages WHERE user_id = ? ORDER BY id ASC LIMIT 300')
    .all(Number(req.params.userId));
  res.json({ messages: rows });
});

adminRouter.post('/support/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const text = String(req.body?.text ?? '').trim();
  if (!text) return res.status(400).json({ message: 'Message is empty' });
  db.prepare('INSERT INTO support_messages (user_id, sender, text, created_at) VALUES (?, ?, ?, ?)').run(
    userId,
    'support',
    text,
    nowIso(),
  );
  notify(userId, 'Support replied', text.slice(0, 120));
  log('support.reply', { userId });
  res.status(201).json({
    messages: db.prepare('SELECT * FROM support_messages WHERE user_id = ? ORDER BY id ASC').all(userId),
  });
});

/* ---------------------------------------------------------------- settings */

const SETTING_KEYS = [
  'app_name',
  'support_name',
  'whatsapp_number',
  'marquee',
  'notice',
  'share_text',
  'videos',
  'auto_approve_deposit',
  'auto_declare',
  'require_deposit_proof',
  'upi_id',
  'upi_name',
  'upi_number',
  'deposit_note',
];

adminRouter.get('/settings', (_req, res) => {
  const values: Record<string, string> = {};
  for (const key of SETTING_KEYS) values[key] = getSetting(key, '');
  values.auto_declare = autoDeclareEnabled() ? '1' : '0';
  res.json({ settings: values, keys: SETTING_KEYS, qrUrl: uploadUrl(getSetting('upi_qr_file', '') || null) });
});

/** Replace the UPI QR image shown on the app's Add Fund screen. */
adminRouter.post('/payment-qr', (req, res) => {
  const image = String(req.body?.image ?? '');
  if (!image) return res.status(400).json({ message: 'No image provided' });
  try {
    const previous = getSetting('upi_qr_file', '');
    const file = saveDataUri(image, 'qr');
    setSetting('upi_qr_file', file);
    removeUpload(previous);
    log('settings.qr', file);
    res.json({ ok: true, qrUrl: uploadUrl(file) });
  } catch (err) {
    res.status(400).json({ message: (err as Error).message });
  }
});

adminRouter.delete('/payment-qr', (_req, res) => {
  removeUpload(getSetting('upi_qr_file', ''));
  setSetting('upi_qr_file', '');
  log('settings.qr', 'removed');
  res.json({ ok: true });
});

adminRouter.post('/settings', (req, res) => {
  const entries = Object.entries(req.body ?? {});
  if (entries.length === 0) return res.status(400).json({ message: 'Nothing to update' });
  for (const [key, value] of entries) setSetting(key, String(value));
  log('settings.update', entries.map(([k]) => k).join(','));
  res.json({ ok: true, updated: entries.length });
});

adminRouter.get('/logs', (_req, res) => {
  res.json({ logs: db.prepare('SELECT * FROM admin_log ORDER BY id DESC LIMIT 200').all() });
});

/** Handy during testing: validate a pick without placing a bid. */
adminRouter.post('/validate-pick', (req, res) => {
  const error = validatePick(req.body?.gameType, String(req.body?.pick ?? ''));
  res.json({ ok: !error, error });
});
