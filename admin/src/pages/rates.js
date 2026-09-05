/* Edit payout multipliers and switch games on or off. */

import { $, $$, esc, fmt, toast } from '../ui.js';
import { api, guard } from '../api.js';
import { render } from '../router.js';

export const page = {
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
