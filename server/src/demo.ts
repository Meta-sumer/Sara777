/* Demo data: users, payout details, deposits, withdrawals, admin adjustments,
 * and two weeks of bids settled against the seeded results — enough for every
 * admin report, wallet page and profit/loss screen to show real numbers.
 *
 *   npm run seed:demo         add demo data to the current database (once)
 *   DEMO_DATA=1 npm run dev   add it automatically when the database is fresh
 *
 * Demo users all have the password "demo1234". A demo employee "ravi1"
 * (password "ravi@1234") is created with an Operations Manager permission set.
 */
import bcrypt from 'bcryptjs';
import { db, getSetting, setSetting, tx } from './db.js';
import {
  ALL_PANNAS,
  DOUBLE_PANNAS,
  type GameTypeKey,
  type Kind,
  type Session,
  SINGLE_PANNAS,
  TRIPLE_PANNAS,
  addDays,
  isWinner,

  todayStr,
  toMinutes,
} from './game.js';
import { activeRate } from './rates.js';
import { type MarketRow, ensureAllSchedules, getSchedule } from './schedule.js';
import type { StoredResult } from './results.js';
import { normalizePermissions } from './permissions.js';

/* -------------------------------------------------------------- randomness */

let seed = 777;
function rnd() {
  // small deterministic PRNG so every demo database looks the same
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = <T,>(list: T[]): T => list[Math.floor(rnd() * list.length)];
const between = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));
const chance = (p: number) => rnd() < p;

const FIRST = [
  'Rahul', 'Amit', 'Suresh', 'Ramesh', 'Vijay', 'Sunil', 'Anil', 'Rajesh', 'Santosh', 'Manoj', 'Deepak', 'Sanjay',
  'Ravi', 'Ajay', 'Vikas', 'Prakash', 'Mahesh', 'Ganesh', 'Dinesh', 'Naresh', 'Pooja', 'Sunita', 'Kavita', 'Rekha',
  'Imran', 'Salman', 'Arif', 'Sameer', 'Kiran', 'Srinivas', 'Venkatesh', 'Murali', 'Harish', 'Gopal', 'Mukesh',
];
const LAST = [
  'Sharma', 'Verma', 'Patil', 'Yadav', 'Kumar', 'Singh', 'Gupta', 'Jadhav', 'Shinde', 'Pawar', 'Reddy', 'Naidu',
  'Khan', 'Shaikh', 'More', 'Gaikwad', 'Chavan', 'Mishra', 'Pandey', 'Rao', 'Joshi', 'Kale',
];
const DEVICES = [
  'Xiaomi M2101K6I', 'Redmi Note 10', 'Samsung SM-A515F', 'vivo 1904', 'OPPO CPH2269', 'realme RMX3085',
  'OnePlus IN2011', 'POCO M2010J19CI', 'Samsung SM-M315F', 'Infinix X682C', 'motorola moto g(60)',
];
const BANKS: Array<[name: string, ifscPrefix: string]> = [
  ['State Bank of India', 'SBIN'],
  ['HDFC Bank', 'HDFC'],
  ['ICICI Bank', 'ICIC'],
  ['Bank of Baroda', 'BARB'],
  ['Punjab National Bank', 'PUNB'],
  ['Kotak Mahindra Bank', 'KKBK'],
  ['Axis Bank', 'UTIB'],
  ['Union Bank of India', 'UBIN'],
];
const CITIES = ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Hyderabad', 'Kurnool', 'Bengaluru', 'Indore', 'Surat', 'Jaipur'];

/* ------------------------------------------------------------------ ledger */

interface DemoUser {
  id: number;
  name: string;
  username: string;
  balance: number;
}

const money = (n: number) => Math.round(n * 100) / 100;

/** A timestamp on `date` at `minutes` past midnight — never later than a minute ago. */
function isoAt(date: string, minutes: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setMinutes(minutes, between(0, 59));
  return new Date(Math.min(d.getTime(), Date.now() - 60_000)).toISOString();
}

export function seedDemo() {
  if (getSetting('demo_seeded') === '1') {
    console.log('[demo] already seeded — skipping');
    return;
  }
  ensureAllSchedules();

  tx(() => {
    const insTxn = db.prepare(
      `INSERT INTO transactions (user_id, type, amount, balance_after, particulars, note, added_by, mode, ref, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const ledger = (
      u: DemoUser,
      type: string,
      delta: number,
      particulars: string,
      note: string,
      at: string,
      addedBy = 'Auto',
      mode: string | null = null,
      ref: string | null = null,
    ) => {
      u.balance = money(u.balance + delta);
      insTxn.run(u.id, type, money(delta), u.balance, particulars, note, addedBy, mode, ref, at);
    };

    /* ---------------------------------------------------------- users */
    const today = todayStr();
    const passwordHash = bcrypt.hashSync('demo1234', 8);
    const insUser = db.prepare(
      `INSERT INTO users (name, username, mobile, password_hash, balance, is_active, device_name, device_id,
                          last_login_at, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?)`,
    );
    const insBank = db.prepare(
      `INSERT INTO banks (user_id, holder_name, account_no, ifsc, bank_name, paytm, phonepe, gpay, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const users: DemoUser[] = [];
    const banks = new Map<number, Record<string, string>>();
    const sharedAccounts = ['50100368380001', '30881313660002', '62373013470003'];
    const COUNT = 90;

    for (let i = 0; i < COUNT; i++) {
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      const mobile = String(between(6, 9)) + String(100000000 + Math.floor(rnd() * 899999999)).slice(0, 9);
      if (db.prepare('SELECT 1 FROM users WHERE mobile = ? OR username = ?').get(mobile, mobile)) continue;
      // a few users pick a handle instead of their mobile as username
      const username = chance(0.35) ? `${name.split(' ')[0].toLowerCase()}${between(10, 9999)}` : mobile;
      if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) continue;
      // most joined during the last two months, a handful today / yesterday
      const joinedBack = i < 6 ? 0 : i < 10 ? 1 : between(2, 60);
      const joined = addDays(today, -joinedBack);
      const createdAt = isoAt(joined, between(8 * 60, 22 * 60));
      const seenBack = Math.min(joinedBack, between(0, 6));
      const seenAt = isoAt(addDays(today, -seenBack), between(8 * 60, 21 * 60));
      const deviceId = Array.from({ length: 16 }, () => '0123456789abcdef'[between(0, 15)]).join('');
      const id = Number(
        insUser.run(name, username, mobile, passwordHash, pick(DEVICES), deviceId, seenAt, seenAt, createdAt)
          .lastInsertRowid,
      );
      const u: DemoUser = { id, name, username, balance: 0 };
      users.push(u);

      ledger(u, 'bonus', 50, 'Register Bonus', 'Welcome bonus credited', createdAt, 'Auto', 'Bonus');

      // payout details (and sometimes an older set, for Bank History / Search Account)
      if (chance(0.8)) {
        const [bankName, ifscPrefix] = pick(BANKS);
        const accountNo = i % 23 === 0 ? pick(sharedAccounts) : String(between(1000000000, 9999999999)) + String(between(10, 9999));
        const bank = {
          holder: name,
          accountNo,
          ifsc: `${ifscPrefix}0${String(between(1000, 999999)).padStart(6, '0')}`,
          bankName: `${bankName} ${pick(CITIES).toUpperCase()}`,
          paytm: chance(0.5) ? mobile : '',
        };
        if (chance(0.2)) {
          const [oldBank, oldPrefix] = pick(BANKS);
          insBank.run(
            id,
            name,
            String(between(1000000000, 9999999999)),
            `${oldPrefix}0${String(between(1000, 999999)).padStart(6, '0')}`,
            `${oldBank} ${pick(CITIES).toUpperCase()}`,
            '',
            '',
            '',
            isoAt(addDays(joined, 1), between(600, 1200)),
          );
        }
        insBank.run(id, bank.holder, bank.accountNo, bank.ifsc, bank.bankName, bank.paytm, '', '', isoAt(addDays(joined, Math.min(2, joinedBack)), between(600, 1300)));
        banks.set(id, bank);
      }
    }

    /* ------------------------------------------------- deposits & adjust */
    const insFund = db.prepare(
      `INSERT INTO fund_requests (user_id, type, amount, method, status, remark, utr, created_at, updated_at,
                                  attempts, processed_by, completed_at, payout_mode, bank_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    interface Ev {
      at: string;
      run: () => void;
    }
    const events: Ev[] = [];
    let cursor = 0;
    /** queue an event that happens later than the one running now */
    const later = (ev: Ev) => {
      let lo = cursor + 1;
      let hi = events.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (events[mid].at <= ev.at) lo = mid + 1;
        else hi = mid;
      }
      events.splice(lo, 0, ev);
    };

    for (const u of users) {
      const joined = (db.prepare('SELECT created_at FROM users WHERE id = ?').get(u.id) as { created_at: string })
        .created_at;
      const joinedDate = todayStr(new Date(joined));
      const daysActive = Math.max(0, Math.round((Date.parse(`${today}T00:00:00`) - Date.parse(`${joinedDate}T00:00:00`)) / 864e5));
      const deposits = chance(0.15) ? 0 : between(1, 5);
      for (let d = 0; d < deposits; d++) {
        const date = addDays(joinedDate, Math.min(daysActive, between(0, Math.max(0, daysActive))));
        const at = isoAt(date, between(7 * 60, 23 * 60));
        const amount = pick([200, 300, 500, 500, 1000, 1000, 1500, 2000, 2500, 5000, 10000]);
        const utr = String(between(100000000, 999999999)) + String(between(100, 999));
        const status = date === today && chance(0.4) ? 'pending' : chance(0.08) ? 'rejected' : 'approved';
        events.push({
          at,
          run: () => {
            const reqId = Number(
              insFund.run(u.id, 'deposit', amount, 'upi', status, status === 'rejected' ? 'Payment not received' : null, utr, at, at, 0, status === 'pending' ? null : 'Auto', null, null, null).lastInsertRowid,
            );
            if (status === 'approved') {
              ledger(u, 'deposit', amount, 'Coins added', `${amount} added to wallet by IP, Transaction id : FUUPIU${utr}`, at, 'Auto', 'IP', `FUUPIU${utr}`);
            }
            void reqId;
          },
        });
      }
      if (chance(0.15)) {
        const date = addDays(today, -between(0, Math.min(20, daysActive)));
        const at = isoAt(date, between(9 * 60, 21 * 60));
        const amount = pick([100, 200, 500, 1000]);
        events.push({
          at,
          run: () => ledger(u, 'adjust', amount, 'Coins credited by admin', 'Bonus / manual add', at, chance(0.5) ? 'admin' : 'ravi1', 'Cash'),
        });
      }
    }

    /* --------------------------------------------------------------- bids */
    const markets = db.prepare('SELECT * FROM markets WHERE is_active = 1').all() as unknown as MarketRow[];
    const insBid = db.prepare(
      `INSERT INTO bids (user_id, market_id, market_name, kind, game_type, session, pick, amount, rate, status,
                         win_amount, bid_date, created_at, settled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const resultOf = (marketId: number, date: string) =>
      db.prepare('SELECT * FROM results WHERE market_id = ? AND result_date = ?').get(marketId, date) as unknown as
        | StoredResult
        | undefined;

    const mainTypes: GameTypeKey[] = ['single_digit', 'single_digit', 'single_digit', 'jodi_digit', 'jodi_digit', 'single_panna', 'single_panna', 'double_panna', 'triple_panna', 'half_sangam', 'full_sangam'];
    const starTypes: GameTypeKey[] = ['single_digit', 'single_digit', 'single_panna', 'double_panna', 'triple_panna'];
    const pickFor = (type: GameTypeKey): string => {
      switch (type) {
        case 'single_digit':
          return String(between(0, 9));
        case 'jodi_digit':
        case 'ab_jodi':
          return String(between(0, 99)).padStart(2, '0');
        case 'single_panna':
          return pick(SINGLE_PANNAS);
        case 'double_panna':
          return pick(DOUBLE_PANNAS);
        case 'triple_panna':
          return pick(TRIPLE_PANNAS);
        case 'half_sangam':
          return chance(0.5) ? `${pick(ALL_PANNAS)}-${between(0, 9)}` : `${between(0, 9)}-${pick(ALL_PANNAS)}`;
        case 'full_sangam':
          return `${pick(ALL_PANNAS)}-${pick(ALL_PANNAS)}`;
        default:
          return '0';
      }
    };

    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    const activeUsers = users.filter(() => chance(0.85));
    for (let back = 14; back >= 0; back--) {
      const date = addDays(today, -back);
      const weekday = new Date(`${date}T12:00:00`).getDay();
      for (const u of activeUsers) {
        const joinedDate = todayStr(
          new Date((db.prepare('SELECT created_at FROM users WHERE id = ?').get(u.id) as { created_at: string }).created_at),
        );
        if (joinedDate > date) continue;
        const bidsToday = chance(0.55) ? between(1, 6) : 0;
        for (let b = 0; b < bidsToday; b++) {
          const market = pick(markets);
          const kind = market.kind as Kind;
          const s = getSchedule(market, weekday);
          if (s.is_closed) continue;
          const type: GameTypeKey = kind === 'andarbahar' ? 'ab_jodi' : kind === 'starline' ? pick(starTypes) : pick(mainTypes);
          const rate = activeRate(kind, type);
          if (!rate) continue;
          const both = type === 'jodi_digit' || type === 'half_sangam' || type === 'full_sangam';
          const session: Session = kind !== 'main' || both ? 'open' : chance(0.5) ? 'open' : 'close';
          const cutoff = toMinutes(kind === 'main' ? (session === 'open' ? s.open_bet_time : s.close_bet_time) : s.close_bet_time);
          const start = kind === 'main' ? 6 * 60 : Math.max(toMinutes(s.open_bet_time), 6 * 60);
          let latest = cutoff - 1;
          if (back === 0) latest = Math.min(latest, nowMins - 1);
          if (latest <= start) continue;
          const at = isoAt(date, between(start, latest));
          const amount = pick([10, 10, 20, 20, 50, 50, 100, 100, 200, 500]);
          const thePick = pickFor(type);
          events.push({
            at,
            run: () => {
              if (u.balance < amount) return;
              const result = resultOf(market.id, date);
              const verdict = result ? isWinner(type, session, thePick, result) : null;
              // results declared later today are settled by the live scheduler
              const settle = verdict !== null && back > 0;
              const winAmount = settle && verdict ? money(amount * rate.rate) : 0;
              const resultAt = isoAt(date, Math.min(1439, toMinutes(session === 'close' && s.close_result_time ? s.close_result_time : s.open_result_time) + 2));
              const bidId = Number(
                insBid.run(u.id, market.id, market.name, kind, type, session, thePick, amount, rate.rate, settle ? (verdict ? 'won' : 'lost') : 'pending', winAmount, date, at, settle ? resultAt : null).lastInsertRowid,
              );
              ledger(u, 'bid', -amount, `${market.name} bid`, `${market.name} (${rate.label}, ${session === 'open' ? 'Open' : 'Close'}): ${thePick}`, at, 'Self', null, `bid:${bidId}`);
              if (settle && verdict) {
                later({
                  at: resultAt,
                  run: () =>
                    ledger(u, 'win', winAmount, `${market.name} winning`, `Amount added to wallet for ${market.name} (${rate.label} Game Win: ${thePick})`, resultAt, pick(['Auto', 'admin', 'ravi1']), null, `bid:${bidId}`),
                });
              }
            },
          });
        }
      }
    }

    /* -------------------------------------------------------- withdrawals */
    for (const u of users) {
      const bank = banks.get(u.id);
      if (!bank || chance(0.35)) continue;
      const n = between(1, 3);
      for (let k = 0; k < n; k++) {
        const back = between(0, 12);
        const date = addDays(today, -back);
        const at = isoAt(date, between(9 * 60, 22 * 60));
        events.push({
          at,
          run: () => {
            const amount = Math.floor(Math.min(u.balance, pick([500, 800, 1000, 1500, 2000, 3000, 5000])) / 100) * 100;
            if (amount < 500) return;
            const status = back === 0 ? 'pending' : pick(['completed', 'completed', 'completed', 'approved', 'rejected', 'failed', 'pending']);
            const mode = bank.paytm && chance(0.3) ? 'paytm' : 'bank';
            const reqId = Number(
              insFund.run(
                u.id, 'withdraw', amount, mode, status,
                status === 'rejected' ? 'Bank details mismatch' : status === 'failed' ? 'Payout failed at gateway' : null,
                null, at, at,
                status === 'failed' ? 1 : status === 'completed' ? 1 : 0,
                status === 'pending' ? null : pick(['admin', 'ravi1']),
                status === 'completed' ? at : null,
                mode,
                JSON.stringify({ holderName: bank.holder, accountNo: bank.accountNo, ifsc: bank.ifsc, bankName: bank.bankName, paytm: bank.paytm }),
              ).lastInsertRowid,
            );
            ledger(u, 'withdraw', -amount, 'Withdraw request', `Request #${reqId} on hold`, at, 'Self', mode === 'paytm' ? 'Paytm' : 'Bank', `wd:${reqId}`);
            if (status === 'rejected') {
              ledger(u, 'refund', amount, 'Withdraw rejected', `Request #${reqId} rejected`, at, 'admin', null, `wd:${reqId}`);
            }
          },
        });
      }
    }

    // apply everything in time order so balances are consistent; winnings are
    // follow-up events inserted at their result time
    events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    for (cursor = 0; cursor < events.length; cursor++) events[cursor].run();

    for (const u of users) db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(u.balance, u.id);

    /* --------------------------------------------- blocked / deleted users */
    const zero = users.filter((u) => u.balance === 0);
    for (const u of users.slice(-4)) db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(u.id);
    for (const u of zero.slice(0, 3)) {
      db.prepare(
        `UPDATE users SET is_deleted = 1, deleted_at = ?, delete_reason = 'Wallet Balance 0 Since Last 7 Days' WHERE id = ?`,
      ).run(new Date().toISOString(), u.id);
    }

    /* ------------------------------------------------------------ employee */
    if (!db.prepare('SELECT 1 FROM admins WHERE username = ?').get('ravi1')) {
      const perms = normalizePermissions([
        'dashboard', 'users', 'games.provider', 'games.setting', 'games.rates', 'games.result',
        'starline.provider', 'starline.setting', 'starline.rates', 'starline.pnl', 'starline.result',
        'andarbahar.provider', 'andarbahar.setting', 'andarbahar.rates', 'andarbahar.pnl', 'andarbahar.result',
        'bookie.oc', 'bookie.cutting', 'bookie.final', 'wallet.fund_request', 'wallet.view', 'wallet.search_account',
        'wallet.bank_history', 'approved_debit.bank', 'approved_debit.paytm', 'declined', 'reports.sales',
        'reports.jodi_all', 'reports.starline_sales', 'reports.total_bids', 'reports.bidding', 'notification', 'news',
      ]);
      db.prepare(
        `INSERT INTO admins (username, name, password_hash, role, permissions, login_permission, created_at)
         VALUES (?, ?, ?, ?, ?, 'both', ?)`,
      ).run('ravi1', 'Ravi', bcrypt.hashSync('ravi@1234', 10), 'Operations Manager', JSON.stringify(perms), new Date().toISOString());
    }

    setSetting('demo_seeded', '1');
    console.log(`[demo] ${users.length} users, ${(db.prepare('SELECT COUNT(*) AS c FROM bids').get() as { c: number }).c} bids seeded`);
  });
}

// allow `npm run seed:demo`
if (process.argv[1] && /demo\.(ts|js)$/.test(process.argv[1])) {
  const { ensureSeed } = await import('./seed.js');
  ensureSeed();
  seedDemo();
}

