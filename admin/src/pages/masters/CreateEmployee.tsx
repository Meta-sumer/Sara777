import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { type PermNode, useAuth } from '../../auth';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import { Card, Empty, Field, Page, Resource, useAction, useToast } from '../../ui';
import { type Employee, LOGIN_PERMISSION_LABEL, type LoginPermission } from './types';

const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;
const LOGIN_OPTIONS: LoginPermission[] = ['both', 'web', 'app', 'none'];

/** Keys a checkbox stands for: a module's pages, or the module itself when it has none. */
const leafKeys = (n: PermNode): string[] => (n.children?.length ? n.children.map((c) => c.key) : [n.key]);

/** "Register New Employee", and the same form for editing (`?id=N`). */
export function CreateEmployee() {
  const [params] = useSearchParams();
  const id = Number(params.get('id')) || 0;
  // remount on create <-> edit so the form state starts fresh
  return <EmployeeForm key={id} id={id} />;
}

interface Loaded {
  roles: string[];
  employee: Employee | null;
}

function EmployeeForm({ id }: { id: number }) {
  const isEdit = id > 0;
  const { nonce } = useRefresh();
  const load = useCallback(async (): Promise<Loaded> => {
    const [roles, one] = await Promise.all([
      api<{ roles: string[] }>('/masters/employees/roles'),
      isEdit ? api<{ employee: Employee }>(`/masters/employees/${id}`) : Promise.resolve(null),
    ]);
    return { roles: roles.roles, employee: one?.employee ?? null };
  }, [id, isEdit, nonce]);
  const state = useLoad(load);

  const title = isEdit ? 'Edit Employee' : 'Register New Employee';
  return (
    <Page title={title} crumb={isEdit ? 'Edit Employee' : 'Create Employee'}>
      <Resource state={state}>
        {(data) =>
          data.employee && (data.employee.isSelf || !data.employee.manageable) ? (
            <Card title={title}>
              <Empty>
                {data.employee.isSelf
                  ? 'You cannot edit your own account. Ask the super admin to change it.'
                  : 'This employee has permissions you do not have. Only the super admin can change them.'}
              </Empty>
            </Card>
          ) : (
            <Form title={title} roles={data.roles} employee={data.employee} />
          )
        }
      </Resource>
    </Page>
  );
}

function Form({ title, roles, employee }: { title: string; roles: string[]; employee: Employee | null }) {
  const { me, can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, run] = useAction();
  const tree = useMemo(() => me?.permissionTree ?? [], [me]);
  const isEdit = !!employee;

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState('');
  const [loginPermission, setLoginPermission] = useState<LoginPermission>('both');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const allKeys = useMemo(() => tree.flatMap(leafKeys), [tree]);
  const grantable = useCallback((key: string) => !!me && (me.isSuper || me.permissions.includes(key)), [me]);
  const grantableKeys = useMemo(() => allKeys.filter(grantable), [allKeys, grantable]);

  // fill the form from the loaded employee (also after Refresh)
  useEffect(() => {
    const known = new Set(allKeys);
    setUsername(employee?.username ?? '');
    setName(employee?.name ?? '');
    setRole(employee?.role ?? '');
    setLoginPermission(employee?.loginPermission ?? 'both');
    setSelected(new Set((employee?.permissions ?? []).filter((k) => known.has(k))));
    setPassword('');
    setConfirm('');
    setError('');
  }, [employee, allKeys]);

  const setKeys = (keys: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (!grantable(k)) continue;
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  const allOn = grantableKeys.length > 0 && grantableKeys.every((k) => selected.has(k));
  const someOn = grantableKeys.some((k) => selected.has(k));

  const validate = (): string => {
    if (!USERNAME_RE.test(username)) return 'Username must be 3 to 30 characters: lowercase letters, digits, _ or .';
    if (!name.trim()) return 'Enter the employee name';
    if (!isEdit || password) {
      if (password.length < 6) return 'Password must be at least 6 characters';
      if (password !== confirm) return 'The two passwords do not match';
    }
    return '';
  };

  const reset = () => {
    setUsername('');
    setName('');
    setPassword('');
    setConfirm('');
    setRole('');
    setLoginPermission('both');
    setSelected(new Set());
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validate();
    setError(problem);
    if (problem) return;
    void run(async () => {
      const body = {
        username,
        name: name.trim(),
        role: role.trim(),
        loginPermission,
        permissions: [...selected],
        ...(password ? { password } : {}),
      };
      if (employee) {
        await api(`/masters/employees/${employee.id}`, { method: 'PUT', body });
        toast(`${username} updated`);
      } else {
        await api('/masters/employees', { method: 'POST', body });
        toast(`${username} created`);
      }
      if (can('masters.manage_employee')) navigate('/masters/employees');
      else if (!employee) reset();
    });
  };

  const signInNote =
    loginPermission === 'app' || loginPermission === 'none'
      ? 'This account will not be able to sign in: staff only use the web panel.'
      : 'Staff sign in on this web panel. App Only and Disabled accounts cannot sign in.';

  return (
    <form onSubmit={submit} autoComplete="off">
      <Card title={title}>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Username">
            <input
              value={username}
              maxLength={30}
              placeholder="e.g. ravi1"
              autoComplete="off"
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
            />
            <Hint>3 to 30 characters: lowercase letters, digits, _ or . (used to sign in)</Hint>
          </Field>
          <Field label="Name">
            <input value={name} maxLength={60} placeholder="Full name" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={isEdit ? 'New Password' : 'Password'}>
            <input
              type="password"
              value={password}
              autoComplete="new-password"
              placeholder={isEdit ? 'Leave blank to keep the current password' : 'At least 6 characters'}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm Password">
            <input
              type="password"
              value={confirm}
              autoComplete="new-password"
              placeholder="Type the password again"
              disabled={isEdit && !password}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <Field label="Role">
            <input
              list="employee-roles"
              value={role}
              maxLength={40}
              placeholder="e.g. Operations Manager"
              onChange={(e) => setRole(e.target.value)}
            />
            <datalist id="employee-roles">
              {roles.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <Hint>Shown under the name in the sidebar. Pick a suggestion or type your own.</Hint>
          </Field>
          <Field label="Login Permission">
            <select value={loginPermission} onChange={(e) => setLoginPermission(e.target.value as LoginPermission)}>
              {LOGIN_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {LOGIN_PERMISSION_LABEL[o]}
                </option>
              ))}
            </select>
            <Hint warn={loginPermission === 'app' || loginPermission === 'none'}>{signInNote}</Hint>
          </Field>
        </div>
      </Card>

      <Card
        title="Permissions"
        actions={
          <Check
            checked={allOn}
            indeterminate={!allOn && someOn}
            disabled={grantableKeys.length === 0}
            onChange={(on) => setKeys(grantableKeys, on)}
            bold
          >
            Select All
          </Check>
        }
      >
        <p className="muted" style={{ margin: '-8px 0 16px' }}>
          {selected.size} of {allKeys.length} selected. Ticking a module selects all of its pages; the sidebar only shows
          what is ticked.
          {me && !me.isSuper && ' Permissions you do not have yourself are greyed out.'}
        </p>
        <div className="columns-1 gap-5 md:columns-2 xl:columns-3">
          {tree.map((node) => {
            const keys = leafKeys(node).filter(grantable);
            const on = keys.filter((k) => selected.has(k)).length;
            const hasPages = !!node.children?.length;
            return (
              <div
                key={node.key}
                className="mb-4 break-inside-avoid rounded-md border px-4 py-3"
                style={{ borderColor: 'var(--border-soft)', background: '#fcfcfd' }}
              >
                <Check
                  bold
                  checked={keys.length > 0 && on === keys.length}
                  indeterminate={on > 0 && on < keys.length}
                  disabled={keys.length === 0}
                  onChange={(v) => setKeys(leafKeys(node), v)}
                >
                  {node.label}
                </Check>
                {hasPages && (
                  <div className="ml-7 mt-1">
                    {node.children!.map((c) => (
                      <Check
                        key={c.key}
                        checked={selected.has(c.key)}
                        disabled={!grantable(c.key)}
                        onChange={(v) => setKeys([c.key], v)}
                      >
                        {c.label}
                      </Check>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="error center">{error}</p>}
        <div className="form-actions">
          <button className="btn success pill" type="submit" disabled={busy} style={{ minWidth: 150 }}>
            {busy ? 'Please wait…' : 'Submit'}
          </button>
        </div>
      </Card>
    </form>
  );
}

function Hint({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return (
    <span
      className="mt-1.5 block text-[12.5px] font-normal"
      style={{ color: warn ? '#b7791f' : 'var(--muted)' }}
    >
      {children}
    </span>
  );
}

/** Checkbox row; `indeterminate` shows a module with only some pages ticked. */
function Check({
  checked,
  indeterminate,
  disabled,
  bold,
  onChange,
  children,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  bold?: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <label
      className={`flex items-center gap-2.5 py-1 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      style={{ color: 'var(--heading)' }}
    >
      <input
        ref={ref}
        type="checkbox"
        className="h-4 w-4 shrink-0"
        style={{ accentColor: 'var(--c-indigo)' }}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={bold ? 'text-[15px] font-bold' : 'text-[14.5px]'}>{children}</span>
    </label>
  );
}
