import { useCallback, useState } from 'react';
import { api } from '../../api';
import { addDays, slash, today } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import { Btn, Card, Chip, DataTable, Page, Resource, type Column } from '../../ui';
import { UserProfileModal } from '../users/UserProfileModal';
import {
  type FundList,
  type FundRow,
  DateCell,
  Issues,
  PayoutCell,
  StatusChip,
  TotalAmount,
  UserCell,
  dash,
  modeLabel,
  phone,
  useRequestActions,
  useSelection,
} from './shared';

type Tab = 'pending' | 'approved' | 'rejected' | 'completed' | 'deposits';

const TABS: Array<{ key: Tab; label: string; count?: 'pending' | 'approved' | 'deposits' }> = [
  { key: 'pending', label: 'Debit Request', count: 'pending' },
  { key: 'approved', label: 'Approved Debit Request', count: 'approved' },
  { key: 'rejected', label: 'Declined Debit Request' },
  { key: 'completed', label: 'Completed Request' },
  { key: 'deposits', label: 'Deposit Requests', count: 'deposits' },
];

interface Response extends FundList {
  counts: { pending: number; approved: number; deposits: number };
}

/** Wallet → Fund Requests: withdraw requests through their payout lifecycle, plus deposits to approve. */
export function FundRequests() {
  const { nonce } = useRefresh();
  const [tab, setTab] = useState<Tab>('pending');
  const [range, setRange] = useState({ from: addDays(today(), -6), to: today() });
  const dated = tab === 'rejected' || tab === 'completed';

  const load = useCallback(() => {
    const q = new URLSearchParams({ tab });
    if (dated) {
      q.set('from', range.from);
      q.set('to', range.to);
    }
    return api<Response>(`/wallet/fund-requests?${q}`);
  }, [tab, dated, range, nonce]);
  const state = useLoad(load);
  const counts = state.data?.counts;

  return (
    <Page title="Fund Requests">
      <Card title="Fund Request">
        <div className="flex flex-wrap border-b border-[#dee2e6] mb-6">
          {TABS.map((t) => {
            const active = t.key === tab;
            const n = t.count && counts ? counts[t.count] : 0;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex-1 min-w-[160px] -mb-px px-4 py-3 text-[14px] font-bold border rounded-t ${
                  active
                    ? 'bg-white border-[#dee2e6] border-b-white text-[#323a46]'
                    : 'border-transparent text-[#6c757d] hover:text-[#323a46]'
                }`}
              >
                {t.label}
                {n > 0 && (
                  <span className="ml-2 inline-block rounded-full bg-[#f4511e] text-white text-[11px] px-2 leading-[18px]">
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {dated && (
          <div className="flex flex-wrap gap-4 items-end mb-4">
            <label className="field w-[190px]">
              From Date
              <input type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            </label>
            <label className="field w-[190px]">
              To Date
              <input type="date" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </label>
          </div>
        )}

        <Resource state={state}>
          {(data) => <RequestTable key={tab} tab={tab} data={data} reload={state.reload} />}
        </Resource>
      </Card>
    </Page>
  );
}

function RequestTable({ tab, data, reload }: { tab: Tab; data: FundList; reload: () => Promise<void> }) {
  const sel = useSelection(data.rows);
  const act = useRequestActions(() => void reload());
  const [profile, setProfile] = useState<number | null>(null);

  const userCols: Column<FundRow>[] = [
    {
      key: 'user',
      label: 'User',
      value: (r) => `${r.name} ${r.username}`,
      render: (r) => <UserCell row={r} onProfile={setProfile} />,
    },
    { key: 'mobile', label: 'Mobile', render: (r) => phone(r.mobile) },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => <strong>{slash(r.amount)}</strong> },
  ];
  const bankCol: Column<FundRow> = {
    key: 'bank',
    label: 'Bank Details',
    value: (r) => [r.bank?.holderName, r.bank?.accountNo, r.bank?.ifsc, r.bank?.paytm].filter(Boolean).join(' '),
    render: (r) => <PayoutCell row={r} />,
    sortable: false,
  };
  const modeCol: Column<FundRow> = { key: 'mode', label: 'Mode', render: (r) => modeLabel(r.mode), value: (r) => r.mode };
  const balanceCol: Column<FundRow> = { key: 'balance', label: 'Current Bal', align: 'right', render: (r) => slash(r.balance) };
  const sr: Column<FundRow> = { key: '__sr', label: 'Sr.', sortable: false, align: 'center', render: (_r, i) => i + 1 };

  let columns: Column<FundRow>[];
  let bulk: React.ReactNode = null;

  if (tab === 'pending') {
    columns = [
      sel.column,
      sr,
      { key: 'attempts', label: 'Attempts', align: 'center' },
      ...userCols,
      modeCol,
      bankCol,
      balanceCol,
      {
        key: 'status',
        label: 'Status',
        render: (r) => (
          <>
            <StatusChip status={r.status} />
            <Issues row={r} />
          </>
        ),
      },
      { key: 'createdAt', label: 'Created', render: (r) => <DateCell iso={r.createdAt} /> },
      {
        key: 'action',
        label: 'Action',
        sortable: false,
        render: (r) => (
          <div className="flex flex-col gap-1.5 items-stretch">
            <Btn sm variant="success" icon="check" disabled={act.busy} onClick={() => act.approve([r])}>
              Approve
            </Btn>
            <Btn sm variant="danger" icon="close" disabled={act.busy} onClick={() => act.reject([r])}>
              Decline
            </Btn>
          </div>
        ),
      },
    ];
    bulk = (
      <Btn variant="success" disabled={act.busy} onClick={() => act.approve(sel.selected)}>
        Approve Selected{sel.selected.length ? ` (${sel.selected.length})` : ''}
      </Btn>
    );
  } else if (tab === 'approved') {
    columns = [
      sel.column,
      sr,
      { key: 'attempts', label: 'Attempts', align: 'center' },
      ...userCols,
      modeCol,
      bankCol,
      {
        key: 'status',
        label: 'Status',
        render: (r) => (
          <div className="whitespace-normal max-w-[220px]">
            <StatusChip status={r.status} />
            {r.status === 'failed' && (r.pgStatus || r.remark) && (
              <div className="text-xs text-[#e53e3e] font-bold mt-1">{r.pgStatus || r.remark}</div>
            )}
            <Issues row={r} />
          </div>
        ),
      },
      { key: 'updatedAt', label: 'Approved At', render: (r) => <DateCell iso={r.updatedAt} /> },
      { key: 'processedBy', label: 'By', render: (r) => dash(r.processedBy) },
      {
        key: 'action',
        label: 'Action',
        sortable: false,
        render: (r) => (
          <div className="flex flex-col gap-1.5 items-stretch">
            <Btn sm variant="success" icon="check" disabled={act.busy} onClick={() => act.complete([r])}>
              Paid
            </Btn>
            {r.status === 'approved' ? (
              <Btn sm variant="warning" disabled={act.busy} onClick={() => act.fail([r])}>
                Failed
              </Btn>
            ) : (
              <Btn sm variant="info" disabled={act.busy} onClick={() => act.retry([r])}>
                Retry
              </Btn>
            )}
            <Btn sm variant="danger" icon="close" disabled={act.busy} onClick={() => act.reject([r])}>
              Decline
            </Btn>
          </div>
        ),
      },
    ];
    bulk = (
      <Btn variant="success" disabled={act.busy} onClick={() => act.complete(sel.selected)}>
        Mark Selected Paid{sel.selected.length ? ` (${sel.selected.length})` : ''}
      </Btn>
    );
  } else if (tab === 'rejected') {
    columns = [
      sr,
      ...userCols,
      modeCol,
      bankCol,
      { key: 'remark', label: 'Remark', render: (r) => <span className="whitespace-normal">{dash(r.remark)}</span> },
      { key: 'processedBy', label: 'Declined By', render: (r) => dash(r.processedBy) },
      { key: 'createdAt', label: 'Requested', render: (r) => <DateCell iso={r.createdAt} /> },
      { key: 'updatedAt', label: 'Declined At', render: (r) => <DateCell iso={r.updatedAt} /> },
    ];
  } else if (tab === 'completed') {
    columns = [
      sr,
      { key: 'attempts', label: 'Attempts', align: 'center' },
      ...userCols,
      modeCol,
      bankCol,
      { key: 'pgRef', label: 'UTR / Ref', render: (r) => dash(r.pgRef) },
      { key: 'processedBy', label: 'Paid By', render: (r) => dash(r.processedBy) },
      { key: 'createdAt', label: 'Requested', render: (r) => <DateCell iso={r.createdAt} /> },
      { key: 'completedAt', label: 'Paid At', render: (r) => <DateCell iso={r.completedAt} /> },
    ];
  } else {
    columns = [
      sel.column,
      sr,
      ...userCols,
      modeCol,
      { key: 'utr', label: 'UTR', render: (r) => dash(r.utr) },
      {
        key: 'proof',
        label: 'Proof',
        sortable: false,
        render: (r) =>
          r.proofUrl ? (
            <a href={r.proofUrl} target="_blank" rel="noreferrer" title="Open payment screenshot">
              <img src={r.proofUrl} alt={`Payment proof for request ${r.id}`} className="proof-thumb" />
            </a>
          ) : (
            <span className="muted">--</span>
          ),
      },
      balanceCol,
      { key: 'createdAt', label: 'Created', render: (r) => <DateCell iso={r.createdAt} /> },
      {
        key: 'action',
        label: 'Action',
        sortable: false,
        render: (r) => (
          <div className="flex flex-col gap-1.5 items-stretch">
            <Btn sm variant="success" icon="check" disabled={act.busy} onClick={() => act.approve([r])}>
              Approve
            </Btn>
            <Btn sm variant="danger" icon="close" disabled={act.busy} onClick={() => act.reject([r])}>
              Decline
            </Btn>
          </div>
        ),
      },
    ];
    bulk = (
      <Btn variant="success" disabled={act.busy} onClick={() => act.approve(sel.selected)}>
        Approve Selected{sel.selected.length ? ` (${sel.selected.length})` : ''}
      </Btn>
    );
  }

  return (
    <>
      {bulk && (
        <div className="flex flex-wrap gap-2 items-center mb-3">
          {bulk}
          {tab === 'pending' && data.invalid > 0 && (
            <Chip tone="bad">
              {data.invalid} request{data.invalid === 1 ? '' : 's'} with payout problems
            </Chip>
          )}
        </div>
      )}
      <DataTable columns={columns} rows={data.rows} rowKey={(r) => r.id} />
      <TotalAmount value={data.totalAmount} />
      {act.dialog}
      {profile !== null && <UserProfileModal userId={profile} onClose={() => setProfile(null)} />}
    </>
  );
}
