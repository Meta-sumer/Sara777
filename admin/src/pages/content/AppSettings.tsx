/* App Settings: How To Play, Notice Board (the app's Withdraw screen notice),
   Profile Note and Wallet Update Contact. Each page edits one setting that the
   app reads from GET /api/settings. */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../../api';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import { Btn, Card, Field, Page, Resource, useAction, useConfirm, useToast } from '../../ui';

/** Load a setting page's data; the top-bar Refresh reloads it. */
function useSetting<T>(path: string) {
  const { nonce } = useRefresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => api<T>(path), [path, nonce]);
  return useLoad(load);
}

function SubmitRow({ busy, children }: { busy: boolean; children?: ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
      {children}
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? 'Please wait…' : 'Submit'}
      </button>
    </div>
  );
}

/** Label on the left, input on the right (stacks on phones), as on the reference form. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-2 md:gap-6 items-start">
      <span style={{ fontWeight: 700, color: 'var(--heading)', paddingTop: 9 }}>{label}</span>
      {children}
    </label>
  );
}

/** Current value in large bold text under the form (News / Profile Note pattern). */
function CurrentValue({ text, empty }: { text: string; empty: string }) {
  return text ? (
    <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--heading)', margin: '10px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {text}
    </p>
  ) : (
    <p className="muted" style={{ marginTop: 10 }}>
      {empty}
    </p>
  );
}

/* ------------------------------------------------------------ How To Play */

interface HowToPlayValue {
  title: string;
  description: string;
  videoUrl: string;
}

export function HowToPlay() {
  const toast = useToast();
  const [busy, run] = useAction();
  const state = useSetting<HowToPlayValue>('/content/how-to-play');
  const [form, setForm] = useState<HowToPlayValue>({ title: '', description: '', videoUrl: '' });

  useEffect(() => {
    if (state.data) setForm(state.data);
  }, [state.data]);

  const set = (key: keyof HowToPlayValue) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast('Enter a title', true);
      return;
    }
    void run(async () => {
      await api('/content/how-to-play', { method: 'POST', body: form });
      toast('How To Play updated');
      await state.reload();
    });
  };

  return (
    <Page title="How To Play">
      <Card title="Update How To Play">
        <Resource state={state}>
          {() => (
            <form className="form-stack" onSubmit={submit}>
              <Row label="Title">
                <input value={form.title} maxLength={100} placeholder="Enter Title" onChange={set('title')} />
              </Row>
              <Row label="Description">
                <textarea value={form.description} rows={5} maxLength={5000} placeholder="Enter Description" onChange={set('description')} />
              </Row>
              <Row label="YouTube Video URL">
                <input value={form.videoUrl} maxLength={500} placeholder="https://youtu.be/…" onChange={set('videoUrl')} />
              </Row>
              <SubmitRow busy={busy}>
                {state.data?.videoUrl && (
                  <a className="btn ghost" href={state.data.videoUrl} target="_blank" rel="noreferrer">
                    Open Saved Video
                  </a>
                )}
              </SubmitRow>
            </form>
          )}
        </Resource>
      </Card>
    </Page>
  );
}

/* ----------------------------------------------- Notice Board (Withdraw screen) */

interface Section {
  title: string;
  description: string;
  contact: string;
}

export function NoticeBoard() {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, run] = useAction();
  const state = useSetting<{ sections: Section[]; notice: string; saved: boolean }>('/content/notice-board');
  const [sections, setSections] = useState<Section[]>([]);

  useEffect(() => {
    if (state.data) setSections(state.data.sections);
  }, [state.data]);

  const update = (i: number, key: keyof Section, value: string) =>
    setSections((list) => list.map((s, k) => (k === i ? { ...s, [key]: value } : s)));

  const removeSection = async (i: number) => {
    const ok = await confirm({
      message: `Remove Section ${i + 1}? It is gone from the app after you press Submit.`,
      confirmText: 'Yes, Remove',
      danger: true,
    });
    if (ok) setSections((list) => list.filter((_, k) => k !== i));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const missing = sections.findIndex((s) => !s.title.trim() || !s.description.trim());
    if (missing >= 0) {
      toast(`Section ${missing + 1} needs a title and a description`, true);
      return;
    }
    void run(async () => {
      await api('/content/notice-board', {
        method: 'POST',
        body: { sections: sections.map((s, i) => ({ ...s, contact: i === 0 ? s.contact : '' })) },
      });
      toast('Notice board updated');
      await state.reload();
    });
  };

  return (
    <Page title="Notice Board">
      <Resource state={state}>
        {(d) => (
          <form onSubmit={submit}>
            <h2 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 800 }}>Update Notice Board</h2>
            {!d.saved && (
              <p className="chip pending" style={{ display: 'block', padding: '10px 14px', marginBottom: 16, fontSize: 14 }}>
                These are the starting sections. Press Submit to publish them on the app's withdraw screen.
              </p>
            )}
            {sections.map((s, i) => (
              <Card
                key={i}
                title={`Section ${i + 1}`}
                actions={
                  sections.length > 1 ? (
                    <Btn sm variant="danger" icon="trash" onClick={() => void removeSection(i)}>
                      Remove
                    </Btn>
                  ) : undefined
                }
              >
                <div className="form-stack">
                  <Field label={`Section ${i + 1} Title`}>
                    <input value={s.title} maxLength={100} placeholder="Enter Title" onChange={(e) => update(i, 'title', e.target.value)} />
                  </Field>
                  <Field label="Description">
                    <textarea
                      value={s.description}
                      rows={5}
                      maxLength={5000}
                      placeholder="Enter Description"
                      onChange={(e) => update(i, 'description', e.target.value)}
                    />
                  </Field>
                  {i === 0 && (
                    <Field label="Contact">
                      <input
                        value={s.contact}
                        maxLength={50}
                        placeholder="Contact number shown with this section (optional)"
                        onChange={(e) => update(i, 'contact', e.target.value)}
                      />
                    </Field>
                  )}
                </div>
              </Card>
            ))}
            <div className="card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <Btn
                  variant="ghost"
                  icon="plus"
                  disabled={sections.length >= 10}
                  onClick={() => setSections((list) => [...list, { title: '', description: '', contact: '' }])}
                >
                  Add Section
                </Btn>
                <button className="btn primary" type="submit" disabled={busy}>
                  {busy ? 'Please wait…' : 'Submit'}
                </button>
              </div>
              <h3 style={{ margin: '20px 0 8px' }}>Notice text the app shows now</h3>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit',
                  background: 'var(--bg)',
                  padding: 14,
                  borderRadius: 6,
                  color: 'var(--heading)',
                }}
              >
                {d.notice || 'No notice set.'}
              </pre>
            </div>
          </form>
        )}
      </Resource>
    </Page>
  );
}

/* ------------------------------------------------------------- Profile Note */

export function ProfileNote() {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, run] = useAction();
  const state = useSetting<{ note: string }>('/content/profile-note');
  const [note, setNote] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim()) {
      toast('Enter the note', true);
      return;
    }
    void run(async () => {
      await api('/content/profile-note', { method: 'POST', body: { note: note.trim() } });
      toast('Profile note updated');
      setNote('');
      await state.reload();
    });
  };

  const clear = async () => {
    if (!(await confirm({ message: 'Remove the profile note from the app?', confirmText: 'Yes, Remove', danger: true }))) return;
    await run(async () => {
      await api('/content/profile-note', { method: 'DELETE' });
      toast('Profile note removed');
      await state.reload();
    });
  };

  return (
    <Page title="Profile Note">
      <form className="card" onSubmit={submit}>
        <Field label="Note">
          <input value={note} maxLength={500} placeholder="Enter note" onChange={(e) => setNote(e.target.value)} />
        </Field>
        <SubmitRow busy={busy} />
        <Resource state={state}>
          {(d) => (
            <>
              <CurrentValue text={d.note} empty="No note is set. The app's profile / bank details screen shows no note." />
              {d.note && (
                <div className="row" style={{ marginTop: 12 }}>
                  <span className="muted">Shown on the app's profile / bank details screen</span>
                  <Btn sm variant="info" icon="edit" onClick={() => setNote(d.note)}>
                    Edit
                  </Btn>
                  <Btn sm variant="danger" icon="trash" disabled={busy} onClick={() => void clear()}>
                    Remove
                  </Btn>
                </div>
              )}
            </>
          )}
        </Resource>
      </form>
    </Page>
  );
}

/* ---------------------------------------------------- Wallet Update Contact */

export function WalletContact() {
  const toast = useToast();
  const [busy, run] = useAction();
  const state = useSetting<{ contacts: string[] }>('/content/wallet-contact');
  const [text, setText] = useState('');

  useEffect(() => {
    if (state.data) setText(state.data.contacts.join(','));
  }, [state.data]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await api<{ contacts: string[] }>('/content/wallet-contact', { method: 'POST', body: { contacts: text } });
      toast(res.contacts.length ? `${res.contacts.length} contact numbers saved` : 'Contact numbers cleared');
      await state.reload();
    });
  };

  return (
    <Page title="Wallet Update Contact">
      <h2 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 800 }}>Update Wallet Related Query Contact Numbers</h2>
      <form className="card" onSubmit={submit}>
        <Field label="Contact No">
          <input
            value={text}
            placeholder="+919876543210,+447452297722"
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>
          Separate numbers with commas. Include the country code, e.g. +91. Up to 10 numbers.
        </p>
        <SubmitRow busy={busy} />
        <Resource state={state}>
          {(d) =>
            d.contacts.length ? (
              <div className="row" style={{ marginTop: 6 }}>
                <span className="muted">Shown in the app:</span>
                {d.contacts.map((c) => (
                  <span key={c} className="chip info">
                    {c}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">No contact numbers are set.</p>
            )
          }
        </Resource>
      </form>
    </Page>
  );
}
