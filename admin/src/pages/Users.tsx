import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { dt, fmt } from '../format';
import { useLoad } from '../hooks';
import { useRefresh } from '../refresh';
import type { UserDetail, UserRow } from '../types';
import { Card, Modal, Resource, TableWrap, useToast } from '../ui';

interface UsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  totalPages: number;
}

export function Users() {
  const { nonce } = useRefresh();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);

  const openId = params.get('id');

  const load = useCallback(
    () =>
      api<UsersResponse>(
        `/users?page=${page}&perPage=25&search=${encodeURIComponent(term)}`,
      ),
    [page, term, nonce],
  );
  const state = useLoad(load);

  const openUser = (id: number | string) => {
    params.set('id', String(id));
    setParams(params, { replace: true });
  };
  const closeUser = () => {
    params.delete('id');
    setParams(params, { replace: true });
  };

  return (
    <>
      <Card>
        <div className="row">
          <input
            placeholder="Search name or mobile"
            style={{ maxWidth: 280 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setTerm(search.trim());
                setPage(1);
              }
            }}
          />
          <button
            className="btn primary"
            onClick={() => {
              setTerm(search.trim());
              setPage(1);
            }}
          >
            Search
          </button>
          <div className="grow" />
          <span className="muted">{fmt(state.data?.total ?? 0)} users</span>
        </div>
      </Card>

      <Resource state={state}>
        {(data) => (
          <Card>
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Mobile</th>
                    <th className="right">Balance</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    data.users.map((u) => (
                      <tr key={u.id}>
                        <td className="muted">{u.id}</td>
                        <td>
                          <strong>{u.name}</strong>
                        </td>
                        <td>{u.mobile}</td>
                        <td className="right">
                          <strong>{fmt(u.balance)}</strong>
                        </td>
                        <td>
                          <span className={`chip ${u.isActive ? 'ok' : 'bad'}`}>
                            {u.isActive ? 'active' : 'blocked'}
                          </span>
                        </td>
                        <td className="muted">{dt(u.createdAt)}</td>
                        <td>
                          <button className="btn sm primary" onClick={() => openUser(u.id)}>
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableWrap>

            <div className="row" style={{ marginTop: 14 }}>
              <button
                className="btn ghost sm"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="muted">
                Page {data.page} of {data.totalPages}
              </span>
              <button
                className="btn ghost sm"
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </Card>
        )}
      </Resource>

      {openId && (
        <UserModal
          id={openId}
          onClose={closeUser}
          onChanged={() => {
            closeUser();
            void state.reload();
          }}
        />
      )}
    </>
  );
}

function UserModal({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    let alive = true;
    api<UserDetail>(`/users/${id}`)
      .then((d) => alive && setDetail(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return (
      <Modal onClose={onClose}>
        <p className="error">{error}</p>
        <button className="btn ghost block" onClick={onClose}>
          Close
        </button>
      </Modal>
    );
  }
  if (!detail) {
    return (
      <Modal onClose={onClose}>
        <p className="muted">Loading…</p>
      </Modal>
    );
  }

  const u = detail.user;

  const adjust = (sign: 1 | -1) => async () => {
    const value = Number(amount);
    if (!value) {
      toast('Enter an amount', true);
      return;
    }
    try {
      const res = await api<{ balance: number }>(`/users/${id}/balance`, {
        method: 'POST',
        body: { delta: sign * Math.abs(value), note },
      });
      toast(`Balance is now ${fmt(res.balance)}`);
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', true);
    }
  };

  const toggleBlock = async () => {
    try {
      await api(`/users/${id}/block`, { method: 'POST', body: { blocked: u.isActive } });
      toast(u.isActive ? 'User blocked' : 'User unblocked');
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', true);
    }
  };

  const resetPassword = async () => {
    try {
      await api(`/users/${id}/password`, { method: 'POST', body: { password } });
      toast('Password reset');
      setPassword('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', true);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2>
        {u.name}{' '}
        <span className={`chip ${u.isActive ? 'ok' : 'bad'}`}>
          {u.isActive ? 'active' : 'blocked'}
        </span>
      </h2>
      <p className="muted">
        {u.mobile} · joined {dt(u.createdAt)} · balance <strong>{fmt(u.balance)}</strong> coins
      </p>

      <div className="card">
        <h3>Adjust balance</h3>
        <div className="row">
          <input
            type="number"
            placeholder="Amount"
            style={{ maxWidth: 140 }}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            placeholder="Note (optional)"
            className="grow"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="btn success" onClick={adjust(1)}>
            Credit
          </button>
          <button className="btn danger" onClick={adjust(-1)}>
            Debit
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Account</h3>
        <div className="row">
          <button className={`btn ${u.isActive ? 'danger' : 'success'}`} onClick={toggleBlock}>
            {u.isActive ? 'Block user' : 'Unblock user'}
          </button>
          <input
            placeholder="New password"
            style={{ maxWidth: 180 }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn ghost" onClick={resetPassword}>
            Reset password
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Payout details</h3>
        {detail.bank ? (
          <p>
            {detail.bank.holder_name || '--'} · {detail.bank.bank_name || '--'} ·{' '}
            {detail.bank.account_no || '--'} · {detail.bank.ifsc || '--'}
            <br />
            <span className="muted">
              UPI: {detail.bank.paytm || detail.bank.phonepe || detail.bank.gpay || '--'}
            </span>
          </p>
        ) : (
          <p className="muted">Not added</p>
        )}
      </div>

      <div className="card">
        <h3>Recent bids</h3>
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Market</th>
                <th>Game</th>
                <th>Number</th>
                <th className="right">Points</th>
                <th>Status</th>
                <th className="right">Win</th>
              </tr>
            </thead>
            <tbody>
              {detail.bids.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    No bids yet
                  </td>
                </tr>
              ) : (
                detail.bids.map((b) => (
                  <tr key={b.id}>
                    <td>{b.market_name}</td>
                    <td>{b.game_type.replace(/_/g, ' ')}</td>
                    <td>
                      <strong>{b.pick}</strong>
                    </td>
                    <td className="right">{fmt(b.amount)}</td>
                    <td>
                      <span className={`chip ${b.status}`}>{b.status}</span>
                    </td>
                    <td className="right">{b.win_amount ? fmt(b.win_amount) : '--'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableWrap>
      </div>

      <div className="card">
        <h3>Recent transactions</h3>
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Particulars</th>
                <th className="right">Amount</th>
                <th className="right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {detail.transactions.map((t) => (
                <tr key={t.id}>
                  <td className="muted">{dt(t.created_at)}</td>
                  <td>{t.particulars}</td>
                  <td
                    className="right"
                    style={{ color: t.amount >= 0 ? 'var(--success)' : 'var(--danger)' }}
                  >
                    {t.amount >= 0 ? '+' : ''}
                    {fmt(t.amount)}
                  </td>
                  <td className="right">{fmt(t.balance_after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>

      <button className="btn ghost block" onClick={onClose}>
        Close
      </button>
    </Modal>
  );
}
