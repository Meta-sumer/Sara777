import { Router } from 'express';
import { db, getSetting, nowIso } from '../db.js';
import { type AuthedRequest, requireAuth } from '../auth.js';
import { allRates } from '../rates.js';
import { uploadUrl } from '../uploads.js';

export const miscRouter = Router();

/** App-wide config the client needs on boot (support number, notice, videos). */
miscRouter.get('/settings', (_req, res) => {
  res.json({
    appName: getSetting('app_name', 'Rama777'),
    whatsappNumber: getSetting('whatsapp_number', '919999999999'),
    supportName: getSetting('support_name', 'Rama777 Support'),
    marquee: getSetting('marquee', 'Beware of fake applications'),
    notice: getSetting('notice', ''),
    shareText: getSetting('share_text', 'Play on Rama777!'),
    videos: JSON.parse(getSetting('videos', '[]')),
    minDeposit: 100,
    minWithdraw: 500,
    payment: {
      upiId: getSetting('upi_id', ''),
      upiName: getSetting('upi_name', ''),
      upiNumber: getSetting('upi_number', ''),
      qrUrl: uploadUrl(getSetting('upi_qr_file', '') || null),
      note: getSetting('deposit_note', ''),
      requireProof: getSetting('require_deposit_proof', '1') === '1',
      autoApprove: getSetting('auto_approve_deposit', '0') === '1',
    },
  });
});

miscRouter.get('/game-rates', (_req, res) => {
  res.json({
    rates: allRates()
      .filter((g) => g.isActive)
      .map((g) => ({
        key: g.key,
        label: g.label,
        rate: g.rate,
        display: `10 - ${10 * g.rate}`,
        kinds: g.kinds,
      })),
  });
});

miscRouter.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id IS NULL OR user_id = ? ORDER BY id DESC LIMIT 100')
    .all(req.user!.id) as Array<Record<string, unknown>>;
  res.json({
    notifications: rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      createdAt: n.created_at,
    })),
  });
});

miscRouter.post('/ideas', requireAuth, (req: AuthedRequest, res) => {
  const text = String(req.body?.text ?? '').trim();
  if (text.length < 5) return res.status(400).json({ message: 'Please write your idea' });
  db.prepare('INSERT INTO ideas (user_id, text, created_at) VALUES (?, ?, ?)').run(req.user!.id, text, nowIso());
  res.status(201).json({ ok: true, message: 'Thanks! Your idea has been submitted.' });
});

/* ------------------------------------------------------------ support chat */

miscRouter.get('/support', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM support_messages WHERE user_id = ? ORDER BY id ASC LIMIT 200')
    .all(req.user!.id) as Array<Record<string, unknown>>;

  if (rows.length === 0) {
    db.prepare('INSERT INTO support_messages (user_id, sender, text, created_at) VALUES (?, ?, ?, ?)').run(
      req.user!.id,
      'support',
      `Welcome to ${getSetting('support_name', 'Support')} 🙏\nHow can I help you?`,
      nowIso(),
    );
    return res.json({
      messages: db
        .prepare('SELECT * FROM support_messages WHERE user_id = ? ORDER BY id ASC')
        .all(req.user!.id)
        .map(mapMessage),
    });
  }
  res.json({ messages: rows.map(mapMessage) });
});

miscRouter.post('/support', requireAuth, (req: AuthedRequest, res) => {
  const text = String(req.body?.text ?? '').trim();
  if (!text) return res.status(400).json({ message: 'Type a message' });
  db.prepare('INSERT INTO support_messages (user_id, sender, text, created_at) VALUES (?, ?, ?, ?)').run(
    req.user!.id,
    'user',
    text,
    nowIso(),
  );
  db.prepare('INSERT INTO support_messages (user_id, sender, text, created_at) VALUES (?, ?, ?, ?)').run(
    req.user!.id,
    'support',
    'Thanks for your message. Our team will reply shortly.',
    nowIso(),
  );
  res.status(201).json({
    messages: db
      .prepare('SELECT * FROM support_messages WHERE user_id = ? ORDER BY id ASC')
      .all(req.user!.id)
      .map(mapMessage),
  });
});

function mapMessage(m: unknown) {
  const r = m as Record<string, unknown>;
  return { id: r.id, sender: r.sender, text: r.text, createdAt: r.created_at };
}
