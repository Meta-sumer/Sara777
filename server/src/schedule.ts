/* Weekly market timetable ("Games Setting" / "Star Game Setting" / "AB Game Setting").
 *
 * Every market has one market_schedule row per weekday. The markets table keeps
 * open_time / close_time as the defaults a new timetable is built from.
 *
 *   main        open_bet_time    open-session bets close (OBT)
 *               close_bet_time   close-session bets close (CBT)
 *               open_result_time open result is published (OBRT)
 *               close_result_time close result is published (CBRT)
 *   starline /  open_bet_time    betting opens (OBT)
 *   andarbahar  close_bet_time   betting closes (CBT)
 *               open_result_time the single result (RSLT)
 */
import { db, getSetting } from './db.js';
import {
  type Kind,
  type MarketStatus,
  type Session,
  formatTime12,
  fromMinutes,
  toMinutes,
  todayStr,
} from './game.js';

export interface MarketRow {
  id: number;
  name: string;
  kind: Kind;
  open_time: string;
  close_time: string;
  days: string;
  is_active: number;
  sort_order: number;
}

export interface ScheduleRow {
  market_id: number;
  day: number;
  open_bet_time: string;
  close_bet_time: string;
  open_result_time: string;
  close_result_time: string | null;
  is_closed: number;
}

export type ScheduleTimes = Omit<ScheduleRow, 'market_id' | 'day'>;

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** minutes main-market bets close before each result */
export const MAIN_BET_CUTOFF = 10;
/** minutes starline / andar bahar bets close before the result */
export const SLOT_BET_CUTOFF = 5;

/**
 * Timetable a market starts with, built from its default times.
 * `opensAt` is when a starline / andar bahar slot starts taking bets
 * (the previous slot's result + 1 minute); it defaults to 00:01.
 */
export function defaultTimes(kind: Kind, openTime: string, closeTime: string, opensAt = '00:01'): ScheduleTimes {
  if (kind === 'main') {
    return {
      open_bet_time: fromMinutes(toMinutes(openTime) - MAIN_BET_CUTOFF),
      close_bet_time: fromMinutes(toMinutes(closeTime) - MAIN_BET_CUTOFF),
      open_result_time: openTime,
      close_result_time: closeTime,
      is_closed: 0,
    };
  }
  return {
    open_bet_time: opensAt,
    close_bet_time: fromMinutes(toMinutes(openTime) - SLOT_BET_CUTOFF),
    open_result_time: openTime,
    close_result_time: null,
    is_closed: 0,
  };
}

const upsert = () =>
  db.prepare(
    `INSERT INTO market_schedule
       (market_id, day, open_bet_time, close_bet_time, open_result_time, close_result_time, is_closed)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(market_id, day) DO UPDATE SET
       open_bet_time = excluded.open_bet_time,
       close_bet_time = excluded.close_bet_time,
       open_result_time = excluded.open_result_time,
       close_result_time = excluded.close_result_time,
       is_closed = excluded.is_closed`,
  );

/** Write one weekday's times. */
export function setSchedule(marketId: number, day: number, t: ScheduleTimes) {
  upsert().run(
    marketId,
    day,
    t.open_bet_time,
    t.close_bet_time,
    t.open_result_time,
    t.close_result_time,
    t.is_closed ? 1 : 0,
  );
}

/** Create the seven weekday rows for a market that has none (missing days only). */
export function ensureSchedule(m: MarketRow, opensAt?: string) {
  const have = new Set(
    (db.prepare('SELECT day FROM market_schedule WHERE market_id = ?').all(m.id) as Array<{ day: number }>).map(
      (r) => r.day,
    ),
  );
  if (have.size === 7) return;
  const runningDays = m.days.split(',').map((d) => Number(d.trim()));
  const base = defaultTimes(m.kind, m.open_time, m.close_time, opensAt);
  for (let day = 0; day < 7; day++) {
    if (have.has(day)) continue;
    setSchedule(m.id, day, { ...base, is_closed: runningDays.includes(day) ? 0 : 1 });
  }
}

/**
 * When a new starline / andar bahar slot starts taking bets: one minute after
 * the result of the slot before it (same kind, by result time), or 00:01.
 */
export function slotOpensAt(kind: Kind, resultTime: string, excludeId = 0): string {
  const prev = db
    .prepare('SELECT MAX(open_time) AS t FROM markets WHERE kind = ? AND open_time < ? AND id != ?')
    .get(kind, resultTime, excludeId) as { t: string | null } | undefined;
  return prev?.t ? fromMinutes(toMinutes(prev.t) + 1) : '00:01';
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Check one day's times before saving them. Returns an error message or null.
 *   main        OBT ≤ OBRT ≤ CBT ≤ CBRT, and OBT before CBT
 *   starline /  OBT (betting opens) < CBT (betting closes) ≤ RSLT
 *   andarbahar
 * A timetable never crosses midnight: marketState compares minutes of one day.
 */
export function checkTimes(kind: Kind, t: ScheduleTimes): string | null {
  const named: Array<[string, string | null]> =
    kind === 'main'
      ? [
          ['OBT (open bets close)', t.open_bet_time],
          ['OBRT (open result)', t.open_result_time],
          ['CBT (close bets close)', t.close_bet_time],
          ['CBRT (close result)', t.close_result_time],
        ]
      : [
          ['OBT (betting opens)', t.open_bet_time],
          ['CBT (betting closes)', t.close_bet_time],
          ['RSLT (result)', t.open_result_time],
        ];
  for (const [label, value] of named) {
    if (!value || !HHMM.test(value)) return `${label} must be a time in HH:MM (24 hour) format`;
  }
  const m = (v: string | null) => toMinutes(v ?? '00:00');
  if (kind === 'main') {
    if (m(t.open_bet_time) > m(t.open_result_time)) return 'OBT (open bets close) must be at or before OBRT (open result)';
    if (m(t.open_result_time) > m(t.close_bet_time)) return 'OBRT (open result) must be at or before CBT (close bets close)';
    if (m(t.close_bet_time) > m(t.close_result_time)) return 'CBT (close bets close) must be at or before CBRT (close result)';
    if (m(t.open_bet_time) >= m(t.close_bet_time)) return 'OBT (open bets close) must be before CBT (close bets close)';
    return null;
  }
  if (m(t.open_bet_time) >= m(t.close_bet_time)) return 'OBT (betting opens) must be before CBT (betting closes)';
  if (m(t.close_bet_time) > m(t.open_result_time)) return 'CBT (betting closes) must be at or before RSLT (result)';
  return null;
}

/**
 * Give every market a timetable. Starline / andar bahar slots of the same kind
 * open one minute after the previous slot's result, like the reference panel.
 */
export function ensureAllSchedules() {
  const markets = db.prepare('SELECT * FROM markets ORDER BY kind, open_time').all() as unknown as MarketRow[];
  const lastResult: Partial<Record<Kind, string>> = {};
  for (const m of markets) {
    let opensAt: string | undefined;
    if (m.kind !== 'main') {
      const prev = lastResult[m.kind];
      opensAt = prev ? fromMinutes(toMinutes(prev) + 1) : '00:01';
      lastResult[m.kind] = m.open_time;
    }
    ensureSchedule(m, opensAt);
  }
}

export function getWeek(marketId: number): ScheduleRow[] {
  return db
    .prepare('SELECT * FROM market_schedule WHERE market_id = ? ORDER BY day')
    .all(marketId) as unknown as ScheduleRow[];
}

/** The timetable for one weekday, creating the market's rows if they are missing. */
export function getSchedule(m: MarketRow, day: number): ScheduleRow {
  const row = db
    .prepare('SELECT * FROM market_schedule WHERE market_id = ? AND day = ?')
    .get(m.id, day) as unknown as ScheduleRow | undefined;
  if (row) return row;
  ensureSchedule(m);
  return db
    .prepare('SELECT * FROM market_schedule WHERE market_id = ? AND day = ?')
    .get(m.id, day) as unknown as ScheduleRow;
}

export interface MarketState {
  status: MarketStatus;
  /** sessions that accept bids right now */
  sessions: Session[];
  /** text the app shows on the market card */
  label: string;
  schedule: ScheduleRow;
}

/** Whether Andar Bahar is switched on for the app (App Settings / AB Provider). */
export function andarBaharEnabled(): boolean {
  return getSetting('andarbahar_enabled', '1') === '1';
}

/** Which halves of today's result are already declared (a declared half takes no more bids). */
function declaredHalves(marketId: number, date: string) {
  const r = db
    .prepare('SELECT open_panna, close_panna, number FROM results WHERE market_id = ? AND result_date = ?')
    .get(marketId, date) as { open_panna: string | null; close_panna: string | null; number: string | null } | undefined;
  return { open: !!(r?.open_panna || r?.number), close: !!r?.close_panna };
}

/**
 * Live betting state of a market from today's timetable. A session whose
 * result was declared early (from the admin panel) stops taking bids too.
 */
export function marketState(m: MarketRow, now = new Date()): MarketState {
  const schedule = getSchedule(m, now.getDay());
  const mins = now.getHours() * 60 + now.getMinutes();

  if (schedule.is_closed || !m.is_active || (m.kind === 'andarbahar' && !andarBaharEnabled())) {
    return { status: 'holiday', sessions: [], label: 'Holiday', schedule };
  }

  const declared = declaredHalves(m.id, todayStr(now));

  if (m.kind === 'main') {
    if (mins < toMinutes(schedule.open_bet_time) && !declared.open) {
      return { status: 'open_running', sessions: ['open', 'close'], label: 'Betting is running', schedule };
    }
    if (mins < toMinutes(schedule.close_bet_time) && !declared.close) {
      return { status: 'close_running', sessions: ['close'], label: 'Betting is running', schedule };
    }
    return { status: 'closed_today', sessions: [], label: 'Closed for Today', schedule };
  }

  if (declared.open) {
    return { status: 'closed_today', sessions: [], label: 'Closed for Today', schedule };
  }
  if (mins < toMinutes(schedule.open_bet_time)) {
    return {
      status: 'closed_today',
      sessions: [],
      label: `Opens at ${formatTime12(schedule.open_bet_time)}`,
      schedule,
    };
  }
  if (mins < toMinutes(schedule.close_bet_time)) {
    return { status: 'open_running', sessions: ['open'], label: 'Betting is running', schedule };
  }
  return { status: 'closed_today', sessions: [], label: 'Closed for Today', schedule };
}

/** Result times shown in the app and admin for today's timetable. */
export function resultTimes(m: MarketRow, schedule: ScheduleRow) {
  const open = schedule.open_result_time;
  const close = m.kind === 'main' ? schedule.close_result_time ?? m.close_time : open;
  return { open, close, openLabel: formatTime12(open), closeLabel: formatTime12(close) };
}
