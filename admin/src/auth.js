/* Login screen, shell visibility and logout. The token lives in localStorage;
   api.js clears it and calls showLogin() whenever the server rejects it. */

import { $ } from './ui.js';
import { API, TOKEN_KEY } from './api.js';
import { render } from './router.js';

export function showLogin() {
  $('#shell').classList.add('hidden');
  $('#login').classList.remove('hidden');
}

export function showShell() {
  $('#login').classList.add('hidden');
  $('#shell').classList.remove('hidden');
  render();
}

$('#login-form').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  $('#login-error').textContent = '';
  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: f.get('username'), password: f.get('password') }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    localStorage.setItem(TOKEN_KEY, data.token);
    showShell();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
};

$('#logout').onclick = () => {
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
};
