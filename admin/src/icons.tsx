/* Small inline SVG icon set for the sidebar and buttons (no icon font needed). */
import type { ReactElement } from 'react';

const P = (d: string) => <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />;

const ICONS: Record<string, ReactElement> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="14" y="14" width="7" height="7" rx="1" fill="currentColor" />
    </>
  ),
  users: (
    <>
      {P('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2')}
      <circle cx="9" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      {P('M23 21v-2a4 4 0 0 0-3-3.87')}
      {P('M16 3.13a4 4 0 0 1 0 7.75')}
    </>
  ),
  games: (
    <>
      {P('M6 11h4M8 9v4')}
      {P('M15 12h.01M18 10h.01')}
      {P('M17.32 5H6.68a4 4 0 0 0-3.98 3.59L2 15a3 3 0 0 0 5.2 2.03L9 15h6l1.8 2.03A3 3 0 0 0 22 15l-.7-6.41A4 4 0 0 0 17.32 5z')}
    </>
  ),
  star: P('M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'),
  diamond: <path d="M12 21.5 3 11l3.5-6h11L21 11z" fill="currentColor" />,
  wallet: (
    <>
      <rect x="2" y="5" width="20" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      {P('M16 12h2')}
      {P('M2 9h20')}
    </>
  ),
  check: P('M20 6 9 17l-5-5'),
  close: P('M18 6 6 18M6 6l12 12'),
  report: (
    <>
      {P('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z')}
      {P('M14 2v6h6M16 13H8M16 17H8M10 9H8')}
    </>
  ),
  bell: (
    <>
      {P('M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9')}
      {P('M13.73 21a2 2 0 0 1-3.46 0')}
    </>
  ),
  monitor: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      {P('M8 21h8M12 17v4')}
    </>
  ),
  trash: (
    <>
      {P('M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6')}
      {P('M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2')}
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      {P('M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z')}
    </>
  ),
  shield: P('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'),
  more: (
    <>
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
    </>
  ),
  edit: (
    <>
      {P('M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7')}
      {P('M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z')}
    </>
  ),
  history: (
    <>
      {P('M3 3v5h5')}
      {P('M3.05 13A9 9 0 1 0 6 5.3L3 8')}
      {P('M12 7v5l4 2')}
    </>
  ),
  user: (
    <>
      {P('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2')}
      <circle cx="12" cy="7" r="4" fill="currentColor" />
    </>
  ),
  trend: P('M23 6l-9.5 9.5-5-5L1 18M17 6h6v6'),
  download: P('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3'),
  plus: P('M12 5v14M5 12h14'),
  ban: (
    <>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      {P('M4.93 4.93l14.14 14.14')}
    </>
  ),
  winners: (
    <>
      {P('M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2')}
      <circle cx="8.5" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      {P('M17 11l2 2 4-4')}
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      {P('M21 21l-4.35-4.35')}
    </>
  ),
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size }: { name: IconName | string; size?: number }) {
  const body = ICONS[name] ?? ICONS.more;
  return (
    <svg viewBox="0 0 24 24" width={size ?? 18} height={size ?? 18} aria-hidden="true">
      {body}
    </svg>
  );
}
