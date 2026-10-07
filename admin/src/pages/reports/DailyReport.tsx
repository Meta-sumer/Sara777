import { useEffect, useState } from 'react';
import { type Player, PlayerSelect } from '../../components/PlayerSelect';
import { exportCsv } from '../../export';
import { dt, today } from '../../format';
import { Card, Chip, type Column, DataTable, Field, Page, srColumn, useAction } from '../../ui';
import { LoadingLine, type PagedResponse, ReportFilter, useServerReport } from './r2Common';

interface ActivityRow {
  at: string;
  tag: string;
  userId: number;
  username: string;
  notification: string;
}

interface Resp extends PagedResponse {
  from: string;
  to: string;
  type: string;
  typeLabel: string;
  rows: ActivityRow[];
}

const REPORT_TYPES: Array<[key: string, label: string, tone: string]> = [
  ['play', 'Play Game', 'info'],
  ['win', 'Win', 'won'],
  ['deposit', 'Deposit', 'ok'],
  ['withdraw_request', 'Withdraw Request', 'pending'],
  ['withdraw_paid', 'Withdraw Paid', 'completed'],
  ['register', 'Register', 'info'],
  ['admin', 'Admin Credit/Debit', 'warn'],
  ['bank', 'Bank Change', 'bad'],
];
const TYPE_OF = new Map(REPORT_TYPES.map(([k, label, tone]) => [k, { label, tone }]));

interface Filters {
  from: string;
  to: string;
  type: string;
}

const start = (): Filters => ({ from: today(), to: today(), type: 'play' });

/** Reports → Daily Report: an activity feed, one readable line per event. */
export function DailyReport() {
  const [f, setF] = useState<Filters>(start);
  const [player, setPlayer] = useState<Player | null>(null);
  const report = useServerReport<Resp>('/reports/daily');
  const [exporting, runExport] = useAction();
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((s) => ({ ...s, [k]: v }));

  const { submit } = report;
  useEffect(() => submit({ ...start() }), [submit]);

  const run = () => submit({ ...f, userId: player ? String(player.id) : '' });
  const cancel = () => {
    setF(start());
    setPlayer(null);
    submit({ ...start() });
  };

  const data = report.data;
  const columns: Column<ActivityRow>[] = [
    srColumn('Sr.'),
    { key: 'at', label: 'Date', render: (r) => dt(r.at) },
    {
      key: 'notification',
      label: 'Notification',
      className: 'wrap',
      render: (r) => (
        <>
          {data?.type === 'all' && (
            <span style={{ marginRight: 8 }}>
              <Chip tone={TYPE_OF.get(r.tag)?.tone}>{TYPE_OF.get(r.tag)?.label ?? r.tag}</Chip>
            </span>
          )}
          {r.notification}
        </>
      ),
    },
  ];

  const doExport = () =>
    runExport(async () => {
      const all = await report.fetchAll();
      exportCsv(
        `daily-report-${all.type}-${all.from}-to-${all.to}`,
        ['Sr.', 'Date', 'Type', 'Username', 'Notification'],
        all.rows.map((r, i) => [i + 1, dt(r.at), TYPE_OF.get(r.tag)?.label ?? r.tag, r.username, r.notification]),
      );
    });

  return (
    <Page title="Daily Report">
      <ReportFilter
        title="Daily Report"
        onSubmit={run}
        onCancel={cancel}
        onExport={doExport}
        busy={report.loading}
        exporting={exporting}
        canExport={!!data}
      >
        <Field label="Start Date">
          <input type="date" value={f.from} max={today()} onChange={(e) => set('from', e.target.value || today())} />
        </Field>
        <Field label="End Date">
          <input type="date" value={f.to} max={today()} onChange={(e) => set('to', e.target.value || today())} />
        </Field>
        <Field label="Player Name">
          <PlayerSelect value={player} onChange={setPlayer} placeholder="Type Username (optional)" />
        </Field>
        <Field label="Report Type">
          <select value={f.type} onChange={(e) => set('type', e.target.value)}>
            {REPORT_TYPES.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
            <option value="all">All Activity</option>
          </select>
        </Field>
      </ReportFilter>

      <Card title={data ? data.typeLabel : undefined}>
        <LoadingLine show={report.loading} />
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r, i) => `${r.tag}-${r.at}-${i}`}
          server={data ? report.server : undefined}
        />
      </Card>
    </Page>
  );
}
