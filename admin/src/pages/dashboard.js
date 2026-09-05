/* Today at a glance: bids, payout, users, wallet float and a per-market table. */

import { $, esc, fmt } from '../ui.js';
import { api } from '../api.js';

export const page = {
  title: 'Dashboard',
  async render(root) {
    const s = await api('/stats');
    root.innerHTML = `
      <div class="stats">
        <div class="stat accent"><div class="label">Bids today</div><div class="value">${fmt(s.bids.today)}</div>
          <div class="sub">${fmt(s.bids.todayAmount)} coins staked</div></div>
        <div class="stat"><div class="label">Payout today</div><div class="value">${fmt(s.bids.todayPayout)}</div>
          <div class="sub">${fmt(s.bids.pending)} bids pending</div></div>
        <div class="stat"><div class="label">Users</div><div class="value">${fmt(s.users.total)}</div>
          <div class="sub">${fmt(s.users.newToday)} new today · ${fmt(s.users.blocked)} blocked</div></div>
        <div class="stat"><div class="label">Coins in wallets</div><div class="value">${fmt(s.users.balance)}</div>
          <div class="sub">${fmt(s.funds.depositedToday)} added today</div></div>
        <div class="stat"><div class="label">Pending requests</div><div class="value">${fmt(
          s.funds.pendingDeposits + s.funds.pendingWithdraws,
        )}</div>
          <div class="sub">${fmt(s.funds.pendingDeposits)} deposit · ${fmt(s.funds.pendingWithdraws)} withdraw</div></div>
      </div>

      <div class="card">
        <h2>Today's markets — ${esc(s.date)}</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Market</th><th>Type</th><th>Status</th><th>Result</th><th class="right">Bids</th>
              <th class="right">Staked</th><th class="right">Payout</th></tr></thead>
            <tbody>
              ${s.markets
                .map(
                  (m) => `<tr>
                    <td><strong>${esc(m.name)}</strong></td>
                    <td>${esc(m.kind)}</td>
                    <td><span class="chip ${esc(m.status)}">${esc(m.status.replace(/_/g, ' '))}</span></td>
                    <td><strong>${esc(m.result)}</strong></td>
                    <td class="right">${fmt(m.bids)}</td>
                    <td class="right">${fmt(m.amount)}</td>
                    <td class="right">${fmt(m.payout)}</td>
                  </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    $('#auto-chip').textContent = s.autoDeclare ? 'Auto results: ON' : 'Auto results: OFF';
    $('#auto-chip').className = `chip ${s.autoDeclare ? 'ok' : 'warn'}`;
  },
};
