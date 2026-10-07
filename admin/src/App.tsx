import { Fragment } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './Layout';
import { Login } from './Login';
import { ALL_PAGES } from './nav';
import { RefreshProvider } from './refresh';
import { ROUTES } from './routes';

export function App() {
  const { ready, authed, can } = useAuth();

  // wait for the stored token to be checked, so the login screen never flashes
  if (!ready) return null;
  if (!authed) return <Login />;

  // land on the dashboard, or the first page this admin may open
  const home = ALL_PAGES.find((p) => can(p.perm))?.path ?? 'dashboard';

  return (
    <RefreshProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to={`/${home}`} replace />} />
          {Object.entries(ROUTES).map(([path, element]) => (
            // keyed so pages shared by several routes (Game Provider for main / starline / AB) remount
            <Route key={path} path={path} element={<Fragment key={path}>{element}</Fragment>} />
          ))}
          <Route path="*" element={<Navigate to={`/${home}`} replace />} />
        </Route>
      </Routes>
    </RefreshProvider>
  );
}
