export type Kind = 'main' | 'starline';
export type Session = 'open' | 'close';

export type GameTypeKey =
  | 'single_digit'
  | 'jodi_digit'
  | 'single_panna'
  | 'double_panna'
  | 'triple_panna'
  | 'half_sangam'
  | 'full_sangam';

export interface GameTypeDef {
  key: GameTypeKey;
  label: string;
  /** payout multiplier: win = amount * rate */
  rate: number;
  kinds: Kind[];
  /** sessions this game can be placed in ('both' = needs open+close result) */
  sessions: Session[] | 'both';
}

export const GAME_TYPES: GameTypeDef[] = [
  { key: 'single_digit', label: 'Single Digit', rate: 10, kinds: ['main', 'starline'], sessions: ['open', 'close'] },
  { key: 'jodi_digit', label: 'Jodi Digit', rate: 100, kinds: ['main'], sessions: 'both' },
  { key: 'single_panna', label: 'Single Panna', rate: 150, kinds: ['main', 'starline'], sessions: ['open', 'close'] },
  { key: 'double_panna', label: 'Double Panna', rate: 300, kinds: ['main', 'starline'], sessions: ['open', 'close'] },
  { key: 'triple_panna', label: 'Triple Panna', rate: 900, kinds: ['main', 'starline'], sessions: ['open', 'close'] },
  { key: 'half_sangam', label: 'Half Sangam', rate: 1000, kinds: ['main'], sessions: 'both' },
  { key: 'full_sangam', label: 'Full Sangam', rate: 10000, kinds: ['main'], sessions: 'both' },
];

export function gameType(key: string): GameTypeDef | undefined {
  return GAME_TYPES.find((g) => g.key === key);
}

/* ------------------------------------------------------------------ pannas */

function digitsOf(p: string) {
  return p.split('').map(Number);
}

export function pannaDigit(panna: string): string {
  return String(digitsOf(panna).reduce((a, b) => a + b, 0) % 10);
}

function buildPannas() {
  const single: string[] = [];
  const double: string[] = [];
  const triple: string[] = [];
  for (let a = 0; a <= 9; a++) {
    for (let b = a; b <= 9; b++) {
      for (let c = b; c <= 9; c++) {
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

export interface ResultRow {
  open_panna: string | null;
  open_digit: string | null;
  close_panna: string | null;
  close_digit: string | null;
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

    case 'single_panna':
    case 'double_panna':
    case 'triple_panna':
      if (session === 'open') return openReady ? pick === r.open_panna : null;
      return closeReady ? pick === r.close_panna : null;

    case 'jodi_digit':
      if (!openReady || !closeReady) return null;
      return pick === String(r.open_digit) + String(r.close_digit);

    case 'half_sangam': {
      if (!openReady || !closeReady) return null;
      const [a, b] = pick.split('-');
      if (a.length === 3) return a === r.open_panna && b === r.close_digit;
      return a === r.open_digit && b === r.close_panna;
    }

    case 'full_sangam': {
      if (!openReady || !closeReady) return null;
      const [a, b] = pick.split('-');
      return a === r.open_panna && b === r.close_panna;
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

export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return String(hh).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' ' + ampm;
}

export type MarketStatus = 'closed_today' | 'open_running' | 'close_running' | 'holiday';

export function marketStatus(
  openTime: string,
  closeTime: string,
  days: string,
  now = new Date(),
): MarketStatus {
  const allowed = days.split(',').map((d) => Number(d.trim()));
  if (!allowed.includes(now.getDay())) return 'holiday';
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < toMinutes(openTime)) return 'open_running';
  if (mins < toMinutes(closeTime)) return 'close_running';
  return 'closed_today';
}

/** sessions that still accept bids for a given status */
export function allowedSessions(status: MarketStatus): Session[] {
  if (status === 'open_running') return ['open', 'close'];
  if (status === 'close_running') return ['close'];
  return [];
}

export function randomPanna(): string {
  return ALL_PANNAS[Math.floor(Math.random() * ALL_PANNAS.length)];
}

export function todayStr(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
