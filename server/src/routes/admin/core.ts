/* Core admin routes: login, session, sidebar badge stats, and the "Others" pages
 * kept from the first panel (all bids, support inbox, ideas, general settings,
 * activity log). */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { config } from '../../config.js';
import { db, getSetting, nowIso, setSetting } from '../../db.js';
import {
  type AdminRequest,
  type AdminRow,


  requirePerm,
  signAdminToken,
  superAdmin,
} from '../../auth.js';
import { validatePick } from '../../game.js';
import { PERMISSION_TREE } from '../../permissions.js';
import { autoDeclareEnabled } from '../../results.js';
import { removeUpload, saveDataUri, uploadUrl } from '../../uploads.js';
import { notify } from '../../wallet.js';
import { log } from './util.js';

/** Public: login. */
export const loginRouter = Router();

loginRouter.post('/login', (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');

  if (username === config.adminUser && password === config.adminPassword) {
    db.prepare('INSERT INTO admin_log (action, detail, admin, created_at) VALUES (?, ?, ?, ?)').run(
      'login',
      'super admin',
      username,
      nowIso(),
    );
    return res.json({ token: signAdminToken(username), username });
  }

  const row = db.prepare('SELECT * FROM admins WHERE username = ?').get(username) as AdminRow | undefined;
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ message: 'Wrong username or password' });
  }
  if (row.is_blocked) return res.status(403).json({ message: 'Your account is blocked. Contact the admin.' });
  if (row.login_permission === 'none' || row.login_permission === 'app') {
    return res.status(403).json({ message: 'Login to the web panel is disabled for this account' });
  }

  db.prepare('UPDATE admins SET last_login_at = ?, last_seen_at = ? WHERE id = ?').run(nowIso(), nowIso(), row.id);
  db.prepare('INSERT INTO admin_log (action, detail, admin, created_at) VALUES (?, ?, ?, ?)').run(
    'login',
    'employee',
    row.username,
    nowIso(),
  );
  res.json({ token: signAdminToken(row.username, row.id), username: row.username });
});

/** Mounted after requireAdmin in index.ts. */
export const coreRouter = Router();

coreRouter.get('/me', (req: AdminRequest, res) => {
  const a = req.admin ?? superAdmin();
  res.json({
    ok: true,
    user: a.username,
    username: a.username,
    name: a.name,
    role: a.role,
    isSuper: a.isSuper,
    permissions: [...a.permissions],
    permissionTree: PERMISSION_TREE,
  });
});

/** Change your own password (employees; the super admin's lives in .env). */
coreRouter.post('/me/password', (req: AdminRequest, res) => {
  const a = req.admin;
  if (!a?.id) return res.status(400).json({ message: 'The super admin password is set in the server .env file' });
  const oldPassword = String(req.body?.oldPassword ?? '');
  const newPassword = String(req.body?.newPassword ?? '');
  const row = db.prepare('SELECT * FROM admins WHERE id = ?').get(a.id) as AdminRow | undefined;
  if (!row || !bcrypt.compareSync(oldPassword, row.password_hash)) {
    return res.status(400).json({ message: 'Current password is wrong' });
  }
  if (newPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), a.id);
  log(req, 'admin.password', { id: a.id });
  res.json({ ok: true });
});

/** Small numbers for the sidebar badges and the auto-results chip. */
coreRouter.get('/stats', (_req, res) => {
  const one = (sql: string) => Number((db.prepare(sql).get() as { v: number | null } | undefined)?.v ?? 0);
  res.json({
    autoDeclare: autoDeclareEnabled(),
    funds: {
      pendingDeposits: one(`SELECT COUNT(*) AS v FROM fund_requests WHERE type='deposit' AND status='pending'`),
      pendingWithdraws: one(`SELECT COUNT(*) AS v FROM fund_requests WHERE type='withdraw' AND status='pending'`),
    },
  });
});

/**
 * Player search for "Player Name" boxes (type at least 3 characters).
 * Matches name, username or mobile. Response: { players: [{ id, name, username, mobile }] }
 */
coreRouter.get('/players', (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 3) return res.json({ players: [] });
  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT id, name, username, mobile FROM users
       WHERE name LIKE ? OR username LIKE ? OR mobile LIKE ? ORDER BY name LIMIT 20`,
    )
    .all(like, like, like);
  res.json({ players: rows });
});

/** Every market (all kinds) for filter dropdowns. */
coreRouter.get('/markets', (_req, res) => {
  const rows = db
    .prepare('SELECT id, name, kind, is_active FROM markets ORDER BY kind, sort_order, id')
    .all() as Array<{ id: number; name: string; kind: string; is_active: number }>;
  res.json({ markets: rows.map((m) => ({ id: m.id, name: m.name, kind: m.kind, isActive: !!m.is_active })) });
});

/* ------------------------------------------------------------- all bids */

coreRouter.get('/bids', requirePerm('others.bids'), (req, res) => {
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

/* -------------------------------------------------------- support inbox */

coreRouter.get('/support', requirePerm('others.support'), (_req, res) => {
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

coreRouter.get('/support/:userId', requirePerm('others.support'), (req, res) => {
  const rows = db
    .prepare('SELECT * FROM support_messages WHERE user_id = ? ORDER BY id ASC LIMIT 300')
    .all(Number(req.params.userId));
  res.json({ messages: rows });
});

coreRouter.post('/support/:userId', requirePerm('others.support'), (req, res) => {
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
  log(req, 'support.reply', { userId });
  res.status(201).json({
    messages: db.prepare('SELECT * FROM support_messages WHERE user_id = ? ORDER BY id ASC').all(userId),
  });
});

/* ------------------------------------------------------------------ ideas */

coreRouter.get('/ideas', requirePerm('others.ideas'), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT i.*, u.name AS user_name, u.mobile AS user_mobile FROM ideas i
       JOIN users u ON u.id = i.user_id ORDER BY i.id DESC LIMIT 200`,
    )
    .all();
  res.json({ ideas: rows });
});

/* -------------------------------------------------------- general settings */

const SETTING_KEYS = [
  'app_name',
  'support_name',
  'whatsapp_number',
  'marquee',
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

coreRouter.get('/settings', requirePerm('others.settings'), (_req, res) => {
  const values: Record<string, string> = {};
  for (const key of SETTING_KEYS) values[key] = getSetting(key, '');
  values.auto_declare = autoDeclareEnabled() ? '1' : '0';
  res.json({ settings: values, keys: SETTING_KEYS, qrUrl: uploadUrl(getSetting('upi_qr_file', '') || null) });
});

/** Replace the UPI QR image shown on the app's Add Fund screen. */
coreRouter.post('/payment-qr', requirePerm('others.settings'), (req, res) => {
  const image = String(req.body?.image ?? '');
  if (!image) return res.status(400).json({ message: 'No image provided' });
  try {
    const previous = getSetting('upi_qr_file', '');
    const file = saveDataUri(image, 'qr');
    setSetting('upi_qr_file', file);
    removeUpload(previous);
    log(req, 'settings.qr', file);
    res.json({ ok: true, qrUrl: uploadUrl(file) });
  } catch (err) {
    res.status(400).json({ message: (err as Error).message });
  }
});

coreRouter.delete('/payment-qr', requirePerm('others.settings'), (req, res) => {
  removeUpload(getSetting('upi_qr_file', ''));
  setSetting('upi_qr_file', '');
  log(req, 'settings.qr', 'removed');
  res.json({ ok: true });
});

/** General settings: only the keys this page owns can be written here. */
coreRouter.post('/settings', requirePerm('others.settings'), (req, res) => {
  const entries = Object.entries(req.body ?? {}).filter(([k]) => SETTING_KEYS.includes(k));
  if (entries.length === 0) return res.status(400).json({ message: 'Nothing to update' });
  for (const [key, value] of entries) setSetting(key, String(value));
  log(req, 'settings.update', entries.map(([k]) => k).join(','));
  res.json({ ok: true, updated: entries.length });
});

/* ------------------------------------------------------------ activity log */

coreRouter.get('/logs', requirePerm('others.logs'), (_req, res) => {
  res.json({ logs: db.prepare('SELECT * FROM admin_log ORDER BY id DESC LIMIT 300').all() });
});

/** Handy during testing: validate a pick without placing a bid. */
coreRouter.post('/validate-pick', (req, res) => {
  const error = validatePick(req.body?.gameType, String(req.body?.pick ?? ''));
  res.json({ ok: !error, error });
});

