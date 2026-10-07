/* Masters: payment gateways and staff accounts (mounted at /api/admin/masters).
 *
 * Payment gateways are configuration only. Balances are virtual coins and
 * deposits are manual UPI payments, so nothing here calls a gateway API: the
 * active pay-in / pay-out choice is stored in the settings `active_payin_pg` /
 * `active_payout_pg` (gateway code) for the deposit and payout screens to read.
 *
 * Employees are rows in `admins`. The super admin lives in .env and is never
 * listed or editable here. A non-super admin can only grant permissions they
 * hold themselves, and can only manage employees whose permissions are a
 * subset of their own, so employee management can't be used to gain access. */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { config } from '../../config.js';
import { all, db, get, getSetting, nowIso, scalar, setSetting, tx } from '../../db.js';
import { type AdminCtx, type AdminRequest, type AdminRow, requirePerm } from '../../auth.js';
import { normalizePermissions, PERMISSION_TREE } from '../../permissions.js';
import { badRequest, log, str } from './util.js';

export const mastersRouter = Router();

/* ================================================================ employees */

const ONLINE_MS = 5 * 60_000;
const LOGIN_PERMISSIONS = ['both', 'web', 'app', 'none'];
const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;
const ROLE_SUGGESTIONS = ['Operations Manager', 'Accountant', 'Result Manager', 'Support', 'Cashier', 'Supervisor'];

/** Module keys that only group pages; they are derived from the pages granted. */
const GROUP_KEYS = new Set(PERMISSION_TREE.filter((n) => n.children?.length).map((n) => n.key));

function parsePerms(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function actorOf(req: AdminRequest): AdminCtx {
  if (!req.admin) throw badRequest('Admin authentication required', 401);
  return req.admin;
}

/** Can `actor` change this employee? Never themselves; others only if they hold every permission the target has. */
function canManage(actor: AdminCtx, row: AdminRow): boolean {
  if (actor.isSuper) return true;
  if (actor.id === row.id) return false;
  return parsePerms(row.permissions).every((k) => actor.permissions.has(k));
}

function employeeJson(row: AdminRow, actor: AdminCtx) {
  const seen = row.last_seen_at ? Date.parse(row.last_seen_at) : NaN;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    permissions: parsePerms(row.permissions),
    loginPermission: row.login_permission,
    isBlocked: !!row.is_blocked,
    online: !row.is_blocked && Number.isFinite(seen) && Date.now() - seen < ONLINE_MS,
    lastLoginAt: row.last_login_at,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    isSelf: actor.id === row.id,
    manageable: canManage(actor, row),
  };
}

function findEmployee(id: unknown): AdminRow {
  const row = get<AdminRow>('SELECT * FROM admins WHERE id = ?', Number(id) || 0);
  if (!row) throw badRequest('Employee not found', 404);
  return row;
}

/** Load the target of a write and check the actor may change it. */
function targetFor(req: AdminRequest, verb: string): { actor: AdminCtx; row: AdminRow } {
  const actor = actorOf(req);
  const row = findEmployee(req.params.id);
  if (actor.id === row.id) throw badRequest(`You cannot ${verb} your own account`, 403);
  if (!canManage(actor, row)) {
    throw badRequest('This employee has permissions you do not have; only the super admin can change them', 403);
  }
  return { actor, row };
}

function checkPassword(password: string) {
  if (password.length < 6) throw badRequest('Password must be at least 6 characters');
  if (password.length > 64) throw badRequest('Password must be at most 64 characters');
}

/** Validate the Register / Edit Employee form. `existing` is set when editing. */
function readEmployee(body: Record<string, unknown>, actor: AdminCtx, existing?: AdminRow) {
  const username = str(body.username).toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw badRequest('Username must be 3 to 30 characters: lowercase letters, digits, _ or .');
  }
  if (username === config.adminUser.toLowerCase()) throw badRequest('This username is reserved for the super admin');
  if (get('SELECT id FROM admins WHERE lower(username) = ? AND id <> ?', username, existing?.id ?? 0)) {
    throw badRequest(`Username "${username}" is already taken`);
  }

  const name = str(body.name);
  if (!name) throw badRequest('Enter the employee name');
  if (name.length > 60) throw badRequest('Name must be at most 60 characters');

  const role = str(body.role) || 'Employee';
  if (role.length > 40) throw badRequest('Role must be at most 40 characters');

  const loginPermission = str(body.loginPermission) || 'both';
  if (!LOGIN_PERMISSIONS.includes(loginPermission)) throw badRequest('Choose a valid login permission');

  const password = String(body.password ?? '');
  if (!existing || password) checkPassword(password);

  // module keys only group pages: keep one only when one of its pages is granted
  const requested = normalizePermissions(body.permissions);
  const permissions = requested.filter(
    (k) => !GROUP_KEYS.has(k) || requested.some((c) => c.startsWith(`${k}.`)),
  );
  if (!actor.isSuper) {
    const missing = permissions.filter((k) => !GROUP_KEYS.has(k) && !actor.permissions.has(k));
    if (missing.length) throw badRequest(`You can only grant permissions you have yourself (${missing.join(', ')})`, 403);
  }

  return { username, name, role, loginPermission, password, permissions };
}

mastersRouter.get('/employees', requirePerm('masters.manage_employee'), (req: AdminRequest, res) => {
  const actor = actorOf(req);
  const rows = all<AdminRow>('SELECT * FROM admins ORDER BY id');
  res.json({ employees: rows.map((r) => employeeJson(r, actor)) });
});

/** Role suggestions for the form: common designations plus every role in use. */
mastersRouter.get(
  '/employees/roles',
  requirePerm('masters.create_employee', 'masters.manage_employee'),
  (_req, res) => {
    const used = all<{ role: string }>(`SELECT DISTINCT role FROM admins WHERE role <> '' ORDER BY role`).map((r) => r.role);
    res.json({ roles: [...new Set([...ROLE_SUGGESTIONS, ...used])] });
  },
);

mastersRouter.get(
  '/employees/:id',
  requirePerm('masters.create_employee', 'masters.manage_employee'),
  (req: AdminRequest, res) => {
    res.json({ employee: employeeJson(findEmployee(req.params.id), actorOf(req)) });
  },
);

mastersRouter.post('/employees', requirePerm('masters.create_employee'), (req: AdminRequest, res) => {
  const input = readEmployee(req.body ?? {}, actorOf(req));
  const info = db
    .prepare(
      `INSERT INTO admins (username, name, password_hash, role, permissions, login_permission, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.username,
      input.name,
      bcrypt.hashSync(input.password, 10),
      input.role,
      JSON.stringify(input.permissions),
      input.loginPermission,
      nowIso(),
    );
  const id = Number(info.lastInsertRowid);
  log(req, 'masters.employee_create', {
    id,
    username: input.username,
    role: input.role,
    loginPermission: input.loginPermission,
    permissions: input.permissions.length,
  });
  res.status(201).json({ employee: employeeJson(findEmployee(id), actorOf(req)) });
});

mastersRouter.put(
  '/employees/:id',
  requirePerm('masters.create_employee', 'masters.manage_employee'),
  (req: AdminRequest, res) => {
    const { actor, row } = targetFor(req, 'edit');
    const input = readEmployee(req.body ?? {}, actor, row);
    tx(() => {
      db.prepare(
        `UPDATE admins SET username = ?, name = ?, role = ?, permissions = ?, login_permission = ? WHERE id = ?`,
      ).run(input.username, input.name, input.role, JSON.stringify(input.permissions), input.loginPermission, row.id);
      if (input.password) {
        db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(input.password, 10), row.id);
      }
    });
    const before = new Set(parsePerms(row.permissions));
    const after = new Set(input.permissions);
    log(req, 'masters.employee_update', {
      id: row.id,
      username: input.username,
      ...(row.username !== input.username ? { previousUsername: row.username } : {}),
      role: input.role,
      loginPermission: input.loginPermission,
      granted: input.permissions.filter((k) => !before.has(k)),
      revoked: [...before].filter((k) => !after.has(k)),
      passwordChanged: !!input.password,
    });
    res.json({ employee: employeeJson(findEmployee(row.id), actor) });
  },
);

mastersRouter.post('/employees/:id/password', requirePerm('masters.manage_employee'), (req: AdminRequest, res) => {
  const { row } = targetFor(req, 'reset the password of');
  const password = String(req.body?.password ?? '');
  checkPassword(password);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), row.id);
  log(req, 'masters.employee_password', { id: row.id, username: row.username });
  res.json({ ok: true });
});

/** Block or unblock; a blocked employee's session is refused on its next request. */
mastersRouter.post('/employees/:id/block', requirePerm('masters.manage_employee'), (req: AdminRequest, res) => {
  const { actor, row } = targetFor(req, 'block');
  const blocked = req.body?.blocked;
  if (typeof blocked !== 'boolean') throw badRequest('Send blocked: true or false');
  db.prepare('UPDATE admins SET is_blocked = ? WHERE id = ?').run(blocked ? 1 : 0, row.id);
  log(req, blocked ? 'masters.employee_block' : 'masters.employee_unblock', { id: row.id, username: row.username });
  res.json({ employee: employeeJson(findEmployee(row.id), actor) });
});

mastersRouter.delete('/employees/:id', requirePerm('masters.manage_employee'), (req: AdminRequest, res) => {
  const { row } = targetFor(req, 'delete');
  db.prepare('DELETE FROM admins WHERE id = ?').run(row.id);
  log(req, 'masters.employee_delete', { id: row.id, username: row.username, role: row.role });
  res.json({ ok: true });
});

/* ========================================================= payment gateways */

type Direction = 'payin' | 'payout';
const SETTING: Record<Direction, string> = { payin: 'active_payin_pg', payout: 'active_payout_pg' };
const DIRECTION_LABEL: Record<Direction, string> = { payin: 'pay-in', payout: 'pay-out' };
const CODE_RE = /^[a-z0-9_]{2,30}$/;
const CRED_KEY_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,39}$/;
const MAX_CREDENTIALS = 20;

interface PgRow {
  id: number;
  name: string;
  code: string;
  supports_payin: number;
  supports_payout: number;
  is_active: number;
  config: string;
  created_at: string;
}

/** Ready-made rows for a fresh install: the two manual methods in use, plus inactive templates. */
const PG_SEED: Array<{ name: string; code: string; payin: boolean; payout: boolean; active: boolean; config: Record<string, string> }> = [
  { name: 'Manual UPI', code: 'manual_upi', payin: true, payout: false, active: true, config: {} },
  { name: 'Manual Bank Transfer', code: 'manual_bank', payin: false, payout: true, active: true, config: {} },
  { name: 'Razorpay', code: 'razorpay', payin: true, payout: true, active: false, config: { key_id: '', key_secret: '' } },
  { name: 'Cashfree', code: 'cashfree', payin: true, payout: true, active: false, config: { app_id: '', secret_key: '' } },
  {
    name: 'PhonePe PG',
    code: 'phonepe',
    payin: true,
    payout: true,
    active: false,
    config: { merchant_id: '', salt_key: '', salt_index: '' },
  },
  { name: 'Paytm PG', code: 'paytm', payin: true, payout: true, active: false, config: { mid: '', merchant_key: '' } },
];

/** Seed once; a table the admin has emptied on purpose stays empty. */
function ensurePgSeed() {
  if (getSetting('pg_seeded') === '1') return;
  tx(() => {
    if (scalar('SELECT COUNT(*) FROM payment_gateways') === 0) {
      const insert = db.prepare(
        `INSERT INTO payment_gateways (name, code, supports_payin, supports_payout, is_active, config, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const g of PG_SEED) {
        insert.run(g.name, g.code, g.payin ? 1 : 0, g.payout ? 1 : 0, g.active ? 1 : 0, JSON.stringify(g.config), nowIso());
      }
      if (!getSetting(SETTING.payin)) setSetting(SETTING.payin, 'manual_upi');
      if (!getSetting(SETTING.payout)) setSetting(SETTING.payout, 'manual_bank');
    }
    setSetting('pg_seeded', '1');
  });
}
ensurePgSeed();

function parseConfig(raw: string): Record<string, string> {
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, String(x ?? '')]));
  } catch {
    return {};
  }
}

/** Secrets never leave the server in full: everything but the last 4 characters is masked. */
function mask(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '•'.repeat(value.length);
  return '•'.repeat(Math.min(value.length - 4, 12)) + value.slice(-4);
}

function activeCodes(): Record<Direction, string> {
  return { payin: getSetting(SETTING.payin, ''), payout: getSetting(SETTING.payout, '') };
}

function gatewayJson(row: PgRow, active = activeCodes()) {
  const cfg = parseConfig(row.config);
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    supportsPayin: !!row.supports_payin,
    supportsPayout: !!row.supports_payout,
    isActive: !!row.is_active,
    credentials: Object.entries(cfg).map(([key, value]) => ({ key, value: mask(value), isSet: value !== '' })),
    inUse: { payin: active.payin === row.code, payout: active.payout === row.code },
    createdAt: row.created_at,
  };
}

function findGateway(id: unknown): PgRow {
  const row = get<PgRow>('SELECT * FROM payment_gateways WHERE id = ?', Number(id) || 0);
  if (!row) throw badRequest('Payment gateway not found', 404);
  return row;
}

/**
 * Credentials arrive as rows `{ key, value, from? }`. A blank value on a row
 * loaded from the server (`from` = its stored key) keeps the stored secret, so
 * the form never needs the real value; renaming the key keeps it too.
 */
function readCredentials(input: unknown, previous: Record<string, string>): Record<string, string> {
  if (input === undefined) return previous;
  if (!Array.isArray(input)) throw badRequest('Credentials must be a list of key/value rows');
  if (input.length > MAX_CREDENTIALS) throw badRequest(`At most ${MAX_CREDENTIALS} credential rows`);
  const out: Record<string, string> = {};
  for (const raw of input as Array<Record<string, unknown>>) {
    const key = str(raw?.key);
    let value = str(raw?.value);
    const from = str(raw?.from);
    if (!key && !value) continue;
    if (!CRED_KEY_RE.test(key)) {
      throw badRequest(`Credential key "${key}" is not valid: start with a letter; use letters, digits, _ . or -`);
    }
    if (key in out) throw badRequest(`Credential key "${key}" is used twice`);
    if (value.length > 500) throw badRequest(`The value for "${key}" is too long`);
    if (!value && from && from in previous) value = previous[from];
    out[key] = value;
  }
  return out;
}

function readGateway(body: Record<string, unknown>, existing?: PgRow) {
  const name = str(body.name);
  if (!name) throw badRequest('Enter the gateway name');
  if (name.length > 50) throw badRequest('Name must be at most 50 characters');

  const code = str(body.code).toLowerCase();
  if (!CODE_RE.test(code)) throw badRequest('Code must be 2 to 30 characters: lowercase letters, digits or _');
  if (get('SELECT id FROM payment_gateways WHERE code = ? AND id <> ?', code, existing?.id ?? 0)) {
    throw badRequest(`Code "${code}" is already used by another gateway`);
  }

  const supportsPayin = body.supportsPayin === true;
  const supportsPayout = body.supportsPayout === true;
  if (!supportsPayin && !supportsPayout) throw badRequest('A gateway must support pay-in, pay-out or both');
  const isActive = body.isActive === true;

  const credentials = readCredentials(body.credentials, existing ? parseConfig(existing.config) : {});
  const missing = Object.entries(credentials).filter(([, v]) => !v).map(([k]) => k);
  if (isActive && missing.length) {
    throw badRequest(`Fill in ${missing.join(', ')} before activating this gateway, or remove the unused rows`);
  }

  // the gateways selected for pay-in / pay-out must stay usable for that direction
  if (existing) {
    const active = activeCodes();
    const still = { payin: supportsPayin, payout: supportsPayout };
    for (const dir of ['payin', 'payout'] as Direction[]) {
      if (active[dir] === existing.code && (!isActive || !still[dir])) {
        throw badRequest(
          `${existing.name} is the active ${DIRECTION_LABEL[dir]} gateway. Switch ${DIRECTION_LABEL[dir]} to another gateway first.`,
        );
      }
    }
  }

  return { name, code, supportsPayin, supportsPayout, isActive, credentials };
}

/** Recent pay-in / pay-out switches, from the Activity Log. */
function switchHistory() {
  const rows = all<{ id: number; detail: string; admin: string | null; created_at: string }>(
    `SELECT id, detail, admin, created_at FROM admin_log WHERE action = 'masters.pg_switch' ORDER BY id DESC LIMIT 20`,
  );
  return rows.map((r) => {
    let d: { direction?: string; from?: string; to?: string } = {};
    try {
      d = JSON.parse(r.detail) as typeof d;
    } catch {
      /* keep blanks */
    }
    return { id: r.id, direction: d.direction ?? '', from: d.from ?? '', to: d.to ?? '', by: r.admin ?? '', at: r.created_at };
  });
}

mastersRouter.get('/pg', requirePerm('masters.pg'), (_req, res) => {
  ensurePgSeed();
  const active = activeCodes();
  const rows = all<PgRow>('SELECT * FROM payment_gateways ORDER BY id');
  res.json({
    gateways: rows.map((r) => gatewayJson(r, active)),
    activePayin: active.payin,
    activePayout: active.payout,
    history: switchHistory(),
  });
});

mastersRouter.post('/pg', requirePerm('masters.pg'), (req, res) => {
  const g = readGateway(req.body ?? {});
  const info = db
    .prepare(
      `INSERT INTO payment_gateways (name, code, supports_payin, supports_payout, is_active, config, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(g.name, g.code, g.supportsPayin ? 1 : 0, g.supportsPayout ? 1 : 0, g.isActive ? 1 : 0, JSON.stringify(g.credentials), nowIso());
  const id = Number(info.lastInsertRowid);
  log(req, 'masters.pg_create', {
    id,
    name: g.name,
    code: g.code,
    payin: g.supportsPayin,
    payout: g.supportsPayout,
    active: g.isActive,
    credentialKeys: Object.keys(g.credentials),
  });
  res.status(201).json({ gateway: gatewayJson(findGateway(id)) });
});

mastersRouter.put('/pg/:id', requirePerm('masters.pg'), (req, res) => {
  const row = findGateway(req.params.id);
  const g = readGateway(req.body ?? {}, row);
  const before = parseConfig(row.config);
  tx(() => {
    db.prepare(
      `UPDATE payment_gateways SET name = ?, code = ?, supports_payin = ?, supports_payout = ?, is_active = ?, config = ?
       WHERE id = ?`,
    ).run(g.name, g.code, g.supportsPayin ? 1 : 0, g.supportsPayout ? 1 : 0, g.isActive ? 1 : 0, JSON.stringify(g.credentials), row.id);
    // a renamed code keeps its pay-in / pay-out selection
    if (g.code !== row.code) {
      for (const dir of ['payin', 'payout'] as Direction[]) {
        if (getSetting(SETTING[dir]) === row.code) setSetting(SETTING[dir], g.code);
      }
    }
  });
  log(req, 'masters.pg_update', {
    id: row.id,
    name: g.name,
    code: g.code,
    ...(g.code !== row.code ? { previousCode: row.code } : {}),
    payin: g.supportsPayin,
    payout: g.supportsPayout,
    active: g.isActive,
    credentialsChanged: Object.keys(g.credentials).filter((k) => before[k] !== g.credentials[k]),
    credentialsRemoved: Object.keys(before).filter((k) => !(k in g.credentials)),
  });
  res.json({ gateway: gatewayJson(findGateway(row.id)) });
});

mastersRouter.delete('/pg/:id', requirePerm('masters.pg'), (req, res) => {
  const row = findGateway(req.params.id);
  const active = activeCodes();
  for (const dir of ['payin', 'payout'] as Direction[]) {
    if (active[dir] === row.code) {
      throw badRequest(`${row.name} is the active ${DIRECTION_LABEL[dir]} gateway. Switch ${DIRECTION_LABEL[dir]} first.`);
    }
  }
  db.prepare('DELETE FROM payment_gateways WHERE id = ?').run(row.id);
  log(req, 'masters.pg_delete', { id: row.id, name: row.name, code: row.code });
  res.json({ ok: true });
});

/** Choose the gateway used for deposits (payin) or withdrawals (payout). */
mastersRouter.post('/pg/active', requirePerm('masters.pg'), (req, res) => {
  const direction = str(req.body?.direction) as Direction;
  if (direction !== 'payin' && direction !== 'payout') throw badRequest('Direction must be payin or payout');
  const code = str(req.body?.code);
  const row = get<PgRow>('SELECT * FROM payment_gateways WHERE code = ?', code);
  if (!row) throw badRequest('Payment gateway not found', 404);
  if (!row.is_active) throw badRequest(`${row.name} is inactive. Activate it first.`);
  if (!(direction === 'payin' ? row.supports_payin : row.supports_payout)) {
    throw badRequest(`${row.name} does not support ${DIRECTION_LABEL[direction]}`);
  }
  const from = getSetting(SETTING[direction], '');
  if (from !== row.code) {
    setSetting(SETTING[direction], row.code);
    log(req, 'masters.pg_switch', { direction, from, to: row.code });
  }
  res.json({ ok: true, activePayin: getSetting(SETTING.payin, ''), activePayout: getSetting(SETTING.payout, '') });
});
