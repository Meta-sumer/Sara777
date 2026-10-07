/* Staff permissions ("Register New Employee" checkboxes).
 *
 * Each module has a key that shows its sidebar group; each page/action has a
 * key of its own. An employee needs the page key to open a page — the module
 * key alone only shows the group. The super admin (ADMIN_USER) has everything.
 *
 * The admin panel reads this tree from GET /api/admin/me, so it is the single
 * source for the employee form and for hiding menu items.
 */

export interface PermNode {
  key: string;
  label: string;
  children?: PermNode[];
}

export const PERMISSION_TREE: PermNode[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'users', label: 'Users' },
  {
    key: 'games',
    label: 'Games',
    children: [
      { key: 'games.provider', label: 'Provider' },
      { key: 'games.setting', label: 'Setting' },
      { key: 'games.rates', label: 'Rates' },
      { key: 'games.result', label: 'Result' },
      { key: 'games.revert', label: 'Revert' },
      { key: 'games.refund', label: 'Refund' },
    ],
  },
  {
    key: 'starline',
    label: 'Starline',
    children: [
      { key: 'starline.provider', label: 'Provider' },
      { key: 'starline.setting', label: 'Setting' },
      { key: 'starline.rates', label: 'Rates' },
      { key: 'starline.pnl', label: 'Profit Loss' },
      { key: 'starline.result', label: 'Result' },
      { key: 'starline.revert', label: 'Revert' },
    ],
  },
  {
    key: 'andarbahar',
    label: 'Andar Bahar',
    children: [
      { key: 'andarbahar.provider', label: 'AB Provider' },
      { key: 'andarbahar.setting', label: 'AB Setting' },
      { key: 'andarbahar.rates', label: 'AB Rates' },
      { key: 'andarbahar.pnl', label: 'AB Profit Loss' },
      { key: 'andarbahar.result', label: 'AB Result' },
      { key: 'andarbahar.revert', label: 'AB Revert' },
    ],
  },
  {
    key: 'bookie',
    label: 'Bookie Corner',
    children: [
      { key: 'bookie.oc', label: 'OC Cutting Group' },
      { key: 'bookie.final', label: 'Final OC Cutting Group' },
      { key: 'bookie.cutting', label: 'Cutting Group' },
    ],
  },
  {
    key: 'wallet',
    label: 'Wallet',
    children: [
      { key: 'wallet.fund_request', label: 'Fund Request' },
      { key: 'wallet.export_debit', label: 'Export Debit Report' },
      { key: 'wallet.bulk_pg', label: 'Process Bulk PG Payment' },
      { key: 'wallet.download_debit', label: 'Download Debit Report' },
      { key: 'wallet.view', label: 'View Wallet' },
      { key: 'wallet.search_account', label: 'Search Account' },
      { key: 'wallet.bank_history', label: 'Bank History' },
      { key: 'wallet.request_onoff', label: 'Request ON/OFF' },
    ],
  },
  {
    key: 'approved_debit',
    label: 'Approved Debit Page',
    children: [
      { key: 'approved_debit.paytm', label: 'Paytm Request' },
      { key: 'approved_debit.bank', label: 'Bank Account Request' },
    ],
  },
  { key: 'declined', label: 'Declined Request' },
  {
    key: 'reports',
    label: 'Reports',
    children: [
      { key: 'reports.jodi_all', label: 'Jodi All' },
      { key: 'reports.sales', label: 'Sales Report' },
      { key: 'reports.sales_summary', label: 'Sales Summary' },
      { key: 'reports.starline_sales', label: 'Starline Sales Report' },
      { key: 'reports.ab_sales', label: 'Andar Bahar Sales Report' },
      { key: 'reports.ab_bids', label: 'Andar Bahar Total Bids' },
      { key: 'reports.fund', label: 'Fund Report' },
      { key: 'reports.fund2', label: 'Fund Report 2' },
      { key: 'reports.upi_fund', label: 'UPI Fund Report' },
      { key: 'reports.total_bids', label: 'Total Bids' },
      { key: 'reports.credit_debit', label: 'Credit Debit Report' },
      { key: 'reports.daily', label: 'Daily Report' },
      { key: 'reports.bidding', label: 'Bidding Report' },
      { key: 'reports.user_analysis', label: 'User Analysis' },
      { key: 'reports.user_report', label: 'User Reports' },
      { key: 'reports.user_list', label: 'List Of Users' },
      { key: 'reports.customer_balance', label: 'Customer Balance' },
      { key: 'reports.all_user_bids', label: 'All User Bids' },
    ],
  },
  { key: 'notification', label: 'Notification' },
  { key: 'news', label: 'News' },
  { key: 'deleted_users', label: 'Deleted Users' },
  {
    key: 'app_settings',
    label: 'App Settings',
    children: [
      { key: 'app_settings.how_to_play', label: 'How To Play' },
      { key: 'app_settings.notice_board', label: 'Notice Board' },
      { key: 'app_settings.profile_note', label: 'Profile Note' },
      { key: 'app_settings.wallet_contact', label: 'Wallet Contact' },
    ],
  },
  {
    key: 'masters',
    label: 'Masters',
    children: [
      { key: 'masters.pg', label: 'Payment Gateway' },
      { key: 'masters.manage_employee', label: 'Manage Employee' },
      { key: 'masters.create_employee', label: 'Create Employee' },
    ],
  },
  {
    key: 'others',
    label: 'Others',
    children: [
      { key: 'others.bids', label: 'All Bids' },
      { key: 'others.support', label: 'Support Inbox' },
      { key: 'others.ideas', label: 'Ideas' },
      { key: 'others.settings', label: 'General Settings' },
      { key: 'others.logs', label: 'Activity Log' },
    ],
  },
];

function flatten(nodes: PermNode[]): string[] {
  return nodes.flatMap((n) => [n.key, ...(n.children ? flatten(n.children) : [])]);
}

export const ALL_PERMISSIONS: string[] = flatten(PERMISSION_TREE);

/** Keep only known keys, and add a module key when any of its pages is granted. */
export function normalizePermissions(input: unknown): string[] {
  const list = Array.isArray(input) ? input.map(String) : [];
  const set = new Set(list.filter((k) => ALL_PERMISSIONS.includes(k)));
  for (const node of PERMISSION_TREE) {
    if (node.children?.some((c) => set.has(c.key))) set.add(node.key);
  }
  return ALL_PERMISSIONS.filter((k) => set.has(k));
}
