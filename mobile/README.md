# SmartBasket Mobile Prototype

Expo SDK 54 / React Native customer application for the SmartBasket dissertation
prototype.

## Main navigation

- **Home** — signed-in shopping dashboard: greeting, next-shop list/basket, a
  curated catalogue strip, and one recipe-inspiration preview
- **Shopping list** — supports manual planning and catalogue-linked items that
  are checked automatically when the matching product enters the smart basket
- **Recipe Ideas** — signed-in recipe list and detail (Home stack, not a tab)
- **My recipes** — account-scoped device-local recipes from Recipe Ideas (not
  a tab, not the recommender). Ingredient transfer is reviewed; recipe amounts
  are not package counts
- **Catalogue** — browses the authorised read-only product catalogue
- **Scan** — scans or manually enters a product barcode
- **Basket** — manages quantities, totals, and cashier QR generation
- **Account** — sign-in, validated shopping history, and descriptive personal activity

The shopping list is device-local `AsyncStorage` per signed-in account
(`smartBasketShoppingListV2:customer:<id>`): create notes/generic/linked rows,
read the list, update checks and personal-note text, delete rows. Personal
recipes use `smartBasketPersonalRecipesV1:customer:<id>` on the same device;
they are not synced and are not part of the recommendation dataset. The Smart
Basket is server `dbo.SB_CartItems`: add, read, change quantity, remove/clear.
See `docs/ARCHITECTURE.md` (checklist vs basket C/R/U/D).

Loyalty, member offers, company branding, and website pickup ordering are not part
of the target mobile application. Customer history lists cashier-validated smart
baskets only. Existing database rows were not deleted.

## Run

```bash
npm install
npm start
```

Use `i` for the iOS simulator, `a` for Android, or a dev build / Expo Go on a
physical device.

### Backend address

The app calls the Express server directly (no proxy). The address comes from
the Expo public env var `EXPO_PUBLIC_API_BASE_URL` in `mobile/.env` (git-ignored).

- **iOS Simulator / web:** `http://127.0.0.1:3001` (the simulator shares the computer's loopback).
- **Physical phone:** `127.0.0.1` is the phone itself. Use the computer's LAN address instead, for example `http://192.168.1.100:3001`. Phone and computer must be on the same ordinary Wi-Fi. Recheck the address after network changes (`ipconfig getifaddr en0` on macOS).

```bash
cp .env.example .env
# Simulator:  EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3001
# Physical phone: EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3001
```

If `EXPO_PUBLIC_API_BASE_URL` is unset the app falls back to a loopback address
that only works locally: `http://127.0.0.1:3001` on the iOS simulator / web,
`http://10.0.2.2:3001` on the Android emulator. **A physical phone cannot reach
those** (`127.0.0.1` is the phone itself), so on a device the env var is
required. An explicitly set but malformed value fails fast with a clear error.

The pure normalisation / fallback logic is in `src/lib/apiBaseUrl.ts`
(`npm test` covers it). `.env` is git-ignored; `.env.example` is the committed
template. `EXPO_PUBLIC_*` values are baked into the JS bundle and are **not**
secret — never put credentials in one.

### Start the backend for a physical device

```bash
cd ../server && HOST=0.0.0.0 npm run dev
```

`HOST` defaults to `0.0.0.0` (all interfaces — also Express's own default), so
this is only needed to be explicit. The startup log prints the LAN address(es)
to use.

### Start Expo for a physical device

```bash
npx expo start --lan
```

Restart Expo (not just reload) after changing `EXPO_PUBLIC_API_BASE_URL` — env
values are read at bundle time.

### Troubleshooting: phone loads the UI but no catalogue/API data

- **Same Wi-Fi.** Phone and computer must be on the same ordinary Wi-Fi
  network. A guest network, VPN, or corporate network often blocks
  device-to-device traffic.
- **Hotspot / client isolation.** A Personal Hotspot or a router with "client
  isolation" / "AP isolation" can stop the phone reaching the laptop even on
  the "same" network.
- **Test from the phone browser.** Open `http://<LAN-IP>:3001/api/health` in
  Safari/Chrome on the phone. It should return `{"status":"ok"}`. If that fails,
  the app cannot work either — it is a network/firewall problem, not an app
  bug.
- **macOS firewall.** System Settings → Network → Firewall: allow incoming
  connections for `node`, or turn the firewall off while testing.
- **LAN IP changes.** DHCP leases expire; the laptop's IP can change after a
  reconnect or reboot. Re-check with `ipconfig getifaddr en0` and update
  `.env`, then restart Expo.
- **Restart after env changes.** `EXPO_PUBLIC_API_BASE_URL` is embedded at
  bundle time — a fast-refresh reload will not pick up a change.

## Core QR workflow

1. The customer signs in and builds a server-backed basket.
2. The app requests a short-lived smart-basket session.
3. The QR encodes `SMART_BASKET:{token}`.
4. The cashier web terminal looks up the token and approves or rejects it.
5. The mobile screen polls the session and displays the resulting status.

The application does not process real payment or verify the physical contents of
the basket.

## Shopping-list workflow

1. Add free-text items from the shopping-list screen, link a catalogue product
   from product details or barcode results, or add catalogue-linked missing
   ingredients from a Recipe Ideas detail screen.
2. Manually check or remove any item at any time.
3. When a linked catalogue product is added to the smart basket, the matching
   shopping-list item is checked automatically.
4. Shopping-list data is stored on the device as prototype-owned planning data;
   it is not written to the authorised company catalogue.

## Recipe Ideas

Signed-in customers open **Recipe Ideas** from the Home card. The list uses
`useRecipeRecommendations` (loading, empty, error/retry, pull-to-refresh);
detail uses `fetchRecipeRecommendationById` and also supports pull-to-refresh.
Missing ingredients that the server has linked to a catalogue product can be
selected and added to the device shopping list in one atomic batch
(`addProductItems`). Unlinked missing ingredients are shown but not addable.

If a signed-out customer taps **Sign in** / **Create account** from Recipe
Ideas or Recipe Detail, the Login/Register screens carry a typed
`returnTo: 'recipeIdeas'` param (`AuthReturnDestination` in
`types/navigation.ts` — a closed type, never an arbitrary route name) and
return straight to Recipe Ideas after a successful sign-in/registration.
Signing in from anywhere else (Insights or the basket QR flow)
still lands on Insights Home exactly as before — that param is optional and
`undefined`-compatible.

Surrounding UI is EN/FR. The server's explanation and data-limitation sentences
are currently English; the screens label them as server-provided English.

Product-id matching across the shopping list (single add, batch add, marking a
linked product collected) is consistently case-insensitive and trimmed via one
shared `normaliseProductIdForMatch` function, and `ShoppingListContext.commit`
only updates the visible list after the `AsyncStorage` write has actually
succeeded — a failed write leaves the previous list on screen and surfaces a
translated error, never a raw storage error.

The recipe data layer:

- `src/types/recommendations.ts` — response types mirroring the server exactly.
- `src/api/recommendations.ts` — `fetchRecipeRecommendations(limit?)` and
  `fetchRecipeRecommendationById(recipeId)`; same signed-in-customer
  convention as `api/customerIdentity.ts`.
- `src/lib/recommendations.ts` — pure helpers for limits, URLs and error kinds.
- `src/hooks/useRecipeRecommendations.ts` — list loading/empty/error/refresh.
- `src/lib/recipeChecklist.ts` — conversion of selected missing links.
- `src/lib/shoppingListBatch.ts` — pure batch merge used by `addProductItems`
  and `addProductItem`, including the shared `normaliseProductIdForMatch`.

See `docs/RECIPE_RECOMMENDATION_DESIGN.md` §8.5–8.7.

## Verification

```bash
npm run typecheck
npx expo config --type public
npm test
```

`npm test` compiles only the pure, RN-independent modules (limit validation,
URL building, API base-URL normalisation / fallback selection, error
classification, checklist conversion, shopping-list batch merge,
translation-key presence) with the existing `typescript` dev dependency
and runs them with Node's built-in `node --test` — no new test framework was
added. The compiled output lives in `.test-build/` (gitignored). The test
script passes `*.test.js` files explicitly so Node 22 does not skip that
hidden directory. Screens, the list hook and the API client are covered by
`npm run typecheck`.
