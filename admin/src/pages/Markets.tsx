import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useLoad } from '../hooks';
import { useRefresh } from '../refresh';
import type { AdminMarket } from '../types';
import { Card, Resource, TableWrap, useToast } from '../ui';

type Draft = Record<
  number,
  { name: string; openTime: string; closeTime: string; days: string; isActive: boolean }
>;

export function Markets() {
  const { nonce } = useRefresh();
  const toast = useToast();
  const load = useCallback(() => api<{ markets: AdminMarket[] }>('/markets'), [nonce]);
  const state = useLoad(load);

  const [draft, setDraft] = useState<Draft>({});
  const [form, setForm] = useState({
    name: '',
    kind: 'main',
    openTime: '',
    closeTime: '',
    days: '0,1,2,3,4,5,6',
  });

  useEffect(() => {
    if (!state.data) return;
    const next: Draft = {};
    for (const m of state.data.markets) {
      next[m.id] = {
        name: m.name,
        openTime: m.openTime,
        closeTime: m.closeTime,
        days: m.days,
        isActive: Boolean(m.isActive),
      };
    }
    setDraft(next);
  }, [state.data]);

  const run = async (fn: () => Promise<string>) => {
    try {
      toast(await fn());
      await state.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', true);
    }
  };

  async function add(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api('/markets', {
        method: 'POST',
        body: { ...form, closeTime: form.closeTime || form.openTime },
      });
      setForm({ name: '', kind: 'main', openTime: '', closeTime: '', days: '0,1,2,3,4,5,6' });
      return 'Market added';
    });
  }

  return (
    <>
      <Card title="Add market">
        <form className="form-grid" onSubmit={add}>
          <label className="field">
            Name
            <input
              required
              placeholder="KALYAN"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="field">
            Type
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="main">Main market</option>
              <option value="starline">King Starline</option>
            </select>
          </label>
          <label className="field">
            Open time
            <input
              required
              placeholder="16:00"
              value={form.openTime}
              onChange={(e) => setForm({ ...form, openTime: e.target.value })}
            />
          </label>
          <label className="field">
            Close time
            <input
              placeholder="18:00"
              value={form.closeTime}
              onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
            />
          </label>
          <label className="field">
            Days
            <input value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
          </label>
          <button className="btn primary" type="submit">
            Add market
          </button>
        </form>
        <p className="muted" style={{ marginBottom: 0 }}>
          Times are 24h <code>HH:MM</code>. Days: 0 = Sunday. For starline leave close time empty.
        </p>
      </Card>

      <Resource state={state}>
        {({ markets }) => (
          <Card title={`All markets (${markets.length})`}>
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Open</th>
                    <th>Close</th>
                    <th>Days</th>
                    <th>Status</th>
                    <th>Today</th>
                    <th>Active</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {markets.map((m) => {
                    const d = draft[m.id];
                    if (!d) return null;
                    const set = (patch: Partial<Draft[number]>) =>
                      setDraft((p) => ({ ...p, [m.id]: { ...d, ...patch } }));
                    return (
                      <tr key={m.id}>
                        <td>
                          <input
                            value={d.name}
                            style={{ minWidth: 170 }}
                            onChange={(e) => set({ name: e.target.value })}
                          />
                        </td>
                        <td>{m.kind}</td>
                        <td>
                          <input
                            className="inline-input"
                            value={d.openTime}
                            onChange={(e) => set({ openTime: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="inline-input"
                            value={d.closeTime}
                            onChange={(e) => set({ closeTime: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            value={d.days}
                            style={{ width: 120 }}
                            onChange={(e) => set({ days: e.target.value })}
                          />
                        </td>
                        <td>
                          <span className={`chip ${m.status}`}>{m.status.replace(/_/g, ' ')}</span>
                        </td>
                        <td>
                          <strong>{m.result}</strong>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            style={{ width: 'auto' }}
                            checked={d.isActive}
                            onChange={(e) => set({ isActive: e.target.checked })}
                          />
                        </td>
                        <td className="row">
                          <button
                            className="btn sm primary"
                            onClick={() =>
                              run(async () => {
                                await api(`/markets/${m.id}`, { method: 'PATCH', body: d });
                                return 'Market updated';
                              })
                            }
                          >
                            Save
                          </button>
                          <button
                            className="btn sm danger"
                            onClick={() => {
                              if (
                                !confirm(
                                  'Delete this market? Markets that already have bids are disabled instead.',
                                )
                              )
                                return;
                              void run(async () => {
                                const res = await api<{ message?: string }>(`/markets/${m.id}`, {
                                  method: 'DELETE',
                                });
                                return res.message ?? 'Market deleted';
                              });
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}
      </Resource>
    </>
  );
}
