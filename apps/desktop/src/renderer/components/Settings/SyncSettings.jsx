import React, { useState } from 'react';

export default function SyncSettings() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await window.glimpse.auth.login(email, password);
      if (result.success) {
        setIsLoggedIn(true);
        setUser(result.data || { email });
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      setError('Connection error. Is the cloud API running?');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await window.glimpse.auth.signup(email, password);
      if (result.success) {
        setIsLoggedIn(true);
        setUser(result.data || { email });
      } else {
        setError(result.error || 'Signup failed');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await window.glimpse.auth.logout();
    setIsLoggedIn(false);
    setUser(null);
    setEmail('');
    setPassword('');
  };

  const handleSync = async () => {
    try {
      await window.glimpse.sync.trigger();
    } catch {
      setError('Sync failed');
    }
  };

  if (isLoggedIn) {
    return (
      <div className="settings-section">
        <h3 className="settings-section__title">Sync & Account</h3>
        <div className="sync-user">
          <div className="sync-user__avatar">👤</div>
          <div className="sync-user__info">
            <div className="sync-user__email">{user?.email || email}</div>
            <div className="sync-user__status">Signed in</div>
          </div>
        </div>

        <div className="settings-row">
          <button className="btn btn-primary" onClick={handleSync}>Sync Now</button>
          <button className="btn btn-secondary" onClick={handleLogout}>Sign Out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section__title">Sync & Account</h3>
      <p className="settings-section__desc">Sign in to sync your bookmarks, history, and settings across devices.</p>

      <form className="sync-form" onSubmit={handleLogin}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
        />
        {error && <div className="sync-form__error">{error}</div>}
        <div className="sync-form__actions">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <button className="btn btn-secondary" type="button" onClick={handleSignup} disabled={loading}>
            Create Account
          </button>
        </div>
      </form>
    </div>
  );
}
