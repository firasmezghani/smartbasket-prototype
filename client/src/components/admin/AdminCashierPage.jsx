import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import {
  fetchCashierBasketByToken,
  rejectCashierBasket,
  validateCashierBasket,
} from '../../api/adminCashierApi.js';
import { normalizeCashierToken } from '../../lib/cashierToken.js';
import { createCashierScanGate } from '../../lib/cashierScanController.js';
import { simulatedWeightPanelView } from '../../lib/simulatedBasketWeight.js';
import {
  cameraNoteAfterLookup,
  canDecideBasket,
  canLookupBasket,
  isTerminalCashierStatus,
  lineAmount,
  nextCustomerLocalState,
} from '../../lib/cashierWorkflow.js';
import { formatDt } from './adminUi.jsx';

function formatMoney(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(3)} TND`;
}

// QR camera states: idle, starting, scanning, denied, unsupported, error.
// Manual entry works in every state.
const CAMERA_IDLE = 'idle';

function describeCameraError(err) {
  const name = err && typeof err === 'object' ? err.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return { state: 'denied', message: 'Camera permission was blocked. Allow camera access for this site, or paste the basket code below.' };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return { state: 'unsupported', message: 'No camera was found on this device. Paste the basket code below.' };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return { state: 'error', message: 'The camera is already in use by another application. Close it and try again, or paste the basket code.' };
  }
  return { state: 'error', message: 'The camera could not be started. Paste the basket code below.' };
}

function recordedOutcomeLabel(status) {
  if (status === 'validated') return 'Basket approved.';
  if (status === 'rejected') return 'Basket not approved.';
  if (status === 'expired') return 'This basket code has expired.';
  if (status === 'cancelled') return 'This basket code was cancelled.';
  return null;
}

export function AdminCashierPage({ user }) {
  const [tokenInput, setTokenInput] = useState('');
  const [activeToken, setActiveToken] = useState('');
  const [basket, setBasket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const [cameraState, setCameraState] = useState(CAMERA_IDLE);
  const [cameraNote, setCameraNote] = useState(null);

  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const lookupInFlightRef = useRef(false);
  const decideInFlightRef = useRef(false);
  // One scan gate for the page, so a detected QR code triggers a single lookup.
  const scanGateRef = useRef(null);
  if (scanGateRef.current === null) scanGateRef.current = createCashierScanGate();

  const typedToken = tokenInput.trim() ? normalizeCashierToken(tokenInput) : '';
  const lookupToken = activeToken || typedToken;

  // Fully stop the camera: scan loop, zxing controls, and every media track.
  const stopCamera = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      // already stopped
    }
    controlsRef.current = null;
    const video = videoRef.current;
    const stream = video && video.srcObject;
    if (stream && typeof stream.getTracks === 'function') {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
    }
    if (video) video.srcObject = null;
  }, []);

  const onLookup = useCallback(
    async (tokenArg, options = {}) => {
      const token =
        typeof tokenArg === 'string' && tokenArg.trim()
          ? normalizeCashierToken(tokenArg)
          : typedToken;
      if (!token) {
        setError('Scan the customer QR, or paste the basket code from the phone.');
        return;
      }
      if (lookupInFlightRef.current || decideInFlightRef.current) return;
      lookupInFlightRef.current = true;
      setLoading(true);
      setError(null);
      if (!options.refresh) {
        setMessage(null);
        setBasket(null);
        setActiveToken('');
      }
      try {
        const res = await fetchCashierBasketByToken(token);
        setBasket(res.data ?? null);
        setActiveToken(token);
      } catch (e) {
        setError(e?.message || 'Lookup failed.');
        if (!options.refresh) {
          setBasket(null);
          setActiveToken('');
        }
      } finally {
        lookupInFlightRef.current = false;
        setLoading(false);
        setCameraNote(cameraNoteAfterLookup());
      }
    },
    [typedToken],
  );

  const startCamera = useCallback(async () => {
    setError(null);
    setCameraNote(null);
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setCameraState('unsupported');
      setCameraNote('This browser cannot open a camera. Paste the basket code below.');
      return;
    }
    scanGateRef.current.clear();
    setCameraState('starting');
    try {
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        videoRef.current,
        (result) => {
          if (!result) return; // Frames without a QR code arrive as an error, which is ignored.
          const { accepted, token } = scanGateRef.current.accept(result.getText(), Date.now());
          if (!accepted || !token) return;
          // QR code found: stop the camera first, then fill the field and look it up once.
          stopCamera();
          setCameraState(CAMERA_IDLE);
          setCameraNote('Looking up basket…');
          setTokenInput(token);
          void onLookup(token);
        },
      );
      controlsRef.current = controls;
      setCameraState('scanning');
    } catch (e) {
      stopCamera();
      const { state, message: note } = describeCameraError(e);
      setCameraState(state);
      setCameraNote(note);
    }
  }, [onLookup, stopCamera]);

  const stopScanning = useCallback(() => {
    stopCamera();
    scanGateRef.current.clear();
    setCameraState(CAMERA_IDLE);
    setCameraNote(null);
  }, [stopCamera]);

  // Stop the camera when the component unmounts or the tab is hidden.
  useEffect(() => {
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        stopCamera();
        scanGateRef.current.clear();
        setCameraState(CAMERA_IDLE);
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      stopCamera();
    };
  }, [stopCamera]);

  const onValidate = async () => {
    if (!lookupToken) return;
    if (decideInFlightRef.current || lookupInFlightRef.current) return;
    decideInFlightRef.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    stopScanning();
    try {
      const res = await validateCashierBasket(lookupToken);
      setMessage(res.message || 'Basket approved.');
      if (res.data) {
        setBasket((prev) => ({ ...(prev ?? {}), ...res.data }));
      }
      await onLookup(lookupToken, { refresh: true });
    } catch (e) {
      setError(e?.message || 'Validation failed.');
    } finally {
      decideInFlightRef.current = false;
      setBusy(false);
    }
  };

  const onReject = async () => {
    if (!lookupToken) return;
    if (decideInFlightRef.current || lookupInFlightRef.current) return;
    const notes = window.prompt('Optional note for the customer (rejection reason):', '');
    if (notes === null) return;
    decideInFlightRef.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    stopScanning();
    try {
      const res = await rejectCashierBasket(lookupToken, notes.trim() || null);
      setMessage(res.message || 'Basket not approved.');
      if (res.data) {
        setBasket((prev) => ({ ...(prev ?? {}), ...res.data }));
      }
      await onLookup(lookupToken, { refresh: true });
    } catch (e) {
      setError(e?.message || 'Rejection failed.');
    } finally {
      decideInFlightRef.current = false;
      setBusy(false);
    }
  };

  const onNextCustomer = () => {
    const next = nextCustomerLocalState();
    setTokenInput(next.tokenInput);
    setActiveToken('');
    setBasket(next.basket);
    setError(next.error);
    setMessage(next.message);
    setCameraNote(next.cameraNote);
    setBusy(false);
    decideInFlightRef.current = false;
    lookupInFlightRef.current = false;
    scanGateRef.current.clear();
    stopScanning();
  };

  if (!user) {
    return <p className="admin-muted">Sign in as staff to use cashier validation.</p>;
  }

  const session = basket?.session;
  const items = Array.isArray(basket?.items) ? basket.items : [];
  const customer = basket?.customer;
  const estimated = basket?.estimatedSubtotal;
  const latestValidation = basket?.latestValidation ?? null;
  const validations = Array.isArray(basket?.validations) ? basket.validations : [];
  const terminal = isTerminalCashierStatus(session?.status);
  const canLookup = canLookupBasket({ loading, deciding: busy });
  const canDecide = canDecideBasket({
    status: session?.status,
    loading,
    deciding: busy,
  });
  const outcome = recordedOutcomeLabel(session?.status);

  const cameraLive = cameraState === 'scanning' || cameraState === 'starting';
  const cameraStatusText =
    cameraState === 'starting'
      ? 'Requesting camera permission…'
      : cameraState === 'scanning'
        ? 'Scanning — hold the customer QR inside the frame.'
        : cameraState === 'denied'
          ? 'Camera permission blocked.'
          : cameraState === 'unsupported'
            ? 'Camera not available on this device.'
            : cameraState === 'error'
              ? 'Camera could not start.'
              : 'Camera is off.';

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>Cashier validation</h1>
      </header>

      <section className="admin-card">
        <h2>Find basket</h2>
        <p className="admin-muted">Scan the customer’s QR or paste their basket code.</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 auto' }}>
            <div
              style={{
                width: 260,
                height: 195,
                borderRadius: 10,
                overflow: 'hidden',
                background: '#0b1220',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--admin-border, #d8e2ea)',
              }}
            >
              <video
                ref={videoRef}
                muted
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: cameraLive ? 'block' : 'none',
                }}
              />
              {!cameraLive ? (
                <span style={{ color: '#9fb0c3', fontSize: 13, padding: '0 1rem', textAlign: 'center' }}>
                  {cameraStatusText}
                </span>
              ) : null}
            </div>
            <div className="admin-form-row" style={{ marginTop: '0.5rem' }}>
              {cameraLive ? (
                <button type="button" className="store-btn admin-btn-muted" onClick={stopScanning}>
                  Stop camera
                </button>
              ) : (
                <button
                  type="button"
                  className="store-btn"
                  onClick={() => void startCamera()}
                  disabled={!canLookup}
                >
                  {cameraState === 'denied' || cameraState === 'error'
                    ? 'Try camera again'
                    : 'Start camera'}
                </button>
              )}
            </div>
            {cameraNote ? (
              <p className="admin-muted" role="status" style={{ marginTop: '0.25rem', fontSize: 12 }}>
                {cameraNote}
              </p>
            ) : cameraLive ? (
              <p className="admin-muted" role="status" style={{ marginTop: '0.25rem', fontSize: 12 }}>
                {cameraStatusText}
              </p>
            ) : null}
          </div>

          <div style={{ flex: '1 1 240px', minWidth: 240 }}>
            <label className="admin-muted" htmlFor="cashier-token-input" style={{ display: 'block', fontSize: 13 }}>
              Paste basket code
            </label>
            <p className="admin-muted" style={{ margin: '0.2rem 0 0.35rem', fontSize: 12 }}>
              Customer can also show this code from their app.
            </p>
            <div className="admin-form-row">
              <input
                id="cashier-token-input"
                type="text"
                className="admin-input"
                style={{ flex: 1, minWidth: 200 }}
                placeholder="Paste the full basket code"
                autoComplete="off"
                spellCheck={false}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canLookup) void onLookup();
                }}
              />
              <button
                type="button"
                className="store-btn"
                onClick={() => void onLookup()}
                disabled={!canLookup}
              >
                {loading ? 'Loading…' : 'Find basket'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="admin-success" role="status">
          {message}
        </p>
      ) : null}

      {session ? (
        <section className="admin-card">
          <h2>Review basket</h2>
          <dl className="admin-dl">
            <dt>Status</dt>
            <dd>
              <strong>{session.status}</strong>
            </dd>
            <dt>Customer</dt>
            <dd>
              {customer?.fullName || '—'}
              {customer?.phone ? ` · ${customer.phone}` : ''}
              {customer?.email ? ` · ${customer.email}` : ''}
            </dd>
            <dt>Lines</dt>
            <dd>
              {basket?.itemCount ?? items.length} items · {basket?.uniqueProductCount ?? '—'} unique
              products
            </dd>
            <dt>Estimated total</dt>
            <dd>
              {estimated != null && estimated > 0
                ? formatMoney(estimated)
                : 'To be confirmed at the till'}
            </dd>
          </dl>

          <table className="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((line) => {
                const total = lineAmount(line.quantity, line.unitPriceSnapshot);
                return (
                  <tr key={line.id}>
                    <td>{line.productNameSnapshot}</td>
                    <td>{line.quantity}</td>
                    <td>{formatMoney(line.unitPriceSnapshot)}</td>
                    <td>{total == null ? '—' : formatMoney(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <SimulatedWeightPanel summary={basket?.simulatedWeight} />

          {canDecide ? (
            <>
              <p className="admin-muted" style={{ marginTop: '1rem' }}>
                Validation only — no payment.
              </p>
              <div className="admin-form-row" style={{ marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="store-btn"
                  disabled={!canDecide}
                  onClick={() => void onValidate()}
                >
                  Approve basket
                </button>
                <button
                  type="button"
                  className="store-btn admin-btn-muted"
                  disabled={!canDecide}
                  onClick={() => void onReject()}
                >
                  Reject basket
                </button>
              </div>
            </>
          ) : null}

          {terminal ? (
            <div style={{ marginTop: '1rem' }}>
              {!message && outcome ? (
                <p className="admin-success" role="status">
                  {outcome}
                </p>
              ) : null}
              <button
                type="button"
                className="store-btn"
                style={{ marginTop: '0.75rem' }}
                onClick={onNextCustomer}
              >
                Next customer
              </button>
            </div>
          ) : null}

          <details className="admin-disclosure">
            <summary>Audit details</summary>
            <dl className="admin-dl">
              <dt>Expires</dt>
              <dd>{formatDt(session.expiresAt)}</dd>
              <dt>Session ID</dt>
              <dd>
                <code>{session.id}</code>
              </dd>
            </dl>
            {latestValidation || validations.length > 0 ? (
              latestValidation ? (
                <dl className="admin-dl">
                  <dt>Validation saved</dt>
                  <dd>Yes</dd>
                  <dt>Recorded status</dt>
                  <dd>
                    <strong>{latestValidation.validationStatus}</strong>
                  </dd>
                  <dt>Staff</dt>
                  <dd>{latestValidation.validatedBy || '—'}</dd>
                  <dt>Timestamp</dt>
                  <dd>{formatDt(latestValidation.createdAt)}</dd>
                  {latestValidation.notes ? (
                    <>
                      <dt>Notes</dt>
                      <dd>{latestValidation.notes}</dd>
                    </>
                  ) : null}
                </dl>
              ) : (
                <p className="admin-muted">No cashier validation row yet for this session.</p>
              )
            ) : (
              <p className="admin-muted">No cashier validation row yet for this session.</p>
            )}
          </details>
        </section>
      ) : null}
    </div>
  );
}

function SimulatedWeightPanel({ summary }) {
  const view = simulatedWeightPanelView(summary);
  return (
    <div className="admin-card" style={{ marginTop: '1rem', background: '#fff7ed' }}>
      <h3>{view.title}</h3>
      <p>
        <strong>{view.heading}</strong>
        {view.amount ? ` — ${view.amount}` : ''}
      </p>
      {view.coverage ? <p className="admin-muted">{view.coverage}</p> : null}
      {view.detail ? <p className="admin-muted">{view.detail}</p> : null}
      <p className="admin-muted">{view.explanation}</p>
    </div>
  );
}
