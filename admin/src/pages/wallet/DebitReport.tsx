import { useCallback, useState } from 'react';
import { api } from '../../api';
import { dateOnly, slash, today } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import { Btn, Card, DataTable, Field, Page, Resource, useToast, type Column } from '../../ui';
import {
  type FundList,
  type FundRow,
  type ReportType,
  REPORT_TYPES,
  StatusChip,
  TotalAmount,
  ValidityLegend,
  dash,
  exportPayout,
  exportedMessage,
  BtnField,
  DateCell,
  modeLabel,
  payoutColumns,
  useRequestActions,
  useSelection,
  validityRow,
} from './shared';

/* ------------------------------------------------------ Export Debit Report */

type SearchType = 'pending' | 'approved';

const SEARCH_TYPES: Array<{ key: SearchType; label: string }> = [
  { key: 'pending', label: 'Pending Debit Requests' },
  { key: 'approved', label: 'All Approved' },
];

interface DebitQuery {
  searchType: SearchType;
  date: string;
}

/**
 * Wallet → Export Debit Report: withdraw requests checked for payout problems
 * (green valid / red invalid), approve the valid ones and export a bank file.
 */
export function ExportDebitReport() {
  const { nonce } = useRefresh();
  const [form, setForm] = useState<DebitQuery & { reportType: ReportType }>({
    searchType: 'pending',
    date: today(),
    reportType: 'kotak',
  });
  const [query, setQuery] = useState<DebitQuery>({ searchType: 'pending', date: today() });

  const load = useCallback(
    () => api<FundList & { date: string }>(`/wallet/debit-report?searchType=${query.searchType}&date=${query.date}`),
    [query, nonce],
  );
  const state = useLoad(load);

  return (
    <Page title="Export Debit Report">
      <Card title="Withdraw Report">
        <div className="filters">
          <Field label="Search Type">
            <select value={form.searchType} onChange={(e) => setForm({ ...form, searchType: e.target.value as SearchType })}>
              {SEARCH_TYPES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Report Type">
            <select value={form.reportType} onChange={(e) => setForm({ ...form, reportType: e.target.value as ReportType })}>
              {REPORT_TYPES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Report Date">
            <input type="date" value={form.date} max={today()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <BtnField label="Submit">
            <Btn variant="warning" onClick={() => setQuery({ searchType: form.searchType, date: form.date })}>
              Get Report
            </Btn>
          </BtnField>
          <BtnField label="Today App Reports">
            <Btn
              variant="indigo"
             
              onClick={() => {
                setForm({ ...form, date: today() });
                setQuery({ searchType: form.searchType, date: today() });
              }}
            >
              See Report
            </Btn>
          </BtnField>
        </div>
        <p className="muted mt-3 mb-0 text-[13px]">
          Pending shows every request still waiting up to the report date; All Approved shows requests approved on that
          date and waiting for payout.
        </p>
      </Card>

      <Resource state={state}>
        {(data) => (
          <DebitResults
            data={data}
            searchType={query.searchType}
            date={query.date}
            reportType={form.reportType}
            reload={state.reload}
          />
        )}
      </Resource>
    </Page>
  );
}

function DebitResults({
  data,
  searchType,
  date,
  reportType,
  reload,
}: {
  data: FundList;
  searchType: SearchType;
  date: string;
  reportType: ReportType;
  reload: () => Promise<void>;
}) {
  const toast = useToast();
  const sel = useSelection(data.rows);
  const act = useRequestActions(() => void reload());
  const pending = searchType === 'pending';
  const validRows = data.rows.filter((r) => r.valid);

  const columns: Column<FundRow>[] = [
    ...(pending ? [sel.column] : []),
    {
      key: 'action',
      label: 'Action',
      sortable: false,
      render: (r) =>
        pending ? (
          <Btn sm variant="success" icon="check" disabled={act.busy || !r.valid} title={r.valid ? 'Approve' : r.issues.join(', ')} onClick={() => act.approve([r], true)}>
            Approve
          </Btn>
        ) : (
          <StatusChip status={r.status} />
        ),
    },
    ...payoutColumns(),
  ];

  const doExport = () => {
    const rows = validRows;
    if (rows.length === 0) return toast('No valid requests to export', true);
    const n = exportPayout(reportType, rows, `withdraw-report-${dateOnly(date).replace(/\//g, '-')}`);
    const skipped = data.rows.length - rows.length;
    toast(exportedMessage(reportType, n, rows.length) + (skipped ? ` · ${skipped} invalid left out` : ''), n === 0);
  };

  return (
    <Card>
      <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
        <div className="flex flex-wrap gap-2">
          {pending && (
            <>
              <Btn variant="dark" className="pill" disabled={act.busy || validRows.length === 0} onClick={() => act.approve(validRows, true)}>
                Approve All{validRows.length ? ` (${validRows.length})` : ''}
              </Btn>
              <Btn variant="success" className="pill" disabled={act.busy} onClick={() => act.approve(sel.selected, true)}>
                Approve Selected{sel.selected.length ? ` (${sel.selected.length})` : ''}
              </Btn>
            </>
          )}
          <Btn variant="brand" icon="download" className="pill" onClick={doExport}>
            Export {REPORT_TYPES.find((t) => t.key === reportType)?.label}
          </Btn>
        </div>
        <ValidityLegend list={data} />
      </div>
      <DataTable
        columns={columns}
        rows={data.rows}
        rowKey={(r) => r.id}
        rowClassName={validityRow}
        pageSize={50}
        pageSizes={[25, 50, 100, 500]}
      />
      <TotalAmount value={data.totalAmount} />
      <p className="muted mt-1 mb-0">
        Valid {slash(validRows.reduce((s, r) => s + r.amount, 0))} · Invalid{' '}
        {slash(data.rows.filter((r) => !r.valid).reduce((s, r) => s + r.amount, 0))}
      </p>
      {act.dialog}
    </Card>
  );
}

/* ---------------------------------------------------- Download Debit Report */

type DownloadStatus = 'all' | 'approved' | 'completed';

const DOWNLOAD_TYPES: Array<{ key: DownloadStatus; label: string }> = [
  { key: 'all', label: 'All Approved' },
  { key: 'approved', label: 'Approved (awaiting payout)' },
  { key: 'completed', label: 'Completed (paid)' },
];

interface DownloadQuery {
  status: DownloadStatus;
  from: string;
  to: string;
}

/** Wallet → Download Debit Report: approved / paid withdraws over a date range, as a table or a bank file. */
export function DownloadDebitReport() {
  const { nonce } = useRefresh();
  const toast = useToast();
  const [form, setForm] = useState<DownloadQuery & { reportType: ReportType }>({
    status: 'all',
    from: today(),
    to: today(),
    reportType: 'kotak',
  });
  const [query, setQuery] = useState<DownloadQuery | null>(null);

  const load = useCallback(
    () =>
      query
        ? api<FundList>(`/wallet/debit-download?status=${query.status}&from=${query.from}&to=${query.to}`)
        : Promise.resolve(null),
    [query, nonce],
  );
  const state = useLoad(load);

  const fetchList = (q: DownloadQuery) =>
    api<FundList>(`/wallet/debit-download?status=${q.status}&from=${q.from}&to=${q.to}`);

  const download = async () => {
    const q = { status: form.status, from: form.from, to: form.to };
    try {
      const list = await fetchList(q);
      setQuery(q);
      if (list.rows.length === 0) return toast('No requests for these dates', true);
      const n = exportPayout(form.reportType, list.rows, `debit-report-${q.from}-to-${q.to}`);
      toast(exportedMessage(form.reportType, n, list.rows.length), n === 0);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
    }
  };

  const columns: Column<FundRow>[] = [
    { key: '__sr', label: 'Sno', sortable: false, align: 'center', render: (_r, i) => i + 1 },
    { key: 'username', label: 'Username' },
    { key: 'mode', label: 'Mode', render: (r) => modeLabel(r.mode) },
    { key: 'holder', label: 'Acc Holder', value: (r) => r.bank?.holderName ?? '', render: (r) => dash(r.bank?.holderName) },
    {
      key: 'bankName',
      label: 'Bank',
      value: (r) => (r.mode === 'paytm' ? 'Paytm' : (r.bank?.bankName ?? '')),
      render: (r) => <span className="whitespace-normal block min-w-[150px]">{r.mode === 'paytm' ? 'Paytm' : dash(r.bank?.bankName)}</span>,
    },
    { key: 'ifsc', label: 'IFSC', value: (r) => r.bank?.ifsc ?? '', render: (r) => (r.mode === 'paytm' ? '--' : dash(r.bank?.ifsc)) },
    {
      key: 'account',
      label: 'A/C NO',
      value: (r) => (r.mode === 'paytm' ? (r.bank?.paytm ?? '') : (r.bank?.accountNo ?? '')),
      render: (r) => dash(r.mode === 'paytm' ? r.bank?.paytm : r.bank?.accountNo),
    },
    { key: 'amount', label: 'Amt', align: 'right', render: (r) => <strong>{slash(r.amount)}</strong> },
    { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} /> },
    { key: 'pgRef', label: 'UTR / Ref', render: (r) => dash(r.pgRef) },
    {
      key: 'date',
      label: 'Date',
      value: (r) => r.completedAt ?? r.updatedAt ?? r.createdAt,
      render: (r) => <DateCell iso={r.completedAt ?? r.updatedAt ?? r.createdAt} />,
    },
  ];

  return (
    <Page title="Download Debit Report">
      <Card title="Debit Report">
        <div className="filters">
          <Field label="Search Type">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as DownloadStatus })}>
              {DOWNLOAD_TYPES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Report Type">
            <select value={form.reportType} onChange={(e) => setForm({ ...form, reportType: e.target.value as ReportType })}>
              {REPORT_TYPES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From Date">
            <input type="date" value={form.from} max={form.to} onChange={(e) => setForm({ ...form, from: e.target.value })} />
          </Field>
          <Field label="To Date">
            <input type="date" value={form.to} min={form.from} max={today()} onChange={(e) => setForm({ ...form, to: e.target.value })} />
          </Field>
          <BtnField label="Submit">
            <Btn variant="warning" onClick={() => setQuery({ status: form.status, from: form.from, to: form.to })}>
              See Report Data
            </Btn>
          </BtnField>
          <BtnField label="Download">
            <Btn variant="warning" icon="download" onClick={() => void download()}>
              Download Report
            </Btn>
          </BtnField>
        </div>
        <p className="muted mt-3 mb-0 text-[13px]">Dates are when the request was approved, or paid for completed requests.</p>
      </Card>

      <Card>
        <Resource state={state}>
          {(data) =>
            data ? (
              <>
                <DataTable columns={columns} rows={data.rows} rowKey={(r) => r.id} pageSize={50} pageSizes={[25, 50, 100, 500]} />
                <TotalAmount value={data.totalAmount} />
              </>
            ) : (
              <DataTable columns={columns} rows={[]} paginate={false} searchable={false} empty="Choose the filters and press See Report Data" />
            )
          }
        </Resource>
      </Card>
    </Page>
  );
}
