/* Admin API client. Every request carries the bearer token, and a 401/403 drops
   the token and drops you back on the login screen. */

import { toast } from './ui.js';
// Cycle with auth.js is deliberate: showLogin is a function declaration, so it is
// hoisted and callable even while this module is still evaluating.
import { showLogin } from './auth.js';

/* config.js sets ADMIN_API_ORIGIN: empty when the API serves this panel itself,
   the API's public origin when the panel is deployed as its own static site. */
export const API = `${window.ADMIN_API_ORIGIN ?? ''}/api/admin`;
export const TOKEN_KEY = 'admin.token';

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
    throw new Error(data.message || 'Session expired');
  }
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

/** Wrap an action so failures surface as a toast instead of a silent console error. */
export function guard(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      toast(err.message, true);
    }
  };
}
