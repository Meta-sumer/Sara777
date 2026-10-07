/* Notifications, News, App Settings (mounted at /api/admin/content)
 *
 * App content lives in settings:
 *   news            one message the app shows as a popup after login (news_updated_at)
 *   how_to_play     JSON { title, description, videoUrl }
 *   notice_board    JSON [{ title, description, contact }] — the Withdraw screen notice;
 *                   every save also writes a plain-text copy to `notice`, which the app shows
 *   profile_note    note on the app's profile / bank details screen
 *   wallet_contacts comma-separated numbers for wallet queries
 * GET /api/settings (routes/misc.ts) hands all of it to the app via appContent().
 */
import { Router } from 'express';
import { all, db, get, getSetting, nowIso, setSetting, tx } from '../../db.js';
import { requirePerm } from '../../auth.js';
import { notify } from '../../wallet.js';
import { badRequest, log, str } from './util.js';

export const contentRouter = Router();

/* ------------------------------------------------------------ app content */

export interface HowToPlay {
  title: string;
  description: string;
  videoUrl: string;
}

export interface NoticeSection {
  title: string;
  description: string;
  contact: string;
}

function parseJson<T>(raw: string, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getHowToPlay(): HowToPlay {
  const saved = parseJson<Partial<HowToPlay> | null>(getSetting('how_to_play', ''), null);
  if (saved) {
    return { title: saved.title ?? '', description: saved.description ?? '', videoUrl: saved.videoUrl ?? '' };
  }
  // before the first save, offer the "How to play" video from General Settings
  const videos = parseJson<Array<{ title?: string; url?: string }>>(getSetting('videos', '[]'), []);
  const video = videos.find((v) => /how to play/i.test(v.title ?? '')) ?? videos[0];
  return { title: 'How to play', description: 'Please watch the video to learn how to play.', videoUrl: video?.url ?? '' };
}

export function getNoticeBoard(): NoticeSection[] {
  const saved = parseJson<Array<Partial<NoticeSection>> | null>(getSetting('notice_board', ''), null);
  if (Array.isArray(saved) && saved.length > 0) {
    return saved.map((s) => ({ title: s.title ?? '', description: s.description ?? '', contact: s.contact ?? '' }));
  }
  // before the first save: the withdraw rules, then the notice the app already shows
  const sections: NoticeSection[] = [
    {
      title: 'Withdraw Information',
      description: '👉 Minimum Withdraw is 500/- Rs\n👉 Maximum Withdraw Is 99999 Rs Per Day.',
      contact: '',
    },
  ];
  const notice = getSetting('notice', '').trim();
  if (notice) sections.push({ title: 'Notice', description: notice, contact: '' });
  return sections;
}

/** Plain-text copy of the notice board for the app's existing `notice` field. */
export function noticeText(sections: NoticeSection[]): string {
  return sections
    .map((s) =>
      [s.title.trim(), s.description.trim(), s.contact.trim() ? `Contact: ${s.contact.trim()}` : '']
        .filter(Boolean)
        .join('\n'),
    )
    .filter(Boolean)
    .join('\n\n');
}

export function getWalletContacts(): string[] {
  return getSetting('wallet_contacts', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Everything the app reads from GET /api/settings. */
export function appContent() {
  return {
    news: getSetting('news', ''),
    newsUpdatedAt: getSetting('news_updated_at', '') || null,
    howToPlay: getHowToPlay(),
    noticeBoard: getNoticeBoard(),
    profileNote: getSetting('profile_note', ''),
    walletContacts: getWalletContacts(),
  };
}

/** Required, trimmed text with a length cap. */
function text(value: unknown, label: string, max: number, required = true): string {
  const v = str(value);
  if (required && !v) throw badRequest(`${label} is required`);
  if (v.length > max) throw badRequest(`${label} must be at most ${max} characters`);
  return v;
}

/* ----------------------------------------------------------- notifications */

/** Admin-sent notifications: every broadcast, plus the single-user ones sent from this page. */
const SENT_BY_ADMIN = `(n.user_id IS NULL OR n.kind = 'admin')`;

contentRouter.get('/notifications', requirePerm('notification'), (_req, res) => {
  const rows = all<{
    id: number;
    user_id: number | null;
    title: string;
    body: string;
    created_at: string;
    user_name: string | null;
    username: string | null;
  }>(
    `SELECT n.id, n.user_id, n.title, n.body, n.created_at, u.name AS user_name, u.username
     FROM notifications n LEFT JOIN users u ON u.id = n.user_id
     WHERE ${SENT_BY_ADMIN} ORDER BY n.id DESC LIMIT 1000`,
  );
  res.json({
    notifications: rows.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.body,
      userId: n.user_id,
      sentTo: n.user_id === null ? 'All Users' : n.user_name ? `${n.user_name} (${n.username})` : `User #${n.user_id}`,
      createdAt: n.created_at,
    })),
  });
});

/** { title, message, userId? } — every user by default, or one user. */
contentRouter.post('/notifications', requirePerm('notification'), (req, res) => {
  const title = text(req.body?.title, 'Title', 100);
  const message = text(req.body?.message, 'Message', 1000);
  const rawUser = req.body?.userId;
  let userId: number | null = null;
  if (rawUser !== undefined && rawUser !== null && rawUser !== '') {
    userId = Number(rawUser);
    const user = get<{ is_deleted: number }>('SELECT is_deleted FROM users WHERE id = ?', userId);
    if (!user) throw badRequest('Selected user was not found');
    if (user.is_deleted) throw badRequest('Selected user is deleted');
  }
  notify(userId, title, message, 'admin');
  log(req, 'notification.send', { title, userId: userId ?? 'all' });
  res.status(201).json({ ok: true });
});

contentRouter.delete('/notifications/:id', requirePerm('notification'), (req, res) => {
  const id = Number(req.params.id);
  const row = get<{ id: number; title: string }>(`SELECT n.id, n.title FROM notifications n WHERE n.id = ? AND ${SENT_BY_ADMIN}`, id);
  if (!row) return res.status(404).json({ message: 'Notification not found' });
  db.prepare('DELETE FROM notifications WHERE id = ?').run(id);
  log(req, 'notification.delete', { id, title: row.title });
  res.json({ ok: true });
});

/* -------------------------------------------------------------------- news */

contentRouter.get('/news', requirePerm('news'), (_req, res) => {
  res.json({ news: getSetting('news', ''), updatedAt: getSetting('news_updated_at', '') || null });
});

contentRouter.post('/news', requirePerm('news'), (req, res) => {
  const message = text(req.body?.message, 'Message', 2000);
  tx(() => {
    setSetting('news', message);
    setSetting('news_updated_at', nowIso());
  });
  log(req, 'news.update', message.slice(0, 120));
  res.json({ news: message, updatedAt: getSetting('news_updated_at', '') });
});

contentRouter.delete('/news', requirePerm('news'), (req, res) => {
  tx(() => {
    setSetting('news', '');
    setSetting('news_updated_at', nowIso());
  });
  log(req, 'news.clear', '');
  res.json({ news: '', updatedAt: null });
});

/* ------------------------------------------------------------ how to play */

contentRouter.get('/how-to-play', requirePerm('app_settings.how_to_play'), (_req, res) => {
  res.json(getHowToPlay());
});

contentRouter.post('/how-to-play', requirePerm('app_settings.how_to_play'), (req, res) => {
  const value: HowToPlay = {
    title: text(req.body?.title, 'Title', 100),
    description: text(req.body?.description, 'Description', 5000, false),
    videoUrl: text(req.body?.videoUrl, 'Video URL', 500, false),
  };
  if (value.videoUrl) {
    let ok = false;
    try {
      ok = ['http:', 'https:'].includes(new URL(value.videoUrl).protocol);
    } catch {
      ok = false;
    }
    if (!ok) throw badRequest('Video URL must be a full link, e.g. https://youtu.be/…');
  }
  setSetting('how_to_play', JSON.stringify(value));
  log(req, 'app_settings.how_to_play', { title: value.title });
  res.json(value);
});

/* ---------------------------------------------------- notice board (withdraw) */

contentRouter.get('/notice-board', requirePerm('app_settings.notice_board'), (_req, res) => {
  // saved: false until the first Submit (the sections are then defaults, not yet in the app)
  res.json({ sections: getNoticeBoard(), notice: getSetting('notice', ''), saved: !!getSetting('notice_board', '') });
});

/** { sections: [{ title, description, contact }] } — 1 to 10 sections. */
contentRouter.post('/notice-board', requirePerm('app_settings.notice_board'), (req, res) => {
  const input = req.body?.sections;
  if (!Array.isArray(input) || input.length === 0) throw badRequest('Add at least one section');
  if (input.length > 10) throw badRequest('At most 10 sections');
  const sections: NoticeSection[] = input.map((s: Record<string, unknown>, i: number) => ({
    title: text(s?.title, `Section ${i + 1} title`, 100),
    description: text(s?.description, `Section ${i + 1} description`, 5000),
    contact: text(s?.contact, `Section ${i + 1} contact`, 50, false),
  }));
  const notice = noticeText(sections);
  tx(() => {
    setSetting('notice_board', JSON.stringify(sections));
    setSetting('notice', notice);
  });
  log(req, 'app_settings.notice_board', { sections: sections.length });
  res.json({ sections, notice });
});

/* ----------------------------------------------------------- profile note */

contentRouter.get('/profile-note', requirePerm('app_settings.profile_note'), (_req, res) => {
  res.json({ note: getSetting('profile_note', '') });
});

contentRouter.post('/profile-note', requirePerm('app_settings.profile_note'), (req, res) => {
  const note = text(req.body?.note, 'Note', 500);
  setSetting('profile_note', note);
  log(req, 'app_settings.profile_note', note.slice(0, 120));
  res.json({ note });
});

contentRouter.delete('/profile-note', requirePerm('app_settings.profile_note'), (req, res) => {
  setSetting('profile_note', '');
  log(req, 'app_settings.profile_note', 'cleared');
  res.json({ note: '' });
});

/* --------------------------------------------------------- wallet contact */

contentRouter.get('/wallet-contact', requirePerm('app_settings.wallet_contact'), (_req, res) => {
  res.json({ contacts: getWalletContacts() });
});

/** { contacts: "num1,num2" | string[] } — up to 10 phone numbers; empty clears the list. */
contentRouter.post('/wallet-contact', requirePerm('app_settings.wallet_contact'), (req, res) => {
  const raw = req.body?.contacts;
  const list = (Array.isArray(raw) ? raw.map(String) : str(raw).split(/[,\n]/))
    .map((s) => s.trim())
    .filter(Boolean);
  const contacts: string[] = [];
  for (const entry of list) {
    const n = entry.replace(/[\s-]/g, '');
    if (!/^\+?\d{7,15}$/.test(n)) throw badRequest(`"${entry}" is not a valid phone number`);
    if (!contacts.includes(n)) contacts.push(n);
  }
  if (contacts.length > 10) throw badRequest('At most 10 contact numbers');
  setSetting('wallet_contacts', contacts.join(','));
  log(req, 'app_settings.wallet_contact', contacts.join(','));
  res.json({ contacts });
});
