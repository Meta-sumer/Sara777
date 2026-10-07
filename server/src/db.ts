import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { tzOffsetMinutes } from './config.js';

const dataDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'matka.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  mpin_hash TEXT,
  balance INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS markets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  open_time TEXT NOT NULL,
  close_time TEXT NOT NULL,
  days TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id INTEGER NOT NULL REFERENCES markets(id),
  result_date TEXT NOT NULL,
  open_panna TEXT,
  open_digit TEXT,
  close_panna TEXT,
  close_digit TEXT,
  UNIQUE(market_id, result_date)
);

CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  market_id INTEGER NOT NULL REFERENCES markets(id),
  market_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  game_type TEXT NOT NULL,
  session TEXT NOT NULL,
  pick TEXT NOT NULL,
  amount INTEGER NOT NULL,
  rate INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  win_amount INTEGER NOT NULL DEFAULT 0,
  bid_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bids_user ON bids(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bids_settle ON bids(market_id, bid_date, status);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  particulars TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_txn_user ON transactions(user_id, id DESC);

CREATE TABLE IF NOT EXISTS fund_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  remark TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS banks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  holder_name TEXT,
  account_no TEXT,
  ifsc TEXT,
  bank_name TEXT,
  paytm TEXT,
  phonepe TEXT,
  gpay TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_rates (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  rate INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

/** Add a column to an existing table when a newer release needs one. */
function addColumnIfMissing(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

// payment proof captured alongside a deposit request
addColumnIfMissing('fund_requests', 'utr', 'utr TEXT');
addColumnIfMissing('fund_requests', 'proof_file', 'proof_file TEXT');

/* ------------------------------------------------- admin panel v2 schema */

db.exec(`
-- Weekly timetable per market. One row per weekday (0 = Sunday … 6 = Saturday).
--   main      open_bet_time    open-session bets close
--             close_bet_time   close-session bets close
--             open_result_time / close_result_time   when each half is published
--   starline  open_bet_time    betting opens
--   andarbahar close_bet_time  betting closes
--             open_result_time the single result (close_result_time is NULL)
CREATE TABLE IF NOT EXISTS market_schedule (
  market_id INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  open_bet_time TEXT NOT NULL,
  close_bet_time TEXT NOT NULL,
  open_result_time TEXT NOT NULL,
  close_result_time TEXT,
  is_closed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (market_id, day)
);

-- Payout multipliers per market kind. A missing row means the game is not
-- offered for that kind; is_active = 0 keeps it listed but switched off.
CREATE TABLE IF NOT EXISTS rates (
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  rate REAL NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, key)
);

-- Staff accounts. The super admin from ADMIN_USER/ADMIN_PASSWORD is not stored here.
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Employee',
  permissions TEXT NOT NULL DEFAULT '[]',
  login_permission TEXT NOT NULL DEFAULT 'both',
  is_blocked INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL
);

-- Withdraw requests can be switched off per weekday, with a message for the app.
CREATE TABLE IF NOT EXISTS withdraw_schedule (
  day INTEGER PRIMARY KEY,
  is_on INTEGER NOT NULL DEFAULT 1,
  message TEXT NOT NULL DEFAULT '',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS payment_gateways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  supports_payin INTEGER NOT NULL DEFAULT 1,
  supports_payout INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

-- End-of-day total of every wallet, for "Yesterday Wallet Balance".
CREATE TABLE IF NOT EXISTS wallet_snapshots (
  snap_date TEXT PRIMARY KEY,
  total_balance REAL NOT NULL,
  users INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`);

// users: app username, device, activity and soft delete
addColumnIfMissing('users', 'username', 'username TEXT');
addColumnIfMissing('users', 'device_name', 'device_name TEXT');
addColumnIfMissing('users', 'device_id', 'device_id TEXT');
addColumnIfMissing('users', 'last_login_at', 'last_login_at TEXT');
addColumnIfMissing('users', 'last_seen_at', 'last_seen_at TEXT');
addColumnIfMissing('users', 'is_deleted', 'is_deleted INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('users', 'deleted_at', 'deleted_at TEXT');
addColumnIfMissing('users', 'delete_reason', 'delete_reason TEXT');
db.exec(`UPDATE users SET username = mobile WHERE username IS NULL OR username = ''`);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)');

// results: Andar Bahar number, and who/when declared and settled each half
addColumnIfMissing('results', 'number', 'number TEXT');
addColumnIfMissing('results', 'open_declared_at', 'open_declared_at TEXT');
addColumnIfMissing('results', 'close_declared_at', 'close_declared_at TEXT');
addColumnIfMissing('results', 'open_settled_at', 'open_settled_at TEXT');
addColumnIfMissing('results', 'close_settled_at', 'close_settled_at TEXT');
addColumnIfMissing('results', 'declared_by', 'declared_by TEXT');

addColumnIfMissing('bids', 'settled_at', 'settled_at TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_bids_date ON bids(bid_date, kind)');

// transactions: audit trail ("Auto", "Self" or the admin username), particular and reference
addColumnIfMissing('transactions', 'added_by', `added_by TEXT NOT NULL DEFAULT 'Auto'`);
addColumnIfMissing('transactions', 'mode', 'mode TEXT');
addColumnIfMissing('transactions', 'ref', 'ref TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_txn_created ON transactions(created_at)');

// fund requests: withdraw processing
//   status: pending | approved | rejected | completed | failed
addColumnIfMissing('fund_requests', 'attempts', 'attempts INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('fund_requests', 'processed_by', 'processed_by TEXT');
addColumnIfMissing('fund_requests', 'completed_at', 'completed_at TEXT');
addColumnIfMissing('fund_requests', 'payout_mode', 'payout_mode TEXT');
addColumnIfMissing('fund_requests', 'bank_snapshot', 'bank_snapshot TEXT');
addColumnIfMissing('fund_requests', 'pg_status', 'pg_status TEXT');
addColumnIfMissing('fund_requests', 'pg_ref', 'pg_ref TEXT');

addColumnIfMissing('admin_log', 'admin', 'admin TEXT');
addColumnIfMissing('notifications', 'kind', `kind TEXT NOT NULL DEFAULT 'general'`);

export function nowIso() {
  return new Date().toISOString();
}

/**
 * SQL for the local calendar day (YYYY-MM-DD) of a stored UTC ISO timestamp.
 * Use it whenever a query filters or groups `created_at`-style columns by day:
 *   `WHERE ${localDate('t.created_at')} BETWEEN ? AND ?`
 */
export function localDate(column: string): string {
  return `date(${column}, '${tzOffsetMinutes >= 0 ? '+' : ''}${tzOffsetMinutes} minutes')`;
}

/** Same as localDate but keeps the time: 'YYYY-MM-DD HH:MM:SS' local. */
export function localDateTime(column: string): string {
  return `datetime(${column}, '${tzOffsetMinutes >= 0 ? '+' : ''}${tzOffsetMinutes} minutes')`;
}

type SqlParam = string | number | null;

/** First column of the first row as a number (COUNT / SUM helpers). */
export function scalar(sql: string, ...params: SqlParam[]): number {
  const row = db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
  if (!row) return 0;
  return Number(Object.values(row)[0] ?? 0);
}

export function all<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function get<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

let txDepth = 0;

/** Run `fn` inside a transaction; rolls back and rethrows on error. Nested calls join the outer one. */
export function tx<T>(fn: () => T): T {
  if (txDepth > 0) return fn();
  db.exec('BEGIN');
  txDepth += 1;
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    txDepth -= 1;
  }
}

export function getSetting(key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value?: string } | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}
