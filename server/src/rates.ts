import { db } from './db.js';
import { GAME_TYPES, type GameTypeDef, type GameTypeKey, type Kind } from './game.js';

export interface RateRow {
  key: GameTypeKey;
  label: string;
  rate: number;
  isActive: boolean;
  kinds: Kind[];
  sessions: GameTypeDef['sessions'];
}

/** Seed the editable rate table from the built-in defaults (once). */
export function ensureRates() {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO game_rates (key, label, rate, is_active) VALUES (?, ?, ?, 1)',
  );
  for (const g of GAME_TYPES) insert.run(g.key, g.label, g.rate);
}

function rowMap() {
  const rows = db.prepare('SELECT * FROM game_rates').all() as unknown as Array<{
    key: string;
    label: string;
    rate: number;
    is_active: number;
  }>;
  return new Map(rows.map((r) => [r.key, r]));
}

/** Every game with its current (admin-editable) rate and on/off state. */
export function allRates(): RateRow[] {
  const map = rowMap();
  return GAME_TYPES.map((g) => {
    const row = map.get(g.key);
    return {
      key: g.key,
      label: row?.label ?? g.label,
      rate: row?.rate ?? g.rate,
      isActive: row ? !!row.is_active : true,
      kinds: g.kinds,
      sessions: g.sessions,
    };
  });
}

/** Rate for one game, or null when the admin has switched it off. */
export function activeRate(key: string): RateRow | null {
  const found = allRates().find((r) => r.key === key);
  if (!found || !found.isActive) return null;
  return found;
}

export function setRate(key: string, rate: number, isActive: boolean) {
  const known = GAME_TYPES.find((g) => g.key === key);
  if (!known) return false;
  db.prepare(
    `INSERT INTO game_rates (key, label, rate, is_active) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET rate = excluded.rate, is_active = excluded.is_active`,
  ).run(key, known.label, Math.max(1, Math.floor(rate)), isActive ? 1 : 0);
  return true;
}
