import { useCallback, useState } from 'react';
import { api } from '../../api';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import { Btn, Card, DataTable, Field, Page, Resource, type Column } from '../../ui';
import {
  type FundList,
  type FundRow,
  DateCell,
  StatusChip,
  TotalAmount,
  ValidityLegend,
  payoutColumns,
  useRequestActions,
  useSelection,
  validityRow,
} from './shared';

type Status = 'failed' | 'approved' | 'all';

/**
 * Wallet → Process Bulk PG Payment: payouts that failed at the bank / gateway
 * (and, on request, approved ones still waiting) to retry, mark paid or decline.
 */
export function BulkPgPayment() {
  const { nonce } = useRefresh();
  const [mode, setMode] = useState('');
  const [status, setStatus] = useState<Status>('failed');

  const load = useCallback(() => api<FundList>(`/wallet/bulk-pg?status=${status}&mode=${mode}`), [status, mode, nonce]);
  const state = useLoad(load);

  return (
    <Page title="Process Bulk PG Payment">
      <Card>
        <p className="muted mt-0 mb-4">
          Withdraw payouts that ran into a problem at the bank or payment gateway show here. Retry sends them back to the
          payout queue; Paid closes them; Decline refunds the held amount to the user.
        </p>
        <div className="filters max-w-[640px]">
          <Field label="Select Mode">
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="">All Modes</option>
              <option value="bank">Bank</option>
              <option value="paytm">Paytm</option>
            </select>
          </Field>
          <Field label="Show">
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="failed">Failed payouts</option>
              <option value="approved">Approved, waiting for payout</option>
              <option value="all">Both</option>
            </select>
          </Field>
        </div>
      </Card>
      <Resource state={state}>{(data) => <PgTable data={data} reload={state.reload} />}</Resource>
    </Page>
  );
}

function PgTable({ data, reload }: { data: FundList; reload: () => Promise<void> }) {
  const sel = useSelection(data.rows);
  const act = useRequestActions(() => void reload());
  const failedSel = sel.selected.filter((r) => r.status === 'failed');

  const columns: Column<FundRow>[] = [
    sel.column,
    {
      key: 'action',
      label: 'Action',
      sortable: false,
      render: (r) => (
        <div className="flex gap-1.5">
          {r.status === 'failed' && (
            <Btn sm variant="info" disabled={act.busy} onClick={() => act.retry([r])}>
              Retry
            </Btn>
          )}
          <Btn sm variant="success" icon="check" disabled={act.busy} onClick={() => act.complete([r])}>
            Paid
          </Btn>
          <Btn sm variant="danger" icon="close" disabled={act.busy} onClick={() => act.reject([r])}>
            Decline
          </Btn>
        </div>
      ),
    },
    { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} /> },
    { key: 'attempts', label: 'Attempts', align: 'center' },
    {
      key: 'pgStatus',
      label: 'PG Status / Message',
      render: (r) => <span className="whitespace-normal block max-w-[240px]">{r.pgStatus || r.remark || '--'}</span>,
    },
    { key: 'updatedAt', label: 'Last Attempt', render: (r) => <DateCell iso={r.updatedAt} /> },
    ...payoutColumns(),
  ];

  return (
    <Card>
      <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
        <div className="flex flex-wrap gap-2">
          <Btn variant="dark" className="pill" disabled={act.busy} onClick={() => act.retry(failedSel)}>
            Retry Selected{failedSel.length ? ` (${failedSel.length})` : ''}
          </Btn>
          <Btn variant="success" className="pill" disabled={act.busy} onClick={() => act.complete(sel.selected)}>
            Mark Selected Paid{sel.selected.length ? ` (${sel.selected.length})` : ''}
          </Btn>
          <Btn variant="danger" className="pill" disabled={act.busy} onClick={() => act.reject(sel.selected)}>
            Decline &amp; Refund Selected
          </Btn>
        </div>
        <ValidityLegend list={data} />
      </div>
      <DataTable columns={columns} rows={data.rows} rowKey={(r) => r.id} rowClassName={validityRow} pageSize={50} pageSizes={[25, 50, 100, 500]} />
      <TotalAmount value={data.totalAmount} />
      {act.dialog}
    </Card>
  );
}
