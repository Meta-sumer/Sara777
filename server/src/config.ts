import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// Market times, "today" and every report date are Indian time. Hosts such as
// Render run in UTC, so pin the zone before anything builds a Date.
if (!process.env.TZ) process.env.TZ = process.env.APP_TZ ?? 'Asia/Kolkata';

export const config = {
  port: Number(process.env.PORT ?? 4100),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  adminKey: process.env.ADMIN_KEY ?? 'admin123',
  adminUser: process.env.ADMIN_USER ?? 'admin',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'admin123',
  autoDeclare: (process.env.AUTO_DECLARE ?? '1') === '1',
  registerBonus: Number(process.env.REGISTER_BONUS ?? 1000),
  /** fill a fresh database with demo users, bids and payments on boot */
  demoData: process.env.DEMO_DATA === '1',
  minBid: 10,
  maxBid: 10000,
};

/**
 * Minutes to add to a stored UTC timestamp to get local time. Timestamps are
 * saved as UTC ISO strings, so SQL that groups or filters by local day uses
 * `localDate(column)` from db.ts, which applies this offset.
 */
export const tzOffsetMinutes = -new Date().getTimezoneOffset();
