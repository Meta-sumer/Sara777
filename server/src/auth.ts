import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { db, nowIso } from './db.js';
import { ALL_PERMISSIONS } from './permissions.js';

export interface UserRow {
  id: number;
  name: string;
  username: string;
  mobile: string;
  password_hash: string;
  mpin_hash: string | null;
  balance: number;
  is_active: number;
  is_deleted: number;
  device_name: string | null;
  device_id: string | null;
  last_login_at: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface AuthedRequest extends Request {
  user?: UserRow;
}

export function signToken(userId: number) {
  return jwt.sign({ uid: userId }, config.jwtSecret, { expiresIn: '90d' });
}

/** Activity timestamps are written at most this often per account. */
const SEEN_EVERY_MS = 60_000;

function staleSeen(iso: string | null | undefined) {
  return !iso || Date.now() - Date.parse(iso) > SEEN_EVERY_MS;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Login required' });

  try {
    const payload = jwt.verify(token, config.jwtSecret) as { uid: number };
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid) as UserRow | undefined;
    if (!user) return res.status(401).json({ message: 'Account not found' });
    if (user.is_deleted) return res.status(403).json({ message: 'This account was deleted. Contact support.' });
    if (!user.is_active) return res.status(403).json({ message: 'Account is blocked. Contact support.' });
    if (staleSeen(user.last_seen_at)) {
      db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(nowIso(), user.id);
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Session expired, please login again' });
  }
}

/* ------------------------------------------------------------------ admin */

export interface AdminCtx {
  /** admins.id, or null for the super admin / x-admin-key */
  id: number | null;
  username: string;
  name: string;
  role: string;
  isSuper: boolean;
  permissions: Set<string>;
}

export interface AdminRequest extends Request {
  admin?: AdminCtx;
}

export interface AdminRow {
  id: number;
  username: string;
  name: string;
  password_hash: string;
  role: string;
  permissions: string;
  login_permission: string;
  is_blocked: number;
  last_login_at: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export function signAdminToken(username: string, adminId: number | null = null) {
  return jwt.sign({ admin: true, username, aid: adminId }, config.jwtSecret, { expiresIn: '12h' });
}

export function superAdmin(username = config.adminUser): AdminCtx {
  return {
    id: null,
    username,
    name: username,
    role: 'Super Admin',
    isSuper: true,
    permissions: new Set(ALL_PERMISSIONS),
  };
}

export function employeeCtx(row: AdminRow): AdminCtx {
  let perms: string[] = [];
  try {
    perms = JSON.parse(row.permissions) as string[];
  } catch {
    perms = [];
  }
  return {
    id: row.id,
    username: row.username,
    name: row.name || row.username,
    role: row.role || 'Employee',
    isSuper: false,
    permissions: new Set(perms),
  };
}

/**
 * Admin routes accept a signed admin session (the panel logs in and stores a
 * token) or the static `x-admin-key` header for scripts/curl (full access).
 * Employee sessions are re-checked on every request, so blocking or deleting
 * an employee logs them out immediately.
 */
export function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  if (req.headers['x-admin-key'] === config.adminKey) {
    req.admin = superAdmin('api-key');
    return next();
  }

  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Admin authentication required' });

  let payload: { admin?: boolean; username?: string; aid?: number | null };
  try {
    payload = jwt.verify(token, config.jwtSecret) as typeof payload;
  } catch {
    return res.status(401).json({ message: 'Admin session expired, please login again' });
  }
  if (!payload.admin) return res.status(401).json({ message: 'Admin authentication required' });

  if (!payload.aid) {
    req.admin = superAdmin(payload.username);
    return next();
  }

  const row = db.prepare('SELECT * FROM admins WHERE id = ?').get(payload.aid) as AdminRow | undefined;
  if (!row) return res.status(401).json({ message: 'This staff account no longer exists' });
  if (row.is_blocked) return res.status(401).json({ message: 'This staff account is blocked' });
  // 'app' = staff app only (there is none yet), 'none' = login disabled
  if (row.login_permission === 'none' || row.login_permission === 'app') {
    return res.status(401).json({ message: 'Login is disabled for this staff account' });
  }
  if (staleSeen(row.last_seen_at)) {
    db.prepare('UPDATE admins SET last_seen_at = ? WHERE id = ?').run(nowIso(), row.id);
  }
  req.admin = employeeCtx(row);
  next();
}

/** Allow the request when the admin has any of the given permission keys. */
export function requirePerm(...keys: string[]) {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    const admin = req.admin;
    if (!admin) return res.status(401).json({ message: 'Admin authentication required' });
    if (admin.isSuper || keys.some((k) => admin.permissions.has(k))) return next();
    return res.status(403).json({ message: 'You do not have permission for this page' });
  };
}

/** Username to write in "Added By" / logs for the current admin request. */
export function adminName(req: Request): string {
  return (req as AdminRequest).admin?.username ?? 'admin';
}

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    mobile: u.mobile,
    balance: Number(u.balance),
    hasMpin: !!u.mpin_hash,
    createdAt: u.created_at,
  };
}
