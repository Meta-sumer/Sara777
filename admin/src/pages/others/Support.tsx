import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../../api';
import { dt } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import type { SupportMessage, SupportThreadRow } from '../../types';
import { Resource, useToast } from '../../ui';

export function Support() {
  const { nonce } = useRefresh();
  const toast = useToast();
  const [userId, setUserId] = useState<number | null>(null);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { threads } = await api<{ threads: SupportThreadRow[] }>('/support');
    const active = userId ?? threads[0]?.user_id ?? null;
    const messages = active
      ? (await api<{ messages: SupportMessage[] }>(`/support/${active}`)).messages
      : [];
    return { threads, messages, active };
  }, [userId, nonce]);

  const state = useLoad(load);

  // keep the newest message in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.data]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const active = state.data?.active;
    if (!active || !text.trim()) return;
    try {
      await api(`/support/${active}`, { method: 'POST', body: { text } });
      setText('');
      await state.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', true);
    }
  }

  return (
    <Resource state={state}>
      {({ threads, messages, active }) => {
        const thread = threads.find((t) => t.user_id === active);
        return (
          <div className="card chat">
            <div className="thread-list">
              {threads.length === 0 ? (
                <p className="muted">No conversations yet</p>
              ) : (
                threads.map((t) => (
                  <div
                    key={t.user_id}
                    className={`thread${t.user_id === active ? ' active' : ''}`}
                    onClick={() => setUserId(t.user_id)}
                  >
                    <div className="name">{t.name}</div>
                    <div className="last">{t.last_text}</div>
                    <div className="last">
                      {t.mobile} · {dt(t.last_at)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div>
              <h2 style={{ marginTop: 0 }}>
                {thread ? `${thread.name} · ${thread.mobile}` : 'Select a chat'}
              </h2>

              <div className="messages" ref={listRef}>
                {messages.map((m) => (
                  <div key={m.id} className={`msg ${m.sender}`}>
                    {m.text}
                    <div className="time">{dt(m.created_at)}</div>
                  </div>
                ))}
              </div>

              {active && (
                <form className="row" style={{ marginTop: 14 }} onSubmit={send}>
                  <input
                    className="grow"
                    placeholder="Type a reply..."
                    autoComplete="off"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <button className="btn primary" type="submit">
                    Send
                  </button>
                </form>
              )}
            </div>
          </div>
        );
      }}
    </Resource>
  );
}
