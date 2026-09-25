#!/usr/bin/env node
// Checks the isolated demo API over HTTP by registering test customers.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = (process.env.DEMO_API_BASE || 'http://127.0.0.1:3002').replace(/\/+$/, '');
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../outputs/recovery/2026-09-22-database-simplification',
);

function fail(message, extra) {
  console.error(message);
  if (extra !== undefined) console.error(JSON.stringify(extra, null, 2));
  process.exit(1);
}

async function request(method, path, { headers, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text, headers: Object.fromEntries(res.headers) };
}

function customerHeaders(id) {
  return { 'x-customer-id': String(id) };
}

function cartSummary(payload) {
  const data = payload?.json?.data;
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    status: payload.status,
    itemCount: items.length,
    grandTotal: data?.grandTotal ?? null,
    totalQuantity: data?.totalQuantity ?? null,
  };
}

function historyCount(payload) {
  const data = payload?.json?.data;
  if (Array.isArray(data)) return data.length;
  if (Array.isArray(data?.records)) return data.records.length;
  if (Array.isArray(data?.items)) return data.items.length;
  if (Array.isArray(data?.history)) return data.history.length;
  if (typeof data?.count === 'number') return data.count;
  return null;
}

const report = { kind: 'isolated_demo_runtime', base, stamp, steps: {} };

const health = await request('GET', '/api/health');
report.steps.health = { status: health.status, json: health.json };
if (health.status !== 200) fail('health failed', health);

const products = await request('GET', '/api/catalog/products?limit=100');
const total = products.json?.pagination?.total;
const list = products.json?.data;
report.steps.catalogue = {
  status: products.status,
  total,
  pageLength: Array.isArray(list) ? list.length : null,
};
if (products.status !== 200 || total !== 91) fail('catalogue total is not 91', report.steps.catalogue);

const searchEgg = await request('GET', '/api/catalog/products?search=egg&limit=20');
const searchLait = await request('GET', '/api/catalog/products?search=lait&limit=20');
const eggHits = Array.isArray(searchEgg.json?.data) ? searchEgg.json.data : [];
const laitHits = Array.isArray(searchLait.json?.data) ? searchLait.json.data : [];
report.steps.search = {
  egg: { status: searchEgg.status, count: eggHits.length },
  lait: { status: searchLait.status, count: laitHits.length },
};
if (!eggHits.length || !laitHits.length) fail('egg/lait search returned no curated hits', report.steps.search);

const barcodeEgg = await request('GET', '/api/catalog/products/by-barcode/6191597900119');
const eggProduct = barcodeEgg.json?.data;
report.steps.barcodeEgg = {
  status: barcodeEgg.status,
  idPrefix: eggProduct?.id ? String(eggProduct.id).slice(0, 8) : null,
  canonicalType: eggProduct?.canonicalType ?? null,
  classificationStatus: eggProduct?.classificationStatus ?? null,
};
if (barcodeEgg.status !== 200 || !eggProduct?.id) fail('egg barcode lookup failed', report.steps.barcodeEgg);

const unknownBarcode = await request('GET', '/api/catalog/products/by-barcode/0000000000000');
report.steps.unknownBarcode = {
  status: unknownBarcode.status,
  code: unknownBarcode.json?.code ?? unknownBarcode.json?.error?.code ?? null,
  message: unknownBarcode.json?.message ?? null,
};
if (unknownBarcode.status !== 404) fail('unknown barcode should 404', report.steps.unknownBarcode);
if (report.steps.unknownBarcode.code === 'NOT_IN_CURATED_CATALOGUE') {
  fail('unknown barcode must not use NOT_IN_CURATED_CATALOGUE on the 91-product database', report.steps.unknownBarcode);
}

const withImage = (Array.isArray(list) ? list : []).find((p) => p.metadataImageUrl || p.imageUrl);
report.steps.metadataImages = {
  listHasImageUrl: Boolean(withImage),
  sampleImageUrl: withImage?.metadataImageUrl || withImage?.imageUrl || null,
  sampleIdPrefix: withImage?.id ? String(withImage.id).slice(0, 8) : null,
};
if (withImage?.metadataImageUrl || withImage?.imageUrl) {
  const imagePath = withImage.metadataImageUrl || withImage.imageUrl;
  const img = await request('GET', imagePath.startsWith('http') ? new URL(imagePath).pathname : imagePath);
  report.steps.metadataImages.imageStatus = img.status;
  report.steps.metadataImages.contentType = img.headers['content-type'] ?? null;
}

const settings = await request('GET', '/api/settings/public');
const appConfig = await request('GET', '/api/app-config');
report.steps.settings = { status: settings.status, keys: (settings.json?.data ?? settings.json)?.length ?? Object.keys(settings.json?.data ?? {}).length };
report.steps.appConfig = {
  status: appConfig.status,
  maxBasketQuantity: appConfig.json?.data?.maxBasketQuantity ?? appConfig.json?.maxBasketQuantity ?? null,
};
if (settings.status !== 200 || appConfig.status !== 200) fail('settings/app-config failed', report.steps);

const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminUsername || !adminPassword) {
  fail('Set ADMIN_USERNAME and ADMIN_PASSWORD before this check. ADMIN_PASSWORD is the login password, not the bcrypt hash.');
}
const staff = await request('POST', '/api/auth/login', {
  body: { username: adminUsername, password: adminPassword },
});
const staffToken = staff.json?.token;
report.steps.staffLogin = { status: staff.status, hasToken: Boolean(staffToken), role: staff.json?.user?.role ?? null };
if (staff.status !== 200 || !staffToken) fail('admin login failed', report.steps.staffLogin);

async function register(label) {
  const email = `demo.min.${stamp}.${label}@example.test`;
  const res = await request('POST', '/api/customers/register', {
    body: { fullName: `Demo ${label}`, email, password: 'DemoPass123!' },
  });
  const customer = res.json?.data?.customer;
  return { status: res.status, id: customer?.id ?? null, email };
}

const approveAccount = await register('approve');
const rejectAccount = await register('reject');
report.steps.register = { approve: approveAccount, reject: rejectAccount };
if (approveAccount.status !== 201 || rejectAccount.status !== 201) fail('synthetic register failed', report.steps.register);

async function recs(customerId) {
  const res = await request('GET', '/api/recommendations/recipes?limit=5', {
    headers: customerHeaders(customerId),
  });
  const data = res.json?.data;
  return {
    status: res.status,
    evidenceSource: data?.evidenceSource ?? null,
    personalised: data?.personalised ?? null,
    count: Array.isArray(data?.recommendations) ? data.recommendations.length : null,
  };
}

const recsEmpty = await recs(approveAccount.id);
report.steps.recsEmpty = recsEmpty;
if (recsEmpty.status !== 200 || recsEmpty.evidenceSource !== 'popularity') {
  fail('empty-basket recommendations should use popularity evidence', recsEmpty);
}

const add = await request('POST', '/api/cart/items', {
  headers: customerHeaders(approveAccount.id),
  body: { productId: eggProduct.id, quantity: 1 },
});
report.steps.addToBasket = cartSummary(add);
if (add.status !== 200 || report.steps.addToBasket.itemCount !== 1) fail('add to basket failed', report.steps.addToBasket);

const recsBasket = await recs(approveAccount.id);
report.steps.recsBasket = recsBasket;
if (recsBasket.status !== 200 || recsBasket.evidenceSource !== 'basket') {
  fail('basket recommendations should use basket evidence', recsBasket);
}

const qr = await request('POST', '/api/smart-basket/session/qr', {
  headers: customerHeaders(approveAccount.id),
});
const qrData = qr.json?.data;
const token = qrData?.token || qrData?.qrValue;
report.steps.qrApproveCreate = {
  status: qr.status,
  sessionId: qrData?.sessionId ?? null,
  sessionStatus: qrData?.status ?? null,
  hasToken: Boolean(token),
};
if (qr.status !== 201 || !token) fail('QR create failed', report.steps.qrApproveCreate);

const auth = { Authorization: `Bearer ${staffToken}` };
const preview = await request('GET', `/api/admin/cashier/basket/${encodeURIComponent(token)}`, { headers: auth });
report.steps.qrApprovePreview = {
  status: preview.status,
  sessionStatus: preview.json?.data?.session?.status ?? preview.json?.data?.status ?? null,
  lineCount: preview.json?.data?.items?.length ?? preview.json?.data?.lines?.length ?? null,
};
if (preview.status !== 200) fail('cashier preview failed', report.steps.qrApprovePreview);

const validate = await request('POST', `/api/admin/cashier/basket/${encodeURIComponent(token)}/validate`, { headers: auth });
report.steps.qrApproveDecision = {
  status: validate.status,
  message: validate.json?.message ?? null,
  sessionStatus: validate.json?.data?.trace?.status ?? validate.json?.data?.session?.status ?? null,
  validationSaved: validate.json?.data?.trace?.validationSaved ?? null,
};
if (validate.status !== 200) fail('QR validate failed', report.steps.qrApproveDecision);

const cartAfterValidate = await request('GET', '/api/cart', { headers: customerHeaders(approveAccount.id) });
report.steps.cartAfterApprove = cartSummary(cartAfterValidate);
if (report.steps.cartAfterApprove.itemCount !== 0) fail('approved cart should be empty', report.steps.cartAfterApprove);

const historyAfterApprove = await request('GET', '/api/purchase-history', { headers: customerHeaders(approveAccount.id) });
report.steps.historyAfterApprove = {
  status: historyAfterApprove.status,
  count: historyCount(historyAfterApprove),
};
if (report.steps.historyAfterApprove.count !== 1) fail('approved history should have 1 row', report.steps.historyAfterApprove);

const recsHistory = await recs(approveAccount.id);
report.steps.recsHistory = recsHistory;
if (recsHistory.status !== 200 || recsHistory.evidenceSource !== 'history') {
  fail('after approve, empty cart should select history evidence', recsHistory);
}

const addReject = await request('POST', '/api/cart/items', {
  headers: customerHeaders(rejectAccount.id),
  body: { productId: eggProduct.id, quantity: 1 },
});
const qrReject = await request('POST', '/api/smart-basket/session/qr', {
  headers: customerHeaders(rejectAccount.id),
});
const rejectToken = qrReject.json?.data?.token || qrReject.json?.data?.qrValue;
const rejectDecision = await request('POST', `/api/admin/cashier/basket/${encodeURIComponent(rejectToken)}/reject`, {
  headers: auth,
  body: { notes: 'isolated demo reject' },
});
const cartAfterReject = await request('GET', '/api/cart', { headers: customerHeaders(rejectAccount.id) });
const historyAfterReject = await request('GET', '/api/purchase-history', { headers: customerHeaders(rejectAccount.id) });
report.steps.qrReject = {
  addStatus: addReject.status,
  qrStatus: qrReject.status,
  decisionStatus: rejectDecision.status,
  message: rejectDecision.json?.message ?? null,
  cartItemCount: cartSummary(cartAfterReject).itemCount,
  historyCount: historyCount(historyAfterReject),
};
if (report.steps.qrReject.decisionStatus !== 200) fail('QR reject failed', report.steps.qrReject);
if (report.steps.qrReject.cartItemCount !== 1) fail('rejected cart should be kept', report.steps.qrReject);
if (report.steps.qrReject.historyCount !== 0) fail('rejected session must not appear in purchase history', report.steps.qrReject);

report.ok = true;
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'RUNTIME_ISOLATED_DEMO.json');
writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(`isolated demo API checks passed. wrote ${outFile}`);
console.log(JSON.stringify({
  catalogueTotal: total,
  barcodeCanonicalType: report.steps.barcodeEgg.canonicalType,
  recs: {
    empty: recsEmpty.evidenceSource,
    basket: recsBasket.evidenceSource,
    history: recsHistory.evidenceSource,
  },
  qrApprove: report.steps.qrApproveDecision.sessionStatus,
  qrRejectKeptCart: report.steps.qrReject.cartItemCount,
}, null, 2));
