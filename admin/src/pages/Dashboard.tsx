import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { amt, dateOnly, dt, fmt, slash, timeOnly } from '../format';
import { useLoad } from '../hooks';
import { useRefresh } from '../refresh';
import { Btn, DataTable, Modal, Resource, StatCard, srColumn, type Column } from '../ui';

interface DashboardData {
  today: string;
  cards: {
    allUsers: number;
    totalBids: number;
    walletAmount: number;
    amountPaid: number;
    loggedInUsers: number;
    zeroBalanceUsers: number;
    todayZeroBalance: number;
    bannedUsers: number;
    totalDeposits: number;
    totalWithdraw: number;
    yesterdayWallet: { amount: number; at: string | null; date: string; source: 'snapshot' | 'computed' };
  };
  registrations: {
    today: number;
    yesterday: number;
    thisWeek: number;
    lastWeek: number;
    thisMonth: number;
    lastMonth: number;
    deleted: number;
    active: number;
  };
  depositLog: Array<{ label: string; amount: number; count: number }>;
  depositTotal: number;
  funds: {
    todayDeposits: number;
    todayWithdraw: number;
    todayNet: number;
    totalDeposits: number;
    totalWithdraw: number;
    grandTotal: number;
  };
}

const BLUE = 'var(--c-primary)';
const DARK = 'var(--c-dark)';
const RED = 'var(--c-danger)';
const INDIGO = 'var(--c-indigo)';

export function Dashboard() {
  const { nonce } = useRefresh();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [registered, setRegistered] = useState<'with' | 'zero' | null>(null);
  const load = useCallback(() => api<DashboardData>('/dashboard'), [nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const state = useLoad(load);

  useEffect(() => {
    document.title = 'Dashboard · Rama777 Admin';
  }, []);

  const openUsers = can('users') ? () => navigate('/users') : undefined;

  return (
    <Resource state={state}>
      {(d) => {
        const c = d.cards;
        const yw = c.yesterdayWallet;
        return (
          <>
            <div className="stats" style={{ marginTop: 4 }}>
              <StatCard label="All Users" value={fmt(c.allUsers)} sub="Till Now" icon="user" color={BLUE} onClick={openUsers} />
              <StatCard label="Total Bids Amount" value={amt(c.totalBids)} sub="Till Now" icon="trend" color={BLUE} />
              <StatCard label="Wallet Amount" value={amt(c.walletAmount)} sub="Till Now" icon="trend" color={DARK} />
              <StatCard label="Amount Paid" value={amt(c.amountPaid)} sub="From App" icon="trend" color={RED} />

              <StatCard label="LoggedIn Users" value={fmt(c.loggedInUsers)} sub="Till Now" icon="ban" color={INDIGO} />
              <StatCard label="Total Zero Balance User" value={fmt(c.zeroBalanceUsers)} sub="Till Now" icon="ban" color={INDIGO} />
              <StatCard label="Today Zero Balance" value={fmt(c.todayZeroBalance)} sub="Today" icon="ban" color={INDIGO} />
              <StatCard label="Banned Users" value={fmt(c.bannedUsers)} sub="Till Now" icon="ban" color={INDIGO} />

              <StatCard label="Total Deposits" value={amt(c.totalDeposits)} sub="Till Now" icon="ban" color={INDIGO} />
              <StatCard label="Total Withdraw" value={amt(c.totalWithdraw)} sub="Till Now" icon="ban" color={INDIGO} />
              <StatCard
                label="Yesterday Wallet Balance"
                value={amt(yw.amount)}
                sub={
                  yw.at ? (
                    <span title="Wallet total recorded at the start of today">{dt(yw.at)}</span>
                  ) : (
                    <span title="No midnight snapshot yet: worked out from today's wallet movements">
                      {dateOnly(yw.date)} 11:59:59 PM
                    </span>
                  )
                }
                icon="trend"
                color={BLUE}
              />
              <div className="stat stat-actions">
                <Btn variant="warning" block onClick={() => setRegistered('with')} style={{ justifyContent: 'center' }}>
                  Today Register With Balance
                </Btn>
                <Btn variant="indigo" block onClick={() => setRegistered('zero')} style={{ justifyContent: 'center' }}>
                  Today Register With Zero Balance
                </Btn>
              </div>
            </div>

            <div className="grid-halves">
              <div className="card">
                <LogTable
                  title="Registered User Log"
                  rows={[
                    { label: 'Today Registered', value: fmt(d.registrations.today), style: { fontWeight: 800, color: 'var(--heading)' } },
                    { label: 'Yesterday Registered', value: fmt(d.registrations.yesterday), style: tone(DARK) },
                    { label: 'This Week', value: fmt(d.registrations.thisWeek) },
                    { label: 'Last Week', value: fmt(d.registrations.lastWeek), style: tone('var(--c-success)') },
                    { label: 'This Month', value: fmt(d.registrations.thisMonth) },
                    { label: 'Last Month', value: fmt(d.registrations.lastMonth), style: tone('var(--c-info)') },
                    { label: 'Deleted Users', value: fmt(d.registrations.deleted) },
                    {
                      label: 'Total Active Users',
                      value: fmt(d.registrations.active),
                      style: tone('var(--c-warning)'),
                      hint: 'Opened the app in the last 24 hours or placed a bid today',
                    },
                  ]}
                />
                <p className="muted" style={{ margin: '10px 2px 0', fontSize: 12.5 }}>
                  Weeks run Monday to Sunday. Deleted users are not counted in the registration rows.
                </p>
              </div>

              <div>
                <div className="card">
                  <LogTable
                    title="Today Deposit Log"
                    rows={[
                      ...d.depositLog.map((r) => ({
                        label: r.label,
                        value: slash(r.amount),
                        hint: `${r.count} ${r.count === 1 ? 'entry' : 'entries'} today`,
                      })),
                      { label: 'GRAND TOTAL', value: slash(d.depositTotal), style: { fontWeight: 800, color: 'var(--heading)' } },
                    ]}
                  />
                </div>
                <div className="card">
                  <LogTable
                    title="Fund Summary"
                    rows={[
                      { label: 'Today Deposits', value: slash(d.funds.todayDeposits) },
                      { label: 'Today Withdraw', value: slash(d.funds.todayWithdraw) },
                      { label: 'Today Net (Deposits − Withdraw)', value: slash(d.funds.todayNet) },
                      { label: 'Total Deposits', value: slash(d.funds.totalDeposits) },
                      { label: 'Total Withdraw', value: slash(d.funds.totalWithdraw) },
                      {
                        label: 'GRAND TOTAL (Deposits − Withdraw)',
                        value: slash(d.funds.grandTotal),
                        style: { fontWeight: 800, color: 'var(--heading)' },
                      },
                    ]}
                  />
                  <p className="muted" style={{ margin: '10px 2px 0', fontSize: 12.5 }}>
                    Deposits include manual adds by admins. Withdraw counts approved and completed requests plus manual
                    debits.
                  </p>
                </div>
              </div>
            </div>

            {registered && <RegisteredToday balance={registered} onClose={() => setRegistered(null)} />}
          </>
        );
      }}
    </Resource>
  );
}

function tone(background: string): CSSProperties {
  return { background, color: '#fff', fontWeight: 700 };
}

/** Two-column log table with a grey title row, as on the reference dashboard. */
function LogTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string; style?: CSSProperties; hint?: string }>;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th colSpan={2} className="center">
              {title}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} title={r.hint}>
              <td className="center wrap" style={{ ...r.style, fontSize: 15 }}>
                {r.label}
              </td>
              <td className="center" style={{ ...r.style, fontSize: 15, width: '32%' }}>
                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RegisteredUser {
  id: number;
  name: string;
  username: string;
  mobile: string;
  createdAt: string;
  amountCredit: number;
  balance: number;
}

/** "User Registered Today" popup behind the two quick-action buttons. */
function RegisteredToday({ balance, onClose }: { balance: 'with' | 'zero'; onClose: () => void }) {
  const load = useCallback(
    () =>
      api<{ users: RegisteredUser[]; totalBalance: number; totalCredit: number }>(
        `/dashboard/registered-today?balance=${balance}`,
      ),
    [balance],
  );
  const state = useLoad(load);

  const columns: Column<RegisteredUser>[] = [
    srColumn('Sno'),
    { key: 'name', label: 'Name' },
    { key: 'username', label: 'Username' },
    { key: 'mobile', label: 'Mobile' },
    { key: 'createdAt', label: 'Registered At', render: (r) => timeOnly(r.createdAt), value: (r) => r.createdAt },
    { key: 'amountCredit', label: 'Amount Credit', align: 'right', render: (r) => amt(r.amountCredit) },
    { key: 'balance', label: 'Balance', align: 'right', render: (r) => amt(r.balance) },
  ];

  return (
    <Modal
      title={`User Registered Today: ${balance === 'with' ? 'With Balance' : 'Zero Balance'}`}
      onClose={onClose}
      size="lg"
    >
      <Resource state={state}>
        {(d) => (
          <DataTable
            columns={columns}
            rows={d.users}
            rowKey={(r) => r.id}
            empty="No user registered today"
            footer={
              <tr>
                <td colSpan={columns.length} className="center">
                  Total Registered Balance : {amt(d.totalBalance)}
                  <span className="muted" style={{ fontWeight: 600, marginLeft: 16 }}>
                    (Amount Credit: {amt(d.totalCredit)})
                  </span>
                </td>
              </tr>
            }
          />
        )}
      </Resource>
    </Modal>
  );
}
