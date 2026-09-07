import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { fmt } from '../format';
import { useLoad } from '../hooks';
import { useRefresh } from '../refresh';
import type { GameRate } from '../types';
import { Card, Resource, TableWrap, useToast } from '../ui';

type Draft = Record<string, { rate: number; isActive: boolean }>;

export function Rates() {
  const { nonce } = useRefresh();
  const toast = useToast();
  const load = useCallback(() => api<{ rates: GameRate[] }>('/rates'), [nonce]);
  const state = useLoad(load);

  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);

  // seed the editable copy whenever the server data arrives
  useEffect(() => {
    if (!state.data) return;
    const next: Draft = {};
    for (const r of state.data.rates) next[r.key] = { rate: r.rate, isActive: r.isActive };
    setDraft(next);
  }, [state.data]);

  async function save() {
    setBusy(true);
    try {
      const rates = Object.entries(draft).map(([key, v]) => ({
        key,
        rate: v.rate,
        isActive: v.isActive,
      }));
      await api('/rates', { method: 'POST', body: { rates } });
      toast('Rates saved');
      await state.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Resource state={state}>
      {({ rates }) => (
        <Card title="Payout rates">
          <p className="muted">
            Win amount = points × rate. Switching a game off hides it in the app and blocks new
            bids.
          </p>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Available in</th>
                  <th>Rate (×)</th>
                  <th>10 points win</th>
                  <th>Enabled</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => {
                  const d = draft[r.key] ?? { rate: r.rate, isActive: r.isActive };
                  return (
                    <tr key={r.key}>
                      <td>
                        <strong>{r.label}</strong>
                      </td>
                      <td className="muted">{r.kinds.join(', ')}</td>
                      <td>
                        <input
                          className="inline-input"
                          type="number"
                          min={1}
                          value={d.rate}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              [r.key]: { ...d, rate: Number(e.target.value) },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <strong>{fmt(d.rate * 10)}</strong>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          style={{ width: 'auto' }}
                          checked={d.isActive}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              [r.key]: { ...d, isActive: e.target.checked },
                            }))
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
          <button
            className="btn primary"
            style={{ marginTop: 16 }}
            onClick={save}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save rates'}
          </button>
        </Card>
      )}
    </Resource>
  );
}
