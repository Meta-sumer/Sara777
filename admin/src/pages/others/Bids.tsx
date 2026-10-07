import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { dt, fmt } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import type { AdminMarket, BidRow } from '../../types';
import { Card, Resource, TableWrap } from '../../ui';

interface Filters {
  marketId: string;
  date: string;
  status: string;
  mobile: string;
}

interface BidsResponse {
  bids: BidRow[];
  total: number;
  totalAmount: number;
  totalPayout: number;
  page: number;
  totalPages: number;
}

const EMPTY: Filters = { marketId: '', date: '', status: '', mobile: '' };

export function Bids() {
  const { nonce } = useRefresh();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), perPage: '25' });
    for (const [k, v] of Object.entries(filters)) if (v) query.set(k, v);
    const [data, marketList] = await Promise.all([
      api<BidsResponse>(`/bids?${query}`),
      api<{ markets: AdminMarket[] }>('/markets'),
    ]);
    return { data, markets: marketList.markets };
  }, [filters, page, nonce]);

  const state = useLoad(load);

  const set = (key: keyof Filters) => (value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  return (
    <Resource state={state}>
      {({ data, markets }) => (
        <>
          <Card>
            <div className="filters">
              <label className="field">
                Market
                <select value={filters.marketId} onChange={(e) => set('marketId')(e.target.value)}>
                  <option value="">All</option>
                  {markets.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Date
                <input
                  type="date"
                  value={filters.date}
                  onChange={(e) => set('date')(e.target.value)}
                />
              </label>
              <label className="field">
                Status
                <select value={filters.status} onChange={(e) => set('status')(e.target.value)}>
                  {['', 'pending', 'won', 'lost', 'refunded'].map((s) => (
                    <option key={s} value={s}>
                      {s || 'All'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Mobile
                <input
                  placeholder="98xxxxxxxx"
                  value={filters.mobile}
                  onChange={(e) => set('mobile')(e.target.value)}
                />
              </label>
              <button
                className="btn ghost"
                onClick={() => {
                  setFilters(EMPTY);
                  setPage(1);
                }}
              >
                Clear
              </button>
            </div>
          </Card>

          <div className="stats">
            <div className="stat">
              <div className="label">Matching bids</div>
              <div className="value">{fmt(data.total)}</div>
            </div>
            <div className="stat">
              <div className="label">Staked</div>
              <div className="value">{fmt(data.totalAmount)}</div>
            </div>
            <div className="stat">
              <div className="label">Paid out</div>
              <div className="value">{fmt(data.totalPayout)}</div>
            </div>
          </div>

          <Card>
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>User</th>
                    <th>Market</th>
                    <th>Game</th>
                    <th>Session</th>
                    <th>Number</th>
                    <th className="right">Points</th>
                    <th className="right">Rate</th>
                    <th>Status</th>
                    <th className="right">Win</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bids.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="empty">
                        No bids match these filters
                      </td>
                    </tr>
                  ) : (
                    data.bids.map((b) => (
                      <tr key={b.id}>
                        <td className="muted">{b.id}</td>
                        <td>
                          <Link to={`/users?id=${b.userId}`}>{b.userName}</Link>
                          <br />
                          <span className="muted">{b.userMobile}</span>
                        </td>
                        <td>{b.marketName}</td>
                        <td>{b.gameType.replace(/_/g, ' ')}</td>
                        <td>{b.session}</td>
                        <td>
                          <strong>{b.pick}</strong>
                        </td>
                        <td className="right">{fmt(b.amount)}</td>
                        <td className="right">{b.rate}x</td>
                        <td>
                          <span className={`chip ${b.status}`}>{b.status}</span>
                        </td>
                        <td className="right">{b.winAmount ? fmt(b.winAmount) : '--'}</td>
                        <td className="muted">{dt(b.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableWrap>

            <div className="row" style={{ marginTop: 14 }}>
              <button
                className="btn ghost sm"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="muted">
                Page {data.page} of {data.totalPages}
              </span>
              <button
                className="btn ghost sm"
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </Card>
        </>
      )}
    </Resource>
  );
}
