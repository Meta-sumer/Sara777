/* Admin API (/api/admin). Each sidebar module has its own router file; every
 * route below the login checks the admin session, and each module guards its
 * routes with requirePerm('<permission key>') from auth.ts. */
import { Router } from 'express';
import { requireAdmin } from '../../auth.js';
import { contentRouter } from './content.js';
import { coreRouter, loginRouter } from './core.js';
import { dashboardRouter } from './dashboard.js';
import { gamesRouter } from './games.js';
import { mastersRouter } from './masters.js';
import { pnlRouter } from './pnl.js';
import { reports1Router } from './reports1.js';
import { reports2Router } from './reports2.js';
import { usersRouter } from './users.js';
import { walletRouter } from './wallet.js';

export const adminRouter = Router();

adminRouter.use(loginRouter);
adminRouter.use(requireAdmin);
adminRouter.use(coreRouter);
adminRouter.use('/dashboard', dashboardRouter);
adminRouter.use('/users', usersRouter);
adminRouter.use('/content', contentRouter);
adminRouter.use('/games', gamesRouter);
adminRouter.use('/pnl', pnlRouter);
adminRouter.use('/wallet', walletRouter);
adminRouter.use('/reports', reports1Router);
adminRouter.use('/reports', reports2Router);
adminRouter.use('/masters', mastersRouter);
