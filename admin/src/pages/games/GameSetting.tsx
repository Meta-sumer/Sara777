import { useCallback, useState, type FormEvent } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { hhmm12 } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import { Btn, Card, Chip, DataTable, Field, Modal, Page, Resource, srColumn, useToast, type Column } from '../../ui';
import { errorText, PERM, TEXT, type DayTimes, type GameKind } from './shared';

interface ScheduleProvider {
  id: number;
  name: string;
  isActive: boolean;
  openTime: string;
  closeTime: string;
  week: DayTimes[];
}

interface ScheduleResponse {
  kind: GameKind;
  dayOrder: number[];
  dayNames: string[];
  providers: ScheduleProvider[];
}

/** The time fields of one weekday, in the order they happen. */
function fieldsOf(kind: GameKind): Array<{ key: keyof DayTimes; short: string; label: string }> {
  return kind === 'main'
    ? [
        { key: 'openBetTime', short: 'OBT', label: 'OBT — Open Bets Close' },
        { key: 'openResultTime', short: 'OBRT', label: 'OBRT — Open Result Time' },
        { key: 'closeBetTime', short: 'CBT', label: 'CBT — Close Bets Close' },
        { key: 'closeResultTime', short: 'CBRT', label: 'CBRT — Close Result Time' },
      ]
    : [
        { key: 'openBetTime', short: 'OBT', label: 'OBT — Betting Opens' },
        { key: 'closeBetTime', short: 'CBT', label: 'CBT — Betting Closes' },
        { key: 'openResultTime', short: 'RSLT', label: 'RSLT — Result Time' },
      ];
}

/** Games / Starline / Andar Bahar → Setting: the weekly timetable matrix (provider × weekday). */
export function GameSetting({ kind }: { kind: GameKind }) {
  const { nonce } = useRefresh();
  const { can } = useAuth();
  const load = useCallback(
    () => api<ScheduleResponse>(`/games/${kind}/schedule`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, nonce],
  );
  const state = useLoad(load);
  const [editing, setEditing] = useState<{ provider: ScheduleProvider; day: number | null } | null>(null);
  const canEdit = can(`${PERM[kind]}.setting`);
  const todayDow = new Date().getDay();
  const fields = fieldsOf(kind);

  const dayColumn = (day: number, name: string): Column<ScheduleProvider> => ({
    key: `d${day}`,
    label: (
      <span className="inline-flex items-center gap-1.5">
        {name}
        {day === todayDow && <Chip tone="info">Today</Chip>}
      </span>
    ),
    sortable: false,
    render: (p) => {
      const d = p.week.find((w) => w.day === day);
      if (!d) return '--';
      return (
        <div className="flex flex-col text-[13px] leading-6">
          {fields.map((f) => (
            <div key={f.key}>
              <strong className="text-[#323a46]">{f.short} :</strong> {hhmm12(d[f.key] as string | null)}
            </div>
          ))}
          <div>
            <strong className="text-[#323a46]">Is Closed :</strong>{' '}
            {d.isClosed ? <span className="loss">Closed</span> : 'Open'}
          </div>
          {canEdit && (
            <div className="mt-2 text-center">
              <Btn variant="dark" sm icon="edit" onClick={() => setEditing({ provider: p, day })}>
                Update
              </Btn>
            </div>
          )}
        </div>
      );
    },
  });

  return (
    <Page title={TEXT[kind].settings}>
      <Card title={TEXT[kind].settingsCard}>
        <p className="muted mb-4 mt-0">
          {kind === 'main'
            ? 'OBT: open-session bets close · OBRT: open result · CBT: close-session bets close · CBRT: close result.'
            : 'OBT: betting opens · CBT: betting closes · RSLT: result time.'}{' '}
          A day marked Closed is a holiday: the app shows the game as closed and takes no bids.
        </p>
        <Resource state={state}>
          {(data) => {
            const columns: Column<ScheduleProvider>[] = [
              srColumn('Sr.'),
              {
                key: 'name',
                label: 'Game Name',
                align: 'center',
                render: (p) => (
                  <div className="flex min-w-[120px] max-w-[170px] flex-col items-center gap-2 whitespace-normal">
                    <strong className="text-[15px] text-[#323a46]">{p.name}</strong>
                    {!p.isActive && <Chip tone="bad">Inactive</Chip>}
                    {canEdit && (
                      <Btn variant="indigo" sm onClick={() => setEditing({ provider: p, day: null })}>
                        Multiple Days Edit
                      </Btn>
                    )}
                  </div>
                ),
              },
              ...data.dayOrder.map((d) => dayColumn(d, data.dayNames[d])),
            ];
            return (
              <DataTable
                columns={columns}
                rows={data.providers}
                rowKey={(p) => p.id}
                paginate={false}
                empty="No providers yet — add one on the Provider page"
              />
            );
          }}
        </Resource>
      </Card>
      {editing && state.data && (
        <DaysModal
          kind={kind}
          provider={editing.provider}
          day={editing.day}
          dayOrder={state.data.dayOrder}
          dayNames={state.data.dayNames}
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

/** "Update" (one weekday) or "Multiple Days Edit" (pick the weekdays). */
function DaysModal({
  kind,
  provider,
  day,
  dayOrder,
  dayNames,
  onClose,
  onSaved,
}: {
  kind: GameKind;
  provider: ScheduleProvider;
  day: number | null;
  dayOrder: number[];
  dayNames: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const multi = day === null;
  // multi-edit starts from today's times, a single day from its own
  const start = provider.week.find((w) => w.day === (day ?? new Date().getDay())) ?? provider.week[0];
  const [days, setDays] = useState<number[]>(day === null ? [] : [day]);
  const [times, setTimes] = useState({
    openBetTime: start?.openBetTime ?? '',
    closeBetTime: start?.closeBetTime ?? '',
    openResultTime: start?.openResultTime ?? '',
    closeResultTime: start?.closeResultTime ?? '',
  });
  const [closed, setClosed] = useState(!!start?.isClosed && !multi);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fields = fieldsOf(kind);

  const toggle = (d: number) => setDays((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d]));
  const allOn = days.length === 7;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (days.length === 0) return setError('Select at least one day');
    for (const f of fields) {
      if (!times[f.key as keyof typeof times]) return setError(`Enter ${f.label}`);
    }
    setBusy(true);
    try {
      await api(`/games/providers/${provider.id}/schedule`, {
        method: 'PUT',
        body: { days, ...times, closeResultTime: kind === 'main' ? times.closeResultTime : null, isClosed: closed },
      });
      const names = dayOrder.filter((d) => days.includes(d)).map((d) => dayNames[d]);
      toast(`${provider.name}: saved for ${days.length === 7 ? 'all days' : names.join(', ')}`);
      await onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={multi ? `Multiple Days Edit — ${provider.name}` : `Update ${provider.name} — ${dayNames[day ?? 0]}`}
      onClose={onClose}
      size="md"
    >
      <form className="form-stack" onSubmit={submit}>
        {multi && (
          <div>
            <div className="mb-2 font-bold text-[#323a46]">Days</div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <label className="check">
                <input type="checkbox" checked={allOn} onChange={() => setDays(allOn ? [] : [...dayOrder])} />
                Select All
              </label>
              {dayOrder.map((d) => (
                <label key={d} className="check">
                  <input type="checkbox" checked={days.includes(d)} onChange={() => toggle(d)} />
                  {dayNames[d]}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <Field key={f.key} label={f.label}>
              <input
                type="time"
                value={times[f.key as keyof typeof times] ?? ''}
                onChange={(e) => setTimes((t) => ({ ...t, [f.key]: e.target.value }))}
              />
            </Field>
          ))}
          <Field label="Is Closed">
            <select value={closed ? '1' : '0'} onChange={(e) => setClosed(e.target.value === '1')}>
              <option value="0">Open</option>
              <option value="1">Closed</option>
            </select>
          </Field>
        </div>
        <p className="muted m-0 text-[13px]">
          {kind === 'main'
            ? 'Times must run in order: OBT ≤ OBRT ≤ CBT ≤ CBRT, all on the same day.'
            : 'Times must run in order: OBT before CBT, and CBT at or before RSLT, all on the same day.'}
        </p>
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
