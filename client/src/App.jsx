import { useState } from 'react';
import { login } from './api/authApi.js';
import { STAFF_TOKEN_KEY } from './api/http.js';
import { AdminApp } from './components/admin/AdminApp.jsx';
import './cashier.css';

const STAFF_USER_KEY = 'staffUser';

function readStoredUser() {
  if (typeof localStorage === 'undefined') return null;
  const token = String(localStorage.getItem(STAFF_TOKEN_KEY) ?? '').trim();
  const raw = localStorage.getItem(STAFF_USER_KEY);
  if (!token || !raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STAFF_TOKEN_KEY);
    localStorage.removeItem(STAFF_USER_KEY);
    return null;
  }
}

export function App() {
  const [user, setUser] = useState(readStoredUser);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleLogin(event) {
    event.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setLoading(true);
    try {
      const result = await login(username.trim(), password);
      localStorage.setItem(STAFF_TOKEN_KEY, result.token);
      localStorage.setItem(STAFF_USER_KEY, JSON.stringify(result.user));
      setUser(result.user);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(STAFF_TOKEN_KEY);
    localStorage.removeItem(STAFF_USER_KEY);
    setUser(null);
    setUsername('');
    setPassword('');
    setError(null);
  }

  if (!user) {
    return (
      <main className="cashier-login-shell">
        <section className="cashier-login-card" aria-labelledby="cashier-login-title">
          <div className="cashier-mark" aria-hidden="true">SB</div>
          <p className="cashier-kicker">SmartBasket prototype</p>
          <h1 id="cashier-login-title">Staff sign-in</h1>
          <p className="cashier-login-copy">
            Sign in to validate a customer basket presented from the mobile application.
          </p>

          <form className="cashier-login-form" onSubmit={handleLogin}>
            <label htmlFor="cashier-username">Username</label>
            <input id="cashier-username" type="text" autoComplete="username" value={username}
              onChange={(event) => setUsername(event.target.value)} disabled={loading} autoFocus />
            <label htmlFor="cashier-password">Password</label>
            <input id="cashier-password" type="password" autoComplete="current-password" value={password}
              onChange={(event) => setPassword(event.target.value)} disabled={loading} />
            {error ? <p className="cashier-login-error" role="alert">{error}</p> : null}
            <button type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
          </form>

          <p className="cashier-research-note">
            Research prototype · No real payment is processed on this terminal.
          </p>
        </section>
      </main>
    );
  }

  const displayName = user.realName || user.username || 'Cashier';
  return (
    <div className="cashier-app-shell">
      <header className="cashier-app-header">
        <div className="cashier-brand-lockup">
          <span className="cashier-mark cashier-mark--small" aria-hidden="true">SB</span>
          <div>
            <p className="cashier-kicker">SmartBasket</p>
            <h1>{user.role === 'ADMIN' ? 'Staff console' : 'Cashier validation'}</h1>
          </div>
        </div>
        <div className="cashier-session">
          <span>Signed in as <strong>{displayName}</strong></span>
          <button type="button" onClick={handleLogout}>Sign out</button>
        </div>
      </header>
      <main className="cashier-workspace"><AdminApp user={user} /></main>
    </div>
  );
}
