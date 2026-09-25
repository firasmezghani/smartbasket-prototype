import { useCallback, useEffect, useState } from 'react';
import { fetchAdminAppConfig, updateMaxBasketQuantity } from '../../api/adminApi.js';
import { AdminError, AdminLoading, formatDt } from './adminUi.jsx';

export function AdminSettingsPage() {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setLoadError(null);
    setSaved(null);
    try {
      const res = await fetchAdminAppConfig();
      const mbq = res?.data?.maxBasketQuantity ?? null;
      setConfig(mbq);
      setDraft(mbq ? String(mbq.value) : '');
      setStatus('ready');
    } catch (err) {
      setLoadError(err?.message || 'Could not load settings.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const min = config?.min ?? 1;
  const max = config?.max ?? 500;

  const parsed = Number(draft);
  const draftValid =
    /^\d+$/.test(draft.trim()) && Number.isInteger(parsed) && parsed >= min && parsed <= max;
  const changed = config ? String(config.value) !== draft.trim() : false;

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaveError(null);
    setSaved(null);
    if (!draftValid) {
      setSaveError(`Enter a whole number between ${min} and ${max}.`);
      return;
    }
    setSaving(true);
    try {
      const res = await updateMaxBasketQuantity(parsed);
      const mbq = res?.data?.maxBasketQuantity ?? null;
      setConfig(mbq);
      setDraft(mbq ? String(mbq.value) : draft);
      setSaved(res?.message || 'Saved.');
    } catch (err) {
      setSaveError(err?.message || 'Could not save the setting.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sb-admin-view">
      <header className="sb-admin-head">
        <h2>Settings</h2>
      </header>

      {status === 'loading' ? <AdminLoading label="Loading settings…" /> : null}
      {status === 'error' ? <AdminError message={loadError} onRetry={load} /> : null}

      {status === 'ready' && config ? (
        <section className="sb-admin-card">
          <h3>Basket limit</h3>
          <p className="sb-admin-hint" style={{ marginBottom: '0.9rem' }}>
            Maximum total units in a basket. Each quantity counts towards this limit.
          </p>

          <form className="sb-admin-form" onSubmit={onSubmit}>
            <label htmlFor="sb-mbq">Total units allowed ({min}–{max})</label>
            <input
              id="sb-mbq"
              className="sb-admin-input"
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              step={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-describedby="sb-mbq-meta"
              disabled={saving}
            />
            <p id="sb-mbq-meta" className="sb-admin-hint">
              Existing items stay in the basket. Customers above the new limit must reduce
              quantities before adding more.
            </p>

            {saveError ? (
              <p className="sb-admin-error" role="alert">
                {saveError}
              </p>
            ) : null}
            {saved ? (
              <p className="sb-admin-success" role="status">
                {saved} New limit: {config.value} units.
              </p>
            ) : null}

            <div>
              <button
                type="submit"
                className="sb-admin-btn"
                disabled={saving || !draftValid || !changed}
              >
                {saving ? 'Saving…' : 'Save limit'}
              </button>
            </div>
          </form>

          <details className="sb-admin-disclosure">
            <summary>Setting details</summary>
            <p className="sb-admin-hint">
              Current source:{' '}
              <strong>{config.source === 'database' ? 'saved setting' : 'built-in default'}</strong>.
              Last updated {formatDt(config.updatedAt)}
              {config.updatedBy ? ` by ${config.updatedBy}` : ''}.
            </p>
          </details>
        </section>
      ) : null}
    </div>
  );
}
