# SmartBasket final-version acceptance

Current scope: 91 curated products, ten recipes, English/French customer app, cashier validation and limited administrator functions. Replaces the retired storefront/order/loyalty checklist.

## Evidence rules

Use synthetic prototype accounts and permitted demonstration products. Imported catalogue records remain read-only. Record date, device, build/source version, expected result, observed result and a redacted screenshot. Do not tick a case on the basis of a source review or a different test. See `evaluation/FINAL_EVIDENCE_2026-09-17.md` for what is currently verified.

## Final manual sequence

| ID | Action and expected result | Final-version device observation |
|---|---|---|
| A1 | Sign in as A, add linked and manual list items; switch to B and back to A. A's list returns unchanged; signed-out state hides it. | Full round trip pending; partial isolation observed 6 September |
| A2 | Browse/search in English and French; inspect subcategories; unknown barcode gives an error, recognised non-curated product gives prototype-unavailable feedback. | Final combined sequence pending; bilingual search reported working in prior discussion |
| A3 | Scan or manually enter a code, change quantity, remove item and inspect server totals; linked list entry becomes collected. | Final combined sequence pending |
| A4 | Generate QR; cashier scans it, reviews snapshots and approves. One validated history session appears and current basket clears. | Happy path observed 6 September; final-version rerun pending |
| A5 | Reject a QR; customer basket remains; customer corrects it and generates a new QR. Reusing a decided token must not create another decision. | Pending |
| A6 | Unknown and expired QR tokens give a recoverable message; manual token entry works with denied/no camera access. | Pending |
| A7 | Basket evidence produces ingredient/quantity explanations; clear mapped evidence to check history and fixed fallback separately. Never describe history as current stock. | Automated scorer/API evidence; final device walkthrough pending |
| A8 | ADMIN can change basket capacity via admin app-config; CASHIER is denied those admin routes. (Administrator product-interpretation review was removed on 22 September 2026 and is not a current acceptance case.) | Automated admin-authorization tests exist; final device walkthrough of settings pending |
| A9 | Old basket shows Resume/Start-new once; Resume preserves contents; Start-new requires confirmation. | Automated activity tests; final device walkthrough pending |
| A10 | Normal catalogue action adds to list; direct basket action appears only under the labelled demonstration setting. | Final build/device check pending |
| A11 | Signed-in checklist: scan a linked product, confirm once, return to the same list with draft text preserved and a success notice. Unlisted / name-similar manual rows stay unchecked. Scan tab does not auto-return to the list. | Pending — not exercised on a device or simulator in this session |

Participant recruitment and a usability study are outside this revision. A developer walkthrough can report design observations only, not user satisfaction or measured population usability.
