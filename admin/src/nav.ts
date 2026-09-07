/* Sidebar order, route paths and the title shown in the topbar. */
export const NAV = [
  { path: 'dashboard', label: 'Dashboard', title: 'Dashboard' },
  { path: 'results', label: 'Results', title: 'Results' },
  { path: 'markets', label: 'Markets', title: 'Markets' },
  { path: 'bids', label: 'Bids', title: 'Bids' },
  { path: 'users', label: 'Users', title: 'Users' },
  { path: 'funds', label: 'Fund requests', title: 'Fund requests' },
  { path: 'rates', label: 'Game rates', title: 'Game rates' },
  { path: 'notifications', label: 'Notifications', title: 'Notifications' },
  { path: 'support', label: 'Support', title: 'Support inbox' },
  { path: 'ideas', label: 'Ideas', title: 'Submitted ideas' },
  { path: 'settings', label: 'Settings', title: 'Settings' },
  { path: 'logs', label: 'Activity log', title: 'Activity log' },
] as const;

export type NavPath = (typeof NAV)[number]['path'];
