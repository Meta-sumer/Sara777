import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { api } from '../api';
import { useLoad } from '../hooks';
import { useRefresh } from '../refresh';
import type { SettingsMap } from '../types';
import { Card, Resource, useToast } from '../ui';

const PAYMENT_KEYS = [
  'upi_id',
  'upi_name',
  'upi_number',
  'require_deposit_proof',
  'deposit_note',
] as const;

const APP_KEYS = [
  'app_name',
  'support_name',
  'whatsapp_number',
  'marquee',
  'share_text',
  'auto_approve_deposit',
  'auto_declare',
  'notice',
  'videos',
] as const;

interface Video {
  title: string;
  url: string;
}

/**
 * `videos` is stored as a JSON array. The form edits it as rows, so the stored
 * text is only ever read here and written back by JSON.stringify — nobody has to
 * type brackets and quotes by hand.
 */
function parseVideos(raw: string): { videos: Video[]; broken: string | null } {
  if (!raw.trim()) return { videos: [], broken: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { videos: [], broken: raw };
    return {
      videos: parsed.map((v) => ({
        title: String((v as Video)?.title ?? ''),
        url: String((v as Video)?.url ?? ''),
      })),
      broken: null,
    };
  } catch {
    return { videos: [], broken: raw };
  }
}

export function Settings() {
  const { nonce } = useRefresh();
  const toast = useToast();
  const load = useCallback(
    () => api<{ settings: SettingsMap; qrUrl: string | null }>('/settings'),
    [nonce],
  );
  const state = useLoad(load);

  const [form, setForm] = useState<SettingsMap>({});
  const [videos, setVideos] = useState<Video[]>([]);
  const [brokenVideos, setBrokenVideos] = useState<string | null>(null);

  useEffect(() => {
    if (!state.data) return;
    setForm({ ...state.data.settings });
    const parsed = parseVideos(state.data.settings.videos ?? '');
    setVideos(parsed.videos);
    setBrokenVideos(parsed.broken);
  }, [state.data]);

  const setVideo = (index: number, patch: Partial<Video>) =>
    setVideos((list) => list.map((v, i) => (i === index ? { ...v, ...patch } : v)));

  const set = (key: string) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const value = (key: string) => form[key] ?? '';

  async function save(keys: readonly string[], message: string, e: FormEvent) {
    e.preventDefault();
    const body: SettingsMap = {};
    for (const k of keys) body[k] = value(k);

    // the rows are the source of truth, so what gets stored is always valid JSON
    if (keys.includes('videos')) {
      body.videos = JSON.stringify(
        videos.filter((v) => v.title.trim() || v.url.trim()),
      );
    }
    try {
      await api('/settings', { method: 'POST', body });
      toast(message);
      await state.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', true);
    }
  }

  async function uploadQr(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read that file'));
        reader.readAsDataURL(file);
      });
      await api('/payment-qr', { method: 'POST', body: { image } });
      toast('QR updated');
      await state.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', true);
    } finally {
      e.target.value = '';
    }
  }

  async function removeQr() {
    try {
      await api('/payment-qr', { method: 'DELETE' });
      toast('QR removed');
      await state.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', true);
    }
  }

  return (
    <Resource state={state}>
      {({ qrUrl }) => (
        <>
          <Card title="Deposit payment details">
            <p className="muted">Shown on the app's Add Fund screen so users know where to pay.</p>
            <form className="form-grid" onSubmit={(e) => save(PAYMENT_KEYS, 'Payment details saved', e)}>
              <label className="field">
                UPI ID
                <input placeholder="name@bank" value={value('upi_id')} onChange={set('upi_id')} />
              </label>
              <label className="field">
                Account name
                <input value={value('upi_name')} onChange={set('upi_name')} />
              </label>
              <label className="field">
                UPI / phone number
                <input value={value('upi_number')} onChange={set('upi_number')} />
              </label>
              <label className="field">
                Require UTR + screenshot
                <select
                  value={value('require_deposit_proof') === '1' ? '1' : '0'}
                  onChange={set('require_deposit_proof')}
                >
                  <option value="1">Yes — user must attach proof</option>
                  <option value="0">No — amount only</option>
                </select>
              </label>
              <label className="field" style={{ gridColumn: '1/-1' }}>
                Instructions shown to the user
                <textarea value={value('deposit_note')} onChange={set('deposit_note')} />
              </label>
              <button className="btn primary" type="submit">
                Save payment details
              </button>
            </form>

            <h3 style={{ marginTop: 22 }}>Payment QR</h3>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div>
                {qrUrl ? (
                  <img
                    src={qrUrl}
                    alt="payment QR"
                    style={{
                      width: 170,
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                    }}
                  />
                ) : (
                  <p className="muted">No QR uploaded</p>
                )}
              </div>
              <div>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadQr} />
                <p className="muted" style={{ margin: '8px 0' }}>
                  PNG / JPG / WEBP, under 4 MB.
                </p>
                {qrUrl && (
                  <button className="btn danger sm" onClick={removeQr}>
                    Remove QR
                  </button>
                )}
              </div>
            </div>
          </Card>

          <Card title="App settings">
            <form className="form-grid" onSubmit={(e) => save(APP_KEYS, 'Settings saved', e)}>
              <label className="field">
                App name
                <input value={value('app_name')} onChange={set('app_name')} />
              </label>
              <label className="field">
                Support name
                <input value={value('support_name')} onChange={set('support_name')} />
              </label>
              <label className="field">
                WhatsApp number
                <input value={value('whatsapp_number')} onChange={set('whatsapp_number')} />
              </label>
              <label className="field">
                Marquee text
                <input value={value('marquee')} onChange={set('marquee')} />
              </label>
              <label className="field">
                Share text
                <input value={value('share_text')} onChange={set('share_text')} />
              </label>
              <label className="field">
                Auto-approve deposits
                <select
                  value={value('auto_approve_deposit') === '1' ? '1' : '0'}
                  onChange={set('auto_approve_deposit')}
                >
                  <option value="1">Yes — credit instantly</option>
                  <option value="0">No — queue for approval</option>
                </select>
              </label>
              <label className="field">
                Auto-declare results
                <select
                  value={value('auto_declare') === '1' ? '1' : '0'}
                  onChange={set('auto_declare')}
                >
                  <option value="1">On — random result at market time</option>
                  <option value="0">Off — declare manually</option>
                </select>
              </label>
              <label className="field" style={{ gridColumn: '1/-1' }}>
                Notice board / rules
                <textarea value={value('notice')} onChange={set('notice')} />
              </label>
              <div style={{ gridColumn: '1/-1' }}>
                <div className="text-[12.5px] font-semibold text-muted">Videos</div>
                <p className="muted" style={{ margin: '4px 0 10px' }}>
                  Shown on the app's Videos screen. Give each one a title and paste its link.
                </p>

                {brokenVideos && (
                  <div style={{ marginBottom: 10 }}>
                    <p className="error" style={{ marginBottom: 4 }}>
                      The saved value was not a readable list, so nothing is filled in below.
                      Saving will replace it. The old value is kept here in case you need it:
                    </p>
                    <code className="block break-all rounded-lg bg-canvas p-2 text-[12px] text-muted">
                      {brokenVideos}
                    </code>
                  </div>
                )}

                {videos.length === 0 && <p className="muted">No videos added yet.</p>}

                <div className="flex flex-col gap-2">
                  {videos.map((v, i) => (
                    <div
                      key={i}
                      className="grid gap-2"
                      style={{ gridTemplateColumns: 'minmax(130px,1fr) minmax(220px,2fr) auto' }}
                    >
                      <input
                        placeholder="How to play"
                        value={v.title}
                        onChange={(e) => setVideo(i, { title: e.target.value })}
                      />
                      <input
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={v.url}
                        onChange={(e) => setVideo(i, { url: e.target.value })}
                      />
                      <button
                        type="button"
                        className="btn danger sm"
                        onClick={() => setVideos((l) => l.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="btn ghost sm"
                  style={{ marginTop: 10 }}
                  onClick={() => setVideos((l) => [...l, { title: '', url: '' }])}
                >
                  + Add video
                </button>
              </div>
              <button className="btn primary" type="submit">
                Save settings
              </button>
            </form>
          </Card>
        </>
      )}
    </Resource>
  );
}
