import { useCallback, useState } from 'react';
import { api } from '../../api';
import { dt, slash } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import {
  AmountBadge,
  Card,
  Chip,
  DataTable,
  Field,
  Modal,
  Page,
  Resource,
  useAction,
  useToast,
  type Column,
} from '../../ui';
import { UserProfileModal } from '../users/UserProfileModal';
import { IconBtn, STATUS_INFO, dash, phone } from './shared';

interface WalletUser {
  id: number;
  name: string;
  username: string;
  mobile: string;
  balance: number;
  isBlocked: boolean;
  lastUpdated: string | null;
}

interface WalletPage {
  page: number;
  perPage: number;
  total: number;
  totalBalance: number;
  rows: WalletUser[];
}

type Ledger = 'all' | 'debit' | 'pg';
type Popup = { kind: 'ledger'; user: WalletUser; filter: Ledger } | { kind: 'edit' | 'profile'; user: WalletUser } | null;

/** Wallet → View Wallet: every wallet by balance, with ledgers and manual credit / debit. */
export function ViewWallet() {
  const { nonce } = useRefresh();
  const [paging, setPaging] = useState({ page: 1, pageSize: 50, search: '' });
  const [popup, setPopup] = useState<Popup>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(paging.page), perPage: String(paging.pageSize) });
    if (paging.search.trim()) q.set('q', paging.search.trim());
    return api<WalletPage>(`/wallet/users?${q}`);
  }, [paging, nonce]);
  const state = useLoad(load);

  const columns: Column<WalletUser>[] = [
    { key: '__sr', label: 'Sr. No', align: 'center', render: (_r, i) => i + 1 },
    { key: 'username', label: 'User Name', align: 'center' },
    {
      key: 'name',
      label: 'Fullname',
      align: 'center',
      render: (u) => (
        <>
          {u.name}
          {u.isBlocked && (
            <span className="ml-2">
              <Chip tone="bad">Blocked</Chip>
            </span>
          )}
        </>
      ),
    },
    { key: 'mobile', label: 'Mobile', align: 'center', render: (u) => phone(u.mobile) },
    { key: 'balance', label: 'Balance', align: 'center', render: (u) => <AmountBadge value={u.balance} /> },
    { key: 'lastUpdated', label: 'Last Updated', align: 'center', render: (u) => dt(u.lastUpdated) },
    {
      key: 'cd',
      label: 'C/D History',
      align: 'center',
      render: (u) => (
        <div className="flex gap-1.5 justify-center">
          <IconBtn icon="history" variant="dark" title="Debit history" onClick={() => setPopup({ kind: 'ledger', user: u, filter: 'debit' })} />
          <IconBtn variant="dark" title="PG credit history" onClick={() => setPopup({ kind: 'ledger', user: u, filter: 'pg' })}>
            <span className="font-serif font-bold text-[12px] leading-[14px]">PG</span>
          </IconBtn>
        </div>
      ),
    },
    {
      key: 'edit',
      label: 'Edit',
      align: 'center',
      render: (u) => <IconBtn icon="edit" variant="indigo" title="Update wallet balance" onClick={() => setPopup({ kind: 'edit', user: u })} />,
    },
    {
      key: 'history',
      label: 'History',
      align: 'center',
      render: (u) => (
        <IconBtn icon="history" variant="warning" title="Transaction history" onClick={() => setPopup({ kind: 'ledger', user: u, filter: 'all' })} />
      ),
    },
    {
      key: 'profile',
      label: 'Profile',
      align: 'center',
      render: (u) => <IconBtn icon="user" variant="indigo" title="Profile" onClick={() => setPopup({ kind: 'profile', user: u })} />,
    },
  ];

  return (
    <Page title="View Wallet">
      <Resource state={state}>
        {(data) => (
          <Card
            title="View Wallet"
            actions={
              <span className="text-[15px] font-bold text-[#323a46]">
                Total Wallet Balance : <AmountBadge value={data.totalBalance} />
              </span>
            }
          >
            <DataTable
              columns={columns}
              rows={data.rows}
              rowKey={(u) => u.id}
              pageSize={50}
              server={{
                total: data.total,
                page: paging.page,
                pageSize: paging.pageSize,
                search: paging.search,
                onChange: (next) => setPaging(next),
              }}
            />
          </Card>
        )}
      </Resource>

      {popup?.kind === 'ledger' && (
        <LedgerModal user={popup.user} filter={popup.filter} onClose={() => setPopup(null)} />
      )}
      {popup?.kind === 'edit' && (
        <UpdateWalletModal
          user={popup.user}
          onClose={() => setPopup(null)}
          onSaved={() => {
            setPopup(null);
            void state.reload();
          }}
        />
      )}
      {popup?.kind === 'profile' && <UserProfileModal userId={popup.user.id} onClose={() => setPopup(null)} />}
    </Page>
  );
}

/* --------------------------------------------------- Transaction History */

interface TxnRow {
  id: number;
  type: string;
  previous: number;
  amount: number;
  signed: number;
  current: number;
  description: string;
  createdAt: string;
  status: string;
  addedBy: string;
  mode: string | null;
  ref: string | null;
  request: { id: number; status: string; processedBy: string | null; payoutRef: string | null } | null;
}

interface TxnPage {
  user: { id: number; name: string; username: string; balance: number };
  total: number;
  totalCredit: number;
  totalDebit: number;
  rows: TxnRow[];
}

const LEDGER_TITLE: Record<Ledger, string> = {
  all: 'Transaction History',
  debit: 'Debit History',
  pg: 'PG Credit History',
};

function LedgerModal({ user, filter, onClose }: { user: WalletUser; filter: Ledger; onClose: () => void }) {
  const [paging, setPaging] = useState({ page: 1, pageSize: 50, search: '' });

  const load = useCallback(() => {
    const q = new URLSearchParams({ filter, page: String(paging.page), perPage: String(paging.pageSize) });
    if (paging.search.trim()) q.set('q', paging.search.trim());
    return api<TxnPage>(`/wallet/users/${user.id}/transactions?${q}`);
  }, [user.id, filter, paging]);
  const state = useLoad(load);

  const columns: Column<TxnRow>[] = [
    { key: '__sno', label: 'sno', align: 'center', render: (_r, i) => i + 1 },
    { key: 'previous', label: 'Previous Amount', align: 'right', render: (t) => slash(t.previous) },
    {
      key: 'amount',
      label: 'Transaction Amount',
      align: 'right',
      render: (t) => <span className={t.signed < 0 ? 'loss' : 'profit'}>{slash(t.amount)}</span>,
    },
    { key: 'current', label: 'Current Amount', align: 'right', render: (t) => slash(t.current) },
    { key: 'description', label: 'Description', render: (t) => <span className="whitespace-normal block min-w-[260px]">{t.description}</span> },
    { key: 'createdAt', label: 'Transaction Date', render: (t) => dt(t.createdAt) },
    { key: 'status', label: 'Transaction Status', render: (t) => <Chip tone="success">{t.status}</Chip> },
    { key: 'addedBy', label: 'Added By' },
  ];
  if (filter === 'debit') {
    columns.push({
      key: 'request',
      label: 'Withdraw Request',
      render: (t) =>
        t.request ? (
          <span className="whitespace-normal">
            #{t.request.id} <Chip tone={STATUS_INFO[t.request.status]?.tone}>{STATUS_INFO[t.request.status]?.label ?? t.request.status}</Chip>
            {t.request.processedBy && <span className="muted text-xs"> by {t.request.processedBy}</span>}
            {t.request.payoutRef && <div className="muted text-xs">Ref {t.request.payoutRef}</div>}
          </span>
        ) : (
          <span className="muted">Manual debit</span>
        ),
    });
  }
  if (filter === 'pg') {
    columns.push(
      { key: 'mode', label: 'Gateway / Mode', render: (t) => dash(t.mode) },
      { key: 'ref', label: 'Gateway Ref / UTR', render: (t) => dash(t.ref) },
    );
  }

  return (
    <Modal title={`${LEDGER_TITLE[filter]} · ${user.name} (${user.username})`} onClose={onClose} size="xl">
      <Resource state={state}>
        {(data) => (
          <>
            <div className="flex flex-wrap gap-4 mb-3 text-[14px]">
              <span>
                Balance <AmountBadge value={data.user.balance} />
              </span>
              {filter !== 'debit' && (
                <span>
                  Credits <strong className="profit">{slash(data.totalCredit)}</strong>
                </span>
              )}
              {filter !== 'pg' && (
                <span>
                  Debits <strong className="loss">{slash(data.totalDebit)}</strong>
                </span>
              )}
            </div>
            <DataTable
              columns={columns}
              rows={data.rows}
              rowKey={(t) => t.id}
              pageSize={50}
              server={{
                total: data.total,
                page: paging.page,
                pageSize: paging.pageSize,
                search: paging.search,
                onChange: (next) => setPaging(next),
              }}
            />
          </>
        )}
      </Resource>
    </Modal>
  );
}

/* ------------------------------------------------- Update Wallet Balance */

const PARTICULARS = ['Cash', 'UPI', 'Bank', 'Bonus', 'Other'];

function UpdateWalletModal({ user, onClose, onSaved }: { user: WalletUser; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [busy, run] = useAction();
  const [form, setForm] = useState({ type: 'credit', amount: '', particular: 'Cash', comments: '' });

  const submit = () =>
    run(async () => {
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter an amount greater than 0');
      if (form.type === 'debit' && amount > user.balance) throw new Error(`The balance is only ${slash(user.balance)}`);
      const res = await api<{ message: string; balance: number }>(`/wallet/users/${user.id}/adjust`, {
        method: 'POST',
        body: { ...form, amount },
      });
      toast(`${res.message}. New balance ${slash(res.balance)}`);
      onSaved();
    });

  return (
    <Modal title="Update Wallet Balance" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="m-0">
          {user.name} ({user.username}) · Balance <AmountBadge value={user.balance} />
        </p>
        <Field label="Type">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="credit">Credit</option>
            <option value="debit">Debit</option>
          </select>
        </Field>
        <Field label="Amount">
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            autoFocus
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </Field>
        <Field label="Particular">
          <select value={form.particular} onChange={(e) => setForm({ ...form, particular: e.target.value })}>
            {PARTICULARS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Comments">
          <input maxLength={200} value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} />
        </Field>
        <div>
          <button className="btn dark" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : 'Submit'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
