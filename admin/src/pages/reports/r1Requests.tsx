/* Shared by Fund Report 2 and UPI Fund Report: deposit / withdraw request rows
   and the per-status totals the server returns with them. */
import { amt, fmt, slash } from '../../format';
import { StatusChip } from './r1Shared';

export interface RequestRow {
  id: number;
  userId: number;
  username: string;
  name: string;
  mobile: string;
  type: 'deposit' | 'withdraw';
  amount: number;
  mode: string | null;
  utr: string | null;
  pgRef: string | null;
  proofUrl: string | null;
  status: string;
  remark: string | null;
  processedBy: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface StatusTotal {
  status: string;
  deposits: number;
  depositAmount: number;
  withdraws: number;
  withdrawAmount: number;
}

export interface RequestsResponse {
  from: string;
  to: string;
  page: number;
  perPage: number;
  total: number;
  totals: {
    count: number;
    amount: number;
    depositAmount: number;
    withdrawAmount: number;
    byStatus: StatusTotal[];
    approvedAmount?: number;
  };
  rows: RequestRow[];
}

export const REQUEST_STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'failed', label: 'Failed' },
];

const MODE_LABEL: Record<string, string> = { upi: 'UPI', bank: 'Bank', paytm: 'Paytm', ip: 'IP', pg: 'PG' };

export function modeLabel(mode: string | null | undefined) {
  if (!mode) return '--';
  return MODE_LABEL[mode.toLowerCase()] ?? mode;
}

export const typeLabel = (t: string) => (t === 'withdraw' ? 'Withdraw' : 'Deposit');

/** Status chip with the rejection / failure reason under it. */
export function StatusCell({ row }: { row: RequestRow }) {
  return (
    <div>
      <StatusChip status={row.status} />
      {row.remark && (
        <div className="muted" style={{ fontSize: 12, marginTop: 3, whiteSpace: 'normal', minWidth: 150, maxWidth: 220 }}>
          {row.remark}
        </div>
      )}
    </div>
  );
}

/**
 * Status-wise count and amount table. `kinds` picks the deposit and/or withdraw
 * columns; statuses with nothing in any shown column are skipped.
 */
export function StatusTotals({
  rows,
  kinds,
}: {
  rows: StatusTotal[];
  kinds: Array<'deposit' | 'withdraw'>;
}) {
  const showDep = kinds.includes('deposit');
  const showWd = kinds.includes('withdraw');
  const visible = rows.filter((r) => (showDep && r.deposits) || (showWd && r.withdraws));
  const sum = (k: keyof Omit<StatusTotal, 'status'>) => rows.reduce((s, r) => s + r[k], 0);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            {showDep && <th className="center">Deposit Requests</th>}
            {showDep && <th className="center">Deposit Amount</th>}
            {showWd && <th className="center">Withdraw Requests</th>}
            {showWd && <th className="center">Withdraw Amount</th>}
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={1 + (showDep ? 2 : 0) + (showWd ? 2 : 0)} className="empty">
                No Records Found
              </td>
            </tr>
          ) : (
            visible.map((r) => (
              <tr key={r.status}>
                <td>
                  <StatusChip status={r.status} />
                </td>
                {showDep && <td className="center">{fmt(r.deposits)}</td>}
                {showDep && <td className="center">{amt(r.depositAmount)}</td>}
                {showWd && <td className="center">{fmt(r.withdraws)}</td>}
                {showWd && <td className="center">{amt(r.withdrawAmount)}</td>}
              </tr>
            ))
          )}
        </tbody>
        {visible.length > 0 && (
          <tfoot>
            <tr>
              <td>Total</td>
              {showDep && <td className="center">{fmt(sum('deposits'))}</td>}
              {showDep && <td className="center">{slash(sum('depositAmount'))}</td>}
              {showWd && <td className="center">{fmt(sum('withdraws'))}</td>}
              {showWd && <td className="center">{slash(sum('withdrawAmount'))}</td>}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

