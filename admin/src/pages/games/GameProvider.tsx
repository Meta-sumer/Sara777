import { useCallback, useState, type FormEvent } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { fmt, hhmm12 } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import {
  Btn,
  Card,
  Chip,
  DataTable,
  Field,
  Modal,
  Page,
  Resource,
  srColumn,
  useAction,
  useConfirm,
  useToast,
  type Column,
} from '../../ui';
import { errorText, PERM, TEXT, type GameKind, type Provider, type ProvidersResponse } from './shared';

/** Games / Starline / Andar Bahar → Provider: the markets (or draw slots) of one kind. */
export function GameProvider({ kind }: { kind: GameKind }) {
  const { nonce } = useRefresh();
  const { can } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [, run] = useAction();
  const load = useCallback(
    () => api<ProvidersResponse>(`/games/${kind}/providers`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, nonce],
  );
  const state = useLoad(load);
  const [editing, setEditing] = useState<Provider | 'new' | null>(null);
  const canEdit = can(`${PERM[kind]}.provider`);

  const remove = (p: Provider) =>
    run(async () => {
      const ok = await confirm({
        title: 'Are you sure?',
        message:
          p.bids > 0
            ? `${p.name} has ${fmt(p.bids)} bids, so it will be disabled instead of deleted. The app stops showing it.`
            : `Delete ${p.name}? Its weekly timetable and result history are removed.`,
        confirmText: p.bids > 0 ? 'Yes, disable' : 'Yes, delete',
        danger: true,
      });
      if (!ok) return;
      const out = await api<{ message: string }>(`/games/providers/${p.id}`, { method: 'DELETE' });
      toast(out.message);
      await state.reload();
    });

  const columns: Column<Provider>[] = [
    srColumn('Sr.'),
    { key: 'name', label: 'Game Name', align: 'center', render: (p) => <strong>{p.name}</strong> },
    { key: 'result', label: 'Game Result', align: 'center', render: (p) => <span className="font-mono">{p.result}</span> },
    {
      key: 'timings',
      label: kind === 'main' ? 'Result Timings (Today)' : 'Timings (Today)',
      align: 'center',
      value: (p) => p.openTime,
      render: (p) => <Timings kind={kind} p={p} />,
    },
    {
      key: 'isActive',
      label: 'Active Status',
      align: 'center',
      value: (p) => (p.isActive ? 'Active' : 'Inactive'),
      render: (p) => <Chip tone={p.isActive ? 'ok' : 'bad'}>{p.isActive ? 'Active' : 'Inactive'}</Chip>,
    },
  ];
  if (canEdit) {
    columns.push(
      {
        key: 'edit',
        label: 'Edit',
        align: 'center',
        sortable: false,
        render: (p) => (
          <Btn variant="info" sm icon="edit" onClick={() => setEditing(p)}>
            Edit
          </Btn>
        ),
      },
      {
        key: 'delete',
        label: 'Delete',
        align: 'center',
        sortable: false,
        render: (p) => (
          <Btn variant="danger" sm icon="trash" onClick={() => void remove(p)}>
            Delete
          </Btn>
        ),
      },
    );
  }

  return (
    <Page title={TEXT[kind].provider}>
      {kind === 'andarbahar' && state.data && (
        <AbSwitch enabled={state.data.enabled} canEdit={canEdit} onChanged={state.reload} />
      )}
      <Card
        title="Providers List"
        actions={
          canEdit && (
            <Btn variant="primary" icon="plus" onClick={() => setEditing('new')}>
              Add New Provider
            </Btn>
          )
        }
      >
        <Resource state={state}>
          {(data) => (
            <DataTable
              columns={columns}
              rows={data.providers}
              rowKey={(p) => p.id}
              paginate={false}
              empty="No providers yet — add one with Add New Provider"
            />
          )}
        </Resource>
      </Card>
      {editing && (
        <ProviderModal
          kind={kind}
          provider={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await state.reload();
          }}
        />
      )}
    </Page>
  );
}

function Timings({ kind, p }: { kind: GameKind; p: Provider }) {
  const t = p.today;
  const dayChip = t.isClosed ? (
    <Chip tone="bad">Closed today</Chip>
  ) : (
    <Chip tone={p.status === 'open_running' || p.status === 'close_running' ? 'ok' : 'pending'}>{p.statusLabel}</Chip>
  );
  return (
    <div className="flex flex-col items-center gap-1">
      {kind === 'main' ? (
        <span>
          Open {hhmm12(t.openResultTime)} · Close {hhmm12(t.closeResultTime)}
        </span>
      ) : (
        <span>
          Bets {hhmm12(t.openBetTime)} – {hhmm12(t.closeBetTime)} · Result {hhmm12(t.openResultTime)}
        </span>
      )}
      {dayChip}
    </div>
  );
}

/** Andar Bahar ON/OFF for the whole app (setting andarbahar_enabled). */
function AbSwitch({ enabled, canEdit, onChanged }: { enabled: boolean; canEdit: boolean; onChanged: () => Promise<void> }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, run] = useAction();
  const toggle = () =>
    run(async () => {
      const next = !enabled;
      const ok = await confirm({
        title: next ? 'Turn Andar Bahar ON?' : 'Turn Andar Bahar OFF?',
        message: next
          ? 'Andar Bahar games show in the app again and accept bids.'
          : 'The app hides Andar Bahar and rejects new Andar Bahar bids. Bids already placed stay pending until you declare their results.',
        confirmText: next ? 'Yes, turn on' : 'Yes, turn off',
        danger: !next,
      });
      if (!ok) return;
      await api('/games/andarbahar/module', { method: 'POST', body: { enabled: next } });
      toast(next ? 'Andar Bahar is ON' : 'Andar Bahar is OFF');
      await onChanged();
    });
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <strong className="text-[15px]">Andar Bahar Module</strong>
        <Chip tone={enabled ? 'ok' : 'bad'}>{enabled ? 'ON — shown in the app' : 'OFF — hidden in the app'}</Chip>
        <span className="muted grow">Switch the whole Andar Bahar game on or off for players.</span>
        {canEdit && (
          <Btn variant={enabled ? 'danger' : 'success'} disabled={busy} onClick={() => void toggle()}>
            {enabled ? 'Turn OFF' : 'Turn ON'}
          </Btn>
        )}
      </div>
    </Card>
  );
}

function ProviderModal({
  kind,
  provider,
  onClose,
  onSaved,
}: {
  kind: GameKind;
  provider: Provider | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState(provider?.name ?? '');
  const [openTime, setOpenTime] = useState(provider?.openTime ?? '');
  const [closeTime, setCloseTime] = useState(provider?.closeTime ?? '');
  const [active, setActive] = useState(provider ? provider.isActive : true);
  const main = kind === 'main';
  const timesChanged = !!provider && (openTime !== provider.openTime || (main && closeTime !== provider.closeTime));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) return setError('Enter the game name');
    if (!openTime) return setError(main ? 'Enter the open result time' : 'Enter the result time');
    if (main && !closeTime) return setError('Enter the close result time');
    setBusy(true);
    try {
      const body = { name: name.trim(), openTime, closeTime: main ? closeTime : openTime, isActive: active };
      if (provider) await api(`/games/providers/${provider.id}`, { method: 'PATCH', body });
      else await api(`/games/${kind}/providers`, { method: 'POST', body });
      toast(provider ? `${body.name} updated` : `${body.name} added`);
      await onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={provider ? 'Edit Game Provider' : 'Add New Provider'} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <Field label="Game Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={main ? 'Enter Game Name' : 'e.g. KING STARLINE 10:00 AM'}
            maxLength={60}
            autoFocus
          />
        </Field>
        {main ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Open Result Time">
              <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
            </Field>
            <Field label="Close Result Time">
              <input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
            </Field>
          </div>
        ) : (
          <Field label="Result Time">
            <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
          </Field>
        )}
        <p className="muted m-0 text-[13px]">
          {main
            ? 'Open and close bets stop 10 minutes before each result. '
            : "Betting opens 1 minute after the previous slot's result and closes 5 minutes before this result. "}
          Adjust single weekdays in {TEXT[kind].settings}.
          {timesChanged && <strong> Saving new times resets all 7 days of this provider's timetable (closed days stay closed).</strong>}
        </p>
        <Field label="Status">
          <select value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')}>
            <option value="1">Active</option>
            <option value="0">Disable Provider</option>
          </select>
        </Field>
        {error && <p className="error m-0">{error}</p>}
        <div className="form-actions left" style={{ marginTop: 0 }}>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : 'Submit'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
