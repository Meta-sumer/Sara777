/* Approve or reject deposit and withdrawal requests. */

import { $$, esc, fmt, dt, toast, openModal } from '../ui.js';
import { api, guard } from '../api.js';
import { render } from '../router.js';

export const page = {
  title: 'Fund requests',
  state: { status: 'pending' },
  async render(root) {
    const st = page.state;
    const { requests } = await api(`/fund-requests?status=${st.status}`);
    root.innerHTML = `
      <div class="card">
        <div class="row">
          ${['pending', 'approved', 'rejected']
            .map(
              (s) =>
                `<button class="btn sm ${st.status === s ? 'primary' : 'ghost'} act-tab" data-status="${s}">${s}</button>`,
            )
            .join('')}
          <div class="grow"></div>
          <span class="muted">${requests.length} requests</span>
        </div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>User</th><th>Type</th><th class="right">Amount</th><th class="right">Balance</th>
              <th>UTR / Ref</th><th>Proof</th><th>Requested</th><th>Remark</th><th></th></tr></thead>
            <tbody>
              ${
                requests.length
                  ? requests
                      .map(
                        (r) => `<tr data-id="${r.id}">
                          <td class="muted">${r.id}</td>
                          <td><strong>${esc(r.user_name)}</strong><br /><span class="muted">${esc(r.user_mobile)}</span></td>
                          <td><span class="chip ${r.type === 'deposit' ? 'ok' : 'warn'}">${esc(r.type)}</span></td>
                          <td class="right"><strong>${fmt(r.amount)}</strong></td>
                          <td class="right">${fmt(r.user_balance)}</td>
                          <td>${r.utr ? `<code>${esc(r.utr)}</code>` : '<span class="muted">—</span>'}</td>
                          <td>${
                            r.proof_url
                              ? `<img class="proof-thumb" src="${esc(r.proof_url)}" alt="payment proof" />`
                              : '<span class="muted">—</span>'
                          }</td>
                          <td class="muted">${dt(r.created_at)}</td>
                          <td class="wrap">${esc(r.remark || '')}</td>
                          <td class="row">${
                            r.status === 'pending'
                              ? `<button class="btn sm success act-approve">Approve</button>
                                 <button class="btn sm danger act-reject">Reject</button>`
                              : `<span class="chip ${esc(r.status)}">${esc(r.status)}</span>`
                          }</td>
                        </tr>`,
                      )
                      .join('')
                  : '<tr><td colspan="10" class="empty">Nothing here</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>`;

    $$('.act-tab', root).forEach((b) => {
      b.onclick = () => {
        st.status = b.dataset.status;
        render();
      };
    });

    const decide = (action) =>
      guard(async (e) => {
        const tr = e.target.closest('tr');
        const remark = action === 'reject' ? prompt('Reason (optional)') ?? '' : '';
        await api(`/fund-requests/${tr.dataset.id}`, { method: 'POST', body: { action, remark } });
        toast(`Request ${action}d`);
        render();
      });

    $$('.act-approve', root).forEach((b) => (b.onclick = decide('approve')));
    $$('.act-reject', root).forEach((b) => (b.onclick = decide('reject')));

    // click a screenshot to see it full size
    $$('.proof-thumb', root).forEach((img) => {
      img.onclick = () => {
        openModal(`
          <h2>Payment proof</h2>
          <img src="${img.getAttribute('src')}" style="width:100%;border-radius:10px" alt="payment proof" />
          <button class="btn ghost block" style="margin-top:14px"
            onclick="document.getElementById('modal').classList.add('hidden')">Close</button>`);
      };
    });
  },
};
