/* Rama777 admin panel — no build step, plain ES modules. */

const API = '/api/admin';
const TOKEN_KEY = 'admin.token';

/* ------------------------------------------------------------------ helpers */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-IN');
}

function dt(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function today() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function toast(message, bad = false) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.toggle('bad', bad);
  node.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.add('hidden'), 2600);
}

function openModal(html) {
  $('#modal-card').innerHTML = html;
  $('#modal').classList.remove('hidden');
  return $('#modal-card');
}

function closeModal() {
  $('#modal').classList.add('hidden');
  $('#modal-card').innerHTML = '';
}

$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});

/* ---------------------------------------------------------------------- api */

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
    throw new Error(data.message || 'Session expired');
  }
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

/** Wrap an action so failures surface as a toast instead of a silent console error. */
function guard(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      toast(err.message, true);
    }
  };
}

/* -------------------------------------------------------------------- pages */

const pages = {};

pages.dashboard = {
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

pages.markets = {
  title: 'Markets',
  async render(root) {
    const { markets } = await api('/markets');
    root.innerHTML = `
      <div class="card">
        <h2>Add market</h2>
        <form id="add-market" class="form-grid">
          <label class="field">Name<input name="name" required placeholder="KALYAN" /></label>
          <label class="field">Type<select name="kind"><option value="main">Main market</option>
            <option value="starline">King Starline</option></select></label>
          <label class="field">Open time<input name="openTime" placeholder="16:00" required /></label>
          <label class="field">Close time<input name="closeTime" placeholder="18:00" /></label>
          <label class="field">Days<input name="days" value="0,1,2,3,4,5,6" /></label>
          <button class="btn primary" type="submit">Add market</button>
        </form>
        <p class="muted" style="margin-bottom:0">Times are 24h <code>HH:MM</code>. Days: 0 = Sunday. For starline leave close time empty.</p>
      </div>

      <div class="card">
        <h2>All markets (${markets.length})</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Open</th><th>Close</th><th>Days</th><th>Status</th>
              <th>Today</th><th>Active</th><th></th></tr></thead>
            <tbody>
              ${markets
                .map(
                  (m) => `<tr data-id="${m.id}">
                    <td><input class="f-name" value="${esc(m.name)}" style="min-width:170px" /></td>
                    <td>${esc(m.kind)}</td>
                    <td><input class="f-open inline-input" value="${esc(m.openTime)}" /></td>
                    <td><input class="f-close inline-input" value="${esc(m.closeTime)}" /></td>
                    <td><input class="f-days" value="${esc(m.days)}" style="width:120px" /></td>
                    <td><span class="chip ${esc(m.status)}">${esc(m.status.replace(/_/g, ' '))}</span></td>
                    <td><strong>${esc(m.result)}</strong></td>
                    <td><input type="checkbox" class="f-active" ${m.isActive ? 'checked' : ''} style="width:auto" /></td>
                    <td class="row">
                      <button class="btn sm primary act-save">Save</button>
                      <button class="btn sm danger act-del">Delete</button>
                    </td>
                  </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    $('#add-market').onsubmit = guard(async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const openTime = f.get('openTime');
      await api('/markets', {
        method: 'POST',
        body: {
          name: f.get('name'),
          kind: f.get('kind'),
          openTime,
          closeTime: f.get('closeTime') || openTime,
          days: f.get('days'),
        },
      });
      toast('Market added');
      render();
    });

    $$('.act-save', root).forEach((btn) => {
      btn.onclick = guard(async () => {
        const tr = btn.closest('tr');
        await api(`/markets/${tr.dataset.id}`, {
          method: 'PATCH',
          body: {
            name: $('.f-name', tr).value,
            openTime: $('.f-open', tr).value,
            closeTime: $('.f-close', tr).value,
            days: $('.f-days', tr).value,
            isActive: $('.f-active', tr).checked,
          },
        });
        toast('Market updated');
        render();
      });
    });

    $$('.act-del', root).forEach((btn) => {
      btn.onclick = guard(async () => {
        const tr = btn.closest('tr');
        if (!confirm('Delete this market? Markets that already have bids are disabled instead.')) return;
        const res = await api(`/markets/${tr.dataset.id}`, { method: 'DELETE' });
        toast(res.message || 'Market deleted');
        render();
      });
    });
  },
};

pages.results = {
  title: 'Results',
  state: { date: today() },
  async render(root) {
    const date = pages.results.state.date;
    const { results } = await api(`/results?date=${date}`);
    root.innerHTML = `
      <div class="card">
        <div class="row">
          <label class="field">Result date<input type="date" id="res-date" value="${esc(date)}" /></label>
          <div class="grow"></div>
          <span class="muted">Publishing a result settles every pending bid for that market and day.</span>
        </div>
      </div>

      <div class="card">
        <h2>Declare results — ${esc(date)}</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Market</th><th>Timing</th><th>Open panna</th><th>Close panna</th>
              <th>Current</th><th class="right">Pending</th><th></th></tr></thead>
            <tbody>
              ${results
                .map(
                  (r) => `<tr data-id="${r.marketId}" data-kind="${r.kind}">
                    <td><strong>${esc(r.name)}</strong></td>
                    <td class="muted">${esc(r.openTimeLabel)}${r.kind === 'main' ? ' - ' + esc(r.closeTimeLabel) : ''}</td>
                    <td class="row">
                      <input class="f-open inline-input" maxlength="3" placeholder="128" value="${esc(r.openPanna)}" />
                      <button class="btn sm primary act-open">Declare</button>
                    </td>
                    <td class="row">
                      ${
                        r.kind === 'main'
                          ? `<input class="f-close inline-input" maxlength="3" placeholder="127" value="${esc(
                              r.closePanna,
                            )}" />
                             <button class="btn sm primary act-close">Declare</button>`
                          : '<span class="muted">—</span>'
                      }
                    </td>
                    <td><strong>${esc(r.display)}</strong></td>
                    <td class="right">${fmt(r.pendingBids)}</td>
                    <td class="row">
                      <button class="btn sm ghost act-summary">Exposure</button>
                      <button class="btn sm danger act-cancel">Cancel &amp; refund</button>
                    </td>
                  </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    $('#res-date').onchange = (e) => {
      pages.results.state.date = e.target.value || today();
      render();
    };

    const declare = (session) =>
      guard(async (e) => {
        const tr = e.target.closest('tr');
        const panna = $(session === 'open' ? '.f-open' : '.f-close', tr).value.trim();
        if (!/^\d{3}$/.test(panna)) return toast('Panna must be 3 digits', true);
        const res = await api('/results', {
          method: 'POST',
          body: { marketId: Number(tr.dataset.id), session, panna, date },
        });
        toast(`Declared — ${res.settled} bids settled, ${res.won} won, ${fmt(res.payout)} paid`);
        render();
      });

    $$('.act-open', root).forEach((b) => (b.onclick = declare('open')));
    $$('.act-close', root).forEach((b) => (b.onclick = declare('close')));

    $$('.act-cancel', root).forEach((btn) => {
      btn.onclick = guard(async () => {
        const tr = btn.closest('tr');
        if (!confirm('Refund every pending bid for this market and date?')) return;
        const res = await api('/markets/cancel', {
          method: 'POST',
          body: { marketId: Number(tr.dataset.id), date },
        });
        toast(`${res.refunded} bids refunded`);
        render();
      });
    });

    $$('.act-summary', root).forEach((btn) => {
      btn.onclick = guard(async () => {
        const tr = btn.closest('tr');
        const { rows } = await api(`/bids/summary?marketId=${tr.dataset.id}&date=${date}`);
        openModal(`
          <h2>Exposure — ${esc($('strong', tr).textContent)}</h2>
          <p class="muted">What each number would cost if it wins.</p>
          <div class="table-wrap"><table>
            <thead><tr><th>Game</th><th>Session</th><th>Number</th><th class="right">Bids</th>
              <th class="right">Staked</th><th class="right">Liability</th></tr></thead>
            <tbody>${
              rows.length
                ? rows
                    .map(
                      (r) => `<tr><td>${esc(r.game_type)}</td><td>${esc(r.session)}</td>
                        <td><strong>${esc(r.pick)}</strong></td><td class="right">${fmt(r.bids)}</td>
                        <td class="right">${fmt(r.amount)}</td>
                        <td class="right"><strong>${fmt(r.liability)}</strong></td></tr>`,
                    )
                    .join('')
                : '<tr><td colspan="6" class="empty">No bids on this market today</td></tr>'
            }</tbody>
          </table></div>
          <button class="btn ghost block" onclick="document.getElementById('modal').classList.add('hidden')">Close</button>`);
      });
    });
  },
};

pages.bids = {
  title: 'Bids',
  state: { page: 1, filters: {} },
  async render(root) {
    const st = pages.bids.state;
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

pages.users = {
  title: 'Users',
  state: { page: 1, search: '' },
  async render(root) {
    const st = pages.users.state;
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

pages.funds = {
  title: 'Fund requests',
  state: { status: 'pending' },
  async render(root) {
    const st = pages.funds.state;
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

pages.rates = {
  title: 'Game rates',
  async render(root) {
    const { rates } = await api('/rates');
    root.innerHTML = `
      <div class="card">
        <h2>Payout rates</h2>
        <p class="muted">Win amount = points × rate. Switching a game off hides it in the app and blocks new bids.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Game</th><th>Available in</th><th>Rate (×)</th><th>10 points win</th><th>Enabled</th></tr></thead>
            <tbody>
              ${rates
                .map(
                  (r) => `<tr data-key="${esc(r.key)}">
                    <td><strong>${esc(r.label)}</strong></td>
                    <td class="muted">${r.kinds.join(', ')}</td>
                    <td><input class="f-rate inline-input" type="number" min="1" value="${r.rate}" /></td>
                    <td class="f-preview"><strong>${fmt(r.rate * 10)}</strong></td>
                    <td><input class="f-active" type="checkbox" ${r.isActive ? 'checked' : ''} style="width:auto" /></td>
                  </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>
        <button class="btn primary" id="save-rates" style="margin-top:16px">Save rates</button>
      </div>`;

    $$('.f-rate', root).forEach((input) => {
      input.oninput = () => {
        $('.f-preview', input.closest('tr')).innerHTML = `<strong>${fmt(Number(input.value) * 10)}</strong>`;
      };
    });

    $('#save-rates').onclick = guard(async () => {
      const payload = $$('tbody tr', root).map((tr) => ({
        key: tr.dataset.key,
        rate: Number($('.f-rate', tr).value),
        isActive: $('.f-active', tr).checked,
      }));
      await api('/rates', { method: 'POST', body: { rates: payload } });
      toast('Rates saved');
      render();
    });
  },
};

pages.notifications = {
  title: 'Notifications',
  async render(root) {
    const { notifications } = await api('/notifications');
    root.innerHTML = `
      <div class="card">
        <h2>Send notification</h2>
        <form id="send" class="form-grid">
          <label class="field">Title<input name="title" required placeholder="Result declared" /></label>
          <label class="field">User id (blank = everyone)<input name="userId" placeholder="" /></label>
          <label class="field" style="grid-column:1/-1">Message<textarea name="body" required></textarea></label>
          <button class="btn primary" type="submit">Send</button>
        </form>
      </div>

      <div class="card">
        <h2>Recent</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>When</th><th>To</th><th>Title</th><th class="wrap">Message</th></tr></thead>
          <tbody>${notifications
            .map(
              (n) => `<tr><td class="muted">${dt(n.created_at)}</td>
                <td>${n.user_id ? esc(n.user_mobile ?? n.user_id) : '<span class="chip">all users</span>'}</td>
                <td><strong>${esc(n.title)}</strong></td><td class="wrap">${esc(n.body)}</td></tr>`,
            )
            .join('')}</tbody>
        </table></div>
      </div>`;

    $('#send').onsubmit = guard(async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      await api('/notifications', {
        method: 'POST',
        body: {
          title: f.get('title'),
          body: f.get('body'),
          userId: f.get('userId') ? Number(f.get('userId')) : undefined,
        },
      });
      toast('Notification sent');
      render();
    });
  },
};

pages.support = {
  title: 'Support inbox',
  state: { userId: null },
  async render(root) {
    const { threads } = await api('/support');
    const st = pages.support.state;
    if (!st.userId && threads.length) st.userId = threads[0].user_id;
    const messages = st.userId ? (await api(`/support/${st.userId}`)).messages : [];
    const active = threads.find((t) => t.user_id === st.userId);

    root.innerHTML = `
      <div class="card chat">
        <div class="thread-list">
          ${
            threads.length
              ? threads
                  .map(
                    (t) => `<div class="thread ${t.user_id === st.userId ? 'active' : ''}" data-id="${t.user_id}">
                      <div class="name">${esc(t.name)}</div>
                      <div class="last">${esc(t.last_text)}</div>
                      <div class="last">${esc(t.mobile)} · ${dt(t.last_at)}</div>
                    </div>`,
                  )
                  .join('')
              : '<p class="muted">No conversations yet</p>'
          }
        </div>
        <div>
          <h2 style="margin-top:0">${active ? esc(active.name) + ' · ' + esc(active.mobile) : 'Select a chat'}</h2>
          <div class="messages" id="messages">
            ${messages
              .map(
                (m) => `<div class="msg ${esc(m.sender)}">${esc(m.text)}<div class="time">${dt(m.created_at)}</div></div>`,
              )
              .join('')}
          </div>
          ${
            st.userId
              ? `<form class="row" id="reply" style="margin-top:14px">
                   <input name="text" class="grow" placeholder="Type a reply..." autocomplete="off" />
                   <button class="btn primary" type="submit">Send</button>
                 </form>`
              : ''
          }
        </div>
      </div>`;

    $$('.thread', root).forEach((t) => {
      t.onclick = () => {
        st.userId = Number(t.dataset.id);
        render();
      };
    });

    const list = $('#messages');
    if (list) list.scrollTop = list.scrollHeight;

    const form = $('#reply');
    if (form) {
      form.onsubmit = guard(async (e) => {
        e.preventDefault();
        const text = new FormData(e.target).get('text');
        if (!String(text).trim()) return;
        await api(`/support/${st.userId}`, { method: 'POST', body: { text } });
        render();
      });
    }
  },
};

pages.ideas = {
  title: 'Submitted ideas',
  async render(root) {
    const { ideas } = await api('/ideas');
    root.innerHTML = `
      <div class="card">
        <div class="table-wrap"><table>
          <thead><tr><th>When</th><th>User</th><th class="wrap">Idea</th></tr></thead>
          <tbody>${
            ideas.length
              ? ideas
                  .map(
                    (i) => `<tr><td class="muted">${dt(i.created_at)}</td>
                      <td>${esc(i.user_name)}<br /><span class="muted">${esc(i.user_mobile)}</span></td>
                      <td class="wrap">${esc(i.text)}</td></tr>`,
                  )
                  .join('')
              : '<tr><td colspan="3" class="empty">No ideas submitted yet</td></tr>'
          }</tbody>
        </table></div>
      </div>`;
  },
};

pages.settings = {
  title: 'Settings',
  async render(root) {
    const { settings, qrUrl } = await api('/settings');
    root.innerHTML = `
      <div class="card">
        <h2>Deposit payment details</h2>
        <p class="muted">Shown on the app's Add Fund screen so users know where to pay.</p>
        <form id="payment-form" class="form-grid">
          <label class="field">UPI ID<input name="upi_id" value="${esc(settings.upi_id)}" placeholder="name@bank" /></label>
          <label class="field">Account name<input name="upi_name" value="${esc(settings.upi_name)}" /></label>
          <label class="field">UPI / phone number<input name="upi_number" value="${esc(settings.upi_number)}" /></label>
          <label class="field">Require UTR + screenshot<select name="require_deposit_proof">
            <option value="1" ${settings.require_deposit_proof === '1' ? 'selected' : ''}>Yes — user must attach proof</option>
            <option value="0" ${settings.require_deposit_proof !== '1' ? 'selected' : ''}>No — amount only</option>
          </select></label>
          <label class="field" style="grid-column:1/-1">Instructions shown to the user<textarea name="deposit_note">${esc(
            settings.deposit_note,
          )}</textarea></label>
          <button class="btn primary" type="submit">Save payment details</button>
        </form>

        <h3 style="margin-top:22px">Payment QR</h3>
        <div class="row" style="align-items:flex-start">
          <div>
            ${
              qrUrl
                ? `<img src="${esc(qrUrl)}" alt="payment QR" style="width:170px;border:1px solid var(--border);border-radius:10px" />`
                : '<p class="muted">No QR uploaded</p>'
            }
          </div>
          <div>
            <input type="file" id="qr-file" accept="image/png,image/jpeg,image/webp" />
            <p class="muted" style="margin:8px 0">PNG / JPG / WEBP, under 4 MB.</p>
            ${qrUrl ? '<button class="btn danger sm" id="qr-remove">Remove QR</button>' : ''}
          </div>
        </div>
      </div>

      <div class="card">
        <h2>App settings</h2>
        <form id="settings-form" class="form-grid">
          <label class="field">App name<input name="app_name" value="${esc(settings.app_name)}" /></label>
          <label class="field">Support name<input name="support_name" value="${esc(settings.support_name)}" /></label>
          <label class="field">WhatsApp number<input name="whatsapp_number" value="${esc(settings.whatsapp_number)}" /></label>
          <label class="field">Marquee text<input name="marquee" value="${esc(settings.marquee)}" /></label>
          <label class="field">Share text<input name="share_text" value="${esc(settings.share_text)}" /></label>
          <label class="field">Auto-approve deposits<select name="auto_approve_deposit">
            <option value="1" ${settings.auto_approve_deposit === '1' ? 'selected' : ''}>Yes — credit instantly</option>
            <option value="0" ${settings.auto_approve_deposit !== '1' ? 'selected' : ''}>No — queue for approval</option>
          </select></label>
          <label class="field">Auto-declare results<select name="auto_declare">
            <option value="1" ${settings.auto_declare === '1' ? 'selected' : ''}>On — random result at market time</option>
            <option value="0" ${settings.auto_declare !== '1' ? 'selected' : ''}>Off — declare manually</option>
          </select></label>
          <label class="field" style="grid-column:1/-1">Notice board / rules<textarea name="notice">${esc(
            settings.notice,
          )}</textarea></label>
          <label class="field" style="grid-column:1/-1">Videos (JSON array of {title, url})<textarea name="videos">${esc(
            settings.videos,
          )}</textarea></label>
          <button class="btn primary" type="submit">Save settings</button>
        </form>
      </div>`;

    $('#settings-form').onsubmit = guard(async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      try {
        JSON.parse(body.videos || '[]');
      } catch {
        return toast('Videos must be valid JSON', true);
      }
      await api('/settings', { method: 'POST', body });
      toast('Settings saved');
      render();
    });

    $('#payment-form').onsubmit = guard(async (e) => {
      e.preventDefault();
      await api('/settings', { method: 'POST', body: Object.fromEntries(new FormData(e.target).entries()) });
      toast('Payment details saved');
      render();
    });

    $('#qr-file').onchange = guard(async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read that file'));
        reader.readAsDataURL(file);
      });
      await api('/payment-qr', { method: 'POST', body: { image } });
      toast('QR updated');
      render();
    });

    const removeQr = $('#qr-remove');
    if (removeQr) {
      removeQr.onclick = guard(async () => {
        await api('/payment-qr', { method: 'DELETE' });
        toast('QR removed');
        render();
      });
    }
  },
};

pages.logs = {
  title: 'Activity log',
  async render(root) {
    const { logs } = await api('/logs');
    root.innerHTML = `
      <div class="card">
        <div class="table-wrap"><table>
          <thead><tr><th>When</th><th>Action</th><th class="wrap">Detail</th></tr></thead>
          <tbody>${
            logs.length
              ? logs
                  .map(
                    (l) => `<tr><td class="muted">${dt(l.created_at)}</td><td><strong>${esc(l.action)}</strong></td>
                      <td class="wrap muted">${esc(l.detail)}</td></tr>`,
                  )
                  .join('')
              : '<tr><td colspan="3" class="empty">No activity yet</td></tr>'
          }</tbody>
        </table></div>
      </div>`;
  },
};

/* ------------------------------------------------------------------- router */

const NAV = [
  ['dashboard', 'Dashboard'],
  ['results', 'Results'],
  ['markets', 'Markets'],
  ['bids', 'Bids'],
  ['users', 'Users'],
  ['funds', 'Fund requests'],
  ['rates', 'Game rates'],
  ['notifications', 'Notifications'],
  ['support', 'Support'],
  ['ideas', 'Ideas'],
  ['settings', 'Settings'],
  ['logs', 'Activity log'],
];

function currentRoute() {
  const name = (location.hash.replace('#/', '').split('?')[0] || 'dashboard').trim();
  return pages[name] ? name : 'dashboard';
}

function buildNav(badges = {}) {
  $('#nav').innerHTML = NAV.map(([key, label]) => {
    const badge = badges[key] ? `<span class="badge">${badges[key]}</span>` : '';
    return `<a href="#/${key}" class="${currentRoute() === key ? 'active' : ''}">${label}${badge}</a>`;
  }).join('');
}

async function render() {
  const name = currentRoute();
  const page = pages[name];
  $('#page-title').textContent = page.title;
  buildNav(render.badges ?? {});
  $('#page').innerHTML = '<p class="muted">Loading…</p>';
  try {
    await page.render($('#page'));
  } catch (err) {
    $('#page').innerHTML = `<div class="card"><p class="error">${esc(err.message)}</p></div>`;
  }
  refreshBadges();
}

async function refreshBadges() {
  try {
    const s = await api('/stats');
    render.badges = {};
    const pending = s.funds.pendingDeposits + s.funds.pendingWithdraws;
    if (pending) render.badges.funds = pending;
    buildNav(render.badges);
    $('#auto-chip').textContent = s.autoDeclare ? 'Auto results: ON' : 'Auto results: OFF';
    $('#auto-chip').className = `chip ${s.autoDeclare ? 'ok' : 'warn'}`;
  } catch {
    // badge refresh is best-effort
  }
}

/* -------------------------------------------------------------------- login */

function showLogin() {
  $('#shell').classList.add('hidden');
  $('#login').classList.remove('hidden');
}

function showShell() {
  $('#login').classList.add('hidden');
  $('#shell').classList.remove('hidden');
  render();
}

$('#login-form').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  $('#login-error').textContent = '';
  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: f.get('username'), password: f.get('password') }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    localStorage.setItem(TOKEN_KEY, data.token);
    showShell();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
};

$('#logout').onclick = () => {
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
};

$('#refresh').onclick = () => render();
$('#menu-btn').onclick = () => $('.sidebar').classList.toggle('open');
window.addEventListener('hashchange', () => {
  $('.sidebar').classList.remove('open');
  render();
});

/* --------------------------------------------------------------------- boot */

(async function boot() {
  if (!localStorage.getItem(TOKEN_KEY)) return showLogin();
  try {
    await api('/me');
    showShell();
  } catch {
    showLogin();
  }
})();
