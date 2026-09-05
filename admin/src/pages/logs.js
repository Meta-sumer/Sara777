/* Every admin action with a timestamp. */

import { esc, dt } from '../ui.js';
import { api } from '../api.js';

export const page = {
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
