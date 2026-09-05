/* Read user chat threads and reply as support. */

import { $, $$, esc, dt } from '../ui.js';
import { api, guard } from '../api.js';
import { render } from '../router.js';

export const page = {
  title: 'Support inbox',
  state: { userId: null },
  async render(root) {
    const { threads } = await api('/support');
    const st = page.state;
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
