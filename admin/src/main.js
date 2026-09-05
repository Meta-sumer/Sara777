/* Entry point. Resume the stored session if the server still accepts the token,
   otherwise show the login screen. */

import { api, TOKEN_KEY } from './api.js';
import { showLogin, showShell } from './auth.js';

(async function boot() {
  if (!localStorage.getItem(TOKEN_KEY)) return showLogin();
  try {
    await api('/me');
    showShell();
  } catch {
    showLogin();
  }
})();
