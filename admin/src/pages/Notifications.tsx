import { useCallback, useState, type FormEvent } from 'react';
import { api } from '../api';
import { dt } from '../format';
import { useLoad } from '../hooks';
import { useRefresh } from '../refresh';
import type { Notification } from '../types';
import { Card, Resource, TableWrap, useToast } from '../ui';

export function Notifications() {
  const { nonce } = useRefresh();
  const toast = useToast();
  const load = useCallback(
    () => api<{ notifications: Notification[] }>('/notifications'),
    [nonce],
  );
  const state = useLoad(load);

  const [title, setTitle] = useState('');
  const [userId, setUserId] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/notifications', {
        method: 'POST',
        body: { title, body, userId: userId ? Number(userId) : undefined },
      });
      toast('Notification sent');
      setTitle('');
      setUserId('');
      setBody('');
      await state.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card title="Send notification">
        <form className="form-grid" onSubmit={send}>
          <label className="field">
            Title
            <input
              required
              placeholder="Result declared"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="field">
            User id (blank = everyone)
            <input value={userId} onChange={(e) => setUserId(e.target.value)} />
          </label>
          <label className="field" style={{ gridColumn: '1/-1' }}>
            Message
            <textarea required value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </form>
      </Card>

      <Resource state={state}>
        {({ notifications }) => (
          <Card title="Recent">
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>To</th>
                    <th>Title</th>
                    <th className="wrap">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty">
                        Nothing sent yet
                      </td>
                    </tr>
                  ) : (
                    notifications.map((n) => (
                      <tr key={n.id}>
                        <td className="muted">{dt(n.created_at)}</td>
                        <td>
                          {n.user_id ? (
                            (n.user_mobile ?? String(n.user_id))
                          ) : (
                            <span className="chip">all users</span>
                          )}
                        </td>
                        <td>
                          <strong>{n.title}</strong>
                        </td>
                        <td className="wrap">{n.body}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}
      </Resource>
    </>
  );
}
