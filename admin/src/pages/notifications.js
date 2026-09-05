/* Broadcast to everyone or notify a single user. */

import { $, esc, dt, toast } from '../ui.js';
import { api, guard } from '../api.js';
import { render } from '../router.js';

export const page = {
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
