import { useCallback, useState } from 'react';
import { api } from '../api';
import { dt, fmt } from '../format';
import { useLoad } from '../hooks';
import { useRefresh } from '../refresh';
import type { FundRequestRow } from '../types';
import { Card, Modal, Resource, TableWrap, useToast } from '../ui';

const TABS = ['pending', 'approved', 'rejected'] as const;

export function Funds() {
  const { nonce } = useRefresh();
  const toast = useToast();
  const [status, setStatus] = useState<(typeof TABS)[number]>('pending');
  const [proof, setProof] = useState<string | null>(null);

  const load = useCallback(
    () => api<{ requests: FundRequestRow[] }>(`/fund-requests?status=${status}`),
    [status, nonce],
  );
  const state = useLoad(load);

  const decide = (id: number, action: 'approve' | 'reject') => async () => {
    const remark = action === 'reject' ? (prompt('Reason (optional)') ?? '') : '';
    try {
      await api(`/fund-requests/${id}`, { method: 'POST', body: { action, remark } });
      toast(`Request ${action}d`);
      await state.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', true);
    }
  };

  return (
    <>
      <Card>
        <div className="row">
          {TABS.map((s) => (
            <button
              key={s}
              className={`btn sm ${status === s ? 'primary' : 'ghost'}`}
              onClick={() => setStatus(s)}
            >
              {s}
            </button>
          ))}
          <div className="grow" />
          <span className="muted">{state.data?.requests.length ?? 0} requests</span>
        </div>
      </Card>

      <Resource state={state}>
        {({ requests }) => (
          <Card>
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>User</th>
                    <th>Type</th>
                    <th className="right">Amount</th>
                    <th className="right">Balance</th>
                    <th>UTR / Ref</th>
                    <th>Proof</th>
                    <th>Requested</th>
                    <th>Remark</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="empty">
                        Nothing here
                      </td>
                    </tr>
                  ) : (
                    requests.map((r) => (
                      <tr key={r.id}>
                        <td className="muted">{r.id}</td>
                        <td>
                          <strong>{r.user_name}</strong>
                          <br />
                          <span className="muted">{r.user_mobile}</span>
                        </td>
                        <td>
                          <span className={`chip ${r.type === 'deposit' ? 'ok' : 'warn'}`}>
                            {r.type}
                          </span>
                        </td>
                        <td className="right">
                          <strong>{fmt(r.amount)}</strong>
                        </td>
                        <td className="right">{fmt(r.user_balance)}</td>
                        <td>{r.utr ? <code>{r.utr}</code> : <span className="muted">—</span>}</td>
                        <td>
                          {r.proof_url ? (
                            <img
                              className="proof-thumb"
                              src={r.proof_url}
                              alt="payment proof"
                              onClick={() => setProof(r.proof_url!)}
                            />
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="muted">{dt(r.created_at)}</td>
                        <td className="wrap">{r.remark || ''}</td>
                        <td className="row">
                          {r.status === 'pending' ? (
                            <>
                              <button className="btn sm success" onClick={decide(r.id, 'approve')}>
                                Approve
                              </button>
                              <button className="btn sm danger" onClick={decide(r.id, 'reject')}>
                                Reject
                              </button>
                            </>
                          ) : (
                            <span className={`chip ${r.status}`}>{r.status}</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}
      </Resource>

      {proof && (
        <Modal title="Payment proof" onClose={() => setProof(null)}>
          <img src={proof} style={{ width: '100%', borderRadius: 10 }} alt="payment proof" />
          <button
            className="btn ghost block"
            style={{ marginTop: 14 }}
            onClick={() => setProof(null)}
          >
            Close
          </button>
        </Modal>
      )}
    </>
  );
}
