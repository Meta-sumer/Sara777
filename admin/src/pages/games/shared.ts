/* Types, labels and helpers shared by the Games / Starline / Andar Bahar pages.
   One component serves all three kinds; the API lives at /api/admin/games. */

export type GameKind = 'main' | 'starline' | 'andarbahar';
export type Session = 'open' | 'close';

/** permission prefix per kind (server/src/permissions.ts) */
export const PERM: Record<GameKind, string> = { main: 'games', starline: 'starline', andarbahar: 'andarbahar' };

export const TEXT: Record<
  GameKind,
  { provider: string; settings: string; settingsCard: string; rates: string; result: string; resultCard: string }
> = {
  main: {
    provider: 'Game Provider',
    settings: 'Game Settings',
    settingsCard: 'Game Settings',
    rates: 'Game Rates',
    result: 'Game Result',
    resultCard: 'Game Result',
  },
  starline: {
    provider: 'Star Game Provider',
    settings: 'Star Game Settings',
    settingsCard: 'Starline Game Settings',
    rates: 'Star Game Rates',
    result: 'Star Game Result',
    resultCard: 'Starline Game Result',
  },
  andarbahar: {
    provider: 'AB Game Provider',
    settings: 'AB Game Settings',
    settingsCard: 'AB Game Settings',
    rates: 'AB Game Rates',
    result: 'AB Game Result',
    resultCard: 'Andar Bahar Game Result',
  },
};

export interface DayTimes {
  day: number;
  dayName: string;
  openBetTime: string;
  closeBetTime: string;
  openResultTime: string;
  closeResultTime: string | null;
  isClosed: boolean;
}

export interface Provider {
  id: number;
  name: string;
  kind: GameKind;
  isActive: boolean;
  sortOrder: number;
  openTime: string;
  closeTime: string;
  today: DayTimes;
  status: string;
  statusLabel: string;
  result: string;
  bids: number;
}

export interface ProvidersResponse {
  kind: GameKind;
  date: string;
  enabled: boolean;
  providers: Provider[];
}

export interface RateRow {
  kind: GameKind;
  key: string;
  label: string;
  rate: number;
  isActive: boolean;
  sortOrder: number;
}

export interface BidCounts {
  pending: number;
  pendingAmount: number;
  won: number;
  lost: number;
  refunded: number;
}

export interface ResultLine {
  marketId: number;
  marketName: string;
  kind: GameKind;
  session: Session;
  resultDate: string;
  value: string;
  digit: string | null;
  display: string;
  fullResult: string;
  declaredAt: string | null;
  declaredBy: string | null;
  settledAt: string | null;
  status: 'pending' | 'settled' | 'empty';
  bids: BidCounts;
  winners: number;
  winAmount: number;
  unpaid: number;
  unpaidAmount: number;
  closeDeclared: boolean;
}

export interface WinnerRow {
  bidId: number;
  userId: number;
  userName: string;
  username: string;
  mobile: string;
  gameType: string;
  gameLabel: string;
  session: Session;
  pick: string;
  amount: number;
  rate: number;
  winAmount: number;
  paid: boolean;
  createdAt: string;
}

export interface WinnersResponse {
  market: { id: number; name: string; kind: GameKind };
  date: string;
  session: Session;
  declared: boolean;
  result: string;
  settledAt: string | null;
  bids: BidCounts;
  winners: WinnerRow[];
  totals: { winners: number; bidAmount: number; winAmount: number; unpaid: number; unpaidAmount: number };
}

/** Ank of a panna: last digit of the sum of its three digits ("123" → "6"). */
export function pannaDigit(panna: string): string {
  if (!/^\d{3}$/.test(panna)) return '';
  return String(panna.split('').reduce((s, d) => s + Number(d), 0) % 10);
}

export function pannaKind(panna: string): string {
  if (!/^\d{3}$/.test(panna)) return '';
  const uniq = new Set(panna.split('')).size;
  return uniq === 3 ? 'Single Panna' : uniq === 2 ? 'Double Panna' : 'Triple Panna';
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
