/* Every bid with filters and running totals. */

import { $, esc, fmt, dt } from '../ui.js';
import { api } from '../api.js';
import { render } from '../router.js';

export const page = {
  title: 'Bids',
  state: { page: 1, filters: {} },
  async render(root) {
    const st = page.state;
    const query = new URLSearchParams({ page: String(st.page), perPage: '25' });
    for (const [k, v] of Object.entries(st.filters)) if (v) query.set(k, v);
    const data = await api(`/bids?${query}`);
    const { markets } = await api('/markets');

    root.innerHTML = `
      <div class="card">
        <div class="filters">
          <label class="field">Market<select id="f-market"><option value="">All</option>
            ${markets.map((m) => `<option value="${m.id}" ${st.filters.marketId == m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
          </select></label>
          <label class="field">Date<input type="date" id="f-date" value="${esc(st.filters.date ?? '')}" /></label>
          <label class="field">Status<select id="f-status">
            ${['', 'pending', 'won', 'lost', 'refunded']
              .map((s) => `<option value="${s}" ${st.filters.status === s ? 'selected' : ''}>${s || 'All'}</option>`)
              .join('')}
          </select></label>
          <label class="field">Mobile<input id="f-mobile" placeholder="98xxxxxxxx" value="${esc(st.filters.mobile ?? '')}" /></label>
          <button class="btn ghost" id="f-clear">Clear</button>
        </div>
      </div>

      <div class="stats">
        <div class="stat"><div class="label">Matching bids</div><div class="value">${fmt(data.total)}</div></div>
        <div class="stat"><div class="label">Staked</div><div class="value">${fmt(data.totalAmount)}</div></div>
        <div class="stat"><div class="label">Paid out</div><div class="value">${fmt(data.totalPayout)}</div></div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>User</th><th>Market</th><th>Game</th><th>Session</th><th>Number</th>
              <th class="right">Points</th><th class="right">Rate</th><th>Status</th><th class="right">Win</th><th>Date</th></tr></thead>
            <tbody>
              ${
                data.bids.length
                  ? data.bids
                      .map(
                        (b) => `<tr>
                          <td class="muted">${b.id}</td>
                          <td><a href="#/users?id=${b.userId}">${esc(b.userName)}</a><br /><span class="muted">${esc(b.userMobile)}</span></td>
                          <td>${esc(b.marketName)}</td>
                          <td>${esc(b.gameType.replace(/_/g, ' '))}</td>
                          <td>${esc(b.session)}</td>
                          <td><strong>${esc(b.pick)}</strong></td>
                          <td class="right">${fmt(b.amount)}</td>
                          <td class="right">${b.rate}x</td>
                          <td><span class="chip ${esc(b.status)}">${esc(b.status)}</span></td>
                          <td class="right">${b.winAmount ? fmt(b.winAmount) : '--'}</td>
                          <td class="muted">${dt(b.createdAt)}</td>
                        </tr>`,
                      )
                      .join('')
                  : '<tr><td colspan="11" class="empty">No bids match these filters</td></tr>'
              }
            </tbody>
          </table>
        </div>
        <div class="row" style="margin-top:14px">
          <button class="btn ghost sm" id="prev" ${data.page <= 1 ? 'disabled' : ''}>Previous</button>
          <span class="muted">Page ${data.page} of ${data.totalPages}</span>
          <button class="btn ghost sm" id="next" ${data.page >= data.totalPages ? 'disabled' : ''}>Next</button>
        </div>
      </div>`;

    const setFilter = (key) => (e) => {
      st.filters[key] = e.target.value;
      st.page = 1;
      render();
    };
    $('#f-market').onchange = setFilter('marketId');
    $('#f-date').onchange = setFilter('date');
    $('#f-status').onchange = setFilter('status');
    $('#f-mobile').onchange = setFilter('mobile');
    $('#f-clear').onclick = () => {
      st.filters = {};
      st.page = 1;
      render();
    };
    $('#prev').onclick = () => {
      st.page = Math.max(1, st.page - 1);
      render();
    };
    $('#next').onclick = () => {
      st.page = Math.min(data.totalPages, st.page + 1);
      render();
    };
  },
};
