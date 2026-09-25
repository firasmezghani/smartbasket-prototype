import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

// Repeated-character and fixture ids. Not partner-store products.
const ALLOWED_GUIDS = new Set([
  '11111111-1111-1111-1111-111111111111',
  'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
  'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB',
  'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC',
  'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEE0001',
  'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEE0002',
]);

// Placeholder barcodes, the simulator example, and GIF87a / GIF89a hex.
const ALLOWED_DIGIT_RUNS = new Set([
  '0000000000000',
  '00000000000006',
  '111111111111',
  '8699096965533',
  '474946383761',
  '474946383961',
]);

const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.xls', '.xlsx']);

function publishedSets() {
  const sql = readFileSync(join(root, 'server/db/migration/V2__seed_demo_catalogue.sql'), 'utf8');
  const guids = new Set(
    [...sql.matchAll(/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}/g)]
      .map((m) => m[0].toUpperCase()),
  );
  const start = sql.indexOf('INSERT INTO dbo.SB_ProductBarcodes');
  const rest = sql.slice(start);
  const next = rest.indexOf('INSERT INTO', 1);
  const section = rest.slice(0, next);
  const barcodes = new Set([...section.matchAll(/\(N'([^']*)'/g)].map((m) => m[1]));
  return { guids, barcodes };
}

test('tracked files only contain the published product ids and barcodes', () => {
  const { guids, barcodes } = publishedSets();
  assert.equal(guids.size, 91);
  assert.equal(barcodes.size, 164);
  const files = [];
  const skipDir = new Set(['node_modules', 'dist', '.test-build']);
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skipDir.has(entry.name) || entry.name === '.env' || entry.name.startsWith('.env.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full.slice(root.length + 1));
    }
  }
  for (const top of ['server', 'client', 'mobile', 'docs']) walk(join(root, top));
  const guidRe = /[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}/g;
  const barRe = /(?<![0-9])[0-9]{12,14}(?![0-9])/g;
  const problems = [];
  for (const file of files) {
    if (!/^(server|client|mobile|docs)\//.test(file)) continue;
    const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
    if (BINARY_EXT.has(ext)) continue;
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    text.split('\n').forEach((line, index) => {
      for (const match of line.matchAll(guidRe)) {
        const id = match[0].toUpperCase();
        if (!guids.has(id) && !ALLOWED_GUIDS.has(id)) {
          problems.push(`${file}:${index + 1} product id ${id}`);
        }
      }
      for (const match of line.matchAll(barRe)) {
        if (!barcodes.has(match[0]) && !ALLOWED_DIGIT_RUNS.has(match[0])) {
          problems.push(`${file}:${index + 1} barcode ${match[0]}`);
        }
      }
    });
  }
  assert.deepEqual(problems, []);
});

function productImagePaths(sql) {
  const start = sql.indexOf('INSERT INTO dbo.SB_ProductMetadata');
  const rest = sql.slice(start);
  const next = rest.indexOf('INSERT INTO', 10);
  const section = next === -1 ? rest : rest.slice(0, next);
  return [...section.matchAll(/, NULL, N'([^']+\.(?:jpg|jpeg|png|webp))'/gi)].map((m) => m[1]);
}

test('product photos match V2 and recipe photos are wired', () => {
  const sql = readFileSync(join(root, 'server/db/migration/V2__seed_demo_catalogue.sql'), 'utf8');
  const paths = productImagePaths(sql);
  const dir = join(root, 'server/product-images');
  const files = readdirSync(dir).filter((name) => name !== 'README.md');
  const pathSet = new Set(paths);
  const fileSet = new Set(files);
  assert.deepEqual(files.filter((name) => !pathSet.has(name)).sort(), []);
  assert.deepEqual(paths.filter((name) => !fileSet.has(name)).sort(), []);

  const recipesDir = join(root, 'mobile/assets/recipes');
  const images = readdirSync(recipesDir).filter((name) => /\.(png|jpe?g|webp|gif)$/i.test(name));
  const sourcePath = join(root, 'mobile/src/lib/recipeImages.ts');
  const source = readFileSync(sourcePath, 'utf8');
  const required = [...source.matchAll(/require\('([^']+)'\)/g)].map((match) => match[1]);
  const requiredNames = required.map((rel) => rel.slice(rel.lastIndexOf('/') + 1));
  assert.deepEqual(images.filter((name) => !requiredNames.includes(name)).sort(), []);
  const missing = required.filter((rel) => !existsSync(join(dirname(sourcePath), rel)));
  assert.deepEqual(missing, []);
});
