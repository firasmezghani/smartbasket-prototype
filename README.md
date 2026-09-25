# SmartBasket Prototype

The database is installed from this repository with Flyway (schema plus the 91-product catalogue seed). See [database setup and test safety](docs/DATABASE_HANDOVER.md). Database-modifying tests require explicit disposable-database opt-in; ordinary tests do not connect to the database.

Independent BSc dissertation prototype for an intelligent mobile shopping
assistant. SmartBasket demonstrates mobile self-checkout with cashier
validation, explainable recipe recommendations, and validated shopping history.
It is not a company storefront and does not process real payments.

## What the application does

**Customer (mobile)**

- Register and sign in
- Browse and search a curated product catalogue (English/French interface)
- Maintain an account-scoped shopping list on the device
- Scan barcodes into a server-backed smart basket
- Generate a time-limited QR code for cashier validation
- View validated purchase history and descriptive personal insights
- Browse recipe ideas ranked from basket evidence, validated history, or a fixed authored baseline

**Staff (web)**

- Cashier sign-in, QR or manual basket lookup, approve or reject
- ADMIN overview and basket-quantity limit settings

After sign-in the mobile app sends the customer id in an `x-customer-id` header. That header is a prototype shortcut, not a secure customer token; admin and cashier use JWT.

No real payment is processed. The prototype does not claim that a physical
basket matches its digital snapshot.

## Repository layout

| Folder | Role |
| --- | --- |
| `mobile/` | Expo / React Native customer app |
| `client/` | React / Vite staff console (cashier + limited ADMIN) |
| `server/` | Express REST API, catalogue reads, baskets, QR sessions, recommendations |
| `docs/` | Architecture, database notes, testing guides, and evaluation evidence |

## Catalogue data versus synthetic demonstration data

- **Catalogue products** in the demonstration database are a **selected subset**
  of authorised imported catalogue rows (91 curated products with barcodes and
  application metadata). Identifiers, names, prices and barcodes are not
  invented for the demo. The company source remains read-only.
- **Customers, carts, QR sessions and cashier validations** used in
  demonstrations and tests are **synthetic**. They are created through the
  normal register / cart / QR APIs on the prototype database. Do not treat
  them as real shoppers or real till transactions.

## Prerequisites

- Node.js 18 or newer, and npm
- Docker, with SQL Server 2022 running in a container named `sqlserver`
- Expo Go on a phone, if you want to run the mobile app on a device
- Flyway is not installed locally. `npm run db:install` runs the Flyway Docker image

## Supported demonstration database and startup

The demonstration database is **`SmartBasketDemo`**. The API listens on port **3001**.

1. From the repository root, install dependencies:

```bash
npm install --prefix server
npm install --prefix client
npm install --prefix mobile
```

2. From the repository root, copy `server/.env.example` to `server/.env` and
   fill in the SQL connection, JWT secret, and cashier and admin usernames and
   bcrypt hashes. The server will not start if `ADMIN_USERNAME`,
   `ADMIN_PASSWORD_HASH`, `CASHIER_USERNAME`, or `CASHIER_PASSWORD_HASH` is
   missing. Never commit `server/.env`.

   From the `server/` folder, create a bcrypt hash with:

```bash
node -e "import('bcryptjs').then(({default:b}) => console.log(b.hashSync('your-password', 12)))"
```

3. Start SQL Server 2022 in Docker (first time only). Choose a strong password
   (at least 8 characters, with upper case, lower case and a number) and put the
   same one in `DB_PASSWORD` in `server/.env`:

```bash
docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=YourStrong!Passw0rd" \
  -p 1433:1433 --name sqlserver -d mcr.microsoft.com/mssql/server:2022-latest
```

   On an Apple Silicon Mac, turn on "Use Rosetta" in Docker Desktop settings
   first. After a restart, run `docker start sqlserver`.

   Then, from the `server/` folder, install the database:

```bash
npm run db:install -- --database SmartBasketDemo
```

This applies `server/db/migration/V1` (schema) and `V2` (91 products, 164
barcodes, metadata and settings), then runs the verification checks. Details:
[docs/DATABASE_HANDOVER.md](docs/DATABASE_HANDOVER.md).

4. From the repository root, start the demonstration API (it uses
   `SmartBasketDemo` on port 3001):

```bash
npm run demo:server
```

5. From the repository root, start the staff console:

```bash
npm run dev:client
```

Vite serves the cashier terminal at `http://localhost:5173` by default.

6. From the `mobile/` folder, start the app:

```bash
npm start
```

Copy `mobile/.env.example` to `mobile/.env` and set `EXPO_PUBLIC_API_BASE_URL`
so a phone can reach the API. Simulators may use loopback.

## Where to read next

| Topic | Document |
| --- | --- |
| Product and data boundary | [docs/THESIS_PRODUCT_SCOPE.md](docs/THESIS_PRODUCT_SCOPE.md) |
| Current architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Database setup and tests | [docs/DATABASE_HANDOVER.md](docs/DATABASE_HANDOVER.md) |
| Current testing entry | [docs/TESTING_CHECKLIST.md](docs/TESTING_CHECKLIST.md) |
| Final-version acceptance cases | [docs/END_TO_END_VALIDATION.md](docs/END_TO_END_VALIDATION.md) |
| Dated evaluation evidence | [docs/evaluation/README.md](docs/evaluation/README.md) |
| Recipe ranking design | [docs/RECIPE_RECOMMENDATION_DESIGN.md](docs/RECIPE_RECOMMENDATION_DESIGN.md) |
| Demo walkthrough | [docs/DEMO_WALKTHROUGH.md](docs/DEMO_WALKTHROUGH.md) |

Product and data rules for the finished prototype:
[docs/THESIS_PRODUCT_SCOPE.md](docs/THESIS_PRODUCT_SCOPE.md).

Shared for academic assessment. All rights reserved. The product data and photos are used with the partner store's permission and are not licensed for reuse.
