/* Everything submitted from the app Submit Idea screen. */

import { esc, dt } from '../ui.js';
import { api } from '../api.js';

export const page = {
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
