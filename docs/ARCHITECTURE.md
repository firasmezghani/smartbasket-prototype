# Architecture

This document describes the finished SmartBasket prototype as implemented.

## System overview

```text
Mobile app (Expo / React Native) + staff browser (React / Vite)
  → HTTP JSON API (Express.js)
    → SQL Server database SmartBasketDemo (demonstration path)
```

| Tier | Location | Responsibility |
| --- | --- | --- |
| Customer app | `mobile/` | Catalogue, scan, device shopping list, personal recipes, basket UI, QR display, history, insights |
| Staff console | `client/` | Staff JWT sign-in, cashier validation, ADMIN overview and basket-limit settings |
| API | `server/` | Auth, catalogue reads, prices and totals, cart, QR sessions, recommendations, purchase history |
| Database | `SmartBasketDemo` | Ten application tables plus two compatibility views required by current SQL |

The app installs `SmartBasketDemo` with Flyway and needs no other database.
`npm run demo:server` (`server/scripts/run-demo-api.mjs`) starts the API on
port 3001 against that database. See
[DATABASE_HANDOVER.md](DATABASE_HANDOVER.md).

## Clients

### Mobile customer app

- Expo SDK 54 / React Native, TypeScript (`mobile/App.tsx` → `MainTabs`).
- Holds no database credentials. Talks to the API using
  `EXPO_PUBLIC_API_BASE_URL` (`mobile/src/lib/apiBaseUrl.ts`).
- **Shopping list** and **personal recipes** are device-local AsyncStorage,
  keyed per signed-in customer id. They are never written to company tables.
  Checklist rows use one of three contracts: a catalogue `productId`, an
  explicit `genericType` CanonicalType key, or a personal note. Exact product
  matches check off when that product enters the server basket; generic types
  need package confirmation; notes are never inferred from names.
- The **smart basket** (quantities, prices, totals) is server-backed
  (`SB_CartItems`). Merge on sign-in and quantity updates use server-side
  basket locks to prevent the tested lost-update race.

### Staff web console

- Vite + React (`client/src/main.jsx` → `App.jsx` → `AdminApp`).
- Every signed-in staff member can validate or reject a basket.
- The `ADMIN` role additionally sees overview and settings (basket quantity
  limit). Endpoint authorization is enforced with `requireAuth` /
  `requireAdmin` on the server; hiding tabs is not the security boundary.
- Staff credentials are environment-configured prototype ADMIN and CASHIER
  accounts, not a company employee directory.

## API surface

Source of truth: `server/src/routes/index.js` and the routers it mounts.

| Prefix | Purpose |
| --- | --- |
| `GET /api/` | Discovery index of supported routes |
| `/api/health` | Process health payload |
| `/api/catalog/*` | Read-only curated catalogue (products, sections, barcode, families, images) |
| `POST /api/auth/login` | Staff JWT |
| `/api/customers` | Customer register / login |
| `/api/cart/*` | Basket lines, merge, clear |
| `/api/purchase-history` | Validated smart-basket history for the customer |
| `/api/recommendations/recipes` | Recipe list and detail |
| `/api/smart-basket/session/*` | QR create, current session, owned session by id, cancel |
| `/api/admin/cashier/basket/:token` | Staff lookup, validate, reject |
| `/api/admin/app-config` | ADMIN read / update `max_basket_quantity` |
| `GET /api/app-config` | Public basket-capacity value |
| `GET /api/settings/public` | Public settings (for example site-only filter) |

Retired storefront concerns (orders, loyalty HTTP, offers, playlists,
home-slides, setup, product-interpretation review UI) are **not** mounted.
A short record of that reduction is in
the current route list in `server/src/routes/`.

Static product images are served from `server/product-images/` at
`PRODUCT_IMAGE_PUBLIC_PATH` (default `/product-images`). There is no live
playlist `/uploads` mount in `server/src/app.js`.

## Demonstration database (`SmartBasketDemo`)

Ten tables:

| Table | Role |
| --- | --- |
| `SB_Products` | Selected imported catalogue rows (runtime reads via view) |
| `SB_ProductBarcodes` | Barcodes for those products (runtime reads via view) |
| `SB_ProductMetadata` | Curation, display, CanonicalType, package, eligibility, `ImagePath` |
| `SB_AppConfig` | Operator `max_basket_quantity` |
| `SB_Settings` | Public store settings |
| `SB_Customers` | Prototype accounts |
| `SB_CartItems` | Live baskets |
| `SB_SmartBasketSessions` | QR handoff sessions |
| `SB_SmartBasketItems` | Frozen QR line snapshots |
| `SB_CashierValidations` | Staff approve/reject audit |

Required compatibility views (current server SQL still selects these names):

- `TabStocksaico`
- `TabStockBarCodesaico`

Catalogue rows are a curated subset copied from the preserved full-import
database. Application accounts and transactions start empty and are created
only through the API. The partner store's tables are never written by this
prototype.

Supported fresh install: Flyway (`server/db/migration`) via
`npm run db:install -- --database <Name>` from `server/`.

## Device-local shopping lists and personal recipes

| Concern | Storage | Server role |
| --- | --- | --- |
| Shopping checklist | AsyncStorage per customer id | Basket adds may check linked rows; no list table |
| Personal recipes | AsyncStorage per customer id | None; not the ranking dataset |
| Smart basket | `SB_CartItems` | Authoritative prices and totals |
| Validated history | `SB_SmartBasketSessions` + items + validations | Purchase-history API |

## Recipe interpretation and ranking

- Operational dataset: ten recipes in `server/src/data/recipes/recipes.json`
  with an authored French display overlay.
- Product names are interpreted automatically (type, package amount/unit,
  contextual exclusions, reliability gate). Administrator override / audit
  tables are not part of `SmartBasketDemo` and are unused by the running
  application.
- Ranking uses eligible current-basket evidence, otherwise eligible validated
  history, otherwise a fixed authored baseline (`fallbackRank`). Essential
  coverage is compared before the weighted score. History is never treated as
  known current stock.
- Design detail: [RECIPE_RECOMMENDATION_DESIGN.md](RECIPE_RECOMMENDATION_DESIGN.md).

## QR handoff and cashier decisions

1. The customer creates a QR session. The server stores a **hash** of the
   token, freezes line snapshots, and returns a short-lived QR value
   (`SMART_BASKET:…`, ten-minute expiry).
2. While the mobile QR screen is focused and the app is foregrounded, the
   phone polls `GET /api/smart-basket/session/:id` for the **displayed**
   session (about every 3 seconds, no overlapping requests). There are no
   push notifications. Polling pauses on blur/background and stops after a
   terminal status.
3. Staff look up the token (camera or paste). Validate and reject run through
   `finalizeValidation` in `smartBasket.service.js`: the session row is locked
   (`UPDLOCK, ROWLOCK`), status and expiry are re-checked, a conditional
   `UPDATE` requires `Status = active`, a cashier validation row is inserted,
   and on approval the live cart lines for that customer are cleared in the
   same transaction. A competing second decision receives HTTP 409.
4. Only validated sessions appear in customer purchase history. Simulated
   basket weight (optional `SIMULATED_BASKET_WEIGHT`) is demonstration
   arithmetic frozen at QR creation; it is not a connected scale and does not
   drive approval.

## Security and deployment limitations

- Parameterised SQL; company / imported catalogue objects are read-only at
  runtime.
- Staff JWT and customer `x-customer-id` are separate identities. Cashier
  routes never accept a customer header as staff auth.
- QR tokens are hashed at rest; plain tokens are not stored.
- This is a **local academic prototype**, not a production deployment:
  - Default API bind may listen on all interfaces for LAN phone testing
  - CORS is configured from environment origins
  - Secrets live in local `.env` files that must not be committed
  - No real payment, fraud detection, or theft-prevention claim
  - No claim of regulatory completeness for privacy or retail law
- Staff usernames and password hashes, and the JWT secret, come from `.env`.
  The server will not start if the admin or cashier values are missing.

## Related documents

- Product boundary: [THESIS_PRODUCT_SCOPE.md](THESIS_PRODUCT_SCOPE.md)
- Database setup: [DATABASE_HANDOVER.md](DATABASE_HANDOVER.md)
- Testing entry: [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)
