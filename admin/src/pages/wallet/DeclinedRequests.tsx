import { useCallback, useState } from 'react';
import { api } from '../../api';
import { addDays, dt, slash, today } from '../../format';
import { exportCsv } from '../../export';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import { Btn, Card, DataTable, FilterCard, Field, Page, Resource, useToast, type Column } from '../../ui';
import { DateCell, type FundList, type FundRow, PayoutCell, TotalAmount, UserCell, dash, modeLabel, phone } from './shared';

type Kind = 'withdraw' | 'deposit';

interface Query {
  type: Kind;
  from: string;
  to: string;
}

/** Declined Requests: declined withdraws (refunded) or declined deposits, with the remark and who declined. */
export function DeclinedRequests() {
  const { nonce } = useRefresh();
  const toast = useToast();
  const initial: Query = { type: 'withdraw', from: addDays(today(), -6), to: today() };
  const [form, setForm] = useState<Query>(initial);
  const [query, setQuery] = useState<Query>(initial);

  const load = useCallback(
    () => api<FundList>(`/wallet/declined?type=${query.type}&from=${query.from}&to=${query.to}`),
    [query, nonce],
  );
  const state = useLoad(load);

  const columns: Column<FundRow>[] = [
    { key: '__sr', label: 'Sr.', sortable: false, align: 'center', render: (_r, i) => i + 1 },
    { key: 'user', label: 'User', value: (r) => r.name + ' ' + r.username, render: (r) => <UserCell row={r} /> },
    { key: 'mobile', label: 'Mobile', render: (r) => phone(r.mobile) },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => <strong>{slash(r.amount)}</strong> },
    { key: 'mode', label: 'Mode', render: (r) => modeLabel(r.mode) },
    query.type === 'withdraw'
      ? {
          key: 'bank',
          label: 'Bank Details',
          sortable: false,
          value: (r) => [r.bank?.holderName, r.bank?.accountNo, r.bank?.paytm].filter(Boolean).join(' '),
          render: (r) => <PayoutCell row={r} />,
        }
      : {
          key: 'utr',
          label: 'UTR / Proof',
          render: (r) => (
            <div className="flex gap-2 items-center">
              <span>{dash(r.utr)}</span>
              {r.proofUrl && (
                <a href={r.proofUrl} target="_blank" rel="noreferrer" title="Open payment screenshot">
                  <img src={r.proofUrl} alt={`Payment proof for request ${r.id}`} className="proof-thumb" />
                </a>
              )}
            </div>
          ),
        },
    { key: 'remark', label: 'Remark', render: (r) => <span className="whitespace-normal block min-w-[160px]">{dash(r.remark)}</span> },
    { key: 'processedBy', label: 'Declined By', render: (r) => dash(r.processedBy) },
    { key: 'createdAt', label: 'Requested At', render: (r) => <DateCell iso={r.createdAt} /> },
    { key: 'updatedAt', label: 'Declined At', render: (r) => <DateCell iso={r.updatedAt} /> },
  ];

  const doExport = (rows: FundRow[]) => {
    if (rows.length === 0) return toast('Nothing to export', true);
    exportCsv(
      `declined-${query.type}-${query.from}-to-${query.to}`,
      ['Sr No', 'Request ID', 'Name', 'Username', 'Mobile', 'Amount', 'Mode', query.type === 'withdraw' ? 'Account' : 'UTR', 'Remark', 'Declined By', 'Requested At', 'Declined At'],
      rows.map((r, i) => [
        i + 1,
        r.id,
        r.name,
        r.username,
        r.mobile,
        r.amount,
        modeLabel(r.mode),
        query.type === 'withdraw' ? (r.mode === 'paytm' ? r.bank?.paytm : r.bank?.accountNo) : r.utr,
        r.remark ?? '',
        r.processedBy ?? '',
        dt(r.createdAt),
        dt(r.updatedAt),
      ]),
    );
  };

  return (
    <Page title="Declined Requests">
      <FilterCard onSubmit={() => setQuery(form)} onCancel={() => { setForm(initial); setQuery(initial); }}>
        <Field label="Request Type">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Kind })}>
            <option value="withdraw">Withdraw (debit)</option>
            <option value="deposit">Deposit (credit)</option>
          </select>
        </Field>
        <Field label="From Date">
          <input type="date" value={form.from} max={form.to} onChange={(e) => setForm({ ...form, from: e.target.value })} />
        </Field>
        <Field label="To Date">
          <input type="date" value={form.to} min={form.from} max={today()} onChange={(e) => setForm({ ...form, to: e.target.value })} />
        </Field>
      </FilterCard>
      <Resource state={state}>
        {(data) => (
          <Card
            title={query.type === 'withdraw' ? 'Declined Withdraw Requests' : 'Declined Deposit Requests'}
            actions={
              <Btn variant="brand" icon="download" onClick={() => doExport(data.rows)}>
                Export
              </Btn>
            }
          >
            <DataTable columns={columns} rows={data.rows} rowKey={(r) => r.id} pageSize={25} />
            <TotalAmount value={data.totalAmount} />
          </Card>
        )}
      </Resource>
    </Page>
  );
}
