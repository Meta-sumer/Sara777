import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { fmt, today } from '../format';
import { useLoad } from '../hooks';
import { useRefresh } from '../refresh';
import type { ExposureRow, ResultLine } from '../types';
import { Card, Modal, Resource, TableWrap, useToast } from '../ui';

export function Results() {
  const { nonce } = useRefresh();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [panna, setPanna] = useState<Record<string, string>>({});
  const [exposure, setExposure] = useState<{ name: string; rows: ExposureRow[] } | null>(null);

  const load = useCallback(
    () => api<{ results: ResultLine[] }>(`/results?date=${date}`),
    [date, nonce],
  );
  const state = useLoad(load);

  // seed the inputs from whatever is already declared for this date
  useEffect(() => {
    if (!state.data) return;
    const next: Record<string, string> = {};
    for (const r of state.data.results) {
      next[`${r.marketId}:open`] = r.openPanna ?? '';
      next[`${r.marketId}:close`] = r.closePanna ?? '';
    }
    setPanna(next);
  }, [state.data]);

  const declare = (marketId: number, session: 'open' | 'close') => async () => {
    const value = (panna[`${marketId}:${session}`] ?? '').trim();
    if (!/^\d{3}$/.test(value)) {
      toast('Panna must be 3 digits', true);
      return;
    }
    try {
      const res = await api<{ settled: number; won: number; payout: number }>('/results', {
        method: 'POST',
        body: { marketId, session, panna: value, date },
      });
      toast(`Declared — ${res.settled} bids settled, ${res.won} won, ${fmt(res.payout)} paid`);
      await state.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', true);
    }
  };

  const cancel = (marketId: number) => async () => {
    if (!confirm('Refund every pending bid for this market and date?')) return;
    try {
      const res = await api<{ refunded: number }>('/markets/cancel', {
        method: 'POST',
        body: { marketId, date },
      });
      toast(`${res.refunded} bids refunded`);
      await state.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', true);
    }
  };

  const showExposure = (marketId: number, name: string) => async () => {
    try {
      const { rows } = await api<{ rows: ExposureRow[] }>(
        `/bids/summary?marketId=${marketId}&date=${date}`,
      );
      setExposure({ name, rows });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', true);
    }
  };

  const set = (key: string, value: string) => setPanna((p) => ({ ...p, [key]: value }));

  return (
    <>
      <Card>
        <div className="row">
          <label className="field">
            Result date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
          </label>
          <div className="grow" />
          <span className="muted">
            Publishing a result settles every pending bid for that market and day.
          </span>
        </div>
      </Card>

      <Resource state={state}>
        {({ results }) => (
          <Card title={`Declare results — ${date}`}>
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Timing</th>
                    <th>Open panna</th>
                    <th>Close panna</th>
                    <th>Current</th>
                    <th className="right">Pending</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.marketId}>
                      <td>
                        <strong>{r.name}</strong>
                      </td>
                      <td className="muted">
                        {r.openTimeLabel}
                        {r.kind === 'main' ? ` - ${r.closeTimeLabel}` : ''}
                      </td>
                      <td className="row">
                        <input
                          className="inline-input"
                          maxLength={3}
                          placeholder="128"
                          value={panna[`${r.marketId}:open`] ?? ''}
                          onChange={(e) => set(`${r.marketId}:open`, e.target.value)}
                        />
                        <button className="btn sm primary" onClick={declare(r.marketId, 'open')}>
                          Declare
                        </button>
                      </td>
                      <td className="row">
                        {r.kind === 'main' ? (
                          <>
                            <input
                              className="inline-input"
                              maxLength={3}
                              placeholder="127"
                              value={panna[`${r.marketId}:close`] ?? ''}
                              onChange={(e) => set(`${r.marketId}:close`, e.target.value)}
                            />
                            <button
                              className="btn sm primary"
                              onClick={declare(r.marketId, 'close')}
                            >
                              Declare
                            </button>
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <strong>{r.display}</strong>
                      </td>
                      <td className="right">{fmt(r.pendingBids)}</td>
                      <td className="row">
                        <button
                          className="btn sm ghost"
                          onClick={showExposure(r.marketId, r.name)}
                        >
                          Exposure
                        </button>
                        <button className="btn sm danger" onClick={cancel(r.marketId)}>
                          Cancel &amp; refund
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}
      </Resource>

      {exposure && (
        <Modal title={`Exposure — ${exposure.name}`} onClose={() => setExposure(null)} wide>
          <p className="muted">What each number would cost if it wins.</p>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Session</th>
                  <th>Number</th>
                  <th className="right">Bids</th>
                  <th className="right">Staked</th>
                  <th className="right">Liability</th>
                </tr>
              </thead>
              <tbody>
                {exposure.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      No bids on this market today
                    </td>
                  </tr>
                ) : (
                  exposure.rows.map((r, i) => (
                    <tr key={`${r.game_type}-${r.session}-${r.pick}-${i}`}>
                      <td>{r.game_type}</td>
                      <td>{r.session}</td>
                      <td>
                        <strong>{r.pick}</strong>
                      </td>
                      <td className="right">{fmt(r.bids)}</td>
                      <td className="right">{fmt(r.amount)}</td>
                      <td className="right">
                        <strong>{fmt(r.liability)}</strong>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableWrap>
          <button className="btn ghost block" onClick={() => setExposure(null)}>
            Close
          </button>
        </Modal>
      )}
    </>
  );
}
