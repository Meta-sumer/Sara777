/* Number and date formatting. One format everywhere (the reference panel mixed
   several): dates DD/MM/YYYY, times hh:mm:ss AM/PM, money with Indian grouping. */

const p2 = (x: number) => String(x).padStart(2, '0');

/** Whole numbers with Indian grouping: 1,23,456 */
export function fmt(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/** Money: Indian grouping, up to 2 decimals (rates like 9.5x make .5 amounts). */
export function amt(n: number | null | undefined): string {
  const v = Number(n || 0);
  return v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** "680750/-" style used on wallet and report totals. */
export function slash(n: number | null | undefined): string {
  return `${Math.round(Number(n || 0) * 100) / 100}/-`;
}

function time12(d: Date, seconds = true): string {
  const h = d.getHours();
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${p2(hh)}:${p2(d.getMinutes())}${seconds ? `:${p2(d.getSeconds())}` : ''} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** ISO timestamp → "03/09/2022 08:45:28 PM" */
export function dt(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${time12(d)}`;
}

/** ISO timestamp or YYYY-MM-DD → "03/09/2022" */
export function dateOnly(value: string | null | undefined): string {
  if (!value) return '--';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--';
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** ISO timestamp → "08:45:28 PM" */
export function timeOnly(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '--' : time12(d);
}

/** "HH:MM" (24h) → "09:05 PM" */
export function hhmm12(hhmm: string | null | undefined): string {
  if (!hhmm) return '--';
  const [h, m] = hhmm.split(':').map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${p2(hh)}:${p2(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Local date as YYYY-MM-DD (value for <input type="date">). */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** YYYY-MM-DD shifted by `days`. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export const KIND_LABEL: Record<string, string> = {
  main: 'Main Market',
  starline: 'Starline',
  andarbahar: 'Andar Bahar',
};

export const SESSION_LABEL: Record<string, string> = { open: 'Open', close: 'Close' };
