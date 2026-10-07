export type Kind = 'main' | 'starline' | 'andarbahar';
export type Session = 'open' | 'close';

export const KINDS: Kind[] = ['main', 'starline', 'andarbahar'];

export function parseKind(value: unknown, fallback: Kind = 'main'): Kind {
  return KINDS.includes(value as Kind) ? (value as Kind) : fallback;
}

export type GameTypeKey =
  | 'single_digit'
  | 'jodi_digit'
  | 'red_bracket'
  | 'single_panna'
  | 'double_panna'
  | 'triple_panna'
  | 'half_sangam'
  | 'full_sangam'
  | 'ab_jodi';

export interface GameTypeDef {
  key: GameTypeKey;
  label: string;
  /** default payout multiplier per market kind: win = amount * rate */
  rates: Partial<Record<Kind, number>>;
  /** sessions this game can be placed in ('both' = needs open+close result) */
  sessions: Session[] | 'both';
  /** seeded switched off (the app has no input screen for it yet) */
  defaultOff?: boolean;
}

/**
 * Default rates follow the reference panel: main market single digit pays
 * 9.5x and jodi 95x, Starline pays 10 / 160 / 320 / 1000, Andar Bahar jodi 100x.
 * Admins change them on the Game Rates pages; bids keep the rate they were placed at.
 */
export const GAME_TYPES: GameTypeDef[] = [
  { key: 'single_digit', label: 'Single Digit', rates: { main: 9.5, starline: 10 }, sessions: ['open', 'close'] },
  { key: 'jodi_digit', label: 'Jodi Digit', rates: { main: 95 }, sessions: 'both' },
  { key: 'red_bracket', label: 'Red Brackets', rates: { main: 95 }, sessions: 'both', defaultOff: true },
  { key: 'single_panna', label: 'Single Panna', rates: { main: 150, starline: 160 }, sessions: ['open', 'close'] },
  { key: 'double_panna', label: 'Double Panna', rates: { main: 300, starline: 320 }, sessions: ['open', 'close'] },
  { key: 'triple_panna', label: 'Triple Panna', rates: { main: 900, starline: 1000 }, sessions: ['open', 'close'] },
  { key: 'half_sangam', label: 'Half Sangam', rates: { main: 1000 }, sessions: 'both' },
  { key: 'full_sangam', label: 'Full Sangam', rates: { main: 10000 }, sessions: 'both' },
  { key: 'ab_jodi', label: 'Jodi', rates: { andarbahar: 100 }, sessions: ['open'] },
];

export function gameType(key: string): GameTypeDef | undefined {
  return GAME_TYPES.find((g) => g.key === key);
}

/** kinds a game type can be offered for */
export function kindsOf(def: GameTypeDef): Kind[] {
  return Object.keys(def.rates) as Kind[];
}

/** game types that are decided by the close result (placed with session 'open') */
export const BOTH_SESSION_TYPES: GameTypeKey[] = GAME_TYPES.filter((g) => g.sessions === 'both').map((g) => g.key);

/** game types that count as "Pana" in profit/loss summaries */
export const PANNA_TYPES: GameTypeKey[] = ['single_panna', 'double_panna', 'triple_panna'];

/** Jodis played as "Red Brackets": both digits equal or five apart. */
export const RED_JODIS = Array.from({ length: 100 }, (_, n) => String(n).padStart(2, '0')).filter((j) => {
  const a = Number(j[0]);
  const b = Number(j[1]);
  return a === b || Math.abs(a - b) === 5;
});

/* ------------------------------------------------------------------ pannas */

function digitsOf(p: string) {
  return p.split('').map(Number);
}

export function pannaDigit(panna: string): string {
  return String(digitsOf(panna).reduce((a, b) => a + b, 0) % 10);
}

/** Matka order of digits inside a panna: ascending, with 0 counted as 10 (so 190, 550, 000). */
const PANNA_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

/**
 * Write a 3-digit panna in standard matka order ("321" → "123", "019" → "190").
 * Picks and declared results are stored this way, so any typed order matches.
 */
export function canonPanna(p: string): string {
  if (!/^\d{3}$/.test(p)) return p;
  return p
    .split('')
    .map(Number)
    .sort((x, y) => PANNA_ORDER.indexOf(x) - PANNA_ORDER.indexOf(y))
    .join('');
}

/** A pick in its stored form: pannas (also inside sangams) in standard order. */
export function normalizePick(type: GameTypeKey, pick: string): string {
  switch (type) {
    case 'single_panna':
    case 'double_panna':
    case 'triple_panna':
      return canonPanna(pick);
    case 'half_sangam':
    case 'full_sangam':
      return pick
        .split('-')
        .map((part) => canonPanna(part))
        .join('-');
    default:
      return pick;
  }
}

function buildPannas() {
  const single: string[] = [];
  const double: string[] = [];
  const triple: string[] = [];
  for (let i = 0; i < 10; i++) {
    for (let j = i; j < 10; j++) {
      for (let k = j; k < 10; k++) {
        const [a, b, c] = [PANNA_ORDER[i], PANNA_ORDER[j], PANNA_ORDER[k]];
        const p = String(a) + String(b) + String(c);
        const uniq = new Set([a, b, c]).size;
        if (uniq === 3) single.push(p);
        else if (uniq === 2) double.push(p);
        else triple.push(p);
      }
    }
  }
  return { single, double, triple };
}

const PANNAS = buildPannas();

export const SINGLE_PANNAS = PANNAS.single;
export const DOUBLE_PANNAS = PANNAS.double;
export const TRIPLE_PANNAS = PANNAS.triple;
export const ALL_PANNAS = [...PANNAS.single, ...PANNAS.double, ...PANNAS.triple];

export function pannaType(panna: string): 'single' | 'double' | 'triple' {
  const uniq = new Set(digitsOf(panna)).size;
  return uniq === 3 ? 'single' : uniq === 2 ? 'double' : 'triple';
}

/** pannas whose ank equals `digit` */
export function pannasForDigit(digit: number, type: 'single' | 'double' | 'triple' = 'single') {
  const list = type === 'single' ? SINGLE_PANNAS : type === 'double' ? DOUBLE_PANNAS : TRIPLE_PANNAS;
  return list.filter((p) => Number(pannaDigit(p)) === digit);
}

/* --------------------------------------------------------------- validation */

const RE = {
  digit: /^[0-9]$/,
  jodi: /^[0-9]{2}$/,
  panna: /^[0-9]{3}$/,
};

/** Returns null when the pick is valid, else an error message. */
export function validatePick(type: GameTypeKey, pick: string): string | null {
  switch (type) {
    case 'single_digit':
      return RE.digit.test(pick) ? null : 'Single digit must be 0-9';
    case 'jodi_digit':
      return RE.jodi.test(pick) ? null : 'Jodi must be two digits (00-99)';
    case 'red_bracket':
      return RED_JODIS.includes(pick) ? null : `Red bracket must be one of ${RED_JODIS.join(', ')}`;
    case 'ab_jodi':
      return RE.jodi.test(pick) ? null : 'Andar Bahar number must be two digits (00-99)';
    case 'single_panna':
      return RE.panna.test(pick) && pannaType(pick) === 'single' ? null : 'Invalid single panna';
    case 'double_panna':
      return RE.panna.test(pick) && pannaType(pick) === 'double' ? null : 'Invalid double panna';
    case 'triple_panna':
      return RE.panna.test(pick) && pannaType(pick) === 'triple' ? null : 'Invalid triple panna';
    case 'half_sangam': {
      const [a, b] = pick.split('-');
      if (!a || !b) return 'Half sangam format: 123-4 or 1-234';
      if (RE.panna.test(a) && RE.digit.test(b)) return null;
      if (RE.digit.test(a) && RE.panna.test(b)) return null;
      return 'Half sangam format: 123-4 or 1-234';
    }
    case 'full_sangam': {
      const [a, b] = pick.split('-');
      return a && b && RE.panna.test(a) && RE.panna.test(b) ? null : 'Full sangam format: 123-456';
    }
    default:
      return 'Unknown game type';
  }
}

/* -------------------------------------------------------------- settlement */

function samePanna(a: string, b: string | null | undefined): boolean {
  return !!b && canonPanna(a) === canonPanna(b);
}

export interface ResultRow {
  open_panna: string | null;
  open_digit: string | null;
  close_panna: string | null;
  close_digit: string | null;
  /** Andar Bahar: the declared two-digit number */
  number?: string | null;
}

/**
 * Decide a bid against a declared result.
 * `null` means the part of the result this bid needs is not declared yet,
 * so the bid stays pending.
 */
export function isWinner(
  type: GameTypeKey,
  session: Session | 'both',
  pick: string,
  r: ResultRow,
): boolean | null {
  const openReady = !!r.open_panna && !!r.open_digit;
  const closeReady = !!r.close_panna && !!r.close_digit;

  switch (type) {
    case 'single_digit':
      if (session === 'open') return openReady ? pick === r.open_digit : null;
      return closeReady ? pick === r.close_digit : null;

    // pannas compare in standard order, so older rows stored as typed still match
    case 'single_panna':
    case 'double_panna':
    case 'triple_panna':
      if (session === 'open') return openReady ? samePanna(pick, r.open_panna) : null;
      return closeReady ? samePanna(pick, r.close_panna) : null;

    case 'jodi_digit':
    case 'red_bracket':
      if (!openReady || !closeReady) return null;
      return pick === String(r.open_digit) + String(r.close_digit);

    case 'ab_jodi':
      return r.number ? pick === r.number : null;

    case 'half_sangam': {
      if (!openReady || !closeReady) return null;
      const [a, b] = pick.split('-');
      if (a.length === 3) return samePanna(a, r.open_panna) && b === r.close_digit;
      return a === r.open_digit && samePanna(b, r.close_panna);
    }

    case 'full_sangam': {
      if (!openReady || !closeReady) return null;
      const [a, b] = pick.split('-');
      return samePanna(a, r.open_panna) && samePanna(b, r.close_panna);
    }

    default:
      return false;
  }
}

/* ------------------------------------------------------------ market timing */

/** minutes since midnight for "HH:MM" */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** "HH:MM" for minutes since midnight, wrapped into one day */
export function fromMinutes(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

export function formatTime12(hhmm: string | null | undefined): string {
  if (!hhmm) return '--';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return String(hh).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' ' + ampm;
}

export type MarketStatus = 'closed_today' | 'open_running' | 'close_running' | 'holiday';

export function randomPanna(): string {
  return ALL_PANNAS[Math.floor(Math.random() * ALL_PANNAS.length)];
}

export function randomJodi(): string {
  return String(Math.floor(Math.random() * 100)).padStart(2, '0');
}

export function todayStr(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** YYYY-MM-DD shifted by `days` */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayStr(d);
}
