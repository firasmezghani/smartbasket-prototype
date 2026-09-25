# Database setup and test safety

## Supported installation (Flyway, 24 September 2026)

A new SmartBasket demonstration database is installed from the repository
alone with Flyway. It does not need any other database.

| File | Role |
| --- | --- |
| `server/db/migration/V1__create_demo_schema.sql` | Ten application tables, two compatibility views (`TabStocksaico`, `TabStockBarCodesaico`), indexes, constraints and the metadata `UpdatedAt` trigger. |
| `server/db/migration/V2__seed_demo_catalogue.sql` | Public seed: 91 selected catalogue products, 164 barcode mappings, 91 metadata rows (CurationVersion 3, image paths), 1 `SB_AppConfig` and 2 `SB_Settings` rows. No customers, passwords, carts, sessions or validations. Generated, not hand-written. |
| `server/db/verify/verify_demo_install.sql` | Read-only checks run after migrate: Flyway history, ten tables, views, trigger, indexes, 91/164/91. |
| `server/scripts/flyway-install.mjs` (`npm run db:install -- --database <Name>`) | Creates the database if missing, runs `flyway migrate` from the Docker image pinned by digest (Flyway OSS 13.8.0), then the verification. |
| `server/scripts/export-public-seed.mjs` (`npm run db:export-seed`) | Read-only SELECT export from SmartBasketDemo that regenerates V2. Only for deliberately preparing a new seed; never edit an applied migration. |

From `server/`, with SQL Server running in Docker container `sqlserver`
(override with `SQLSERVER_CONTAINER`) and `DB_USER`/`DB_PASSWORD` in
`server/.env`:

```bash
npm run db:install -- --database SmartBasketDemo   # on a machine that has no SmartBasketDemo yet
```

Then set `DB_NAME` to that database and start the app. Product photographs
referenced by `ImagePath` are the files in `server/product-images/`.

Safety rules in the runner: protected catalogue databases and system databases are
always refused; an existing database with tables that Flyway did not create is
refused and left untouched; a second run applies only pending migrations. The
password is passed to Docker through the environment and is not printed; `.env`
is not modified.

Verification (`server/db/verify/verify_demo_install.sql`) checks Flyway history,
the ten tables, views, trigger, indexes, and the 91 products, 164 barcodes, and
91 metadata rows. Customer, cart, and session tables start empty.

The 91 products (names, prices, barcodes) and the product photographs are used
with the partner store's permission.

## Script classification

| Entry point | Classification and target |
| --- | --- |
| run-demo-api.mjs / npm run demo:server | Starts the normal app on 3001; not a test. Startup checks database name/count; subsequent application use writes operational data |
| run-isolated-demo-api.mjs | Second app process on 3002, still uses SmartBasketDemo; a different port does NOT isolate the database |
| verify-isolated-demo-api.mjs | Database-modifying HTTP exercise: registration, basket and cashier operations; NOT a read-only verifier |
| npm run test:db:create | Creates a NEW explicitly designated disposable database and synthetic fixtures; refuses existing targets |
| npm run test:db | Cart concurrency and cashier integration suites; modify only the verified disposable target; run sequentially |
| catalog.curatedMode.integration.test.js; catalogSearch.integration.test.js | Private-catalogue read-only tests; disabled by default. Require SB_PRIVATE_CATALOGUE_READ_TESTS=YES, use DB_NAME from the environment and depend on private data; never combine with disposable-write flags |
| db/migration V1, V2; flyway-install.mjs | Supported install. Creates a new database or applies pending migrations to a Flyway-managed one; refuses protected and non-Flyway databases |
| flyway-migration-sql.test.js | Static checks of V1/V2 and the runner name guard; no database connection |

The install uses Flyway.

## Explicit disposable integration tests

From server/, supply these variables only for the test commands (not in the live
.env file). Choose a new suffix for each fresh installation:

```bash
SB_TEST_DATABASE=SmartBasketTest_my_unique_run SB_TEST_DISPOSABLE=YES npm run test:db:create
SB_TEST_DATABASE=SmartBasketTest_my_unique_run SB_TEST_DISPOSABLE=YES npm run test:db
```

Creation uses the existing connection credentials without changing their file.
The login needs permission to create a database. It reads database existence in
master, refuses an existing target, creates a new database, verifies DB_NAME(),
and adds a database-level disposable marker before schema/fixture writes.
It applies `server/db/migration/V1__create_demo_schema.sql` in memory to the new
database, then inserts synthetic fixtures. It does not copy catalogue rows.

The fixtures are two fictional products, two test barcodes, metadata, safe
settings and one non-login customer. They exist only to test concurrency and
cashier behaviour; they are not a public catalogue or a reproduction of thesis
recommendation results. No images or real customer accounts are copied.

Both mutating suites require the explicit YES flag and a name matching
SmartBasketTest_<suffix>. Protected catalogue database names are rejected
case-insensitively, as are all other names outside that pattern. Tests override
the database only in their own process, then check the actual service pool's
DB_NAME() and disposable marker before enabling tests and before every test.
An opted-in connection/identity failure fails the suite instead of silently
passing as unavailable. A second migrate/provision invocation refuses to replace
an existing database. No automatic drop or reset is provided.

Without opt-in, all four database integration files skip before opening a
connection. Ordinary npm test still runs unit/static tests. A skipped database
case is not a passed acceptance check. Use test:db for writes: it runs the suites
in separate sequential processes because they share global capacity fixtures.
Do not run two test:db commands concurrently against the same disposable target.

Cleanup touches only test fixtures on the disposable target. Failed tests may
leave synthetic rows or a test trigger there; use a new disposable name rather
than resetting the working demonstration. The setup guard and database marker
are protections against accidental targeting, not a substitute for database
permissions. For handover, a login restricted to the disposable database gives
additional isolation; current local credentials may have wider privileges.

## Handover boundaries

Flyway is the install path. No other database is needed. The working app and
its `.env` file are separate from the disposable test procedure.

## Defence explanation

The database is installed with Flyway from two versioned scripts in the
repository: V1 creates the ten-table schema with its views, constraints and
trigger, and V2 seeds the 91 selected real products that the demonstration
uses. Flyway records which versions have run, so an installation is
repeatable and can be checked. A verification script then confirms the schema
and the 91/164/91 catalogue. The full company import is not needed to install.
Database-modifying tests use a separately named disposable database with
fictional fixtures, so key basket and cashier behaviour is checked without
altering the working demonstration.
