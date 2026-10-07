import { useCallback, type ReactNode } from 'react';
import { api } from '../../api';
import { amt, dt, fmt } from '../../format';
import { useLoad } from '../../hooks';
import { Chip, Modal, Resource } from '../../ui';

export interface UserProfile {
  id: number;
  name: string;
  username: string;
  mobile: string;
  balance: number;
  isActive: boolean;
  isDeleted: boolean;
  deviceName: string | null;
  deviceId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  deletedAt: string | null;
  deleteReason: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  bank: {
    holderName: string | null;
    accountNo: string | null;
    bankName: string | null;
    ifsc: string | null;
    paytm: string | null;
    phonepe: string | null;
    gpay: string | null;
    updatedAt: string;
    changes: number;
  } | null;
  stats: {
    deposits: number;
    withdrawals: number;
    pendingWithdraw: number;
    bidCount: number;
    bidAmount: number;
    winnings: number;
  };
}

/** Empty values show as "--" (the reference printed a raw "null"). */
const v = (x: string | null | undefined): string => (x === null || x === undefined || x === '' ? '--' : x);

export function statusChip(u: { isActive: boolean; isDeleted?: boolean }) {
  if (u.isDeleted) return <Chip tone="bad">Deleted</Chip>;
  return u.isActive ? <Chip tone="ok">Active</Chip> : <Chip tone="bad">Blocked</Chip>;
}

function KeyValue({ title, rows }: { title: string; rows: Array<[string, ReactNode]> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th colSpan={2} className="center">
              {title}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className="center" style={{ width: '42%' }}>
                {label}
              </td>
              <td className="center wrap" style={{ wordBreak: 'break-word' }}>
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * User profile popup (address, city, pincode, bank and UPI details), opened from
 * All Users and from View Wallet → Profile. Shared: keep this signature.
 */
export function UserProfileModal({ userId, onClose }: { userId: number; onClose: () => void }) {
  const load = useCallback(() => api<UserProfile>(`/users/${userId}`), [userId]);
  const state = useLoad(load);
  const p = state.data;

  return (
    <Modal title={p ? `User Profile : ${p.username}` : 'User Profile'} onClose={onClose} size="lg">
      <Resource state={state}>
        {(u) => {
          const b = u.bank;
          return (
            <>
              <div className="row" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--heading)' }}>{u.name}</div>
                  <div className="muted">
                    {u.username === u.mobile ? u.mobile : `${u.username} · ${u.mobile}`}
                  </div>
                </div>
                <div className="row">
                  {statusChip(u)}
                  <span className="amt-badge" title="Wallet balance">
                    {amt(u.balance)}/-
                  </span>
                </div>
              </div>

              <div className="grid-halves">
                <KeyValue
                  title="Address & Bank Details"
                  rows={[
                    ['Address', v(u.address)],
                    ['City', v(u.city)],
                    ['Pincode', v(u.pincode)],
                    ['Acc Holder Name', v(b?.holderName)],
                    ['Account Number', v(b?.accountNo)],
                    ['Bank Name', v(b?.bankName)],
                    ['IFSC', v(b?.ifsc)],
                    ['Paytm Number', v(b?.paytm)],
                    ['PhonePe Number', v(b?.phonepe)],
                    ['Google Pay Number', v(b?.gpay)],
                    [
                      'Bank Details Updated',
                      b ? `${dt(b.updatedAt)}${b.changes > 1 ? ` (${b.changes - 1} earlier)` : ''}` : '--',
                    ],
                  ]}
                />
                <KeyValue
                  title="Account Summary"
                  rows={[
                    ['Wallet Balance', amt(u.balance)],
                    ['Joined', dt(u.createdAt)],
                    ['Last Login', dt(u.lastLoginAt)],
                    ['Last Seen In App', dt(u.lastSeenAt)],
                    ['Device Name', v(u.deviceName)],
                    ['Device Id', v(u.deviceId)],
                    ['Total Deposits', amt(u.stats.deposits)],
                    ['Total Withdraw', amt(u.stats.withdrawals)],
                    ['Pending Withdraw', amt(u.stats.pendingWithdraw)],
                    ['Total Bids', `${fmt(u.stats.bidCount)} bids · ${amt(u.stats.bidAmount)}`],
                    ['Total Winnings', amt(u.stats.winnings)],
                    ...(u.isDeleted
                      ? ([
                          ['Deleted At', dt(u.deletedAt)],
                          ['Delete Reason', v(u.deleteReason)],
                        ] as Array<[string, ReactNode]>)
                      : []),
                  ]}
                />
              </div>
              <p className="muted" style={{ margin: '12px 0 0', fontSize: 12.5 }}>
                The app does not ask for a postal address, so Address, City and Pincode stay empty. Deposits include
                manual adds; withdraw counts approved and completed requests.
              </p>
            </>
          );
        }}
      </Resource>
    </Modal>
  );
}
