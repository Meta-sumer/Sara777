import { useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../../api';
import { dt } from '../../format';
import { Btn, Card, Chip, Page, TableWrap, useAction } from '../../ui';
import { UserProfileModal } from '../users/UserProfileModal';
import { dash } from './shared';

interface CurrentDetail {
  userId: number;
  username: string;
  name: string;
  mobile: string;
  balance: number;
  holderName: string;
  accountNo: string;
  ifsc: string;
  bankName: string;
  paytm: string;
  savedAt: string | null;
}

interface OldDetail {
  id: number;
  userId: number;
  username: string;
  name: string;
  holderName: string;
  accountNo: string;
  ifsc: string;
  bankName: string;
  paytm: string;
  savedAt: string;
  changedOn: string | null;
}

interface SearchResult {
  q: string;
  current: CurrentDetail[];
  old: OldDetail[];
}

/**
 * Wallet → Search Account: who is paid to an account number (or a username's
 * details), and the payout details they used before. Spots shared accounts.
 */
export function SearchAccount() {
  const [q, setQ] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, run] = useAction();
  const [profile, setProfile] = useState<number | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = q.trim();
    void run(async () => {
      if (!value) throw new Error('Enter an account number or username');
      setResult(await api<SearchResult>(`/wallet/search-account?q=${encodeURIComponent(value)}`));
    });
  };

  const accounts = new Set(result?.current.map((c) => c.accountNo).filter(Boolean));
  const shared = result ? result.current.length > 1 && accounts.size < result.current.length : false;

  return (
    <Page title="Search Account">
      <Card>
        <form className="flex flex-wrap gap-3 items-end" onSubmit={submit}>
          <label className="field grow max-w-[520px]">
            User Account Number / Username
            <input value={q} placeholder="Type account number or username" onChange={(e) => setQ(e.target.value)} autoFocus />
          </label>
          <button className="btn warning" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : 'Get Details'}
          </button>
        </form>
      </Card>

      <Card>
        <h2 className="text-center text-[20px] font-extrabold text-[#323a46] mt-0 mb-4">Current Details</h2>
        {shared && (
          <p className="text-center mt-0 mb-3">
            <Chip tone="bad">{result!.current.length} users are paid to this account</Chip>
          </p>
        )}
        <Table
          head={['Username', 'Name', 'Acc Holder', 'A/C NO', 'Bank', 'IFSC', 'Paytm', 'Saved On', 'Profile']}
          empty={result ? 'No Data Found' : 'Search an account number or username'}
          rows={result?.current.map((c) => (
            <tr key={c.userId}>
              <td>{c.username}</td>
              <td>{c.name}</td>
              <td>{dash(c.holderName)}</td>
              <td>{dash(c.accountNo)}</td>
              <td className="wrap">{dash(c.bankName)}</td>
              <td>{dash(c.ifsc)}</td>
              <td>{dash(c.paytm)}</td>
              <td>{dt(c.savedAt)}</td>
              <td className="center">
                <Btn sm variant="indigo" icon="user" title="Profile" aria-label="Profile" onClick={() => setProfile(c.userId)} />
              </td>
            </tr>
          ))}
        />
      </Card>

      <Card>
        <h2 className="text-center text-[20px] font-extrabold text-[#323a46] mt-0 mb-4">Old Details</h2>
        <Table
          head={['Username', 'Old Acc No', 'Old Bank Name', 'Old IFSC', 'Old Acc Name', 'Old Paytm', 'Changed On']}
          empty={result ? 'No Data Found' : 'Search an account number or username'}
          rows={result?.old.map((o) => (
            <tr key={o.id}>
              <td>{o.username}</td>
              <td>{dash(o.accountNo)}</td>
              <td className="wrap">{dash(o.bankName)}</td>
              <td>{dash(o.ifsc)}</td>
              <td>{dash(o.holderName)}</td>
              <td>{dash(o.paytm)}</td>
              <td>{dt(o.changedOn)}</td>
            </tr>
          ))}
        />
      </Card>

      {profile !== null && <UserProfileModal userId={profile} onClose={() => setProfile(null)} />}
    </Page>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows?: ReactNode[]; empty: string }) {
  return (
    <TableWrap>
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows && rows.length > 0 ? (
            rows
          ) : (
            <tr>
              <td colSpan={head.length} className="empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </TableWrap>
  );
}
