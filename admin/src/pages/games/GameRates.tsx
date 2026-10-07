import { useCallback, useState, type FormEvent } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { amt } from '../../format';
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
import { errorText, PERM, TEXT, type GameKind, type RateRow } from './shared';

interface MissingRate {
  key: string;
  label: string;
  defaultRate: number;
}

interface RatesResponse {
  kind: GameKind;
  rates: RateRow[];
  missing: MissingRate[];
}

const KIND_NAME: Record<GameKind, string> = { main: 'main market games', starline: 'Starline', andarbahar: 'Andar Bahar' };

/** "10 → 95": what a bid of 10 pays at this price. */
function Payout({ rate }: { rate: number }) {
  const ok = Number.isFinite(rate) && rate > 0;
  return <span className="muted text-[12.5px]">{ok ? `10 → ${amt(Math.round(10 * rate * 100) / 100)}` : '--'}</span>;
}

/** Games / Starline / Andar Bahar → Rates ("Game List"): payout multiplier per game type. */
export function GameRates({ kind }: { kind: GameKind }) {
  const { nonce } = useRefresh();
  const { can } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [, run] = useAction();
  const load = useCallback(
    () => api<RatesResponse>(`/games/${kind}/rates`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, nonce],
  );
  const state = useLoad(load);
  const [editing, setEditing] = useState<RateRow | 'new' | null>(null);
  const canEdit = can(`${PERM[kind]}.rates`);

  const remove = (r: RateRow) =>
    run(async () => {
      const ok = await confirm({
        title: 'Are you sure?',
        message: `Remove ${r.label} from ${KIND_NAME[kind]}? Players can no longer bid on it. Bids already placed keep the price they were placed at.`,
        confirmText: 'Yes, remove',
        danger: true,
      });
      if (!ok) return;
      await api(`/games/${kind}/rates/${r.key}`, { method: 'DELETE' });
      toast(`${r.label} removed`);
      await state.reload();
    });

  const columns: Column<RateRow>[] = [
    srColumn('Sr.'),
    { key: 'label', label: 'Game Name' },
    {
      key: 'rate',
      label: 'Game Price',
      render: (r) => (
        <span className="inline-flex items-baseline gap-2">
          <strong className="text-[#323a46]">{amt(r.rate)}</strong>
          <Payout rate={r.rate} />
        </span>
      ),
    },
    {
      key: 'isActive',
      label: 'Status',
      value: (r) => (r.isActive ? 'Active' : 'Inactive'),
      render: (r) => <Chip tone={r.isActive ? 'ok' : 'bad'}>{r.isActive ? 'Active' : 'Inactive'}</Chip>,
    },
  ];
  if (canEdit) {
    columns.push(
      {
        key: 'edit',
        label: 'Edit',
        align: 'center',
        sortable: false,
        render: (r) => (
          <Btn variant="info" sm icon="edit" onClick={() => setEditing(r)}>
            Edit
          </Btn>
        ),
      },
      {
        key: 'delete',
        label: 'Delete',
        align: 'center',
        sortable: false,
        render: (r) => (
          <Btn variant="danger" sm icon="trash" onClick={() => void remove(r)}>
            Delete
          </Btn>
        ),
      },
    );
  }

  const missing = state.data?.missing ?? [];

  return (
    <Page title={TEXT[kind].rates}>
      <Card
        title="Game List"
        actions={
          canEdit && (
            <Btn
              variant="primary"
              icon="plus"
              disabled={missing.length === 0}
              title={missing.length === 0 ? 'Every game for this section is already in the list' : undefined}
              onClick={() => setEditing('new')}
            >
              Add New Game
            </Btn>
          )
        }
      >
        <p className="muted mb-4 mt-0">
          Game Price is the payout multiplier: a winning bid pays bid amount × price (decimals such as 9.5 are allowed).
          Inactive games stay listed but players cannot bid on them.
        </p>
        <Resource state={state}>
          {(data) => (
            <DataTable
              columns={columns}
              rows={data.rates}
              rowKey={(r) => r.key}
              paginate={false}
              searchable={false}
              empty="No games — add one with Add New Game"
            />
          )}
        </Resource>
      </Card>
      {editing && (
        <RateModal
          kind={kind}
          rate={editing === 'new' ? null : editing}
          missing={missing}
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

function RateModal({
  kind,
  rate,
  missing,
  onClose,
  onSaved,
}: {
  kind: GameKind;
  rate: RateRow | null;
  missing: MissingRate[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const first = missing[0];
  const [key, setKey] = useState(rate?.key ?? first?.key ?? '');
  const [label, setLabel] = useState(rate?.label ?? first?.label ?? '');
  const [price, setPrice] = useState(String(rate?.rate ?? first?.defaultRate ?? ''));
  const [active, setActive] = useState(rate ? rate.isActive : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = (k: string) => {
    const m = missing.find((x) => x.key === k);
    setKey(k);
    if (m) {
      setLabel(m.label);
      setPrice(String(m.defaultRate));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const n = Number(price);
    if (!label.trim()) return setError('Enter the game name');
    if (price.trim() === '' || !Number.isFinite(n) || n <= 0) return setError('Game price must be a number above 0');
    setBusy(true);
    try {
      const body = { label: label.trim(), rate: n, isActive: active };
      if (rate) await api(`/games/${kind}/rates/${rate.key}`, { method: 'PATCH', body });
      else await api(`/games/${kind}/rates`, { method: 'POST', body: { key, ...body } });
      toast(`${body.label} saved`);
      await onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={rate ? 'Edit Game' : 'Add New Game'} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        {!rate && (
          <Field label="Game Type">
            <select value={key} onChange={(e) => pick(e.target.value)}>
              {missing.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Game Name">
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Enter Game Name" />
        </Field>
        <Field label="Game Price">
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Enter Game Price"
          />
        </Field>
        <p className="muted m-0 text-[13px]">
          Payout: <Payout rate={Number(price)} /> (bid amount × price)
        </p>
        <Field label="Status">
          <select value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')}>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
        </Field>
        {error && <p className="error m-0">{error}</p>}
        <div className="form-actions left" style={{ marginTop: 0 }}>
          <button className="btn primary" type="submit" disabled={busy || (!rate && !key)}>
            {busy ? 'Please wait…' : 'Submit'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
