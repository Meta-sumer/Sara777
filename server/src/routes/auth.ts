import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { db, nowIso } from '../db.js';
import { type AuthedRequest, type UserRow, publicUser, requireAuth, signToken } from '../auth.js';
import { applyTxn, notify } from '../wallet.js';

export const authRouter = Router();

const MOBILE_RE = /^[6-9]\d{9}$/;

function findByMobile(mobile: string) {
  return db.prepare('SELECT * FROM users WHERE mobile = ?').get(mobile) as UserRow | undefined;
}

authRouter.post('/register', (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const mobile = String(req.body?.mobile ?? '').trim();
  const password = String(req.body?.password ?? '');

  if (name.length < 2) return res.status(400).json({ message: 'Please enter your name' });
  if (!MOBILE_RE.test(mobile)) return res.status(400).json({ message: 'Enter a valid 10 digit mobile number' });
  if (password.length < 4) return res.status(400).json({ message: 'Password must be at least 4 characters' });
  if (findByMobile(mobile)) return res.status(409).json({ message: 'This mobile number is already registered' });

  const info = db
    .prepare('INSERT INTO users (name, mobile, password_hash, balance, created_at) VALUES (?, ?, ?, 0, ?)')
    .run(name, mobile, bcrypt.hashSync(password, 10), nowIso());
  const userId = Number(info.lastInsertRowid);

  if (config.registerBonus > 0) {
    applyTxn({
      userId,
      type: 'bonus',
      delta: config.registerBonus,
      particulars: 'Register Bonus',
      note: 'Welcome bonus credited',
    });
  }
  notify(userId, 'Welcome!', `Hi ${name}, your account is ready. Enjoy the games.`);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserRow;
  res.status(201).json({ token: signToken(userId), user: publicUser(user) });
});

authRouter.post('/login', (req, res) => {
  const mobile = String(req.body?.mobile ?? '').trim();
  const password = String(req.body?.password ?? '');
  const user = findByMobile(mobile);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: 'Mobile number or password is wrong' });
  }
  if (!user.is_active) return res.status(403).json({ message: 'Account is blocked. Contact support.' });
  res.json({ token: signToken(user.id), user: publicUser(user) });
});

authRouter.post('/forgot-password', (req, res) => {
  const mobile = String(req.body?.mobile ?? '').trim();
  const password = String(req.body?.password ?? '');
  const user = findByMobile(mobile);
  if (!user) return res.status(404).json({ message: 'No account with this mobile number' });
  if (password.length < 4) return res.status(400).json({ message: 'Password must be at least 4 characters' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), user.id);
  res.json({ ok: true, message: 'Password updated, please login' });
});

authRouter.get('/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: publicUser(req.user!) });
});

authRouter.patch('/me', requireAuth, (req: AuthedRequest, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (name.length < 2) return res.status(400).json({ message: 'Please enter your name' });
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user!.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as unknown as UserRow;
  res.json({ user: publicUser(user) });
});

authRouter.post('/change-password', requireAuth, (req: AuthedRequest, res) => {
  const oldPassword = String(req.body?.oldPassword ?? '');
  const newPassword = String(req.body?.newPassword ?? '');
  if (!bcrypt.compareSync(oldPassword, req.user!.password_hash)) {
    return res.status(400).json({ message: 'Current password is wrong' });
  }
  if (newPassword.length < 4) return res.status(400).json({ message: 'Password must be at least 4 characters' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.user!.id);
  res.json({ ok: true, message: 'Password changed' });
});

/* ------------------------------------------------------------------- MPIN */

authRouter.post('/mpin', requireAuth, (req: AuthedRequest, res) => {
  const mpin = String(req.body?.mpin ?? '');
  if (!/^\d{4}$/.test(mpin)) return res.status(400).json({ message: 'MPIN must be 4 digits' });
  if (req.user!.mpin_hash) {
    const oldMpin = String(req.body?.oldMpin ?? '');
    if (!bcrypt.compareSync(oldMpin, req.user!.mpin_hash)) {
      return res.status(400).json({ message: 'Current MPIN is wrong' });
    }
  }
  db.prepare('UPDATE users SET mpin_hash = ? WHERE id = ?').run(bcrypt.hashSync(mpin, 10), req.user!.id);
  res.json({ ok: true, message: 'MPIN saved' });
});

authRouter.post('/mpin/verify', requireAuth, (req: AuthedRequest, res) => {
  const mpin = String(req.body?.mpin ?? '');
  if (!req.user!.mpin_hash) return res.status(400).json({ message: 'MPIN not set' });
  if (!bcrypt.compareSync(mpin, req.user!.mpin_hash)) return res.status(400).json({ message: 'Wrong MPIN' });
  res.json({ ok: true });
});
