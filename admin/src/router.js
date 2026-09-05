/* Hash router. #/<key> picks a page module, renders it into #page, and keeps the
   sidebar links and their pending-request badges in sync. */

import { $, esc } from './ui.js';
import { api } from './api.js';
import { pages } from './pages/index.js';

/** Sidebar order and labels. Keys must exist in `pages`. */
export const NAV = [
  ['dashboard', 'Dashboard'],
  ['results', 'Results'],
  ['markets', 'Markets'],
  ['bids', 'Bids'],
  ['users', 'Users'],
  ['funds', 'Fund requests'],
  ['rates', 'Game rates'],
  ['notifications', 'Notifications'],
  ['support', 'Support'],
  ['ideas', 'Ideas'],
  ['settings', 'Settings'],
  ['logs', 'Activity log'],
];

export function currentRoute() {
  const name = (location.hash.replace('#/', '').split('?')[0] || 'dashboard').trim();
  return pages[name] ? name : 'dashboard';
}

export function buildNav(badges = {}) {
  $('#nav').innerHTML = NAV.map(([key, label]) => {
    const badge = badges[key] ? `<span class="badge">${badges[key]}</span>` : '';
    return `<a href="#/${key}" class="${currentRoute() === key ? 'active' : ''}">${label}${badge}</a>`;
  }).join('');
}

export async function render() {
  const name = currentRoute();
  const page = pages[name];
  $('#page-title').textContent = page.title;
  buildNav(render.badges ?? {});
  $('#page').innerHTML = '<p class="muted">Loading…</p>';
  try {
    await page.render($('#page'));
  } catch (err) {
    $('#page').innerHTML = `<div class="card"><p class="error">${esc(err.message)}</p></div>`;
  }
  refreshBadges();
}

export async function refreshBadges() {
  try {
    const s = await api('/stats');
    render.badges = {};
    const pending = s.funds.pendingDeposits + s.funds.pendingWithdraws;
    if (pending) render.badges.funds = pending;
    buildNav(render.badges);
    $('#auto-chip').textContent = s.autoDeclare ? 'Auto results: ON' : 'Auto results: OFF';
    $('#auto-chip').className = `chip ${s.autoDeclare ? 'ok' : 'warn'}`;
  } catch {
    // badge refresh is best-effort
  }
}

$('#refresh').onclick = () => render();
$('#menu-btn').onclick = () => $('.sidebar').classList.toggle('open');
window.addEventListener('hashchange', () => {
  $('.sidebar').classList.remove('open');
  render();
});
