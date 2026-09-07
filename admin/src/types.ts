/* Shapes the admin API returns.
 *
 * The API is not consistent about casing — list endpoints built for the panel
 * return camelCase, while the ones that hand back raw rows return the column
 * names. These types follow whatever each endpoint actually sends.
 */

export type Kind = 'main' | 'starline';
export type Session = 'open' | 'close';

/* ------------------------------------------------------------------ stats */

export interface Stats {
  date: string;
  autoDeclare: boolean;
  users: { total: number; active: number; blocked: number; newToday: number; balance: number };
  bids: { today: number; todayAmount: number; todayPayout: number; pending: number; total: number };
  funds: { pendingDeposits: number; pendingWithdraws: number; depositedToday: number };
  markets: Array<{
    id: number;
    name: string;
    kind: string;
    status: string;
    result: string;
    bids: number;
    amount: number;
    payout: number;
  }>;
}

/* ---------------------------------------------------------------- markets */

export interface AdminMarket {
  id: number;
  name: string;
  kind: Kind;
  openTime: string;
  closeTime: string;
  days: string;
  isActive: boolean | number;
  status: string;
  result: string;
}

/* ---------------------------------------------------------------- results */

export interface ResultLine {
  marketId: number;
  name: string;
  kind: Kind;
  openTimeLabel: string;
  closeTimeLabel: string;
  openPanna: string | null;
  closePanna: string | null;
  display: string;
  pendingBids: number;
}

export interface ExposureRow {
  game_type: string;
  session: string;
  pick: string;
  bids: number;
  amount: number;
  liability: number;
}

/* ------------------------------------------------------------------- bids */

export interface BidRow {
  id: number;
  userId: number;
  userName: string;
  userMobile: string;
  marketName: string;
  gameType: string;
  session: string;
  pick: string;
  amount: number;
  rate: number;
  status: string;
  winAmount: number | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ users */

export interface UserRow {
  id: number;
  name: string;
  mobile: string;
  balance: number;
  isActive: boolean | number;
  createdAt: string;
}

export interface UserDetail {
  user: UserRow;
  bank: {
    holder_name?: string;
    bank_name?: string;
    account_no?: string;
    ifsc?: string;
    paytm?: string;
    phonepe?: string;
    gpay?: string;
  } | null;
  bids: Array<{
    id: number;
    market_name: string;
    game_type: string;
    pick: string;
    amount: number;
    status: string;
    win_amount: number | null;
  }>;
  transactions: Array<{
    id: number;
    created_at: string;
    particulars: string;
    amount: number;
    balance_after: number;
  }>;
}

/* ---------------------------------------------------------- fund requests */

export interface FundRequestRow {
  id: number;
  user_name: string;
  user_mobile: string;
  user_balance: number;
  type: 'deposit' | 'withdraw';
  amount: number;
  utr: string | null;
  proof_url: string | null;
  status: string;
  remark: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ rates */

export interface GameRate {
  key: string;
  label: string;
  kinds: string[];
  rate: number;
  isActive: boolean;
}

/* ---------------------------------------------------- notifications, etc. */

export interface Notification {
  id: number;
  user_id: number | null;
  user_mobile?: string;
  title: string;
  body: string;
  created_at: string;
}

export interface SupportThreadRow {
  user_id: number;
  name: string;
  mobile: string;
  last_text: string;
  last_at: string;
}

export interface SupportMessage {
  id: number;
  sender: 'user' | 'support';
  text: string;
  created_at: string;
}

export interface Idea {
  id: number;
  user_name: string;
  user_mobile: string;
  text: string;
  created_at: string;
}

export interface LogRow {
  id: number;
  action: string;
  detail: string;
  created_at: string;
}

export type SettingsMap = Record<string, string>;
