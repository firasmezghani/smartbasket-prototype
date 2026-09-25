// Shared helpers and loading/error views for the staff console.

export function formatDt(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return '—';
  }
}


export function AdminLoading({ label = 'Loading…' }) {
  return (
    <div className="sb-admin-state" role="status" aria-live="polite">
      <div className="sb-admin-spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function AdminError({ message, onRetry }) {
  return (
    <div className="sb-admin-error" role="alert">
      <p style={{ margin: 0 }}>{message || 'Something went wrong.'}</p>
      {onRetry ? (
        <button
          type="button"
          className="sb-admin-btn sb-admin-btn--ghost"
          style={{ marginTop: '0.6rem' }}
          onClick={onRetry}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
