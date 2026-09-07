import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './Layout';
import { Login } from './Login';
import { RefreshProvider } from './refresh';

import { Dashboard } from './pages/Dashboard';
import { Results } from './pages/Results';
import { Markets } from './pages/Markets';
import { Bids } from './pages/Bids';
import { Users } from './pages/Users';
import { Funds } from './pages/Funds';
import { Rates } from './pages/Rates';
import { Notifications } from './pages/Notifications';
import { Support } from './pages/Support';
import { Ideas } from './pages/Ideas';
import { Settings } from './pages/Settings';
import { Logs } from './pages/Logs';

export function App() {
  const { ready, authed } = useAuth();

  // wait for the stored token to be checked, so the login screen never flashes
  if (!ready) return null;
  if (!authed) return <Login />;

  return (
    <RefreshProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="results" element={<Results />} />
          <Route path="markets" element={<Markets />} />
          <Route path="bids" element={<Bids />} />
          <Route path="users" element={<Users />} />
          <Route path="funds" element={<Funds />} />
          <Route path="rates" element={<Rates />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="support" element={<Support />} />
          <Route path="ideas" element={<Ideas />} />
          <Route path="settings" element={<Settings />} />
          <Route path="logs" element={<Logs />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </RefreshProvider>
  );
}
