// Helpers for the cashier screen state.

export function isTerminalCashierStatus(status) {
  const s = String(status ?? '').toLowerCase();
  return s === 'validated' || s === 'rejected' || s === 'cancelled' || s === 'expired';
}

// Clear the "QR detected, looking up" note after the lookup finishes.
export function cameraNoteAfterLookup() {
  return null;
}

export function canLookupBasket({ loading, deciding } = {}) {
  return loading !== true && deciding !== true;
}

export function canDecideBasket({ status, loading, deciding } = {}) {
  return status === 'active' && loading !== true && deciding !== true;
}

// Resets the screen only; the finished session is not changed.
export function nextCustomerLocalState() {
  return {
    tokenInput: '',
    basket: null,
    error: null,
    message: null,
    cameraNote: null,
    deciding: false,
  };
}

export function lineAmount(quantity, unitPrice) {
  if (quantity == null || unitPrice == null || unitPrice === '') return null;
  const qty = Number(quantity);
  const unit = Number(unitPrice);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unit)) return null;
  return Math.round(qty * unit * 1000) / 1000;
}
