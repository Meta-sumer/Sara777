/* Pieces shared by the wallet pages: the fund-request row shape, the approve /
   decline / paid / failed / retry actions (with their dialogs), row selection,
   payout-details cell, status chips and the bank payout file formats. */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../../api';
import { exportCsv, type Cell } from '../../export';
import { dateOnly, dt, slash, timeOnly, today } from '../../format';
import { Btn, Chip, Field, Modal, useAction, useConfirm, useToast, type Column } from '../../ui';

export interface BankSnapshot {
  holderName: string;
  accountNo: string;
  ifsc: string;
  bankName: string;
  paytm: string;
}

export type FundStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'failed';

/** One deposit / withdraw request as the wallet endpoints return it. */
export interface FundRow {
  id: number;
  userId: number;
  name: string;
  username: string;
  mobile: string;
  type: 'deposit' | 'withdraw';
  amount: number;
  /** bank | paytm for withdraws, UPI for deposits */
  mode: string;
  status: FundStatus;
  attempts: number;
  remark: string | null;
  createdAt: string;
  updatedAt: string | null;
  processedBy: string | null;
  completedAt: string | null;
  pgStatus: string | null;
  pgRef: string | null;
  utr: string | null;
  proofUrl: string | null;
  /** current wallet balance (the request amount is already held out of it) */
  balance: number;
  held: number;
  bank: BankSnapshot | null;
  bankChanged: boolean;
  address: string | null;
  city: string | null;
  isBlocked: boolean;
  isDeleted: boolean;
  valid: boolean;
  issues: string[];
}

export interface FundList {
  rows: FundRow[];
  total: number;
  totalAmount: number;
  valid: number;
  invalid: number;
}

interface BulkResult {
  done: number;
  failed: Array<{ id: number; message: string }>;
  message: string;
}

export type FundAction = 'approve' | 'reject' | 'complete' | 'fail' | 'retry';

/* ------------------------------------------------------------- formatting */

export const STATUS_INFO: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Pending', tone: 'pending' },
  approved: { label: 'Approved', tone: 'approved' },
  failed: { label: 'Failed', tone: 'failed' },
  completed: { label: 'Completed', tone: 'completed' },
  rejected: { label: 'Declined', tone: 'rejected' },
};

export function StatusChip({ status }: { status: string }) {
  const info = STATUS_INFO[status] ?? { label: status, tone: '' };
  return <Chip tone={info.tone}>{info.label}</Chip>;
}

export function modeLabel(mode: string): string {
  if (mode === 'bank') return 'Bank';
  if (mode === 'paytm') return 'Paytm';
  return mode.toUpperCase();
}

/** "+91XXXXXXXXXX" for 10-digit Indian numbers. */
export function phone(mobile: string | null | undefined): string {
  if (!mobile) return '--';
  return /^\d{10}$/.test(mobile) ? `+91${mobile}` : mobile;
}

export const dash = (v: string | null | undefined) => (v && v.trim() ? v : '--');

/** Payout details in one cell: holder / account / IFSC / bank, or the Paytm number. */
export function PayoutCell({ row }: { row: FundRow }) {
  const b = row.bank;
  if (!b) return <span className="muted">--</span>;
  return (
    <div className="whitespace-normal leading-snug min-w-[200px]">
      {row.mode === 'paytm' ? (
        <>
          <div className="font-bold">Paytm {dash(b.paytm)}</div>
          <div className="muted text-xs">{dash(b.holderName)}</div>
        </>
      ) : !b.accountNo && !b.ifsc ? (
        <>
          <div className="font-bold text-[#e53e3e]">No bank account</div>
          {b.paytm && <div className="muted text-xs">Paytm {b.paytm}</div>}
        </>
      ) : (
        <>
          <div className="font-bold">{dash(b.holderName)}</div>
          <div className="text-xs">A/C {dash(b.accountNo)}</div>
          <div className="muted text-xs">
            {dash(b.ifsc)} · {dash(b.bankName)}
          </div>
        </>
      )}
      {row.bankChanged && (
        <div className="mt-1">
          <Chip tone="warn">Details changed after request</Chip>
        </div>
      )}
    </div>
  );
}

/** Timestamp as date over time, to keep wide tables narrow. */
export function DateCell({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="muted">--</span>;
  return (
    <div className="leading-snug">
      <div>{dateOnly(iso)}</div>
      <div className="muted text-xs">{timeOnly(iso)}</div>
    </div>
  );
}

/** Name over username; the name opens the profile when `onProfile` is given. */
export function UserCell({ row, onProfile }: { row: { name: string; username: string; userId: number }; onProfile?: (id: number) => void }) {
  return (
    <div className="leading-snug">
      {onProfile ? (
        <button type="button" className="btn link" title="View profile" onClick={() => onProfile(row.userId)}>
          {row.name}
        </button>
      ) : (
        <div className="font-bold">{row.name}</div>
      )}
      <div className="muted text-xs">{row.username}</div>
    </div>
  );
}

/** Red list of reasons a request cannot be paid as it stands. */
export function Issues({ row }: { row: FundRow }) {
  if (row.valid) return null;
  return <div className="text-xs font-bold text-[#e53e3e] whitespace-normal mt-1">{row.issues.join(', ')}</div>;
}

/** The "Valid Req." / "Invalid Req." legend above report tables. */
export function ValidityLegend({ list }: { list?: FundList }) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="px-2.5 py-1 rounded text-white text-[13px] font-bold bg-[#10c469]">
        Valid Req.{list ? ` (${list.valid})` : ''}
      </span>
      <span className="px-2.5 py-1 rounded text-white text-[13px] font-bold bg-[#ff5c5d]">
        Invalid Req.{list ? ` (${list.invalid})` : ''}
      </span>
    </div>
  );
}

/** Green / red row background for valid / invalid withdraw requests. */
export const validityRow = (r: FundRow) =>
  r.valid ? '[&>td]:!bg-[#effbf4]' : '[&>td]:!bg-[#fff0f0]';

export function TotalAmount({ value, label = 'Total Amount' }: { value: number; label?: string }) {
  return (
    <p className="mt-5 mb-0 text-[22px] font-extrabold text-[#323a46]">
      {label} : {slash(value)}
    </p>
  );
}

/** Small icon-only table button. */
export function IconBtn({
  icon,
  title,
  variant,
  onClick,
  disabled,
  children,
}: {
  icon?: string;
  title: string;
  variant: 'dark' | 'indigo' | 'warning' | 'success' | 'danger' | 'info' | 'primary';
  onClick: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <Btn sm variant={variant} icon={icon} title={title} aria-label={title} onClick={onClick} disabled={disabled} className="icon">
      {children}
    </Btn>
  );
}

/** Columns shared by Export Debit Report and Process Bulk PG Payment. */
export function payoutColumns(): Column<FundRow>[] {
  return [
    {
      key: 'user',
      label: 'User',
      value: (r) => `${r.name} ${r.username}`,
      render: (r) => (
        <div className="leading-snug">
          <div className="font-bold">{r.name}</div>
          <div className="muted text-xs">{r.username}</div>
        </div>
      ),
    },
    { key: 'mobile', label: 'Mobile No.', render: (r) => phone(r.mobile) },
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
    { key: 'balance', label: 'Current Bal', align: 'right', render: (r) => slash(r.balance) },
    { key: 'amount', label: 'Amt', align: 'right', render: (r) => <strong>{slash(r.amount)}</strong> },
    { key: 'createdAt', label: 'Date', render: (r) => <DateCell iso={r.createdAt} /> },
    { key: 'address', label: 'Address', render: (r) => <span className="whitespace-normal">{dash(r.address)}</span> },
    { key: 'city', label: 'City', render: (r) => dash(r.city) },
    {
      key: 'issues',
      label: 'Check',
      value: (r) => (r.valid ? 'Valid' : r.issues.join(', ')),
      render: (r) =>
        r.valid ? (
          <span className="font-bold text-[#0b9c55]">Valid</span>
        ) : (
          <span className="font-bold text-[#e53e3e] whitespace-normal">{r.issues.join(', ')}</span>
        ),
    },
  ];
}

/** A labelled cell holding a button, lined up with the filter fields. */
export function BtnField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-[14.5px] font-bold text-[#323a46]">
      {label}
      <div className="mt-[7px]">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------- selection */

/** Row checkboxes for a DataTable: returns the column and the selected rows. */
export function useSelection<T extends { id: number }>(rows: T[]) {
  const [ids, setIds] = useState<Set<number>>(new Set());

  // forget rows that left the list (approved, declined, filtered away)
  useEffect(() => {
    setIds((s) => {
      const keep = new Set([...s].filter((id) => rows.some((r) => r.id === id)));
      return keep.size === s.size ? s : keep;
    });
  }, [rows]);

  const allOn = rows.length > 0 && rows.every((r) => ids.has(r.id));
  const toggle = useCallback((id: number) => {
    setIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const column: Column<T> = {
    key: '__select',
    label: (
      <input
        type="checkbox"
        aria-label="Select all"
        checked={allOn}
        onChange={() => setIds(allOn ? new Set() : new Set(rows.map((r) => r.id)))}
      />
    ),
    sortable: false,
    align: 'center',
    render: (r) => (
      <input type="checkbox" aria-label={`Select request ${r.id}`} checked={ids.has(r.id)} onChange={() => toggle(r.id)} />
    ),
  };

  const selected = useMemo(() => rows.filter((r) => ids.has(r.id)), [rows, ids]);
  return { column, selected, clear: () => setIds(new Set()) };
}

/* ---------------------------------------------------------------- actions */

const DECLINE_REASONS = [
  'Bank details mismatch',
  'Invalid account details',
  'Duplicate request',
  'Suspicious activity',
  'Cancelled at user request',
];
const FAIL_REASONS = [
  'Beneficiary bank is down',
  'Invalid account / IFSC at bank',
  'Gateway timeout',
  'Payout account has insufficient funds',
];

type Dialog = { kind: 'reject' | 'complete' | 'fail'; rows: FundRow[] } | null;

const sum = (rows: FundRow[]) => rows.reduce((s, r) => s + r.amount, 0);
const who = (r: FundRow) => `${r.name} (${r.username})`;

/**
 * Approve / decline / mark paid / mark failed / retry for one or many requests.
 * Render `dialog` somewhere in the page; `onDone` reloads the list.
 */
export function useRequestActions(onDone: () => void) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, run] = useAction();
  const [dialog, setDialog] = useState<Dialog>(null);

  const post = (action: FundAction, rows: FundRow[], body: Record<string, unknown> = {}) =>
    run(async () => {
      if (rows.length === 1) {
        const res = await api<{ message: string }>(`/wallet/requests/${rows[0].id}/${action}`, {
          method: 'POST',
          body,
        });
        toast(res.message);
      } else {
        const res = await api<BulkResult>('/wallet/requests/bulk', {
          method: 'POST',
          body: { ...body, action, ids: rows.map((r) => r.id) },
        });
        const skipped = res.failed.length ? ` · ${res.failed[0].message}${res.failed.length > 1 ? ' …' : ''}` : '';
        toast(res.message + skipped, res.done === 0);
      }
      setDialog(null);
      onDone();
    });

  const needRows = (rows: FundRow[]) => {
    if (rows.length === 0) toast('Select at least one request', true);
    return rows.length > 0;
  };

  const approve = async (rows: FundRow[], onlyValid = false) => {
    if (!needRows(rows)) return;
    const deposit = rows[0].type === 'deposit';
    const ok = await confirm({
      title: 'Are you sure?',
      message:
        rows.length === 1
          ? `Approve ${deposit ? 'deposit' : 'withdraw'} of ${slash(rows[0].amount)} for ${who(rows[0])}?${deposit ? ' The coins are added to the wallet now.' : ''}`
          : `Approve ${rows.length} requests worth ${slash(sum(rows))}?${onlyValid ? ' Invalid requests are skipped.' : ''}`,
      confirmText: 'Yes, approve',
    });
    if (ok) await post('approve', rows, onlyValid ? { onlyValid: true } : {});
  };

  const retry = async (rows: FundRow[]) => {
    if (!needRows(rows)) return;
    const ok = await confirm({
      message: `Queue ${rows.length === 1 ? `request #${rows[0].id}` : `${rows.length} requests`} for payout again?`,
      confirmText: 'Yes, retry',
    });
    if (ok) await post('retry', rows);
  };

  const complete = async (rows: FundRow[]) => {
    if (!needRows(rows)) return;
    if (rows.length === 1) return setDialog({ kind: 'complete', rows });
    const ok = await confirm({
      message: `Mark ${rows.length} requests worth ${slash(sum(rows))} as paid? Only do this after the bank has paid them.`,
      confirmText: 'Yes, mark paid',
    });
    if (ok) await post('complete', rows);
  };

  const reject = (rows: FundRow[]) => needRows(rows) && setDialog({ kind: 'reject', rows });
  const fail = (rows: FundRow[]) => needRows(rows) && setDialog({ kind: 'fail', rows });

  const node = dialog && (
    <ActionDialog
      dialog={dialog}
      busy={busy}
      onClose={() => setDialog(null)}
      onSubmit={(body) => post(dialog.kind, dialog.rows, body)}
    />
  );

  return { busy, dialog: node, approve, reject, complete, fail, retry };
}

function ActionDialog({
  dialog,
  busy,
  onClose,
  onSubmit,
}: {
  dialog: NonNullable<Dialog>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const { kind, rows } = dialog;
  const [text, setText] = useState('');
  const toast = useToast();
  const one = rows.length === 1 ? rows[0] : null;
  const deposit = rows[0].type === 'deposit';

  const title =
    kind === 'reject' ? (deposit ? 'Decline Deposit' : 'Decline Withdraw Request') : kind === 'complete' ? 'Mark as Paid' : 'Mark Payout Failed';

  const submit = () => {
    const value = text.trim();
    if (kind === 'reject' && !value) return toast('Enter a remark for the user', true);
    if (kind === 'fail' && !value) return toast('Enter the failure reason', true);
    onSubmit(kind === 'reject' ? { remark: value } : kind === 'complete' ? (value ? { ref: value } : {}) : { message: value });
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant={kind === 'complete' ? 'success' : 'danger'} disabled={busy} onClick={submit}>
            {busy ? 'Please wait…' : kind === 'reject' ? 'Decline' : kind === 'complete' ? 'Mark Paid' : 'Mark Failed'}
          </Btn>
        </>
      }
    >
      <div className="form-stack">
        {one ? (
          <table>
            <tbody>
              <tr>
                <th>User</th>
                <td>{who(one)}</td>
              </tr>
              <tr>
                <th>Amount</th>
                <td>
                  <strong>{slash(one.amount)}</strong>
                </td>
              </tr>
              {one.type === 'withdraw' ? (
                <>
                  <tr>
                    <th>Mode</th>
                    <td>{modeLabel(one.mode)}</td>
                  </tr>
                  <tr>
                    <th>Pay to</th>
                    <td>
                      <PayoutCell row={one} />
                    </td>
                  </tr>
                </>
              ) : (
                <tr>
                  <th>UTR</th>
                  <td>{dash(one.utr)}</td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <p className="m-0">
            <strong>{rows.length}</strong> requests, total <strong>{slash(sum(rows))}</strong>
          </p>
        )}

        {kind === 'reject' && (
          <>
            {!deposit && <p className="muted m-0">The held amount goes back to the user's wallet.</p>}
            <Field label="Remark (shown to the user)">
              <input
                list="decline-reasons"
                value={text}
                autoFocus
                maxLength={200}
                placeholder="Reason for declining"
                onChange={(e) => setText(e.target.value)}
              />
              <datalist id="decline-reasons">
                {(deposit ? ['Payment not received', 'UTR not found in bank statement', 'Duplicate UTR'] : DECLINE_REASONS).map(
                  (r) => (
                    <option key={r} value={r} />
                  ),
                )}
              </datalist>
            </Field>
          </>
        )}
        {kind === 'complete' && (
          <Field label="UTR / Reference No. (optional)">
            <input
              value={text}
              autoFocus
              maxLength={60}
              placeholder="Bank UTR or payout reference"
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
        )}
        {kind === 'fail' && (
          <>
            <p className="muted m-0">The request moves to Process Bulk PG Payment, where it can be retried, paid or declined.</p>
            <Field label="Failure reason / PG message">
              <input
                list="fail-reasons"
                value={text}
                autoFocus
                maxLength={200}
                placeholder="Why the payout failed"
                onChange={(e) => setText(e.target.value)}
              />
              <datalist id="fail-reasons">
                {FAIL_REASONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------- payout file formats */

export const REPORT_TYPES = [
  { key: 'kotak', label: 'Kotak Bulk Payout' },
  { key: 'generic', label: 'Generic Bank CSV' },
  { key: 'paytm', label: 'Paytm Payout' },
] as const;
export type ReportType = (typeof REPORT_TYPES)[number]['key'];

/**
 * Download withdraw requests as a bank / Paytm bulk payout file. Kotak and Paytm
 * files only take requests of their own payout mode; returns how many rows went in.
 */
export function exportPayout(type: ReportType, rows: FundRow[], name: string): number {
  const stamp = dateOnly(today()).replace(/\//g, '-');
  if (type === 'kotak') {
    const list = rows.filter((r) => r.mode === 'bank');
    const headers = [
      'Payment Type',
      'Payment Ref No',
      'Payment Date',
      'Beneficiary Name',
      'Beneficiary Account No',
      'IFSC Code',
      'Beneficiary Bank',
      'Amount',
      'Beneficiary Mobile',
      'Beneficiary Address',
      'City',
      'Debit Narration',
      'Credit Narration',
    ];
    const data: Cell[][] = list.map((r) => [
      r.amount <= 500000 ? 'IMPS' : 'NEFT',
      `WD${r.id}`,
      dateOnly(today()),
      r.bank?.holderName ?? '',
      r.bank?.accountNo ?? '',
      r.bank?.ifsc ?? '',
      r.bank?.bankName ?? '',
      r.amount,
      r.mobile,
      r.address ?? '',
      r.city ?? '',
      'Rama777 withdraw payout',
      `Rama777 WD${r.id}`,
    ]);
    exportCsv(`${name}-kotak-${stamp}`, headers, data);
    return list.length;
  }
  if (type === 'paytm') {
    const list = rows.filter((r) => r.mode === 'paytm');
    exportCsv(
      `${name}-paytm-${stamp}`,
      ['Order ID', 'Beneficiary Phone Number', 'Beneficiary Name', 'Amount', 'Comment'],
      list.map((r) => [`WD${r.id}`, r.bank?.paytm ?? '', r.bank?.holderName || r.name, r.amount, `Rama777 withdraw #${r.id}`]),
    );
    return list.length;
  }
  exportCsv(
    `${name}-${stamp}`,
    [
      'Sr No',
      'Request ID',
      'Username',
      'Name',
      'Mobile',
      'Payout Mode',
      'Account Holder',
      'Bank Name',
      'IFSC',
      'Account No',
      'Paytm No',
      'Amount',
      'Requested At',
      'Status',
      'UTR / Ref',
      'Address',
      'City',
    ],
    rows.map((r, i) => [
      i + 1,
      r.id,
      r.username,
      r.name,
      r.mobile,
      modeLabel(r.mode),
      r.bank?.holderName ?? '',
      r.bank?.bankName ?? '',
      r.bank?.ifsc ?? '',
      r.bank?.accountNo ?? '',
      r.bank?.paytm ?? '',
      r.amount,
      dt(r.createdAt),
      STATUS_INFO[r.status]?.label ?? r.status,
      r.pgRef ?? '',
      r.address ?? '',
      r.city ?? '',
    ]),
  );
  return rows.length;
}

/** Toast text after an export, saying what was left out of a mode-specific file. */
export function exportedMessage(type: ReportType, exported: number, total: number): string {
  const left = total - exported;
  if (exported === 0) return `No ${type === 'paytm' ? 'Paytm' : 'bank'} requests to export`;
  return `Exported ${exported} request${exported === 1 ? '' : 's'}${left > 0 ? ` (${left} ${type === 'paytm' ? 'bank' : 'Paytm'} request${left === 1 ? '' : 's'} not in this file)` : ''}`;
}
