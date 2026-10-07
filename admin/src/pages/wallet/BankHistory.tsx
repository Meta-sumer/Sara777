import { useCallback, useState } from 'react';
import { api } from '../../api';
import { dt } from '../../format';
import { useLoad } from '../../hooks';
import { useRefresh } from '../../refresh';
import { Btn, Card, Chip, DataTable, Modal, Page, Resource, TableWrap, type Column } from '../../ui';
import { dash } from './shared';

interface BankUser {
  userId: number;
  username: string;
  name: string;
  holderName: string;
  accountNo: string;
  ifsc: string;
  bankName: string;
  paytm: string;
  updatedAt: string;
  changes: number;
}

interface BankPage {
  total: number;
  rows: BankUser[];
}

interface Version {
  id: number;
  holderName: string;
  accountNo: string;
  ifsc: string;
  bankName: string;
  paytm: string;
  phonepe: string;
  gpay: string;
  savedAt: string;
  changedOn: string | null;
  current: boolean;
}

/** Wallet → Bank History: current payout details of every user, and each user's change history. */
export function BankHistory() {
  const { nonce } = useRefresh();
  const [paging, setPaging] = useState({ page: 1, pageSize: 25, search: '' });
  const [changedOnly, setChangedOnly] = useState(false);
  const [open, setOpen] = useState<BankUser | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(paging.page), perPage: String(paging.pageSize) });
    if (paging.search.trim()) q.set('q', paging.search.trim());
    if (changedOnly) q.set('changed', '1');
    return api<BankPage>(`/wallet/bank-history?${q}`);
  }, [paging, changedOnly, nonce]);
  const state = useLoad(load);

  const columns: Column<BankUser>[] = [
    { key: 'username', label: 'Username' },
    { key: 'bankName', label: 'Bank', render: (b) => <span className="whitespace-normal block min-w-[180px]">{dash(b.bankName)}</span> },
    { key: 'accountNo', label: 'Account', render: (b) => dash(b.accountNo) },
    { key: 'ifsc', label: 'IFSC', render: (b) => dash(b.ifsc) },
    { key: 'holderName', label: 'Acc Holder', render: (b) => dash(b.holderName) },
    { key: 'paytm', label: 'Paytm', render: (b) => dash(b.paytm) },
    { key: 'updatedAt', label: 'Last Changed', render: (b) => dt(b.updatedAt) },
    {
      key: 'history',
      label: 'History',
      align: 'center',
      render: (b) => (
        <Btn sm variant="indigo" icon="history" onClick={() => setOpen(b)}>
          View Change History{b.changes > 0 ? ` (${b.changes})` : ''}
        </Btn>
      ),
    },
  ];

  return (
    <Page title="Bank History">
      <Resource state={state}>
        {(data) => (
          <Card title="Profile Change History">
            <DataTable
              columns={columns}
              rows={data.rows}
              rowKey={(b) => b.userId}
              pageSize={25}
              toolbar={
                <label className="check">
                  <input
                    type="checkbox"
                    checked={changedOnly}
                    onChange={(e) => {
                      setChangedOnly(e.target.checked);
                      setPaging((p) => ({ ...p, page: 1 }));
                    }}
                  />
                  Only users who changed their details
                </label>
              }
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
      {open && <ChangeHistoryModal user={open} onClose={() => setOpen(null)} />}
    </Page>
  );
}

function ChangeHistoryModal({ user, onClose }: { user: BankUser; onClose: () => void }) {
  const load = useCallback(() => api<{ versions: Version[] }>(`/wallet/bank-history/${user.userId}`), [user.userId]);
  const state = useLoad(load);

  return (
    <Modal title={`Change History · ${user.name} (${user.username})`} onClose={onClose} size="xl">
      <Resource state={state}>
        {({ versions }) => (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th className="center">#</th>
                  <th>Acc Holder</th>
                  <th>A/C NO</th>
                  <th>Bank</th>
                  <th>IFSC</th>
                  <th>Paytm</th>
                  <th>PhonePe / GPay</th>
                  <th>Saved On</th>
                  <th>Changed On</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v, i) => (
                  <tr key={v.id}>
                    <td className="center">{versions.length - i}</td>
                    <td>{dash(v.holderName)}</td>
                    <td>{dash(v.accountNo)}</td>
                    <td className="wrap">{dash(v.bankName)}</td>
                    <td>{dash(v.ifsc)}</td>
                    <td>{dash(v.paytm)}</td>
                    <td>{dash([v.phonepe, v.gpay].filter(Boolean).join(' / '))}</td>
                    <td>{dt(v.savedAt)}</td>
                    <td>{v.current ? <Chip tone="ok">Current</Chip> : dt(v.changedOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Resource>
    </Modal>
  );
}
