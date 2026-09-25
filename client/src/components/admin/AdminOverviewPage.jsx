import { useCallback, useEffect, useState } from 'react';
import { fetchAdminAppConfig } from '../../api/adminApi.js';
import { AdminError, AdminLoading } from './adminUi.jsx';

function StatCard({ value, label }) {
  return (
    <div className="sb-admin-stat">
      <div className="sb-admin-stat-value">{value}</div>
      <div className="sb-admin-stat-label">{label}</div>
    </div>
  );
}

export function AdminOverviewPage({ user, onNavigate }) {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const cfgRes = await fetchAdminAppConfig();
      setConfig(cfgRes?.data?.maxBasketQuantity ?? null);
      setStatus('ready');
    } catch (err) {
      setError(err?.message || 'Could not load the dashboard.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="sb-admin-view">
      <header className="sb-admin-head">
        <h2>Admin overview</h2>
      </header>

      {status === 'loading' ? <AdminLoading label="Loading dashboard…" /> : null}
      {status === 'error' ? <AdminError message={error} onRetry={load} /> : null}

      {status === 'ready' ? (
        <section className="sb-admin-card">
          <h3>Basket capacity</h3>
          {config ? (
            <>
              <div className="sb-admin-statgrid">
                <StatCard value={config.value} label="Max total units per basket" />
                <StatCard value={`${config.min}–${config.max}`} label="Allowed range" />
              </div>
              <button
                type="button"
                className="sb-admin-btn sb-admin-btn--ghost"
                style={{ marginTop: '0.8rem' }}
                onClick={() => onNavigate?.('settings')}
              >
                Open Settings
              </button>
            </>
          ) : (
            <p className="sb-admin-hint">Configuration unavailable.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
