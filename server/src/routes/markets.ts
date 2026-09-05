import { Router } from 'express';
import { db } from '../db.js';
import {
  allowedSessions,
  formatTime12,
  marketStatus,
  todayStr,
} from '../game.js';
import { allRates } from '../rates.js';
import { type MarketRow, formatResult, getResult } from '../results.js';

export const marketsRouter = Router();

const STATUS_LABEL: Record<string, string> = {
  open_running: 'Betting is running',
  close_running: 'Betting is running',
  closed_today: 'Closed for Today',
  holiday: 'Holiday',
};

function serialize(m: MarketRow, date: string) {
  const status = marketStatus(m.open_time, m.close_time, m.days);
  const sessions = m.kind === 'starline'
    ? (status === 'open_running' ? ['open'] : [])
    : allowedSessions(status);
  const result = getResult(m.id, date);

  return {
    id: m.id,
    name: m.name,
    kind: m.kind,
    openTime: m.open_time,
    closeTime: m.close_time,
    openTimeLabel: formatTime12(m.open_time),
    closeTimeLabel: formatTime12(m.close_time),
    days: m.days.split(',').map(Number),
    status,
    statusLabel: STATUS_LABEL[status],
    isPlayable: sessions.length > 0,
    sessions,
    result: formatResult(result, m.kind),
    resultParts: result
      ? {
          openPanna: result.open_panna,
          openDigit: result.open_digit,
          closePanna: result.close_panna,
          closeDigit: result.close_digit,
        }
      : null,
  };
}

marketsRouter.get('/', (req, res) => {
  const kind = req.query.kind === 'starline' ? 'starline' : 'main';
  const date = todayStr();
  const markets = db
    .prepare('SELECT * FROM markets WHERE kind = ? AND is_active = 1 ORDER BY sort_order, id')
    .all(kind) as unknown as MarketRow[];
  res.json({ date, markets: markets.map((m) => serialize(m, date)) });
});

marketsRouter.get('/game-types', (req, res) => {
  const kind = req.query.kind === 'starline' ? 'starline' : 'main';
  res.json({
    gameTypes: allRates()
      .filter((g) => g.isActive && g.kinds.includes(kind))
      .map((g) => ({ key: g.key, label: g.label, rate: g.rate, sessions: g.sessions })),
  });
});

marketsRouter.get('/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM markets WHERE id = ?').get(Number(req.params.id)) as MarketRow | undefined;
  if (!m) return res.status(404).json({ message: 'Market not found' });
  res.json({ market: serialize(m, todayStr()) });
});

/** Result history for one market — powers the chart / result-history screens. */
marketsRouter.get('/:id/results', (req, res) => {
  const id = Number(req.params.id);
  const limit = Math.min(Number(req.query.limit ?? 60), 400);
  const m = db.prepare('SELECT * FROM markets WHERE id = ?').get(id) as MarketRow | undefined;
  if (!m) return res.status(404).json({ message: 'Market not found' });

  const rows = db
    .prepare('SELECT * FROM results WHERE market_id = ? ORDER BY result_date DESC LIMIT ?')
    .all(id, limit) as Array<{
      result_date: string;
      open_panna: string | null;
      open_digit: string | null;
      close_panna: string | null;
      close_digit: string | null;
    }>;

  res.json({
    market: { id: m.id, name: m.name, kind: m.kind },
    results: rows.map((r) => ({
      date: r.result_date,
      openPanna: r.open_panna,
      openDigit: r.open_digit,
      closePanna: r.close_panna,
      closeDigit: r.close_digit,
      jodi: r.open_digit && r.close_digit ? `${r.open_digit}${r.close_digit}` : null,
      display: formatResult(r, m.kind),
    })),
  });
});

/** All markets' results for one day — the "Game Result" history screen. */
marketsRouter.get('/results/by-date', (req, res) => {
  const date = String(req.query.date ?? todayStr());
  const kind = req.query.kind === 'starline' ? 'starline' : 'main';
  const markets = db
    .prepare('SELECT * FROM markets WHERE kind = ? AND is_active = 1 ORDER BY sort_order, id')
    .all(kind) as unknown as MarketRow[];

  res.json({
    date,
    results: markets.map((m) => {
      const r = getResult(m.id, date);
      return {
        marketId: m.id,
        marketName: m.name,
        openTimeLabel: formatTime12(m.open_time),
        closeTimeLabel: formatTime12(m.close_time),
        display: formatResult(r, m.kind),
      };
    }),
  });
});
