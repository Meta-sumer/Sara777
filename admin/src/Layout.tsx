import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './auth';
import { Icon } from './icons';
import { NAV, type NavGroup, pageFor } from './nav';
import { useRefresh } from './refresh';
import { Btn, Card, Empty, Field, Modal, useAction, useToast } from './ui';

interface BadgeStats {
  autoDeclare: boolean;
  funds: { pendingDeposits: number; pendingWithdraws: number };
}

export function Layout() {
  const { me, can, signOut } = useAuth();
  const { nonce, refresh } = useRefresh();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [stats, setStats] = useState<BadgeStats | null>(null);

  const current = pageFor(location.pathname);

  // groups and pages this admin may see
  const groups = useMemo(
    () =>
      NAV.map((g) => ({ ...g, children: g.children?.filter((c) => can(c.perm)) })).filter((g) =>
        g.page ? can(g.page.perm) : (g.children?.length ?? 0) > 0,
      ),
    [can],
  );

  const activeGroup = NAV.find((g) => g.children?.some((c) => c.path === current?.path))?.key;
  const [openGroup, setOpenGroup] = useState<string | undefined>(activeGroup);
  useEffect(() => {
    if (activeGroup) setOpenGroup(activeGroup);
  }, [activeGroup]);

  // sidebar badges; best effort, never blocks the page
  const loadStats = useCallback(async () => {
    try {
      setStats(await api<BadgeStats>('/stats'));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    void loadStats();
  }, [loadStats, nonce, location.pathname]);

  // close the drawer / menu whenever the route changes
  useEffect(() => {
    setDrawer(false);
    setMenu(false);
  }, [location.pathname]);

  const pendingWithdraws = stats?.funds.pendingWithdraws ?? 0;
  const pendingDeposits = stats?.funds.pendingDeposits ?? 0;
  const badgeFor = (path: string) =>
    path === 'wallet/fund-requests' ? pendingWithdraws + pendingDeposits : 0;
  const groupBadge = (g: NavGroup) => (g.key === 'wallet' ? pendingWithdraws + pendingDeposits : 0);

  const allowed = !current || can(current.perm);

  return (
    <div className="shell">
      <aside className={`sidebar${drawer ? ' open' : ''}`}>
        <div className="sidebar-head">
          <div className="sidebar-logo">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Rama777" />
          </div>
          <div className="sidebar-user">{me?.name || me?.username}</div>
          <div className="sidebar-role">{me?.role}</div>
        </div>

        <nav>
          {groups.map((g) =>
            g.page ? (
              <NavLink key={g.key} to={`/${g.page.path}`} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <span className="nav-icon">
                  <Icon name={g.icon} />
                </span>
                <span className="nav-label">{g.label}</span>
              </NavLink>
            ) : (
              <div key={g.key} className={`nav-group${openGroup === g.key ? ' open' : ''}`}>
                <button onClick={() => setOpenGroup((o) => (o === g.key ? undefined : g.key))}>
                  <span className="nav-icon">
                    <Icon name={g.icon} />
                  </span>
                  <span className="nav-label">{g.label}</span>
                  {groupBadge(g) > 0 && <span className="nav-badge">{groupBadge(g)}</span>}
                  <span className="nav-chevron">›</span>
                </button>
                <div className="nav-sub">
                  {g.children!.map((c) => (
                    <NavLink key={c.path} to={`/${c.path}`} end className={({ isActive }) => (isActive ? 'active' : '')}>
                      {c.label}
                      {badgeFor(c.path) > 0 && <span className="nav-badge">{badgeFor(c.path)}</span>}
                    </NavLink>
                  ))}
                </div>
              </div>
            ),
          )}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="icon-btn only-mobile" aria-label="Menu" onClick={() => setDrawer((o) => !o)}>
            ☰
          </button>
          <h1>{current?.title ?? 'Dashboard'}</h1>
          <div className="topbar-right">
            {stats && (
              <span className={`chip ${stats.autoDeclare ? 'ok' : 'warn'}`} title="Settings → auto results">
                Auto results: {stats.autoDeclare ? 'ON' : 'OFF'}
              </span>
            )}
            <Btn sm variant="ghost" onClick={refresh}>
              Refresh
            </Btn>
            <button className="user-menu-btn" onClick={() => setMenu((m) => !m)}>
              <span className="avatar">{(me?.name || me?.username || 'A').slice(0, 1).toUpperCase()}</span>
              <span>{me?.username}</span>
              <span aria-hidden>▾</span>
            </button>
            {menu && (
              <div className="user-menu" onMouseLeave={() => setMenu(false)}>
                <div className="menu-head">
                  <strong>{me?.name || me?.username}</strong>
                  <div className="muted">{me?.role}</div>
                </div>
                {!me?.isSuper && <button onClick={() => setPwOpen(true)}>Change password</button>}
                <button onClick={signOut}>Logout</button>
              </div>
            )}
          </div>
        </header>

        <section className="page">
          {allowed ? (
            <Outlet />
          ) : (
            <Card title={current?.title}>
              <Empty>You do not have permission to open this page.</Empty>
            </Card>
          )}
        </section>
      </main>

      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [busy, run] = useAction();
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  return (
    <Modal title="Change Password" onClose={onClose}>
      <div className="form-stack">
        <Field label="Current password">
          <input type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} />
        </Field>
        <Field label="New password">
          <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} />
        </Field>
      </div>
      <div className="form-actions left">
        <Btn
          variant="primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api('/me/password', { method: 'POST', body: { oldPassword, newPassword } });
              toast('Password changed');
              onClose();
            })
          }
        >
          Submit
        </Btn>
      </div>
    </Modal>
  );
}
