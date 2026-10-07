import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { dt, fmt } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import {
  Btn,
  Card,
  DataTable,
  Page,
  Resource,
  srColumn,
  useAction,
  useConfirm,
  useToast,
  type Column,
} from '../../ui';
import { dash, PAGE_SIZES, usersQuery, type UserRow, type UsersPage } from './AllUsers';
import { UserProfileModal } from './UserProfileModal';

interface AutoDelete {
  enabled: boolean;
  days: number;
  /** users the rule would delete right now */
  eligible: number;
  lastRun: { at: string; deleted: number; days: number } | null;
  deletedNow?: number;
}

export function DeletedUsers() {
  const { nonce } = useRefresh();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, run] = useAction();
  const [query, setQuery] = useState({ page: 1, pageSize: 50, search: '' });
  const [profileId, setProfileId] = useState<number | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => api<UsersPage>(usersQuery('/users/deleted', query)), [query, nonce]);
  const state = useLoad(load);

  const restore = async (u: UserRow) => {
    const ok = await confirm({
      title: `Restore ${u.name}?`,
      message: 'The user can log in and play again. The auto delete rule will leave them alone for its set number of days.',
      confirmText: 'Yes, Restore',
    });
    if (!ok) return;
    await run(async () => {
      await api(`/users/${u.id}/restore`, { method: 'POST' });
      toast(`${u.username} restored`);
      await state.reload();
    });
  };

  const columns: Column<UserRow>[] = [
    srColumn('Sno'),
    { key: 'name', label: 'Name' },
    { key: 'username', label: 'Username' },
    { key: 'mobile', label: 'Mobile' },
    { key: 'deviceName', label: 'Device Name', render: (u) => dash(u.deviceName) },
    { key: 'deviceId', label: 'Device Id', render: (u) => dash(u.deviceId) },
    { key: 'deleteReason', label: 'Delete Reason', className: 'wrap', render: (u) => dash(u.deleteReason) },
    { key: 'deletedAt', label: 'Deleted At', render: (u) => dt(u.deletedAt) },
    {
      key: 'actions',
      label: 'Action',
      align: 'center',
      render: (u) => (
        <div className="row" style={{ justifyContent: 'center', flexWrap: 'nowrap' }}>
          <Btn sm variant="success" disabled={busy} onClick={() => void restore(u)}>
            Restore
          </Btn>
          <Btn sm variant="indigo" onClick={() => setProfileId(u.id)}>
            Profile
          </Btn>
        </div>
      ),
    },
  ];

  return (
    <Page title="Deleted Users">
      <AutoDeleteCard onChanged={() => void state.reload()} />
      <Card title="View Deleted Users">
        <Resource state={state}>
          {(d) => (
            <DataTable
              columns={columns}
              rows={d.users}
              rowKey={(u) => u.id}
              pageSizes={PAGE_SIZES}
              pageSize={query.pageSize}
              empty={query.search ? 'No matching users found' : 'No deleted users'}
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
      {profileId && <UserProfileModal userId={profileId} onClose={() => setProfileId(null)} />}
    </Page>
  );
}

/** The reference panel's "Wallet Balance 0 Since Last N Days" rule, opt-in here. */
function AutoDeleteCard({ onChanged }: { onChanged: () => void }) {
  const { nonce } = useRefresh();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, run] = useAction();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => api<AutoDelete>('/users/auto-delete'), [nonce]);
  const state = useLoad(load);
  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState('7');

  useEffect(() => {
    if (!state.data) return;
    setEnabled(state.data.enabled);
    setDays(String(state.data.days));
  }, [state.data]);

  const save = async () => {
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      toast('Days must be a whole number from 1 to 365', true);
      return;
    }
    if (enabled) {
      const ok = await confirm({
        title: 'Turn on auto delete?',
        message: `Users whose wallet balance is 0 with no transaction or bid in the last ${n} days will be deleted now and then checked every hour. Deleted users can be restored from this page.`,
        confirmText: 'Yes, Save',
        danger: true,
      });
      if (!ok) return;
    }
    await run(async () => {
      const res = await api<AutoDelete>('/users/auto-delete', { method: 'POST', body: { enabled, days: n } });
      toast(enabled ? `Saved. ${fmt(res.deletedNow ?? 0)} users deleted now.` : 'Auto delete is off');
      await state.reload();
      onChanged();
    });
  };

  return (
    <Card title="Auto Delete Zero Balance Users">
      <Resource state={state}>
        {(d) => (
          <>
            <div className="row" style={{ gap: 18, alignItems: 'center' }}>
              <label className="check">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                Delete users whose wallet balance is 0 with no transaction or bid for
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="inline-input"
                aria-label="Days"
              />
              <span style={{ fontWeight: 600, color: 'var(--heading)' }}>days</span>
              <Btn variant="primary" disabled={busy} onClick={() => void save()}>
                Submit
              </Btn>
            </div>
            <p className="muted" style={{ margin: '12px 0 0' }}>
              Status: <strong style={{ color: d.enabled ? 'var(--c-profit)' : 'var(--heading)' }}>{d.enabled ? 'ON' : 'OFF'}</strong>
              {' · '}
              {fmt(d.eligible)} {d.eligible === 1 ? 'user matches' : 'users match'} the rule right now
              {' · '}
              {d.lastRun
                ? `Last run ${dt(d.lastRun.at)}, ${fmt(d.lastRun.deleted)} deleted`
                : 'Not run yet'}
              . Users with a pending bid or fund request are never deleted.
            </p>
          </>
        )}
      </Resource>
    </Card>
  );
}
