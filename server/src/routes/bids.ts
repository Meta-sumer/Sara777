import { Router } from 'express';
import { config } from '../config.js';
import { db, nowIso } from '../db.js';
import { type AuthedRequest, requireAuth } from '../auth.js';
import { KINDS, type Kind, type Session, gameType, normalizePick, todayStr, validatePick } from '../game.js';
import { activeRate } from '../rates.js';
import { type MarketRow, marketState } from '../schedule.js';
import { BY_SELF, applyTxn } from '../wallet.js';

export const bidsRouter = Router();

interface Entry {
  pick: string;
  amount: number;
}

bidsRouter.post('/', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const marketId = Number(req.body?.marketId);
  const gameTypeKey = String(req.body?.gameType ?? '');
  const session = String(req.body?.session ?? 'open') as Session;
  const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];

  const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(marketId) as MarketRow | undefined;
  if (!market || !market.is_active) return res.status(404).json({ message: 'Market not available' });

  const def = gameType(gameTypeKey);
  if (!def || def.rates[market.kind] === undefined) {
    return res.status(400).json({ message: 'This game is not available for this market' });
  }

  // rate and on/off state are controlled per market kind from the admin panel
  const rateRow = activeRate(market.kind, def.key);
  if (!rateRow) return res.status(400).json({ message: `${def.label} is currently disabled` });

  // the weekly timetable decides which sessions still take bids
  const open = marketState(market).sessions;
  if (open.length === 0) return res.status(400).json({ message: 'Betting is closed for this market' });

  // Games that need both halves of the result must be placed before open time.
  const effectiveSession: Session = def.sessions === 'both' ? 'open' : session;
  if (def.sessions === 'both') {
    if (!open.includes('open')) {
      return res.status(400).json({ message: `${def.label} is closed, open time has passed` });
    }
  } else if (!open.includes(effectiveSession)) {
    return res.status(400).json({ message: `${effectiveSession === 'open' ? 'Open' : 'Close'} session is closed` });
  }

  if (rawEntries.length === 0) return res.status(400).json({ message: 'Add at least one bid' });
  if (rawEntries.length > 200) return res.status(400).json({ message: 'Too many bids in one submit' });

  const entries: Entry[] = [];
  for (const raw of rawEntries) {
    const pick = String(raw?.pick ?? '').trim();
    const amount = Math.floor(Number(raw?.amount));
    const pickError = validatePick(def.key, pick);
    if (pickError) return res.status(400).json({ message: `${pickError} (${pick || 'empty'})` });
    if (!Number.isFinite(amount) || amount < config.minBid) {
      return res.status(400).json({ message: `Minimum bid amount is ${config.minBid}` });
    }
    if (amount > config.maxBid) {
      return res.status(400).json({ message: `Maximum bid amount is ${config.maxBid}` });
    }
    // pannas are stored in standard matka order, so "321" and "123" are the same pick
    entries.push({ pick: normalizePick(def.key, pick), amount });
  }

  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  if (total > user.balance) {
    return res.status(400).json({ message: 'Insufficient balance, please add funds' });
  }

  const date = todayStr();
  const created = nowIso();

  db.exec('BEGIN');
  try {
    const insert = db.prepare(
      `INSERT INTO bids
       (user_id, market_id, market_name, kind, game_type, session, pick, amount, rate, status, bid_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    );
    for (const e of entries) {
      insert.run(
        user.id,
        market.id,
        market.name,
        market.kind,
        def.key,
        effectiveSession,
        e.pick,
        e.amount,
        rateRow.rate,
        date,
        created,
      );
      applyTxn({
        userId: user.id,
        type: 'bid',
        delta: -e.amount,
        particulars: `${market.name} bid`,
        note: `${market.name} (${def.label}, ${effectiveSession === 'open' ? 'Open' : 'Close'}): ${e.pick}`,
        addedBy: BY_SELF,
      });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const balance = (db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id) as { balance: number }).balance;
  res.status(201).json({
    ok: true,
    message: 'Bid placed successfully',
    count: entries.length,
    totalAmount: total,
    balance,
  });
});

bidsRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(Number(req.query.perPage ?? 20), 100);
  const kind = KINDS.includes(req.query.kind as Kind) ? String(req.query.kind) : null;
  const status = typeof req.query.status === 'string' ? req.query.status : null;

  const where: string[] = ['user_id = ?'];
  const params: Array<string | number> = [req.user!.id];
  if (kind) {
    where.push('kind = ?');
    params.push(kind);
  }
  if (status === 'settled') {
    where.push(`status IN ('won','lost')`);
  } else if (status) {
    where.push('status = ?');
    params.push(status);
  }
  const clause = where.join(' AND ');

  const total = (db.prepare(`SELECT COUNT(*) AS c FROM bids WHERE ${clause}`).get(...params) as { c: number }).c;
  const rows = db
    .prepare(`SELECT * FROM bids WHERE ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, perPage, (page - 1) * perPage);

  res.json({
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    bids: (rows as Array<Record<string, unknown>>).map((b) => ({
      id: b.id,
      marketId: b.market_id,
      marketName: b.market_name,
      kind: b.kind,
      gameType: b.game_type,
      gameLabel: gameType(String(b.game_type))?.label ?? b.game_type,
      session: b.session,
      pick: b.pick,
      amount: b.amount,
      rate: b.rate,
      status: b.status,
      winAmount: b.win_amount,
      bidDate: b.bid_date,
      createdAt: b.created_at,
    })),
  });
});
