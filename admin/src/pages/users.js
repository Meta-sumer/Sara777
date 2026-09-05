/* Search users, block, adjust coins, reset passwords and open a full profile. */

import { $, $$, esc, fmt, dt, toast, openModal, closeModal } from '../ui.js';
import { api, guard } from '../api.js';
import { render } from '../router.js';

export const page = {
  title: 'Users',
  state: { page: 1, search: '' },
  async render(root) {
    const st = page.state;
    const data = await api(`/users?page=${st.page}&perPage=25&search=${encodeURIComponent(st.search)}`);

    root.innerHTML = `
      <div class="card">
        <div class="row">
          <input id="search" placeholder="Search name or mobile" value="${esc(st.search)}" style="max-width:280px" />
          <button class="btn primary" id="do-search">Search</button>
          <div class="grow"></div>
          <span class="muted">${fmt(data.total)} users</span>
        </div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Name</th><th>Mobile</th><th class="right">Balance</th><th>Status</th>
              <th>Joined</th><th></th></tr></thead>
            <tbody>
              ${
                data.users.length
                  ? data.users
                      .map(
                        (u) => `<tr>
                          <td class="muted">${u.id}</td>
                          <td><strong>${esc(u.name)}</strong></td>
                          <td>${esc(u.mobile)}</td>
                          <td class="right"><strong>${fmt(u.balance)}</strong></td>
                          <td><span class="chip ${u.isActive ? 'ok' : 'bad'}">${u.isActive ? 'active' : 'blocked'}</span></td>
                          <td class="muted">${dt(u.createdAt)}</td>
                          <td><button class="btn sm primary act-view" data-id="${u.id}">Manage</button></td>
                        </tr>`,
                      )
                      .join('')
                  : '<tr><td colspan="7" class="empty">No users found</td></tr>'
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

    $('#do-search').onclick = () => {
      st.search = $('#search').value.trim();
      st.page = 1;
      render();
    };
    $('#search').onkeydown = (e) => {
      if (e.key === 'Enter') $('#do-search').click();
    };
    $('#prev').onclick = () => {
      st.page = Math.max(1, st.page - 1);
      render();
    };
    $('#next').onclick = () => {
      st.page = Math.min(data.totalPages, st.page + 1);
      render();
    };
    $$('.act-view', root).forEach((b) => (b.onclick = () => userModal(b.dataset.id)));

    const wanted = new URLSearchParams(location.hash.split('?')[1] ?? '').get('id');
    if (wanted) userModal(wanted);
  },
};

const userModal = guard(async (id) => {
  const d = await api(`/users/${id}`);
  const u = d.user;
  const card = openModal(`
    <h2>${esc(u.name)} <span class="chip ${u.isActive ? 'ok' : 'bad'}">${u.isActive ? 'active' : 'blocked'}</span></h2>
    <p class="muted">${esc(u.mobile)} · joined ${dt(u.createdAt)} · balance <strong>${fmt(u.balance)}</strong> coins</p>

    <div class="card">
      <h3>Adjust balance</h3>
      <div class="row">
        <input id="m-amount" type="number" placeholder="Amount" style="max-width:140px" />
        <input id="m-note" placeholder="Note (optional)" class="grow" />
        <button class="btn success" id="m-credit">Credit</button>
        <button class="btn danger" id="m-debit">Debit</button>
      </div>
    </div>

    <div class="card">
      <h3>Account</h3>
      <div class="row">
        <button class="btn ${u.isActive ? 'danger' : 'success'}" id="m-block">${u.isActive ? 'Block user' : 'Unblock user'}</button>
        <input id="m-pass" placeholder="New password" style="max-width:180px" />
        <button class="btn ghost" id="m-reset">Reset password</button>
      </div>
    </div>

    <div class="card">
      <h3>Payout details</h3>
      ${
        d.bank
          ? `<p>${esc(d.bank.holder_name || '--')} · ${esc(d.bank.bank_name || '--')} · ${esc(d.bank.account_no || '--')} · ${esc(
              d.bank.ifsc || '--',
            )}<br /><span class="muted">UPI: ${esc(d.bank.paytm || d.bank.phonepe || d.bank.gpay || '--')}</span></p>`
          : '<p class="muted">Not added</p>'
      }
    </div>

    <div class="card">
      <h3>Recent bids</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Market</th><th>Game</th><th>Number</th><th class="right">Points</th><th>Status</th><th class="right">Win</th></tr></thead>
        <tbody>${
          d.bids.length
            ? d.bids
                .map(
                  (b) => `<tr><td>${esc(b.market_name)}</td><td>${esc(b.game_type.replace(/_/g, ' '))}</td>
                    <td><strong>${esc(b.pick)}</strong></td><td class="right">${fmt(b.amount)}</td>
                    <td><span class="chip ${esc(b.status)}">${esc(b.status)}</span></td>
                    <td class="right">${b.win_amount ? fmt(b.win_amount) : '--'}</td></tr>`,
                )
                .join('')
            : '<tr><td colspan="6" class="empty">No bids yet</td></tr>'
        }</tbody>
      </table></div>
    </div>

    <div class="card">
      <h3>Recent transactions</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>When</th><th>Particulars</th><th class="right">Amount</th><th class="right">Balance</th></tr></thead>
        <tbody>${d.transactions
          .map(
            (t) => `<tr><td class="muted">${dt(t.created_at)}</td><td>${esc(t.particulars)}</td>
              <td class="right" style="color:${t.amount >= 0 ? 'var(--success)' : 'var(--danger)'}">${t.amount >= 0 ? '+' : ''}${fmt(
                t.amount,
              )}</td><td class="right">${fmt(t.balance_after)}</td></tr>`,
          )
          .join('')}</tbody>
      </table></div>
    </div>

    <button class="btn ghost block" id="m-close">Close</button>`);

  const adjust = (sign) =>
    guard(async () => {
      const amount = Number($('#m-amount', card).value);
      if (!amount) return toast('Enter an amount', true);
      const res = await api(`/users/${id}/balance`, {
        method: 'POST',
        body: { delta: sign * Math.abs(amount), note: $('#m-note', card).value },
      });
      toast(`Balance is now ${fmt(res.balance)}`);
      closeModal();
      render();
    });

  $('#m-credit', card).onclick = adjust(1);
  $('#m-debit', card).onclick = adjust(-1);
  $('#m-block', card).onclick = guard(async () => {
    await api(`/users/${id}/block`, { method: 'POST', body: { blocked: u.isActive } });
    toast(u.isActive ? 'User blocked' : 'User unblocked');
    closeModal();
    render();
  });
  $('#m-reset', card).onclick = guard(async () => {
    const password = $('#m-pass', card).value;
    await api(`/users/${id}/password`, { method: 'POST', body: { password } });
    toast('Password reset');
  });
  $('#m-close', card).onclick = closeModal;
});
