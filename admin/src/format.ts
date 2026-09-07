/* Number and date formatting, matching what the panel showed before. */

export function fmt(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString('en-IN');
}

export function dt(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function today(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
