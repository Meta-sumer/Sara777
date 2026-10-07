/* Sidebar tree, in the reference panel's order. Each page has a route path,
   the title shown in the top bar, and the permission key (server/src/permissions.ts)
   an employee needs to see it. routes.tsx maps every path to its component. */

export interface NavPage {
  path: string;
  label: string;
  title: string;
  perm: string;
}

export interface NavGroup {
  key: string;
  label: string;
  icon: string;
  /** module permission key (shows the group when any child is allowed) */
  perm: string;
  /** a leaf item with no sub-menu */
  page?: NavPage;
  children?: NavPage[];
}

const p = (path: string, label: string, perm: string, title = label): NavPage => ({ path, label, title, perm });

export const NAV: NavGroup[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', perm: 'dashboard', page: p('dashboard', 'Dashboard', 'dashboard') },
  { key: 'users', label: 'All Users', icon: 'users', perm: 'users', page: p('users', 'All Users', 'users') },
  {
    key: 'games',
    label: 'Games',
    icon: 'games',
    perm: 'games',
    children: [
      p('games/provider', 'Games Provider', 'games.provider', 'Game Provider'),
      p('games/setting', 'Games Setting', 'games.setting', 'Game Settings'),
      p('games/rates', 'Game Rates', 'games.rates', 'Game Rates'),
      p('games/result', 'Game Result', 'games.result', 'Game Result'),
    ],
  },
  {
    key: 'starline',
    label: 'Starline',
    icon: 'star',
    perm: 'starline',
    children: [
      p('starline/provider', 'Star Games Provider', 'starline.provider', 'Star Game Provider'),
      p('starline/setting', 'Star Games Setting', 'starline.setting', 'Star Game Settings'),
      p('starline/rates', 'Star Game Rates', 'starline.rates', 'Star Game Rates'),
      p('starline/pnl', 'Star Game Profit Loss', 'starline.pnl', 'Starline Profit/Loss'),
      p('starline/result', 'Star Game Result', 'starline.result', 'Star Game Result'),
    ],
  },
  {
    key: 'andarbahar',
    label: 'Andar Bahar',
    icon: 'diamond',
    perm: 'andarbahar',
    children: [
      p('andarbahar/provider', 'AB Game Provider', 'andarbahar.provider', 'AB Game Provider'),
      p('andarbahar/setting', 'AB Game Setting', 'andarbahar.setting', 'AB Game Settings'),
      p('andarbahar/rates', 'AB Game Rates', 'andarbahar.rates', 'AB Game Rates'),
      p('andarbahar/pnl', 'AB Game Profit Loss', 'andarbahar.pnl', 'Andar Bahar Profit/Loss'),
      p('andarbahar/result', 'AB Game Result', 'andarbahar.result', 'AB Game Result'),
    ],
  },
  {
    key: 'bookie',
    label: 'Bookie Corner',
    icon: 'wallet',
    perm: 'bookie',
    children: [
      p('bookie/oc', 'OC Cutting Group', 'bookie.oc'),
      p('bookie/final', 'Final OC Cutting Group', 'bookie.final'),
      p('bookie/cutting', 'Cutting Group', 'bookie.cutting'),
    ],
  },
  {
    key: 'wallet',
    label: 'Wallet',
    icon: 'wallet',
    perm: 'wallet',
    children: [
      p('wallet/fund-requests', 'Fund Requests', 'wallet.fund_request'),
      p('wallet/export-debit', 'Export Debit Report', 'wallet.export_debit'),
      p('wallet/bulk-pg', 'Process Bulk PG Payment', 'wallet.bulk_pg'),
      p('wallet/download-debit', 'Download Debit Report', 'wallet.download_debit'),
      p('wallet/view', 'View Wallet', 'wallet.view'),
      p('wallet/search-account', 'Search Account', 'wallet.search_account'),
      p('wallet/bank-history', 'Bank History', 'wallet.bank_history'),
      p('wallet/request-onoff', 'Request On/Off', 'wallet.request_onoff'),
    ],
  },
  {
    key: 'approved_debit',
    label: 'Approved Debit Requests',
    icon: 'check',
    perm: 'approved_debit',
    children: [
      p('approved-debit/paytm', 'Paytm Request', 'approved_debit.paytm', 'Approved Paytm Requests'),
      p('approved-debit/bank', 'Bank Account Request', 'approved_debit.bank', 'Approved Bank Account Requests'),
    ],
  },
  { key: 'declined', label: 'Declined Requests', icon: 'close', perm: 'declined', page: p('declined', 'Declined Requests', 'declined') },
  {
    key: 'reports',
    label: 'Reports',
    icon: 'report',
    perm: 'reports',
    children: [
      p('reports/jodi-all', 'Jodi All', 'reports.jodi_all', 'Jodi All Report'),
      p('reports/sales', 'Sales Report', 'reports.sales'),
      p('reports/sales-summary', 'Sales Summary', 'reports.sales_summary'),
      p('reports/starline-sales', 'Starline Sales Report', 'reports.starline_sales'),
      p('reports/ab-sales', 'Andar Bahar Sales Report', 'reports.ab_sales'),
      p('reports/ab-bids', 'Andar Bahar Total Bids', 'reports.ab_bids', 'Andar Bahar Bidding Report'),
      p('reports/fund', 'Fund Report', 'reports.fund'),
      p('reports/fund2', 'Fund Report 2', 'reports.fund2'),
      p('reports/upi-fund', 'UPI Fund Report', 'reports.upi_fund'),
      p('reports/total-bids', 'Total Bids', 'reports.total_bids', 'Detailed Bidding Report'),
      p('reports/credit-debit', 'Credit/Debit Report', 'reports.credit_debit'),
      p('reports/daily', 'Daily Report', 'reports.daily'),
      p('reports/bidding', 'Bidding Report', 'reports.bidding'),
      p('reports/user-analysis', 'User Analysis', 'reports.user_analysis'),
      p('reports/user-report', 'User Reports', 'reports.user_report', 'User Report'),
      p('reports/user-list', 'List Of Users', 'reports.user_list', 'User Lists'),
      p('reports/customer-balance', 'Customer Balance', 'reports.customer_balance'),
      p('reports/all-user-bids', 'All User Bids', 'reports.all_user_bids'),
    ],
  },
  { key: 'notification', label: 'Notification', icon: 'bell', perm: 'notification', page: p('notifications', 'Notification', 'notification', 'Notifications') },
  { key: 'news', label: 'News', icon: 'monitor', perm: 'news', page: p('news', 'News', 'news') },
  { key: 'deleted_users', label: 'Deleted User', icon: 'trash', perm: 'deleted_users', page: p('deleted-users', 'Deleted User', 'deleted_users', 'Deleted Users') },
  {
    key: 'app_settings',
    label: 'App Settings',
    icon: 'gear',
    perm: 'app_settings',
    children: [
      p('app/how-to-play', 'How to play', 'app_settings.how_to_play', 'How To Play'),
      p('app/notice-board', 'Withdraw Screen', 'app_settings.notice_board', 'Notice Board'),
      p('app/profile-note', 'Profile Note', 'app_settings.profile_note'),
      p('app/wallet-contact', 'Wallet Contact', 'app_settings.wallet_contact', 'Wallet Update Contact'),
    ],
  },
  {
    key: 'masters',
    label: 'Masters',
    icon: 'shield',
    perm: 'masters',
    children: [
      p('masters/pg', 'Payment Gateway', 'masters.pg', 'Payment Gateways'),
      p('masters/employees', 'Manage Employee', 'masters.manage_employee', 'Manage Employees'),
      p('masters/employees/new', 'Create Employee', 'masters.create_employee', 'Register New Employee'),
    ],
  },
  {
    key: 'others',
    label: 'Others',
    icon: 'more',
    perm: 'others',
    children: [
      p('others/bids', 'All Bids', 'others.bids'),
      p('others/support', 'Support Inbox', 'others.support'),
      p('others/ideas', 'Submitted Ideas', 'others.ideas'),
      p('others/settings', 'General Settings', 'others.settings'),
      p('others/logs', 'Activity Log', 'others.logs'),
    ],
  },
];

/** Every page in sidebar order. */
export const ALL_PAGES: NavPage[] = NAV.flatMap((g) => (g.page ? [g.page] : g.children ?? []));

/** The page for a router pathname ("/wallet/view" → View Wallet). Longest match wins. */
export function pageFor(pathname: string): NavPage | undefined {
  const path = pathname.replace(/^\/+|\/+$/g, '');
  return [...ALL_PAGES].sort((a, b) => b.path.length - a.path.length).find((pg) => path === pg.path || path.startsWith(`${pg.path}/`));
}
