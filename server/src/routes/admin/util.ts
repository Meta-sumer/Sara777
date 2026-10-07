/* Helpers shared by the admin module routers. */
import type { Request } from 'express';
import { db, nowIso } from '../../db.js';
import { adminName } from '../../auth.js';
import { todayStr } from '../../game.js';

/** Write an Activity Log row, tagged with the admin who did it. */
export function log(req: Request, action: string, detail: unknown) {
  db.prepare('INSERT INTO admin_log (action, detail, admin, created_at) VALUES (?, ?, ?, ?)').run(
    action,
    typeof detail === 'string' ? detail : JSON.stringify(detail),
    adminName(req),
    nowIso(),
  );
}

/** ?date=YYYY-MM-DD, defaulting to today. */
export function qDate(req: Request, key = 'date'): string {
  const v = String(req.query[key] ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : todayStr();
}

/** ?from=&to= (YYYY-MM-DD), both defaulting to today; swapped if reversed. */
export function qRange(req: Request, fromKey = 'from', toKey = 'to'): { from: string; to: string } {
  const from = qDate(req, fromKey);
  const to = req.query[toKey] ? qDate(req, toKey) : from;
  return from <= to ? { from, to } : { from: to, to: from };
}

/** ?page=&perPage= with sane bounds. */
export function qPage(req: Request, defaultPerPage = 50, maxPerPage = 500) {
  const page = Math.max(1, Math.floor(Number(req.query.page ?? 1)) || 1);
  const perPage = Math.min(maxPerPage, Math.max(1, Math.floor(Number(req.query.perPage ?? defaultPerPage)) || defaultPerPage));
  return { page, perPage, offset: (page - 1) * perPage };
}

/** Trimmed string query/body value ('' when missing). */
export function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v).trim();
}

/** Throwable 400 error the module routers can use: `throw badRequest('...')`. */
export function badRequest(message: string, status = 400) {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}
