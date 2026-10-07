import { useState, type FormEvent } from 'react';
import { useAuth } from './auth';

export function Login() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={onSubmit}>
        <img className="login-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="Rama777" />
        <p className="muted center">Admin panel — staff and admin login</p>

        <label>
          Username
          <input
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Login'}
        </button>
        <p className="error">{error}</p>
      </form>
    </div>
  );
}
