import { useCallback } from 'react';
import { api } from '../api';
import { fmt } from '../format';
import { useLoad } from '../hooks';
import { useRefresh } from '../refresh';
import type { Stats } from '../types';
import { Card, Resource, TableWrap } from '../ui';

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className={`stat${accent ? ' accent' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

export function Dashboard() {
  const { nonce } = useRefresh();
  const load = useCallback(() => api<Stats>('/stats'), [nonce]);
  const state = useLoad(load);

  return (
    <Resource state={state}>
      {(s) => (
        <>
          <div className="stats">
            <Stat
              accent
              label="Bids today"
              value={fmt(s.bids.today)}
              sub={`${fmt(s.bids.todayAmount)} coins staked`}
            />
            <Stat
              label="Payout today"
              value={fmt(s.bids.todayPayout)}
              sub={`${fmt(s.bids.pending)} bids pending`}
            />
            <Stat
              label="Users"
              value={fmt(s.users.total)}
              sub={`${fmt(s.users.newToday)} new today · ${fmt(s.users.blocked)} blocked`}
            />
            <Stat
              label="Coins in wallets"
              value={fmt(s.users.balance)}
              sub={`${fmt(s.funds.depositedToday)} added today`}
            />
            <Stat
              label="Pending requests"
              value={fmt(s.funds.pendingDeposits + s.funds.pendingWithdraws)}
              sub={`${fmt(s.funds.pendingDeposits)} deposit · ${fmt(s.funds.pendingWithdraws)} withdraw`}
            />
          </div>

          <Card title={`Today's markets — ${s.date}`}>
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Result</th>
                    <th className="right">Bids</th>
                    <th className="right">Staked</th>
                    <th className="right">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {s.markets.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.name}</strong>
                      </td>
                      <td>{m.kind}</td>
                      <td>
                        <span className={`chip ${m.status}`}>{m.status.replace(/_/g, ' ')}</span>
                      </td>
                      <td>
                        <strong>{m.result}</strong>
                      </td>
                      <td className="right">{fmt(m.bids)}</td>
                      <td className="right">{fmt(m.amount)}</td>
                      <td className="right">{fmt(m.payout)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        </>
      )}
    </Resource>
  );
}
