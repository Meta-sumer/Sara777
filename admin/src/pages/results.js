/* Declare open/close panna, inspect exposure, cancel a market day and refund bids. */

import { $, $$, esc, fmt, today, toast, openModal } from '../ui.js';
import { api, guard } from '../api.js';
import { render } from '../router.js';

export const page = {
  title: 'Results',
  state: { date: today() },
  async render(root) {
    const date = page.state.date;
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
      page.state.date = e.target.value || today();
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
