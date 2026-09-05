/* Add, rename, retime, reorder, enable and delete markets. */

import { $, $$, esc, toast } from '../ui.js';
import { api, guard } from '../api.js';
import { render } from '../router.js';

export const page = {
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
