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
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
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

export interface Market {
  id: number;
  name: string;
  kind: 'main' | 'starline';
  openTime: string;
  closeTime: string;
  openTimeLabel: string;
  closeTimeLabel: string;
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

export interface AppSettings {
  appName: string;
  whatsappNumber: string;
  supportName: string;
  marquee: string;
  notice: string;
  shareText: string;
  videos: Array<{ title: string; url: string }>;
  minDeposit: number;
  minWithdraw: number;
  payment: PaymentDetails;
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

export function formatCoins(n: number) {
  return n.toLocaleString('en-IN');
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
