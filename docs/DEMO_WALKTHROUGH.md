# SmartBasket demonstration walkthrough

A short sequence for the finished app. Uses a synthetic customer account.
Staff logins are the values in `server/.env`. Create the customer on the day.

Estimated time: ~8 minutes. Do a full dry run once before the real thing.

---

## 0. Prerequisites (once, before the session)

| # | Action | Expected |
|---|---|---|
| 0.1 | From `server/`, tests pass | `npm test` |
| 0.2 | Database installed | `npm run db:install -- --database SmartBasketDemo` from `server/` runs `verify_demo_install.sql` (91 products, 164 barcodes, 91 metadata rows) |
| 0.3 | Catalogue is the 91 products | `GET /api/catalog/products?limit=1` reports `pagination.total` = 91 |
| 0.4 | Phone and computer on the same Wi-Fi; `mobile/.env` has `EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:3001` | `http://<LAN-IP>:3001/api/health` returns `{"status":"ok"}` |

> Imagery: products show their image from `server/product-images/`; a product
> without one shows the "No image" placeholder.

---

## 1. Start the three processes

```bash
# terminal 1 — demonstration API (SmartBasketDemo on port 3001)
npm run demo:server

# terminal 2 — cashier web portal
npm run dev:client                  # http://localhost:5173

# terminal 3 — mobile app
cd mobile && npm start              # Expo Go / a dev build on the phone
```

**Expected:** the demo server listens on port 3001 against `SmartBasketDemo`
(and refuses to start if the connected database is wrong). Cashier portal loads
a sign-in card. The phone app loads the Home screen. Configure
`EXPO_PUBLIC_API_BASE_URL` for a physical device (see `mobile/README.md`).

**Recovery:** phone can't reach the API → re-check step 0.4; run
`ipconfig getifaddr en0`, update `mobile/.env`, **restart** Expo (not reload).
See `mobile/README.md` → Troubleshooting.

---

## 2. Sign in as a synthetic customer

On the phone: **Account** tab → **Create account** → name `Demo Client`, a
throwaway email (e.g. `demo+today@example.test`), any password. Submit.

**Expected:** lands on the Account overview, signed in. (A guest basket, if any,
is merged.)

**Recovery:** email already used → append a number. Registration error → check
the backend terminal for the request; the message shown is safe/translated.

---

## 3. Prepare a shopping checklist

**Home → Open shopping list** (card titled **Shopping list**, subtitle
**Prepare your next shop.**). Add two personal notes, e.g. `Salad leaves` and
`Bread`. Then **Catalogue → open "Œufs El Mazraa — boîte de 6" → Add to
list**; do the same for **"Huile d'olive extra vierge Al Jazira
500 ml"**.

**Expected:** four items on the list. The two catalogue-linked items carry a
"Catalogue product" badge; the two personal notes carry a compact
"Personal note" badge. Nothing is checked yet.

> Note: from the catalogue, the primary action is **Add to list**.
> A **Demo: simulate scanning** button appears **only** in a dev build and is
> labelled as a demonstration shortcut. It does not use the camera.

---

## 4. Scan the six-egg pack and the olive oil into the Smart Basket

**Scan** tab. Scan (or type, using the manual-entry fallback) the barcodes for:

1. the six-egg pack — `Œufs El Mazraa — boîte de 6`
2. the olive oil — `Huile d'olive extra vierge Al Jazira 500 ml`

Add each result to the basket.

**Expected:** the Basket tab shows 2 distinct product lines. The interpreter
reads the egg pack as **6 pieces** (1 box × 6) and the oil as **500 ml**.

**Recovery:** unknown or unsupported barcode → use manual entry with a known
barcode of one of the 91 products, or use the dev-only
**Demo: simulate scanning** button on the product detail screen. An unknown
barcode is not added. The app does not invent a product, price, or identity.

---

## 5. Show the checklist auto-checking

Open **Home → Open shopping list**.

**Expected:** the two catalogue-linked items (eggs, olive oil) are now
**checked automatically**, with a "Collected" badge and a strikethrough. The two
manual items are still unchecked (they remain under the customer's control).

---

## 6. Show the quantity-aware omelette recommendation

**Home → Recipe Ideas → open "Classic Omelette".**

**Expected (English):**

- Evidence badge: **Your basket** (basket-personalised, not popularity).
- **Eggs** requirement → *Recipe requires: 3 eggs* · *Detected: 6 eggs* ·
  **Quantity sufficient** (green).
- **Cooking fat** requirement → *Matched with: Olive oil* · **In your current
  basket** — olive oil is accepted as the butter alternative
  (`anyOfKeys: [butter, olive_oil]`).
- Optional grated cheese is listed but not claimed as matched or missing unless
  present.

**Recovery:** shows as "Popular" instead of basket-personalised → the egg /
oil products were not interpreted as evidence; confirm step 0.3 (approve them)
and that the basket actually holds both lines.

---

## 7. Generate the cashier QR

**Basket tab → Generate cashier QR.**

**Expected:** the QR screen shows a code encoding `SMART_BASKET:<token>`,
"Waiting for cashier validation", and a 10-minute expiry countdown.

---

## 8. Scan the QR with the cashier browser camera

On the laptop, cashier portal (`http://localhost:5173`) → sign in as staff
(dev-default cashier or admin, see `server/.env.example`) → **Cashier
validation** → **Start camera** → allow the camera → hold the phone's QR
screen in frame.

**Expected:** on detection the camera **stops**, the token fills the field, and
one basket lookup runs. The session, customer name (`Demo Client`), line items
(eggs, olive oil) and an estimated subtotal appear.

**Recovery:** camera blocked / unavailable → the "denied" / "unsupported" state
shows and **manual paste** still works: copy the token text and paste it, or
type it, then **Find basket**.

---

## 9. Validate the basket

Click **Approve basket**.

**Expected:** success message ("Basket validated…"); the session status becomes
**validated**; a cashier-validation audit row is recorded and shown.

---

## 10. Confirm the basket clears

Back on the phone: open the **Basket** tab (pull to refresh if needed).

**Expected:** the Smart Basket is **empty** — successful validation cleared the
active cart server-side.

---

## 11. Show validated shopping history

Phone: **Account → Validated Shopping History** → open the most recent entry.

**Expected:** the just-validated basket appears (source: validated smart
basket), with its item snapshot, recorded item count and recorded value, and
the validation timestamp. Only validated sessions appear here.

**Then reopen Home → Recipe Ideas** (pull to refresh if the screen was already
open). The basket is empty, so recommendations must use **validated-history**
semantics: “Inspired by your validated purchases”, “Check what you still have
before cooking”, quantities not verified. They must **not** still say “in your
current basket”, “quantity sufficient”, or that you can make the dish right now.

---

## 12. Show remaining administrator settings (no catalogue write)

Laptop, cashier portal → **Admin** (ADMIN role) → **Settings**.

**Expected:** basket-quantity limit is visible and can be adjusted within the
documented range. There is no Product Intelligence Review tab. Catalogue
membership stays in curated `SB_ProductMetadata`; automatic interpretation
still ranks recipes without an administrator override.

**Do not** change imported catalogue tables.

---

## 13. Switch to French and show localized recipe content

Phone: **Account → language selector → Français.** Return to **Recipe Ideas →
"Omelette nature"**.

**Expected:**

- Recipe title, description, cuisine (`française`), category
  (`petit-déjeuner`) and ingredient labels (`Œufs`, `Beurre ou huile
  d'olive`, `Fromage râpé`, …) are all in **French**.
- The recipe order, the recipe ids, and the requirement logic are **identical**
  to English: **Œufs** → *La recette demande : 3 œufs* · *Détecté : 6 œufs* ·
  **Quantité suffisante**; cooking fat → *Associé à : Huile d'olive*.
- `GET /api/recommendations/recipes?language=fr` (and `…/:recipeId?language=fr`)
  is what the app now calls; `meta.language` echoes `fr`. Anything other than
  `en`/`fr` falls back to English.

**Recovery:** recipe content still English after switching → fully close and
reopen Recipe Ideas (the list refetches on a language change); confirm
`server/src/data/recipes/recipes.fr.json` is present and `npm test` passed.

---

## Reset between runs

- Phone: sign out (checklist is hidden; it is account-scoped, not deleted).
- To reuse the same customer, its checklist and validated history persist.
- To start clean, create a new synthetic customer in step 2.
- The QR snapshot expires on its own after 10 minutes; a new basket generates a
  fresh one.
