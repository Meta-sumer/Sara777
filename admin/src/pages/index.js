/* Page registry. Keys are the #/hash routes; the sidebar order lives in router.js. */

import { page as dashboard } from './dashboard.js';
import { page as markets } from './markets.js';
import { page as results } from './results.js';
import { page as bids } from './bids.js';
import { page as users } from './users.js';
import { page as funds } from './funds.js';
import { page as rates } from './rates.js';
import { page as notifications } from './notifications.js';
import { page as support } from './support.js';
import { page as ideas } from './ideas.js';
import { page as settings } from './settings.js';
import { page as logs } from './logs.js';

export const pages = {
  dashboard,
  markets,
  results,
  bids,
  users,
  funds,
  rates,
  notifications,
  support,
  ideas,
  settings,
  logs,
};
