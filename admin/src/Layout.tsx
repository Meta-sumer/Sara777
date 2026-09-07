import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './auth';
import { NAV } from './nav';
import { useRefresh } from './refresh';
import type { Stats } from './types';

export function Layout() {
  const { signOut } = useAuth();
  const { nonce, refresh } = useRefresh();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<Pick<Stats, 'autoDeclare' | 'funds'> | null>(null);

  const current = NAV.find((n) => location.pathname.startsWith(`/${n.path}`)) ?? NAV[0];

  // sidebar badge + the auto-results chip; best effort, never blocks the page
  const loadStats = useCallback(async () => {
    try {
      const s = await api<Stats>('/stats');
      setStats({ autoDeclare: s.autoDeclare, funds: s.funds });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats, nonce, location.pathname]);

  // close the drawer whenever the route changes
  useEffect(() => setOpen(false), [location.pathname]);

  const pending = stats ? stats.funds.pendingDeposits + stats.funds.pendingWithdraws : 0;

  return (
    <div className="shell">
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">RAMA</span>
          <span className="brand-num">777</span>
        </div>

        <nav>
          {NAV.map((item) => (
            <NavLink key={item.path} to={`/${item.path}`} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}
              {item.path === 'funds' && pending > 0 && <span className="badge">{pending}</span>}
            </NavLink>
          ))}
        </nav>

        <button className="btn ghost block" onClick={signOut}>
          Logout
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="icon-btn only-mobile" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            ☰
          </button>
          <h1>{current.title}</h1>
          <div className="topbar-right">
            {stats && (
              <span className={`chip ${stats.autoDeclare ? 'ok' : 'warn'}`}>
                Auto results: {stats.autoDeclare ? 'ON' : 'OFF'}
              </span>
            )}
            <button className="btn ghost sm" onClick={refresh}>
              Refresh
            </button>
          </div>
        </header>

        <section className="page">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
