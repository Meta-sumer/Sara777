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

export async function api<T>(path: string, { method = 'GET', body }: Options = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  const data = (text ? JSON.parse(text) : {}) as T & { message?: string };

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
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = (await res.json()) as { token?: string; message?: string };
  if (!res.ok || !data.token) throw new ApiError(data.message ?? 'Login failed', res.status);
  localStorage.setItem(TOKEN_KEY, data.token);
  return data.token;
}
