/* App name, support details, marquee, notice board, videos and automation toggles. */

import { $, esc, toast } from '../ui.js';
import { api, guard } from '../api.js';
import { render } from '../router.js';

export const page = {
  title: 'Settings',
  async render(root) {
    const { settings, qrUrl } = await api('/settings');
    root.innerHTML = `
      <div class="card">
        <h2>Deposit payment details</h2>
        <p class="muted">Shown on the app's Add Fund screen so users know where to pay.</p>
        <form id="payment-form" class="form-grid">
          <label class="field">UPI ID<input name="upi_id" value="${esc(settings.upi_id)}" placeholder="name@bank" /></label>
          <label class="field">Account name<input name="upi_name" value="${esc(settings.upi_name)}" /></label>
          <label class="field">UPI / phone number<input name="upi_number" value="${esc(settings.upi_number)}" /></label>
          <label class="field">Require UTR + screenshot<select name="require_deposit_proof">
            <option value="1" ${settings.require_deposit_proof === '1' ? 'selected' : ''}>Yes — user must attach proof</option>
            <option value="0" ${settings.require_deposit_proof !== '1' ? 'selected' : ''}>No — amount only</option>
          </select></label>
          <label class="field" style="grid-column:1/-1">Instructions shown to the user<textarea name="deposit_note">${esc(
            settings.deposit_note,
          )}</textarea></label>
          <button class="btn primary" type="submit">Save payment details</button>
        </form>

        <h3 style="margin-top:22px">Payment QR</h3>
        <div class="row" style="align-items:flex-start">
          <div>
            ${
              qrUrl
                ? `<img src="${esc(qrUrl)}" alt="payment QR" style="width:170px;border:1px solid var(--border);border-radius:10px" />`
                : '<p class="muted">No QR uploaded</p>'
            }
          </div>
          <div>
            <input type="file" id="qr-file" accept="image/png,image/jpeg,image/webp" />
            <p class="muted" style="margin:8px 0">PNG / JPG / WEBP, under 4 MB.</p>
            ${qrUrl ? '<button class="btn danger sm" id="qr-remove">Remove QR</button>' : ''}
          </div>
        </div>
      </div>

      <div class="card">
        <h2>App settings</h2>
        <form id="settings-form" class="form-grid">
          <label class="field">App name<input name="app_name" value="${esc(settings.app_name)}" /></label>
          <label class="field">Support name<input name="support_name" value="${esc(settings.support_name)}" /></label>
          <label class="field">WhatsApp number<input name="whatsapp_number" value="${esc(settings.whatsapp_number)}" /></label>
          <label class="field">Marquee text<input name="marquee" value="${esc(settings.marquee)}" /></label>
          <label class="field">Share text<input name="share_text" value="${esc(settings.share_text)}" /></label>
          <label class="field">Auto-approve deposits<select name="auto_approve_deposit">
            <option value="1" ${settings.auto_approve_deposit === '1' ? 'selected' : ''}>Yes — credit instantly</option>
            <option value="0" ${settings.auto_approve_deposit !== '1' ? 'selected' : ''}>No — queue for approval</option>
          </select></label>
          <label class="field">Auto-declare results<select name="auto_declare">
            <option value="1" ${settings.auto_declare === '1' ? 'selected' : ''}>On — random result at market time</option>
            <option value="0" ${settings.auto_declare !== '1' ? 'selected' : ''}>Off — declare manually</option>
          </select></label>
          <label class="field" style="grid-column:1/-1">Notice board / rules<textarea name="notice">${esc(
            settings.notice,
          )}</textarea></label>
          <label class="field" style="grid-column:1/-1">Videos (JSON array of {title, url})<textarea name="videos">${esc(
            settings.videos,
          )}</textarea></label>
          <button class="btn primary" type="submit">Save settings</button>
        </form>
      </div>`;

    $('#settings-form').onsubmit = guard(async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      try {
        JSON.parse(body.videos || '[]');
      } catch {
        return toast('Videos must be valid JSON', true);
      }
      await api('/settings', { method: 'POST', body });
      toast('Settings saved');
      render();
    });

    $('#payment-form').onsubmit = guard(async (e) => {
      e.preventDefault();
      await api('/settings', { method: 'POST', body: Object.fromEntries(new FormData(e.target).entries()) });
      toast('Payment details saved');
      render();
    });

    $('#qr-file').onchange = guard(async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read that file'));
        reader.readAsDataURL(file);
      });
      await api('/payment-qr', { method: 'POST', body: { image } });
      toast('QR updated');
      render();
    });

    const removeQr = $('#qr-remove');
    if (removeQr) {
      removeQr.onclick = guard(async () => {
        await api('/payment-qr', { method: 'DELETE' });
        toast('QR removed');
        render();
      });
    }
  },
};
