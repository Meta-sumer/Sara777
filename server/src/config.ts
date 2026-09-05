import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export const config = {
  port: Number(process.env.PORT ?? 4100),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  adminKey: process.env.ADMIN_KEY ?? 'admin123',
  adminUser: process.env.ADMIN_USER ?? 'admin',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'admin123',
  autoDeclare: (process.env.AUTO_DECLARE ?? '1') === '1',
  registerBonus: Number(process.env.REGISTER_BONUS ?? 1000),
  minBid: 10,
  maxBid: 10000,
};
