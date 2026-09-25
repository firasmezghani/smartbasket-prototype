# SmartBasket Prototype: Product and Data Scope

## Purpose

SmartBasket is an independent research prototype developed for a BSc Computer
Science dissertation, **"An Intelligent Mobile Shopping Assistant"**. It
investigates how a mobile self-checkout workflow can be combined with an
explainable recipe recommendation feature and evaluated in a controlled retail
setting.

The application name is **SmartBasket**. It is deliberately neutral and does not
represent or advertise the organisation that provided authorised access to
selected catalogue data.

## Intended users and setting

The intended customers are adult supermarket shoppers in Tunisia using English or French. Cashiers and a limited administrator role support the workflow. This is a controlled academic prototype, not a production deployment or a claim of legal compliance. Country-specific privacy requirements and research ethics are discussed in the dissertation. The code does not provide a complete regulatory configuration or rights/retention workflow.

`fallbackRank` is a fixed authored baseline and late tie-break, not measured popularity. The scorer explicitly prioritises essential coverage before the weighted score.

## User experiences

### Customer mobile app

The mobile application provides:

- Account registration and sign-in
- Product catalogue browsing and search. Search accepts controlled English and
  French food vocabulary (for example `tomato`/`tomate`, `egg`/`œufs`,
  `milk`/`lait`, `cheese`/`fromage`) regardless of the active interface
  language. This is a deterministic server-side alias expansion over the
  curated catalogue, not machine translation of product names.
- Account-scoped shopping-list planning with three explicit entry contracts:
  (1) a catalogue-linked product stored by product id; (2) a generic ingredient
  type the customer chooses from the reviewed CanonicalType allowlist
  (for example “Milk — choose brand in store”); (3) an unrestricted
  personal note. Typed text is never converted into a type. Exact product-id
  matching still takes priority. A compatible generic entry is offered only
  after confirmation, and several possible entries require selection. Pack
  sizes stay distinct: confirming a 6-egg box does not complete a larger
  planned quantity. Recipe substitutions are not shopping substitutes.
  The list is saved per customer id; a signed-out customer sees a
  signed-out state rather than an editable list, and each account's list is
  isolated from every other account's. A signed-in checklist can open a
  dedicated Home-stack scan session that shares the Scan-tab implementation,
  confirms one unit into the smart basket, then returns to the same list.
  An unchecked row may open that session: a manual row carries only its id
  and requires “add to basket and check”; a generic-type row checks the
  scanned package against that CanonicalType and shows the brand/package
  before add; a catalogue-linked row also carries
  the expected product id so a different product can be rejected before add.
  General checklist scanning never selects a row by name. The checklist field
  can suggest catalogue products from the existing search endpoint; choosing a
  suggestion stores that product id, a distinguished generic choice stores the
  canonical key, and an explicit personal-note action
  stores unlinked text. After a confirmed basket add from the catalogue demo
  action or a general scan, an exact linked checklist match is checked
  without opening a matching dialog. Remaining compatible generic types can
  be completed only if the customer confirms the package. Ordinary add-success
  notices do not offer personal-note assignment; remaining unchecked
  manual notes can be
  matched only from the note's More menu (Match with basket). That optional flow
  remains a reviewable confirmation (product and note shown together; save
  only on Confirm match). Matching a product already in the basket checks the list
  only. This is a safeguard against accidental selection, not a claim that a
  free-text note can be validated automatically.
  The Scan tab itself never inherits that return destination. Catalogue
  browsing stays available on empty and populated lists without replacing the
  in-store scan action.
- Automatic checking of a linked list item when its product is added to the
  smart basket. Manual names are not bound to a scanned brand or product.
- One prompt to Resume or Start-new when re-opening a smart basket that has
  been left untouched past a server-defined inactivity threshold (default
  24 hours). The basket is never auto-deleted; server activity data, not the
  device clock, decides.
- Barcode scanning with manual-entry fallback
- Product details and server-provided prices
- Smart-basket quantity changes and item removal
- Running basket totals calculated by the server
- Basket QR generation for cashier validation
- While the QR screen is focused and the app is in the foreground, the phone
  polls the **displayed** session about every three seconds (no overlapping
  requests). There are no push notifications; backgrounded or blurred screens
  do not update automatically. Approval, rejection, expiry and cancellation
  replace the QR with an explicit outcome. A rejected basket is kept; only
  server-side approval clears it. A secondary **Show basket code** action
  reveals the same full token the cashier paste field accepts.
- Validated shopping history after cashier approval, kept for traceability only
- Explainable recipe recommendations with short, deterministic explanations
  (see "Intelligent recipe recommendation" below)
- **My recipes** — account-scoped, device-local recipes the customer writes
  themselves (title, ingredient names, optional recipe amounts, optional
  instructions). They are not part of the authored recommendation dataset or
  its evaluation. Adding ingredients to the shopping list is a reviewed step:
  exact product, supported generic type, or personal note, chosen by the
  customer. Recipe amounts are not package counts and do not claim ingredient
  availability. There is no cloud sync, image upload, or sharing in this pass.
- Account profile, language, validated history and sign-out. Aggregate customer analytics and recipe-interaction logging are not implemented.

Customer “Validated Shopping History” contains only the signed-in customer’s
cashier-validated smart-basket sessions (`SB_SmartBasketSessions` with
`Status = N'validated'`), their item snapshots, and cashier validation records
where available. Website orders, pending or confirmed pickup orders, and
rejected, expired, cancelled, or active smart baskets are not displayed. This
is a read/display-scope change: existing database rows and tables were not
deleted. Mobile pickup-order screens were removed. Customer purchase-history
endpoints were narrowed to this validated-only contract. Recipe-history
evidence already uses validated smart baskets only.

The application does not process payment. Dated, bounded evaluation results are recorded in `docs/evaluation`; they do not establish commercial impact.

### Staff web console

The web application provides only the staff workflow required by the prototype:

- Staff authentication
- Basket QR scanning by browser camera (`@zxing/browser`, opened only on an
  explicit "Start camera" action), with **Paste basket code** / hardware-scanner
  token entry as the fallback in every state. The paste field accepts the same
  full `SMART_BASKET:` payload shown on the phone, not a short spoken code.
- Review of products, quantities, prices, and total
- Optional labelled **simulated basket weight** panel on new QR sessions when
  `SIMULATED_BASKET_WEIGHT=true`. This is frozen fictional fixture arithmetic
  (integer grams, coverage of product lines vs basket units). It is not a
  scale reading, not theft detection, and does not approve or reject a session.
  Older sessions and demo-disabled sessions show an unavailable state.
  A future physical-scale check would compare a measured reading to this
  frozen arithmetic; that comparison, a connected scale, and theft scoring
  are not implemented.
- Clear handling of expired, unknown, or previously validated baskets, then a
  **Next customer** action that resets local lookup state only
- Basket approval or rejection, with one non-payment notice at the decision
- Confirmation of a simulated (non-payment) transaction record

Earlier prototype iterations also contained a public storefront, an online
checkout, promotional-content tools, loyalty administration, and a management
dashboard. Those earlier modules were removed. The current `client/` renders
cashier validation for both staff roles, plus a protected ADMIN area for an
overview and basket-capacity settings. Server authorization enforces the role
boundary. Administrator product-interpretation review was removed on
22 September 2026; automatic name interpretation, contextual exclusions, and
the exact/high reliability gate remain.

## Intelligent recipe recommendation

The principal intelligent component is an **explainable recipe recommendation
system**. Given what the customer is buying now (or has previously bought), it
surfaces recipes they can mostly already make and shows *whether the recipe is
ready*, *what is missing*, and *which evidence source applied* (current basket,
past purchases, or a non-personalised popular idea). Verbose repeated
evidence-source explanations are not the primary card content.

### Evidence hierarchy (exclusive, in order)

Exactly one evidence source is used for a given request; sources are **never
mixed** in one ranking:

1. **Current mapped basket.** The customer's current smart-basket products are
   mapped to canonical ingredient keys through the effective interpretation
   service. If at least one eligible product maps, that key
   set is the evidence.
2. **Otherwise, validated shopping history.** Used only when the basket produces
   no mapped ingredient key. Restricted to cashier-validated basket sessions;
   rejected, expired, cancelled and active sessions are excluded.
3. **Otherwise, a popularity fallback.** Used only when neither the basket nor
   validated history produces a mapped ingredient key. Recipes are ordered by an
   authored fallback rank, not by scoring an empty ingredient set.

### Behaviour and guarantees

- **`personalised: true` means customer-specific shopping evidence (mapped
  basket or validated history) was used.** It does **not** mean the system has
  inferred the customer's tastes or preferences. Popularity results are always
  `personalised: false`.
- **Confidence is a fixed mapping label** (`exact`, `high`, `medium`, `low`,
  `none`) attached to how a product matched an ingredient rule. It is **not** a
  probability, a score, or a statistical confidence, and is never presented as
  one.
- Recipe ranking is driven by essential-ingredient coverage. Popularity is
  excluded from the score. Ranking compares essential coverage first and weighted score second. When these are equal and both recipes have no
  missing essentials, the more specific recipe (more matched essential
  requirements) ranks first; `fallbackRank` and `recipeId` follow. Specificity
  and popularity never override better essential coverage.
- **Missing ingredients may link to catalogue products.** Only missing
  ingredients whose catalogue match is *sufficiently reliable*
  (`exact`, `high`, or `medium` confidence) can become shopping-list additions;
  the shipped API additionally applies the effective-interpretation gate to
  catalogue candidates. Automatic ingredient evidence requires exact/high
  type confidence and no contextual exclusion. Medium/low/none, ambiguous,
  or unresolved automatic interpretations do not contribute. At most one
  catalogue product is linked per missing requirement group.
- The method is **deterministic and explainable**: pure functions, no runtime
  LLM, no external AI service, no recipe API, no web scraping, no clock, no
  randomness. The same inputs always produce the same ranking and the same
  explanation.
- It is **not a chatbot and not a generative-AI system**. Explanation text is
  assembled from structured fields (matched / missing ingredients, coverage,
  evidence source).
- **Bilingual (EN/FR).** The recommendation endpoints accept `?language=en|fr`
  (anything else safely resolves to `en`; echoed in `meta.language`) and return
  recipe titles, descriptions, cuisine, category and ingredient labels in that
  language from an **authored** overlay in the versioned dataset
  (`server/src/data/recipes/recipes.fr.json`) — no runtime machine translation.
  Recipe ids, ranking and the structured requirement contract are identical
  across locales. Imported catalogue product names are never translated.

### Data and safety boundaries for this feature

- The recipe dataset (canonical English `recipes.json` + the authored French
  display overlay `recipes.fr.json`) and the product→ingredient mapping rules
  are **synthetic**, authored for this prototype, and stored only as versioned
  repository JSON — never in the database.
- Company catalogue data is **read-only**. The recommender never receives a
  company catalogue row directly; a caller passes a small
  `{ name, family, category, description, brand }` object.
- All prototype writes remain isolated in prototype-owned `SB_*` operational tables. The
  recommender itself performs no writes.
- **No real payment occurs** anywhere in the system.
- Cashier validation is a prototype traceability workflow. It does **not** verify
  the physical contents of a basket and is **not** evidence of theft prevention.

### Offline evaluation (implemented 5 September 2026)

A reproducible offline comparison of the ingredient-coverage recommender against
the non-personalised popularity baseline is implemented in
`server/src/evaluation/` and run with `npm run evaluate:recommendations`
(artifacts under `docs/evaluation/`, design in
`RECIPE_RECOMMENDATION_DESIGN.md` §12). It reports Hit@K, MRR, Precision@K,
Recall@K, essential-ingredient coverage and missing-essential counts over ten
manually labelled synthetic retrieval scenarios, plus separate guardrail
scenarios. **It is a small curated regression benchmark against explicit
synthetic relevance labels: it measures scenario suitability and expected
system behaviour, not real customer preference, population-level performance or
commercial impact.** Some candidate measures from research question 2 (NDCG@K,
catalogue coverage, response time) are not yet covered. No commercial-impact
claims are made.

### Catalogue

The customer app shows 91 products from the partner store's catalogue, with
barcodes, prices, and photos used with permission. Details:
[CURATED_PROTOTYPE_CATALOGUE.md](CURATED_PROTOTYPE_CATALOGUE.md). The ten
recipes can all be demonstrated on this set.

The catalogue data stays read-only. Application metadata lives in
`dbo.SB_ProductMetadata`. `CATALOGUE_MODE=curated` is the customer default.

## Authorised company data

The current engineering assumption is that selected product-catalogue data may be
read from the company database with permission. Exact permitted tables, fields,
images, retention conditions, and reporting restrictions must be recorded in the
project data audit.

Permitted catalogue access does not authorise unrestricted use of customer,
employee, supplier, stock-operation, or transaction data. Those sources require
separate explicit permission.

### Mandatory separation

Company source tables remain read-only. Prototype-created information is stored
in separate application tables (`SB_*`), including:

- Prototype user accounts
- Active basket sessions and basket items
- Simulated transactions and transaction items
- Cashier validation records
- Runtime configuration (`SB_AppConfig` basket limit)
- Analytics and recipe-interaction events are not implemented.

The current shopping-list implementation is stored locally on the customer's
device as prototype-owned planning data, under a versioned key scoped to the
customer id (`smartBasketShoppingListV2:customer:<id>`). It is not written to
company tables or to any server table.

The `GET /api/cart` response carries, in addition to the basket lines and
server-calculated totals, non-authoritative lifecycle hints derived from the
`SB_CartItems` timestamps: `lastActivityAt`, `serverTime`, `stale`, and
`staleThresholdMs`. These drive only the Resume / Start-new prompt; every
basket mutation is still re-checked and priced by the server. No new endpoint
was added — "Start new basket" reuses `DELETE /api/cart`.

Synthetic users and transaction histories remain the default for demonstrations,
tests, screenshots, and usability sessions unless an approved alternative is
documented.

## Research and ethical limits

- No real payment details are collected or processed.
- The system does not claim to verify the physical contents of a basket.
- Cashier validation is a prototype control, not proof of theft prevention.
- Recommendations are described as based on **implicit, incomplete** evidence;
  they never claim to know customer preferences.
- Validated history is incomplete shopping evidence, not proof of preference or current household stock. Aggregate customer analytics are outside the implemented scope.
- Human-participant data collection begins only after ethical approval.
- Dissertation screenshots and examples must not reveal confidential identifiers,
  internal infrastructure, credentials, or identifiable company records.

## Initial acceptance criteria

The first refined release is complete when:

1. No visible company branding, loyalty, promotion, or online-order language
   remains.
2. The web client exposes the cashier workflow and protected Admin support
   functions, with separate staff roles enforced by the API.
3. A customer can scan or select a product, edit the basket, generate a QR token,
   and have the basket validated by a cashier.
4. All authoritative totals are calculated by the backend.
5. Company catalogue access is read-only and prototype writes are isolated in
   operational `SB_*` tables; imported catalogue copies remain read-only at runtime.
6. Synthetic data can run the complete workflow without a company connection.
7. The explainable recipe recommendation feature is implemented end to end
   (dataset, product→ingredient mapping, evidence hierarchy, ranking, structured
   explanations, catalogue-linked missing ingredients). The deterministic
   offline evaluation against the popularity baseline is implemented and
   runnable (`npm run evaluate:recommendations`); it is a small curated
   synthetic-label benchmark, not a real-preference or population-level study.

Database provisioning and destructive maintenance are explicitly excluded from
the browser application. Required schema migrations are run offline by an
authorised developer or database administrator.
