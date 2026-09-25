// Accepts the first scan of a QR code and ignores repeats for a short time.

import { normalizeCashierToken } from './cashierToken.js';

const DEFAULT_WINDOW_MS = 4000;

export function createCashierScanGate({ windowMs = DEFAULT_WINDOW_MS } = {}) {
  const cooldown = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : DEFAULT_WINDOW_MS;
  let accepted = false;
  let lastToken = null;
  let lastAcceptedAt = -Infinity;

  return {
    // the raw decoded text from the scanner
    // clock (defaults to Date.now())
    accept(rawText, nowMs = Date.now()) {
      const token = normalizeCashierToken(rawText);
      if (!token) return { accepted: false, token: null };
      if (accepted) return { accepted: false, token: null };
      if (token === lastToken && nowMs - lastAcceptedAt < cooldown) {
        return { accepted: false, token: null };
      }
      accepted = true;
      lastToken = token;
      lastAcceptedAt = nowMs;
      return { accepted: true, token };
    },
    // Re-arm the gate for another scan (e.g. after a failed lookup).
    reset() {
      accepted = false;
    },
    // Full reset, including the recent-token memory.
    clear() {
      accepted = false;
      lastToken = null;
      lastAcceptedAt = -Infinity;
    },
    // a scan has been accepted and not re-armed
    get isAccepted() {
      return accepted;
    },
  };
}
