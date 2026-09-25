// Runs the integration suites one after another so they do not share settings at the same time.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { designatedDatabase } from '../test-support/disposableDatabase.js';
if (!designatedDatabase()) throw new Error('Explicit disposable database opt-in required.');
if (process.env.SB_PRIVATE_CATALOGUE_READ_TESTS) throw new Error('Private catalogue reads must not be enabled.');
for (const file of ['cart.concurrency.integration.test.js','smartBasket.cashierDecision.integration.test.js']) {
  const result=spawnSync(process.execPath,['--test',`src/services/${file}`],{
    cwd:fileURLToPath(new URL('../',import.meta.url)),env:process.env,stdio:'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
