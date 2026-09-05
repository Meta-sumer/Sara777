import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { db } from './db.js';

export interface UserRow {
  id: number;
  name: string;
  mobile: string;
  password_hash: string;
  mpin_hash: string | null;
  balance: number;
  is_active: number;
  created_at: string;
}

export interface AuthedRequest extends Request {
  user?: UserRow;
}

export function signToken(userId: number) {
  return jwt.sign({ uid: userId }, config.jwtSecret, { expiresIn: '90d' });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Login required' });

  try {
    const payload = jwt.verify(token, config.jwtSecret) as { uid: number };
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid) as UserRow | undefined;
    if (!user) return res.status(401).json({ message: 'Account not found' });
    if (!user.is_active) return res.status(403).json({ message: 'Account is blocked. Contact support.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Session expired, please login again' });
  }
}

export function signAdminToken(username: string) {
  return jwt.sign({ admin: true, username }, config.jwtSecret, { expiresIn: '12h' });
}

/**
 * Admin routes accept either a signed admin session (the panel logs in and
 * stores a token) or the static `x-admin-key` header for scripts/curl.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.headers['x-admin-key'] === config.adminKey) return next();

  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret) as { admin?: boolean };
      if (payload.admin) return next();
    } catch {
      return res.status(401).json({ message: 'Admin session expired, please login again' });
    }
  }
  return res.status(403).json({ message: 'Admin authentication required' });
}

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    name: u.name,
    mobile: u.mobile,
    balance: u.balance,
    hasMpin: !!u.mpin_hash,
    createdAt: u.created_at,
  };
}
