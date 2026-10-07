import { useCallback, useState } from 'react';
import { api } from '../../api';
import { slash } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import { Btn, Card, DataTable, FilterCard, Field, Page, Resource, useToast, type Column } from '../../ui';
import { UserProfileModal } from '../users/UserProfileModal';
import {
  type FundList,
  type FundRow,
  DateCell,
  Issues,
  TotalAmount,
  UserCell,
  dash,
  exportPayout,
  exportedMessage,
  phone,
  useRequestActions,
  useSelection,
} from './shared';

const TITLE = { paytm: 'Approved Paytm Requests', bank: 'Approved Bank Account Requests' };

/**
 * Approved Debit → Paytm Request / Bank Account Request: approved withdraws
 * waiting to be paid in that mode. Mark them paid (with the UTR) or failed.
 */
export function ApprovedDebit({ mode }: { mode: 'paytm' | 'bank' }) {
  const { nonce } = useRefresh();
  const [form, setForm] = useState({ from: '', to: '' });
  const [range, setRange] = useState({ from: '', to: '' });

  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (range.from) {
      q.set('from', range.from);
      q.set('to', range.to || range.from);
    }
    return api<FundList>(`/wallet/approved/${mode}?${q}`);
  }, [mode, range, nonce]);
  const state = useLoad(load);

  return (
    <Page title={TITLE[mode]}>
      <FilterCard
        title="Approved between (leave empty for all)"
        onSubmit={() => setRange({ from: form.from, to: form.to || form.from })}
        onCancel={() => {
          setForm({ from: '', to: '' });
          setRange({ from: '', to: '' });
        }}
      >
        <Field label="From Date">
          <input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
        </Field>
        <Field label="To Date">
          <input type="date" value={form.to} min={form.from || undefined} onChange={(e) => setForm({ ...form, to: e.target.value })} />
        </Field>
      </FilterCard>
      <Resource state={state}>
        {(data) => <ApprovedTable key={mode} mode={mode} data={data} reload={state.reload} />}
      </Resource>
    </Page>
  );
}

function ApprovedTable({ mode, data, reload }: { mode: 'paytm' | 'bank'; data: FundList; reload: () => Promise<void> }) {
  const toast = useToast();
  const sel = useSelection(data.rows);
  const act = useRequestActions(() => void reload());
  const [profile, setProfile] = useState<number | null>(null);

  const payout: Column<FundRow>[] =
    mode === 'paytm'
      ? [
          { key: 'paytm', label: 'Paytm Number', value: (r) => r.bank?.paytm ?? '', render: (r) => <strong>{dash(r.bank?.paytm)}</strong> },
          { key: 'holder', label: 'Name on Account', value: (r) => r.bank?.holderName ?? '', render: (r) => dash(r.bank?.holderName) },
        ]
      : [
          { key: 'holder', label: 'Acc Holder', value: (r) => r.bank?.holderName ?? '', render: (r) => dash(r.bank?.holderName) },
          { key: 'account', label: 'A/C NO', value: (r) => r.bank?.accountNo ?? '', render: (r) => <strong>{dash(r.bank?.accountNo)}</strong> },
          { key: 'ifsc', label: 'IFSC', value: (r) => r.bank?.ifsc ?? '', render: (r) => dash(r.bank?.ifsc) },
          {
            key: 'bankName',
            label: 'Bank',
            value: (r) => r.bank?.bankName ?? '',
            render: (r) => <span className="whitespace-normal block min-w-[160px]">{dash(r.bank?.bankName)}</span>,
          },
        ];

  const columns: Column<FundRow>[] = [
    sel.column,
    { key: '__sr', label: 'Sr.', sortable: false, align: 'center', render: (_r, i) => i + 1 },
    {
      key: 'action',
      label: 'Action',
      sortable: false,
      render: (r) => (
        <div className="flex flex-col gap-1.5 items-stretch">
          <Btn sm variant="success" icon="check" disabled={act.busy} onClick={() => act.complete([r])}>
            Paid
          </Btn>
          <Btn sm variant="warning" disabled={act.busy} onClick={() => act.fail([r])}>
            Failed
          </Btn>
        </div>
      ),
    },
    { key: 'user', label: 'User', value: (r) => r.name + ' ' + r.username, render: (r) => <UserCell row={r} onProfile={setProfile} /> },
    { key: 'mobile', label: 'Mobile', render: (r) => phone(r.mobile) },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      render: (r) => (
        <>
          <strong>{slash(r.amount)}</strong>
          <Issues row={r} />
        </>
      ),
    },
    ...payout,
    { key: 'attempts', label: 'Attempts', align: 'center' },
    { key: 'createdAt', label: 'Requested', render: (r) => <DateCell iso={r.createdAt} /> },
    { key: 'updatedAt', label: 'Approved At', render: (r) => <DateCell iso={r.updatedAt} /> },
    { key: 'processedBy', label: 'Approved By', render: (r) => dash(r.processedBy) },
  ];

  const doExport = () => {
    if (data.rows.length === 0) return toast('Nothing to export', true);
    const type = mode === 'paytm' ? 'paytm' : 'kotak';
    const n = exportPayout(type, data.rows, mode === 'paytm' ? 'approved-paytm' : 'approved-bank');
    toast(exportedMessage(type, n, data.rows.length), n === 0);
  };

  return (
    <Card>
      <div className="flex flex-wrap gap-2 mb-4">
        <Btn variant="success" disabled={act.busy} onClick={() => act.complete(sel.selected)}>
          Mark Selected Paid{sel.selected.length ? ` (${sel.selected.length})` : ''}
        </Btn>
        <Btn variant="brand" icon="download" onClick={doExport}>
          Export {mode === 'paytm' ? 'Paytm Payout CSV' : 'Kotak Bulk Payout CSV'}
        </Btn>
      </div>
      <DataTable columns={columns} rows={data.rows} rowKey={(r) => r.id} pageSize={50} pageSizes={[25, 50, 100, 500]} />
      <TotalAmount value={data.totalAmount} />
      {act.dialog}
      {profile !== null && <UserProfileModal userId={profile} onClose={() => setProfile(null)} />}
    </Card>
  );
}
