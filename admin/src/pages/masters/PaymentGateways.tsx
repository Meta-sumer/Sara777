import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../../api';
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
import type { Gateway, PgList, PgSwitch } from './types';

type Direction = 'payin' | 'payout';
const DIRECTION: Record<Direction, { label: string; short: string; use: string }> = {
  payin: { label: 'Active Pay-in Gateway', short: 'Pay-in', use: 'Used for deposits (Add Fund).' },
  payout: { label: 'Active Pay-out Gateway', short: 'Pay-out', use: 'Used for withdrawal payouts.' },
};

const supports = (g: Gateway, d: Direction) => (d === 'payin' ? g.supportsPayin : g.supportsPayout);

function Tick({ on }: { on: boolean }) {
  return on ? (
    <span className="profit" aria-label="Yes">
      ✓
    </span>
  ) : (
    <span className="loss" aria-label="No">
      ✗
    </span>
  );
}

export function PaymentGateways() {
  const { nonce } = useRefresh();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, run] = useAction();
  const [editing, setEditing] = useState<Gateway | 'new' | null>(null);

  const load = useCallback(() => api<PgList>('/masters/pg'), [nonce]);
  const state = useLoad(load);
  const { reload } = state;
  const gateways = state.data?.gateways;

  const nameOf = useCallback(
    (code: string) => (code ? (gateways?.find((g) => g.code === code)?.name ?? code) : '--'),
    [gateways],
  );

  const switchTo = useCallback(
    async (direction: Direction, from: string, to: string) => {
      if (!to || to === from) return;
      const ok = await confirm({
        title: `Switch ${DIRECTION[direction].short.toLowerCase()} gateway?`,
        message: `${DIRECTION[direction].short} will switch from ${nameOf(from)} to ${nameOf(to)}. The change is recorded in the Activity Log.`,
        confirmText: 'Switch',
      });
      if (!ok) return;
      await run(async () => {
        await api('/masters/pg/active', { method: 'POST', body: { direction, code: to } });
        toast(`${DIRECTION[direction].short} gateway switched to ${nameOf(to)}`);
        await reload();
      });
    },
    [confirm, nameOf, reload, run, toast],
  );

  const remove = useCallback(
    async (g: Gateway) => {
      const ok = await confirm({
        title: `Delete ${g.name}?`,
        message: 'The gateway and its saved credentials are removed.',
        confirmText: 'Delete',
        danger: true,
      });
      if (!ok) return;
      await run(async () => {
        await api(`/masters/pg/${g.id}`, { method: 'DELETE' });
        toast(`${g.name} deleted`);
        await reload();
      });
    },
    [confirm, reload, run, toast],
  );

  const columns = useMemo<Column<Gateway>[]>(
    () => [
      srColumn<Gateway>('Sno'),
      {
        key: 'name',
        label: 'Name',
        render: (g) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <strong>{g.name}</strong>
            {g.inUse.payin && <Chip tone="info">Pay-in in use</Chip>}
            {g.inUse.payout && <Chip tone="info">Pay-out in use</Chip>}
          </div>
        ),
      },
      { key: 'code', label: 'Code', render: (g) => <code>{g.code}</code> },
      {
        key: 'supportsPayin',
        label: 'Pay-in',
        align: 'center',
        value: (g) => (g.supportsPayin ? 1 : 0),
        render: (g) => <Tick on={g.supportsPayin} />,
      },
      {
        key: 'supportsPayout',
        label: 'Pay-out',
        align: 'center',
        value: (g) => (g.supportsPayout ? 1 : 0),
        render: (g) => <Tick on={g.supportsPayout} />,
      },
      {
        key: 'credentials',
        label: 'Credentials',
        align: 'center',
        value: (g) => g.credentials.filter((c) => c.isSet).length,
        render: (g) =>
          g.credentials.length === 0 ? (
            <span className="muted">None needed</span>
          ) : (
            `${g.credentials.filter((c) => c.isSet).length} of ${g.credentials.length} set`
          ),
      },
      {
        key: 'isActive',
        label: 'Status',
        align: 'center',
        value: (g) => (g.isActive ? 'Active' : 'Inactive'),
        render: (g) => <Chip tone={g.isActive ? 'ok' : 'bad'}>{g.isActive ? 'Active' : 'Inactive'}</Chip>,
      },
      {
        key: 'edit',
        label: 'Edit',
        align: 'center',
        sortable: false,
        render: (g) => (
          <Btn variant="info" sm icon="edit" onClick={() => setEditing(g)}>
            Edit
          </Btn>
        ),
      },
      {
        key: 'delete',
        label: 'Delete',
        align: 'center',
        sortable: false,
        render: (g) => {
          const inUse = g.inUse.payin || g.inUse.payout;
          return (
            <Btn
              variant="danger"
              sm
              icon="trash"
              disabled={busy || inUse}
              title={inUse ? 'Switch pay-in / pay-out to another gateway before deleting this one' : undefined}
              onClick={() => void remove(g)}
            >
              Delete
            </Btn>
          );
        },
      },
    ],
    [busy, remove],
  );

  const historyColumns = useMemo<Column<PgSwitch>[]>(
    () => [
      srColumn<PgSwitch>('Sno'),
      { key: 'at', label: 'Switched At', render: (h) => dt(h.at) },
      {
        key: 'direction',
        label: 'Direction',
        value: (h) => (h.direction ? DIRECTION[h.direction].short : '--'),
      },
      { key: 'from', label: 'From', value: (h) => nameOf(h.from) },
      { key: 'to', label: 'To', value: (h) => nameOf(h.to) },
      { key: 'by', label: 'Switched By', value: (h) => h.by || '--' },
    ],
    [nameOf],
  );

  return (
    <Page title="Payment Gateway">
      <Resource state={state}>
        {(data) => (
          <>
            <Card title="Active Gateways">
              <div className="grid-halves">
                {(['payin', 'payout'] as Direction[]).map((d) => (
                  <ActiveSelect
                    key={d}
                    direction={d}
                    gateways={data.gateways}
                    current={d === 'payin' ? data.activePayin : data.activePayout}
                    last={data.history.find((h) => h.direction === d)}
                    disabled={busy}
                    onChange={(from, to) => void switchTo(d, from, to)}
                  />
                ))}
              </div>
              <p className="muted" style={{ margin: '16px 0 0' }}>
                Balances in this app are virtual coins and deposits are manual UPI payments (UTR + screenshot), so no
                gateway API is called. Switching records which gateway the deposit and payout screens use. Only active
                gateways that support a direction can be chosen for it.
              </p>
            </Card>

            <Card
              title="Payment Gateways"
              actions={
                <Btn variant="indigo" className="pill" icon="plus" onClick={() => setEditing('new')}>
                  Add Gateway
                </Btn>
              }
            >
              <DataTable
                columns={columns}
                rows={data.gateways}
                rowKey={(g) => g.id}
                empty="No payment gateways. Use Add Gateway to create one."
              />
            </Card>

            <Card title="Switch History">
              <DataTable
                columns={historyColumns}
                rows={data.history}
                rowKey={(h) => h.id}
                pageSize={5}
                pageSizes={[5, 10, 20]}
                searchable={false}
                empty="The pay-in / pay-out gateway has not been switched yet."
              />
            </Card>
          </>
        )}
      </Resource>

      {editing && (
        <GatewayModal
          gateway={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </Page>
  );
}

function ActiveSelect({
  direction,
  gateways,
  current,
  last,
  disabled,
  onChange,
}: {
  direction: Direction;
  gateways: Gateway[];
  current: string;
  last?: PgSwitch;
  disabled?: boolean;
  onChange: (from: string, to: string) => void;
}) {
  const options = gateways.filter((g) => g.isActive && supports(g, direction));
  const valid = options.some((g) => g.code === current);
  return (
    <Field label={DIRECTION[direction].label}>
      <select
        value={valid ? current : ''}
        disabled={disabled || options.length === 0}
        onChange={(e) => onChange(current, e.target.value)}
      >
        {!valid && <option value="">{current ? `${current} (not available)` : '-- Not set --'}</option>}
        {options.map((g) => (
          <option key={g.code} value={g.code}>
            {g.name}
          </option>
        ))}
      </select>
      <Hint>
        {DIRECTION[direction].use}{' '}
        {options.length === 0
          ? `No active gateway supports ${DIRECTION[direction].short.toLowerCase()}.`
          : last
            ? `Last switched by ${last.by || '--'} on ${dt(last.at)}.`
            : ''}
      </Hint>
    </Field>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <span className="muted mt-1.5 block text-[12.5px] font-normal">{children}</span>;
}

interface CredRow {
  /** local row id for React keys */
  rid: number;
  key: string;
  value: string;
  /** the stored key this row was loaded from (a blank value keeps its secret) */
  from?: string;
  masked?: string;
  isSet?: boolean;
}

let nextRid = 1;

/** Code suggested from the name until the admin types one: "PhonePe PG" → "phonepe_pg". */
const codeFrom = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);

function GatewayModal({
  gateway,
  onClose,
  onSaved,
}: {
  gateway: Gateway | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [busy, run] = useAction();
  const [name, setName] = useState(gateway?.name ?? '');
  const [code, setCode] = useState(gateway?.code ?? '');
  const [codeTouched, setCodeTouched] = useState(!!gateway);
  const [payin, setPayin] = useState(gateway?.supportsPayin ?? true);
  const [payout, setPayout] = useState(gateway?.supportsPayout ?? false);
  const [active, setActive] = useState(gateway?.isActive ?? false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<CredRow[]>(
    () =>
      gateway?.credentials.map((c) => ({
        rid: nextRid++,
        key: c.key,
        value: '',
        from: c.key,
        masked: c.value,
        isSet: c.isSet,
      })) ?? [],
  );

  const patch = (rid: number, change: Partial<CredRow>) =>
    setRows((rs) => rs.map((r) => (r.rid === rid ? { ...r, ...change } : r)));

  const inUse = gateway ? gateway.inUse.payin || gateway.inUse.payout : false;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter the gateway name');
    if (!/^[a-z0-9_]{2,30}$/.test(code)) return setError('Code must be 2 to 30 characters: lowercase letters, digits or _');
    if (!payin && !payout) return setError('Tick pay-in, pay-out or both');
    setError('');
    void run(async () => {
      const body = {
        name: name.trim(),
        code,
        supportsPayin: payin,
        supportsPayout: payout,
        isActive: active,
        credentials: rows
          .filter((r) => r.key.trim() || r.value.trim())
          .map((r) => ({ key: r.key.trim(), value: r.value.trim(), ...(r.from ? { from: r.from } : {}) })),
      };
      if (gateway) await api(`/masters/pg/${gateway.id}`, { method: 'PUT', body });
      else await api('/masters/pg', { method: 'POST', body });
      toast(gateway ? `${body.name} updated` : `${body.name} added`);
      onSaved();
    });
  };

  return (
    <Modal title={gateway ? `Edit Gateway · ${gateway.name}` : 'Add Payment Gateway'} onClose={onClose} size="md">
      <form className="form-stack" onSubmit={submit} autoComplete="off">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input
              value={name}
              maxLength={50}
              placeholder="e.g. Razorpay"
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                if (!codeTouched) setCode(codeFrom(e.target.value));
              }}
            />
          </Field>
          <Field label="Code">
            <input
              value={code}
              maxLength={30}
              placeholder="e.g. razorpay"
              onChange={(e) => {
                setCodeTouched(true);
                setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
              }}
            />
            <Hint>Lowercase letters, digits or _. Unique.</Hint>
          </Field>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <label className="check">
            <input type="checkbox" checked={payin} onChange={(e) => setPayin(e.target.checked)} />
            Supports Pay-in
          </label>
          <label className="check">
            <input type="checkbox" checked={payout} onChange={(e) => setPayout(e.target.checked)} />
            Supports Pay-out
          </label>
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
        </div>
        {inUse && (
          <p className="muted" style={{ margin: 0 }}>
            This gateway is selected for {gateway?.inUse.payin ? 'pay-in' : ''}
            {gateway?.inUse.payin && gateway?.inUse.payout ? ' and ' : ''}
            {gateway?.inUse.payout ? 'pay-out' : ''}, so it has to stay active and keep supporting it.
          </p>
        )}

        <div>
          <div className="mb-2 flex items-center gap-3">
            <strong style={{ color: 'var(--heading)', flex: 1 }}>Credentials</strong>
            <label className="check" style={{ fontWeight: 400 }}>
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
              Show what I type
            </label>
            <Btn
              variant="ghost"
              sm
              icon="plus"
              onClick={() => setRows((rs) => [...rs, { rid: nextRid++, key: '', value: '' }])}
            >
              Add Row
            </Btn>
          </div>
          {rows.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No credentials. Manual methods need none; add rows such as key_id / key_secret for an API gateway.
            </p>
          ) : (
            <div className="grid gap-2">
              {rows.map((r) => (
                <div key={r.rid} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-2">
                  <input
                    aria-label="Key"
                    placeholder="key"
                    value={r.key}
                    maxLength={40}
                    onChange={(e) => patch(r.rid, { key: e.target.value.replace(/\s+/g, '') })}
                  />
                  <input
                    aria-label="Value"
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder={
                      r.from ? (r.isSet ? `Saved ${r.masked}. Leave blank to keep` : 'Not set') : 'value'
                    }
                    value={r.value}
                    maxLength={500}
                    onChange={(e) => patch(r.rid, { value: e.target.value })}
                  />
                  <Btn
                    variant="danger"
                    sm
                    aria-label="Remove row"
                    title="Remove row"
                    onClick={() => setRows((rs) => rs.filter((x) => x.rid !== r.rid))}
                  >
                    ×
                  </Btn>
                </div>
              ))}
            </div>
          )}
          <Hint>
            Values are kept on the server; only their last 4 characters are ever shown again. Every value must be filled
            in before the gateway can be made active.
          </Hint>
        </div>

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
