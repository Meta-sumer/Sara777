import AsyncStorage from '@react-native-async-storage/async-storage';

export const TOKEN_KEY = 'app.token';

/** Set EXPO_PUBLIC_API_URL in mobile/.env to your machine's LAN address. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Body = Record<string, unknown> | undefined;

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Network error — check your internet or the API address', 0);
  }

  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // the host (not our API) answered with plain text / HTML, e.g. 429 or 503
      const message =
        res.status === 429
          ? 'Too many requests right now. Please wait a minute and try again.'
          : res.status >= 500
            ? 'Server is starting up or busy. Please try again in a minute.'
            : 'Something went wrong';
      throw new ApiError(message, res.status);
    }
  }
  if (!res.ok) {
    throw new ApiError(String(data.message ?? 'Something went wrong'), res.status);
  }
  return data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string, body?: Body) => request<T>('POST', path, body),
  patch: <T,>(path: string, body?: Body) => request<T>('PATCH', path, body),
};

/* ------------------------------------------------------------------- types */

export interface User {
  id: number;
  name: string;
  mobile: string;
  balance: number;
  hasMpin: boolean;
  createdAt: string;
}

/** Market kinds: main bazaar markets, King Starline slots, and Andar Bahar draws. */
export type MarketKind = 'main' | 'starline' | 'andarbahar';

export interface Market {
  id: number;
  name: string;
  kind: MarketKind;
  openTime: string;
  closeTime: string;
  openTimeLabel: string;
  closeTimeLabel: string;
  /** main: open-session bids close · starline / andar bahar: bids open */
  openBidsLabel?: string;
  /** main: close-session bids close · starline / andar bahar: bids close */
  closeBidsLabel?: string;
  status: 'open_running' | 'close_running' | 'closed_today' | 'holiday';
  statusLabel: string;
  isPlayable: boolean;
  sessions: Array<'open' | 'close'>;
  result: string;
}

export interface GameTypeInfo {
  key: string;
  label: string;
  rate: number;
  sessions: Array<'open' | 'close'> | 'both';
}

export interface Bid {
  id: number;
  marketId: number;
  marketName: string;
  kind: string;
  gameType: string;
  gameLabel: string;
  session: 'open' | 'close';
  pick: string;
  amount: number;
  rate: number;
  status: 'pending' | 'won' | 'lost' | 'refunded';
  winAmount: number;
  bidDate: string;
  createdAt: string;
}

export interface PassbookEntry {
  id: number;
  type: string;
  amount: number;
  balanceAfter: number;
  particulars: string;
  note: string | null;
  createdAt: string;
}

export interface FundRequest {
  id: number;
  type: 'deposit' | 'withdraw';
  amount: number;
  method: string | null;
  status: 'pending' | 'approved' | 'rejected';
  /** exact stage: pending / approved / completed (paid) / failed (processing) / rejected */
  stage?: string;
  /** label for the stage: Pending, Approved, Paid, Processing, Declined */
  statusLabel?: string;
  payoutMode?: 'bank' | 'paytm' | null;
  payoutRef?: string | null;
  completedAt?: string | null;
  utr: string | null;
  proofUrl: string | null;
  remark: string | null;
  createdAt: string;
}

export interface BankDetails {
  id: number;
  holderName: string;
  accountNo: string;
  ifsc: string;
  bankName: string;
  paytm: string;
  phonepe: string;
  gpay: string;
  createdAt: string;
}

export interface PaymentDetails {
  upiId: string;
  upiName: string;
  upiNumber: string;
  qrUrl: string | null;
  note: string;
  requireProof: boolean;
  autoApprove: boolean;
}

export interface NoticeSection {
  title: string;
  description: string;
  contact: string;
}

export interface HowToPlay {
  title: string;
  description: string;
  videoUrl: string;
}

export interface WithdrawStatus {
  open: boolean;
  message: string;
  dayName: string;
  minWithdraw: number;
}

export interface AppSettings {
  appName: string;
  /** Andar Bahar switched on from the admin panel */
  andarBaharEnabled?: boolean;
  whatsappNumber: string;
  supportName: string;
  marquee: string;
  notice: string;
  shareText: string;
  videos: Array<{ title: string; url: string }>;
  minDeposit: number;
  minWithdraw: number;
  payment: PaymentDetails;
  /** login popup text; shown again whenever newsUpdatedAt changes */
  news?: string;
  newsUpdatedAt?: string | null;
  howToPlay?: HowToPlay;
  noticeBoard?: NoticeSection[];
  /** note shown where users edit bank details */
  profileNote?: string;
  /** numbers to contact for wallet updates */
  walletContacts?: string[];
}

/** Turn a server path like `/uploads/qr-1.png` into a URL the app can load. */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return API_URL.replace(/\/api\/?$/, '') + path;
}

export interface ResultRowItem {
  date: string;
  openPanna: string | null;
  openDigit: string | null;
  closePanna: string | null;
  closeDigit: string | null;
  jodi: string | null;
  display: string;
}

export interface Paged<T> {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

/* ---------------------------------------------------------------- helpers */

/** Coins with Indian grouping; rates like 9.5x can leave .5 amounts. */
export function formatCoins(n: number) {
  return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/** Payout per 10 points, e.g. rate 9.5 → "95". */
export function payoutFor10(rate: number) {
  return String(Math.round(rate * 10 * 100) / 100);
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (x: number) => String(x).padStart(2, '0');
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 === 0 ? 12 : h % 12;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}\n${pad(h)}:${pad(d.getMinutes())}:${pad(
    d.getSeconds(),
  )} ${ampm}`;
}

export function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}
