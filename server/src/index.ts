import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import './db.js';
import { authRouter } from './routes/auth.js';
import { marketsRouter } from './routes/markets.js';
import { bidsRouter } from './routes/bids.js';
import { walletRouter } from './routes/wallet.js';
import { miscRouter } from './routes/misc.js';
import { adminRouter } from './routes/admin.js';
import { startScheduler } from './results.js';
import { ensureSeed } from './seed.js';
import { uploadsDir } from './uploads.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/auth', authRouter);
app.use('/api/markets', marketsRouter);
app.use('/api/bids', bidsRouter);
app.use('/api/wallet', walletRouter);
app.use('/api', miscRouter);
app.use('/api/admin', adminRouter);

// user-uploaded payment screenshots and the UPI QR
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

// admin panel — top-level admin/ folder, static, no build step (http://localhost:PORT/admin)
const adminDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../admin');
app.use('/admin', express.static(adminDir));
app.get('/', (_req, res) => res.redirect('/admin'));

app.use((_req, res) => res.status(404).json({ message: 'Route not found' }));

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ message: err.message || 'Something went wrong' });
});

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

ensureSeed();
startScheduler();

app.listen(config.port, () => {
  console.log(`\n  Matka API running`);
  console.log(`  local   http://localhost:${config.port}/api`);
  console.log(`  lan     http://${lanAddress()}:${config.port}/api`);
  console.log(`  admin   http://localhost:${config.port}/admin`);
  console.log(`  put the lan url in mobile/.env as EXPO_PUBLIC_API_URL\n`);
});
