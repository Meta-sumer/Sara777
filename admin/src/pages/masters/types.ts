/* API shapes for the Masters pages (server/src/routes/admin/masters.ts). */

export type LoginPermission = 'both' | 'web' | 'app' | 'none';

export interface Employee {
  id: number;
  username: string;
  name: string;
  role: string;
  permissions: string[];
  loginPermission: LoginPermission;
  isBlocked: boolean;
  /** seen within the last 5 minutes */
  online: boolean;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  /** the signed-in admin's own row */
  isSelf: boolean;
  /** the signed-in admin may change this employee */
  manageable: boolean;
}

export const LOGIN_PERMISSION_LABEL: Record<LoginPermission, string> = {
  both: 'Both (Web Panel + App)',
  web: 'Web Panel Only',
  app: 'App Only',
  none: 'Disabled',
};

/** Only these can sign in to the web panel (there is no staff app). */
export const CAN_SIGN_IN: LoginPermission[] = ['both', 'web'];

export interface Credential {
  key: string;
  /** masked: all but the last 4 characters */
  value: string;
  isSet: boolean;
}

export interface Gateway {
  id: number;
  name: string;
  code: string;
  supportsPayin: boolean;
  supportsPayout: boolean;
  isActive: boolean;
  credentials: Credential[];
  inUse: { payin: boolean; payout: boolean };
  createdAt: string;
}

export interface PgSwitch {
  id: number;
  direction: 'payin' | 'payout' | '';
  from: string;
  to: string;
  by: string;
  at: string;
}

export interface PgList {
  gateways: Gateway[];
  activePayin: string;
  activePayout: string;
  history: PgSwitch[];
}
