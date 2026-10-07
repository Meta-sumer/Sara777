import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { dt } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import {
  Btn,
  Card,
  Chip,
  type Column,
  DataTable,
  Field,
  Modal,
  Page,
  Resource,
  srColumn,
  useAction,
  useConfirm,
  useToast,
} from '../../ui';
import { CAN_SIGN_IN, type Employee, LOGIN_PERMISSION_LABEL } from './types';

/** Why a row's buttons are disabled, or '' when they are not. */
function lockReason(e: Employee): string {
  if (e.isSelf) return 'This is your own account. Change your password from the menu at the top right.';
  if (!e.manageable) return 'This employee has permissions you do not have. Only the super admin can change them.';
  return '';
}

function LoginStatus({ e }: { e: Employee }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {e.isBlocked ? (
        <Chip tone="bad">Blocked</Chip>
      ) : e.online ? (
        <Chip tone="ok">Online</Chip>
      ) : (
        <span className="muted">
          Offline · {e.lastSeenAt ? `last seen ${dt(e.lastSeenAt)}` : 'never signed in'}
        </span>
      )}
      {!CAN_SIGN_IN.includes(e.loginPermission) && (
        <Chip tone="warn">Login: {LOGIN_PERMISSION_LABEL[e.loginPermission]}</Chip>
      )}
    </div>
  );
}

export function ManageEmployees() {
  const { can } = useAuth();
  const { nonce } = useRefresh();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, run] = useAction();
  const [pwFor, setPwFor] = useState<Employee | null>(null);

  const load = useCallback(() => api<{ employees: Employee[] }>('/masters/employees'), [nonce]);
  const state = useLoad(load);
  const { reload } = state;

  const canEdit = can('masters.create_employee');

  const toggleBlock = useCallback(
    async (e: Employee) => {
      const block = !e.isBlocked;
      const ok = await confirm({
        title: block ? `Block ${e.username}?` : `Unblock ${e.username}?`,
        message: block
          ? 'They are signed out at once and cannot sign in until you unblock them.'
          : 'They can sign in to the panel again.',
        confirmText: block ? 'Block' : 'Unblock',
        danger: block,
      });
      if (!ok) return;
      await run(async () => {
        await api(`/masters/employees/${e.id}/block`, { method: 'POST', body: { blocked: block } });
        toast(block ? `${e.username} blocked` : `${e.username} unblocked`);
        await reload();
      });
    },
    [confirm, run, toast, reload],
  );

  const remove = useCallback(
    async (e: Employee) => {
      const ok = await confirm({
        title: `Delete ${e.username}?`,
        message: 'The account is removed and signed out at once. Its Activity Log entries are kept.',
        confirmText: 'Delete',
        danger: true,
      });
      if (!ok) return;
      await run(async () => {
        await api(`/masters/employees/${e.id}`, { method: 'DELETE' });
        toast(`${e.username} deleted`);
        await reload();
      });
    },
    [confirm, run, toast, reload],
  );

  const columns = useMemo<Column<Employee>[]>(() => {
    const cols: Column<Employee>[] = [
      srColumn<Employee>('Sno'),
      {
        key: 'username',
        label: 'Employee Username',
        align: 'center',
        render: (e) => (
          <>
            {e.username}
            {e.isSelf && <span className="muted"> (you)</span>}
          </>
        ),
      },
      { key: 'name', label: 'Name', align: 'center' },
      { key: 'role', label: 'Role', align: 'center' },
      {
        key: 'status',
        label: 'Login Status',
        align: 'center',
        value: (e) => (e.isBlocked ? 'Blocked' : e.online ? 'Online' : 'Offline'),
        render: (e) => <LoginStatus e={e} />,
      },
      {
        key: 'password',
        label: 'Change Password',
        align: 'center',
        sortable: false,
        render: (e) => (
          <Btn variant="dark" className="pill" sm disabled={!!lockReason(e)} title={lockReason(e)} onClick={() => setPwFor(e)}>
            Change Password
          </Btn>
        ),
      },
      {
        key: 'block',
        label: 'Block Employee',
        align: 'center',
        sortable: false,
        render: (e) => (
          <Btn
            variant={e.isBlocked ? 'success' : 'danger'}
            sm
            disabled={busy || !!lockReason(e)}
            title={lockReason(e)}
            onClick={() => void toggleBlock(e)}
          >
            {e.isBlocked ? 'Unblock' : 'Block'}
          </Btn>
        ),
      },
    ];
    if (canEdit) {
      cols.push({
        key: 'edit',
        label: 'Edit Employee',
        align: 'center',
        sortable: false,
        render: (e) => (
          <Btn
            variant="primary"
            sm
            disabled={!!lockReason(e)}
            title={lockReason(e)}
            onClick={() => navigate(`/masters/employees/new?id=${e.id}`)}
          >
            Edit Employee
          </Btn>
        ),
      });
    }
    cols.push({
      key: 'delete',
      label: 'Delete Employee',
      align: 'center',
      sortable: false,
      render: (e) => (
        <Btn variant="danger" sm disabled={busy || !!lockReason(e)} title={lockReason(e)} onClick={() => void remove(e)}>
          Delete
        </Btn>
      ),
    });
    return cols;
  }, [busy, canEdit, navigate, remove, toggleBlock]);

  return (
    <Page title="Manage Employee">
      <Card
        title="Manage Employee"
        actions={
          canEdit && (
            <Btn variant="indigo" className="pill" icon="plus" onClick={() => navigate('/masters/employees/new')}>
              Create Employee
            </Btn>
          )
        }
      >
        <p className="muted" style={{ margin: '-6px 0 16px' }}>
          The super admin account is set in the server's .env file, so it is not listed here and cannot be edited from
          the panel. Online means active in the last 5 minutes.
        </p>
        <Resource state={state}>
          {({ employees }) => (
            <DataTable
              columns={columns}
              rows={employees}
              rowKey={(e) => e.id}
              empty="No employees yet. Use Create Employee to add one."
            />
          )}
        </Resource>
      </Card>

      {pwFor && <ChangePassword employee={pwFor} onClose={() => setPwFor(null)} />}
    </Page>
  );
}

function ChangePassword({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const toast = useToast();
  const [busy, run] = useAction();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (password.length < 6) return setError('Password must be at least 6 characters');
    if (password !== again) return setError('The two passwords do not match');
    setError('');
    void run(async () => {
      await api(`/masters/employees/${employee.id}/password`, { method: 'POST', body: { password } });
      toast(`Password changed for ${employee.username}`);
      onClose();
    });
  };

  return (
    <Modal title={`Change Password · ${employee.username}`} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
      >
        <Field label="New Password">
          <input
            type="password"
            autoComplete="new-password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Confirm Password">
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Type it again"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
          />
        </Field>
        <p className="muted" style={{ margin: 0 }}>
          Their current session stays signed in. Block the account if you need to sign them out.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="form-actions left" style={{ marginTop: 0 }}>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : 'Submit'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
