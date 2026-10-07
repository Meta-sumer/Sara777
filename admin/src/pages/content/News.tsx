import { useCallback, useState, type FormEvent } from 'react';
import { api } from '../../api';
import { dt } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import { Btn, Field, Page, Resource, useAction, useConfirm, useToast } from '../../ui';

/** The one news message the app shows as a popup after login. */
export function News() {
  const { nonce } = useRefresh();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, run] = useAction();
  const [message, setMessage] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => api<{ news: string; updatedAt: string | null }>('/content/news'), [nonce]);
  const state = useLoad(load);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast('Enter the news message', true);
      return;
    }
    void run(async () => {
      await api('/content/news', { method: 'POST', body: { message: message.trim() } });
      toast('News updated');
      setMessage('');
      await state.reload();
    });
  };

  const clear = async () => {
    const ok = await confirm({ message: 'Remove the current news? Users will no longer see a popup.', confirmText: 'Yes, Remove', danger: true });
    if (!ok) return;
    await run(async () => {
      await api('/content/news', { method: 'DELETE' });
      toast('News removed');
      await state.reload();
    });
  };

  return (
    <Page title="News">
      <form className="card" onSubmit={submit}>
        <Field label="Message*">
          <textarea
            value={message}
            rows={5}
            maxLength={2000}
            placeholder="Enter Message Here"
            onChange={(e) => setMessage(e.target.value)}
          />
        </Field>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : 'Submit'}
          </button>
        </div>

        <Resource state={state}>
          {(d) =>
            d.news ? (
              <div style={{ marginTop: 10 }}>
                <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--heading)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {d.news}
                </p>
                <div className="row" style={{ marginTop: 12 }}>
                  <span className="muted">Shown as a popup when users log in · updated {dt(d.updatedAt)}</span>
                  <Btn sm variant="info" icon="edit" onClick={() => setMessage(d.news)}>
                    Edit
                  </Btn>
                  <Btn sm variant="danger" icon="trash" disabled={busy} onClick={() => void clear()}>
                    Remove
                  </Btn>
                </div>
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 10 }}>
                No news is set, so users see no popup after login.
              </p>
            )
          }
        </Resource>
      </form>
    </Page>
  );
}
