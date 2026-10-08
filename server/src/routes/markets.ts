import { Router } from 'express';
import { db } from '../db.js';
import { formatTime12, parseKind, todayStr } from '../game.js';
import { allRates } from '../rates.js';
import { formatResult, getResult } from '../results.js';
import { type MarketRow, andarBaharEnabled, marketState, resultTimes } from '../schedule.js';

export const marketsRouter = Router();

function serialize(m: MarketRow, date: string) {
  const state = marketState(m);
  const times = resultTimes(m, state.schedule);
  const result = getResult(m.id, date);
  const runningDays = (
    db.prepare('SELECT day FROM market_schedule WHERE market_id = ? AND is_closed = 0 ORDER BY day').all(m.id) as Array<{
      day: number;
    }>
  ).map((r) => r.day);

  return {
    id: m.id,
    name: m.name,
    kind: m.kind,
    openTime: times.open,
    closeTime: times.close,
    openTimeLabel: times.openLabel,
    closeTimeLabel: times.closeLabel,
    // betting cut-offs from today's timetable
    //   main: open-session bids close / close-session bids close
    //   starline / andar bahar: bids open / bids close
    openBidsLabel: formatTime12(state.schedule.open_bet_time),
    closeBidsLabel: formatTime12(state.schedule.close_bet_time),
    days: runningDays,
    status: state.status,
    statusLabel: state.label,
    isPlayable: state.sessions.length > 0,
    sessions: state.sessions,
    result: formatResult(result, m.kind),
    resultParts: result
      ? {
          openPanna: result.open_panna,
          openDigit: result.open_digit,
          closePanna: result.close_panna,
          closeDigit: result.close_digit,
          number: result.number,
        }
      : null,
  };
}

function marketsOf(kind: string) {
  if (kind === 'andarbahar' && !andarBaharEnabled()) return [];
  return db
    .prepare('SELECT * FROM markets WHERE kind = ? AND is_active = 1 ORDER BY sort_order, id')
    .all(kind) as unknown as MarketRow[];
}

marketsRouter.get('/', (req, res) => {
  const kind = parseKind(req.query.kind);
  const date = todayStr();
  res.json({
    date,
    enabled: kind !== 'andarbahar' || andarBaharEnabled(),
    markets: marketsOf(kind).map((m) => serialize(m, date)),
  });
});

marketsRouter.get('/game-types', (req, res) => {
  const kind = parseKind(req.query.kind);
  res.json({
    gameTypes: allRates(kind)
      .filter((g) => g.isActive)
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
      number: string | null;
    }>;

  res.json({
    market: { id: m.id, name: m.name, kind: m.kind },
    results: rows.map((r) => ({
      date: r.result_date,
      openPanna: r.open_panna,
      openDigit: r.open_digit,
      closePanna: r.close_panna,
      closeDigit: r.close_digit,
      number: r.number,
      jodi: r.open_digit && r.close_digit ? `${r.open_digit}${r.close_digit}` : r.number,
      display: formatResult(r, m.kind),
    })),
  });
});

/** All markets' results for one day — the "Game Result" history screen. */
marketsRouter.get('/results/by-date', (req, res) => {
  const date = String(req.query.date ?? todayStr());
  const kind = parseKind(req.query.kind);
  const day = new Date(`${date}T12:00:00`).getDay();

  res.json({
    date,
    results: marketsOf(kind).map((m) => {
      const r = getResult(m.id, date);
      const s = db.prepare('SELECT * FROM market_schedule WHERE market_id = ? AND day = ?').get(m.id, day) as
        | { open_result_time: string; close_result_time: string | null }
        | undefined;
      const times = s
        ? resultTimes(m, { ...s, market_id: m.id, day, open_bet_time: '', close_bet_time: '', is_closed: 0 })
        : resultTimes(m, marketState(m).schedule);
      return {
        marketId: m.id,
        marketName: m.name,
        openTimeLabel: times.openLabel,
        closeTimeLabel: times.closeLabel,
        display: formatResult(r, m.kind),
      };
    }),
  });
});
