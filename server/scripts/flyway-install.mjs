#!/usr/bin/env node
// Installs a database with Flyway and checks it (run: npm run db:install -- --database <Name>).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnvFile } from './envFile.mjs';

// Pinned by digest so every install uses the same Flyway build.
export const FLYWAY_IMAGE =
  'flyway/flyway@sha256:b33cf0249b9f7dc2f2737c22cad266ad270b37ff2740415a138407cb69e5d0e3';
export const PROTECTED = new Set(['smartbasket', 'saico', 'master', 'model', 'msdb', 'tempdb']);
export const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;

export function checkTargetName(name) {
  if (!name || !NAME_PATTERN.test(name)) return 'database name must be letters, digits or underscores, starting with a letter';
  if (PROTECTED.has(name.toLowerCase())) return `${name} is protected and is never a Flyway target`;
  return null;
}

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(msg) {
  console.error(`Refusing: ${msg}`);
  process.exit(1);
}

async function main() {
  const i = process.argv.indexOf('--database');
  const database = i > -1 ? process.argv[i + 1] : undefined;
  const nameError = checkTargetName(database);
  if (nameError) fail(`${nameError}. Usage: node scripts/flyway-install.mjs --database <Name>`);

  const fileEnv = parseEnvFile(join(serverRoot, '.env'));
  const user = fileEnv.DB_USER || 'sa';
  const password = fileEnv.DB_PASSWORD;
  if (!password) fail('DB_PASSWORD missing from server/.env');
  const container = process.env.SQLSERVER_CONTAINER || 'sqlserver';
  const childEnv = { ...process.env, SQLCMDPASSWORD: password, FLYWAY_PASSWORD: password };

  function sqlcmd(args, input) {
    const r = spawnSync(
      'docker',
      ['exec', '-i', '-e', 'SQLCMDPASSWORD', container, '/opt/mssql-tools18/bin/sqlcmd',
        '-S', 'localhost', '-U', user, '-C', '-b', '-h', '-1', '-W', ...args],
      { input, encoding: 'utf8', env: childEnv },
    );
    if (r.status !== 0) {
      process.stderr.write(r.stdout || '');
      process.stderr.write(r.stderr || '');
      fail(`sqlcmd exited with ${r.status}`);
    }
    return r.stdout;
  }

  const state = sqlcmd(['-Q', `SET NOCOUNT ON;
    IF DB_ID(N'${database}') IS NULL SELECT 'missing'
    ELSE IF OBJECT_ID(N'[${database}].dbo.flyway_schema_history', N'U') IS NOT NULL SELECT 'flyway'
    ELSE IF EXISTS (SELECT 1 FROM [${database}].sys.tables) SELECT 'unmanaged'
    ELSE SELECT 'empty'`]).trim();

  if (state === 'unmanaged') {
    fail(`${database} already contains tables that Flyway did not create. It is left untouched.`);
  }
  if (state === 'missing') {
    sqlcmd(['-Q', `CREATE DATABASE [${database}] COLLATE SQL_Latin1_General_CP1_CI_AS;`]);
    console.log(`Created database ${database}.`);
  } else {
    console.log(`Database ${database} exists (${state}); Flyway will apply only pending migrations.`);
  }

  const flyway = spawnSync(
    'docker',
    ['run', '--rm', '--network', `container:${container}`, '-e', 'FLYWAY_PASSWORD',
      '-v', `${join(serverRoot, 'db/migration')}:/flyway/sql:ro`,
      FLYWAY_IMAGE,
      `-url=jdbc:sqlserver://localhost:1433;databaseName=${database};encrypt=true;trustServerCertificate=true`,
      `-user=${user}`, '-locations=filesystem:/flyway/sql', '-validateMigrationNaming=true',
      'migrate'],
    { encoding: 'utf8', env: childEnv, stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (flyway.status !== 0) fail(`flyway migrate exited with ${flyway.status}`);

  const verify = readFileSync(join(serverRoot, 'db/verify/verify_demo_install.sql'));
  process.stdout.write(sqlcmd(['-d', database], verify));
  console.log(`\n${database} installed by Flyway and verified. server/.env was not modified.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
