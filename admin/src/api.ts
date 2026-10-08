/* Admin API client.
 *
 * The path is relative on purpose: Vite proxies /api to the local backend on
 * 4100 in dev, and the API serves the built panel itself in production, so the
 * browser only ever talks to one origin.
 */

const BASE = '/api/admin';
export const TOKEN_KEY = 'admin.token';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** AuthProvider registers a logout here, so a rejected token drops the session. */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

interface Options {
  method?: string;
  body?: unknown;
}

/** What to tell the admin when the host (not our API) answers with a non-JSON error page. */
function hostMessage(status: number): string | null {
  if (status === 429) return 'Too many requests right now. Please wait a minute and try again.';
  if (status === 502 || status === 503 || status === 504) {
    return 'The server is starting up or unavailable. Please try again in a minute.';
  }
  return null;
}

/**
 * Read a response body as JSON. Hosting layers (Render, Cloudflare, Vercel) can
 * answer with plain text or HTML — those become a readable { message }.
 */
async function readBody<T>(res: Response): Promise<T & { message?: string }> {
  const text = await res.text();
  if (!text) return {} as T & { message?: string };
  try {
    return JSON.parse(text) as T & { message?: string };
  } catch {
    const plain = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    const message = hostMessage(res.status) ?? (plain || `Request failed (${res.status})`);
    return { message } as T & { message?: string };
  }
}

/** fetch() that turns "no connection" into a readable error. */
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError('Cannot reach the server. Check your internet connection and try again.', 0);
  }
}

export async function api<T>(path: string, { method = 'GET', body }: Options = {}): Promise<T> {
  const res = await send(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await readBody<T>(res);

  // 401 = session gone (expired, blocked, deleted) → back to login.
  // 403 = logged in but this page/action is not in the admin's permissions.
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    onUnauthorized();
    throw new ApiError(data.message ?? 'Session expired', res.status);
  }
  if (!res.ok) throw new ApiError(data.message ?? 'Request failed', res.status);
  return data;
}

/** Log in and store the token. Kept apart from api() because it carries no token. */
export async function login(username: string, password: string): Promise<string> {
  const res = await send(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await readBody<{ token?: string }>(res);
  if (!res.ok || !data.token) throw new ApiError(data.message ?? 'Login failed', res.status);
  localStorage.setItem(TOKEN_KEY, data.token);
  return data.token;
}
