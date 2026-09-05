import { db, getSetting, nowIso, setSetting } from './db.js';
import { pannaDigit, randomPanna, todayStr } from './game.js';
import { ensureRates } from './rates.js';

const MAIN_MARKETS: Array<[name: string, open: string, close: string]> = [
  ['RADHA MORNING', '09:00', '10:00'],
  ['TATA MORNING', '10:00', '11:00'],
  ['LATA MORNING', '10:50', '11:50'],
  ['MADHUR MORNING', '11:35', '12:35'],
  ['MILAN MORNING', '12:10', '13:10'],
  ['SRIDEVI DAY', '13:15', '14:15'],
  ['KALYAN', '16:00', '18:00'],
  ['MILAN DAY', '15:15', '17:15'],
  ['RAJDHANI DAY', '15:20', '17:20'],
  ['SRIDEVI NIGHT', '19:00', '20:00'],
  ['MILAN NIGHT', '21:00', '23:00'],
  ['RAJDHANI NIGHT', '21:30', '23:45'],
  ['MAIN BAZAR', '21:35', '23:59'],
];

/** King Starline runs a single-result game roughly every hour. */
const STARLINE_MARKETS: Array<[name: string, time: string]> = [
  ['KING STARLINE 10:00 AM', '10:00'],
  ['KING STARLINE 11:00 AM', '11:00'],
  ['KING STARLINE 12:00 PM', '12:00'],
  ['KING STARLINE 01:00 PM', '13:00'],
  ['KING STARLINE 02:00 PM', '14:00'],
  ['KING STARLINE 03:00 PM', '15:00'],
  ['KING STARLINE 04:00 PM', '16:00'],
  ['KING STARLINE 05:00 PM', '17:00'],
  ['KING STARLINE 06:00 PM', '18:00'],
  ['KING STARLINE 07:00 PM', '19:00'],
  ['KING STARLINE 08:00 PM', '20:00'],
  ['KING STARLINE 09:00 PM', '21:00'],
];

const DEFAULT_SETTINGS: Record<string, string> = {
  app_name: 'Rama777',
  support_name: 'Rama777 Support',
  whatsapp_number: '919999999999',
  marquee: 'Beware of fake applications',
  notice:
    'This app uses virtual coins only. Coins have no real-world value and cannot be exchanged for money.\n\n' +
    '1. Bids once placed cannot be cancelled.\n' +
    '2. Results are published right after the market close time.\n' +
    '3. Winnings are credited to your wallet automatically.\n' +
    '4. For any help use the support chat.',
  share_text: 'Play daily games on Rama777 — install now!',
  videos: JSON.stringify([
    { title: 'How to play', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    { title: 'How to add coins', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  ]),
  // deposits wait in the admin queue by default; flip to '1' in the admin panel
  // to credit coins instantly
  auto_approve_deposit: '0',
  require_deposit_proof: '1',
  upi_id: 'rama777@upi',
  upi_name: 'Rama777',
  upi_number: '9999999999',
  deposit_note:
    'Pay the exact amount to the UPI ID above, then enter the UTR / reference number and attach the payment screenshot. Coins are credited after the admin verifies your payment.',
};

function seedMarkets() {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM markets').get() as { c: number }).c;
  if (count > 0) return false;

  const insert = db.prepare(
    'INSERT INTO markets (name, kind, open_time, close_time, days, is_active, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)',
  );
  MAIN_MARKETS.forEach(([name, open, close], i) => {
    insert.run(name, 'main', open, close, '0,1,2,3,4,5,6', i);
  });
  STARLINE_MARKETS.forEach(([name, time], i) => {
    insert.run(name, 'starline', time, time, '0,1,2,3,4,5,6', i);
  });
  return true;
}

/** Backfill past results so the chart / history screens have data on day one. */
function seedHistory(days = 45) {
  const markets = db.prepare('SELECT id, kind FROM markets').all() as Array<{ id: number; kind: string }>;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO results (market_id, result_date, open_panna, open_digit, close_panna, close_digit)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  for (let back = days; back >= 1; back--) {
    const d = new Date();
    d.setDate(d.getDate() - back);
    const date = todayStr(d);
    for (const m of markets) {
      const op = randomPanna();
      if (m.kind === 'starline') {
        insert.run(m.id, date, op, pannaDigit(op), null, null);
      } else {
        const cp = randomPanna();
        insert.run(m.id, date, op, pannaDigit(op), cp, pannaDigit(cp));
      }
    }
  }
}

function seedSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!getSetting(key)) setSetting(key, value);
  }
}

function seedNotifications() {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id IS NULL').get() as { c: number }).c;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO notifications (user_id, title, body, created_at) VALUES (NULL, ?, ?, ?)');
  insert.run('Welcome', 'Thanks for installing. All games run on virtual coins.', nowIso());
  insert.run('King Starline', 'Starline games run every hour from 10 AM to 9 PM.', nowIso());
}

export function ensureSeed() {
  const fresh = seedMarkets();
  ensureRates();
  seedSettings();
  seedNotifications();
  if (fresh) {
    seedHistory();
    console.log('[seed] markets, settings and 45 days of results created');
  }
}

// allow `npm run seed`
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  ensureSeed();
  console.log('[seed] done');
}
