import { db } from './db.js';
import { GAME_TYPES, type GameTypeDef, type GameTypeKey, type Kind, gameType, kindsOf } from './game.js';

export interface RateRow {
  kind: Kind;
  key: GameTypeKey;
  label: string;
  rate: number;
  isActive: boolean;
  sortOrder: number;
  sessions: GameTypeDef['sessions'];
}

interface DbRate {
  kind: Kind;
  key: GameTypeKey;
  label: string;
  rate: number;
  is_active: number;
  sort_order: number;
}

/** Seed the per-kind rate table from the built-in defaults (missing rows only). */
export function ensureRates() {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO rates (kind, key, label, rate, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
  );
  GAME_TYPES.forEach((g, i) => {
    for (const kind of kindsOf(g)) insert.run(kind, g.key, g.label, g.rates[kind]!, g.defaultOff ? 0 : 1, i);
  });
}

function toRow(r: DbRate): RateRow {
  return {
    kind: r.kind,
    key: r.key,
    label: r.label,
    rate: Number(r.rate),
    isActive: !!r.is_active,
    sortOrder: r.sort_order,
    sessions: gameType(r.key)?.sessions ?? ['open'],
  };
}

/** Every game offered for a kind (or all kinds), with its current rate and on/off state. */
export function allRates(kind?: Kind): RateRow[] {
  const rows = kind
    ? db.prepare('SELECT * FROM rates WHERE kind = ? ORDER BY sort_order, key').all(kind)
    : db.prepare('SELECT * FROM rates ORDER BY kind, sort_order, key').all();
  return (rows as unknown as DbRate[]).filter((r) => gameType(r.key)).map(toRow);
}

/** Rate for one game of a kind, or null when it is not offered or switched off. */
export function activeRate(kind: Kind, key: string): RateRow | null {
  const row = db.prepare('SELECT * FROM rates WHERE kind = ? AND key = ?').get(kind, key) as unknown as
    | DbRate
    | undefined;
  if (!row || !row.is_active || !gameType(row.key)) return null;
  return toRow(row);
}

/** Update a game's rate / label / on-off for a kind. Rates may have decimals (9.5). */
export function setRate(kind: Kind, key: string, patch: { rate?: number; label?: string; isActive?: boolean }) {
  const def = gameType(key);
  if (!def || !kindsOf(def).includes(kind)) return false;
  const current = db.prepare('SELECT * FROM rates WHERE kind = ? AND key = ?').get(kind, key) as unknown as
    | DbRate
    | undefined;
  const rate = patch.rate ?? current?.rate ?? def.rates[kind]!;
  if (!Number.isFinite(rate) || rate <= 0) return false;
  db.prepare(
    `INSERT INTO rates (kind, key, label, rate, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, key) DO UPDATE SET label = excluded.label, rate = excluded.rate, is_active = excluded.is_active`,
  ).run(
    kind,
    key,
    (patch.label ?? current?.label ?? def.label).trim() || def.label,
    Math.round(rate * 100) / 100,
    (patch.isActive ?? (current ? !!current.is_active : true)) ? 1 : 0,
    current?.sort_order ?? GAME_TYPES.indexOf(def),
  );
  return true;
}

/** Stop offering a game for a kind ("Delete" on the rates list). */
export function removeRate(kind: Kind, key: string) {
  return db.prepare('DELETE FROM rates WHERE kind = ? AND key = ?').run(kind, key).changes > 0;
}

/** Game types a kind can offer that currently have no row ("Add New Game" choices). */
export function missingRates(kind: Kind): Array<{ key: GameTypeKey; label: string; defaultRate: number }> {
  const have = new Set(allRates(kind).map((r) => r.key));
  return GAME_TYPES.filter((g) => kindsOf(g).includes(kind) && !have.has(g.key)).map((g) => ({
    key: g.key,
    label: g.label,
    defaultRate: g.rates[kind]!,
  }));
}
