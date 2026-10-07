import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { dt } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import { Btn, Card, DataTable, Page, Resource, srColumn, useAction, useConfirm, useToast, type Column } from '../../ui';
import { UserProfileModal } from './UserProfileModal';

export interface UserRow {
  id: number;
  name: string;
  username: string;
  mobile: string;
  balance: number;
  isActive: boolean;
  deviceName: string | null;
  deviceId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  deletedAt: string | null;
  deleteReason: string | null;
}

export interface UsersPage {
  page: number;
  perPage: number;
  total: number;
  users: UserRow[];
}

export const PAGE_SIZES = [10, 25, 50, 100, 250, 500];

/** Server-paged query for the user tables (search: name, username, mobile or DD/MM/YYYY). */
export function usersQuery(path: string, q: { page: number; pageSize: number; search: string }, extra = '') {
  const params = new URLSearchParams({ page: String(q.page), perPage: String(q.pageSize) });
  if (q.search.trim()) params.set('q', q.search.trim());
  return `${path}?${params.toString()}${extra}`;
}

export const dash = (s: string | null | undefined) => s || '--';

export function AllUsers() {
  const { nonce } = useRefresh();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, run] = useAction();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState({ page: 1, pageSize: 50, search: '' });
  const [status, setStatus] = useState('all');

  // #/users?id=N opens that user's profile (linked from Others → All Bids)
  const profileId = Number(params.get('id')) || null;
  const openProfile = (id: number) => setParams({ id: String(id) });
  const closeProfile = () => {
    params.delete('id');
    setParams(params, { replace: true });
  };

  const load = useCallback(
    () => api<UsersPage>(usersQuery('/users', query, status === 'all' ? '' : `&status=${status}`)),
    // nonce: the top-bar Refresh button reloads the table
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, status, nonce],
  );
  const state = useLoad(load);

  const toggleBlock = async (u: UserRow) => {
    const block = u.isActive;
    const ok = await confirm({
      title: block ? `Block ${u.name}?` : `Unblock ${u.name}?`,
      message: block
        ? 'The user will be logged out and cannot log in, place bids or withdraw until unblocked.'
        : 'The user will be able to log in, play and withdraw again.',
      confirmText: block ? 'Yes, Block' : 'Yes, Unblock',
      danger: block,
    });
    if (!ok) return;
    await run(async () => {
      await api(`/users/${u.id}/block`, { method: 'POST', body: { blocked: block } });
      toast(block ? `${u.username} blocked` : `${u.username} unblocked`);
      await state.reload();
    });
  };

  const columns: Column<UserRow>[] = [
    srColumn('Sno'),
    { key: 'name', label: 'Name' },
    { key: 'username', label: 'Username' },
    { key: 'mobile', label: 'Mobile' },
    { key: 'deviceName', label: 'Device Name', render: (u) => dash(u.deviceName) },
    { key: 'deviceId', label: 'Device ID', render: (u) => dash(u.deviceId) },
    { key: 'createdAt', label: 'Created At', render: (u) => dt(u.createdAt) },
    {
      key: 'block',
      label: 'Block',
      align: 'center',
      render: (u) =>
        can('users') ? (
          <Btn sm variant={u.isActive ? 'danger' : 'success'} disabled={busy} onClick={() => void toggleBlock(u)}>
            {u.isActive ? 'Block' : 'Unblock'}
          </Btn>
        ) : null,
    },
    {
      key: 'profile',
      label: 'Profile',
      align: 'center',
      render: (u) => (
        <Btn sm variant="indigo" onClick={() => openProfile(u.id)}>
          Profile
        </Btn>
      ),
    },
  ];

  return (
    <Page title="All Users">
      <Card title="View All Users">
        <Resource state={state}>
          {(d) => (
            <DataTable
              columns={columns}
              rows={d.users}
              rowKey={(u) => u.id}
              pageSizes={PAGE_SIZES}
              pageSize={query.pageSize}
              empty={query.search ? 'No matching users found' : 'No users yet'}
              toolbar={
                <label>
                  Status
                  <select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setQuery((q) => ({ ...q, page: 1 }));
                    }}
                  >
                    <option value="all">All Users</option>
                    <option value="active">Active</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </label>
              }
              server={{
                total: d.total,
                page: query.page,
                pageSize: query.pageSize,
                search: query.search,
                onChange: setQuery,
              }}
            />
          )}
        </Resource>
      </Card>
      {profileId && <UserProfileModal userId={profileId} onClose={closeProfile} />}
    </Page>
  );
}
