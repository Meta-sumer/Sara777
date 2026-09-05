import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** 6 MB of base64 is roughly a 4.5 MB image — plenty for a payment screenshot. */
const MAX_BYTES = 6 * 1024 * 1024;

export class UploadError extends Error {
  status = 400;
}

/**
 * Store a `data:image/...;base64,...` string as a file and return its name.
 * Clients send images this way so the API stays plain JSON.
 */
export function saveDataUri(dataUri: string, prefix = 'img'): string {
  const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(dataUri.trim());
  if (!match) throw new UploadError('Image must be a base64 data URI');

  const [, mime, payload] = match;
  const ext = MIME_EXT[mime.toLowerCase()];
  if (!ext) throw new UploadError('Only JPG, PNG or WEBP images are allowed');

  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length === 0) throw new UploadError('Image is empty');
  if (buffer.length > MAX_BYTES) throw new UploadError('Image is too large, keep it under 4 MB');

  const name = `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, name), buffer);
  return name;
}

export function removeUpload(name: string | null | undefined) {
  if (!name) return;
  const target = path.join(uploadsDir, path.basename(name));
  fs.rm(target, { force: true }, () => {});
}

/** Public URL the app and admin panel use to show an uploaded file. */
export function uploadUrl(name: string | null | undefined): string | null {
  return name ? `/uploads/${name}` : null;
}
