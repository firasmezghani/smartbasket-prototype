// Checks the image files in server/product-images/.

import { readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { buildProductImageAssetUrl } from '../src/services/catalog.service.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'product-images');
const MAX_BYTES = 300 * 1024;
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// Recognised image magic numbers → the extensions they may back.
function magicMatches(buf, ext) {
  const hex = buf.toString('hex');
  if (hex.startsWith('ffd8ff')) return ext === '.jpg' || ext === '.jpeg';
  if (hex.startsWith('89504e470d0a1a0a')) return ext === '.png';
  if (hex.startsWith('474946383761') || hex.startsWith('474946383961')) return ext === '.gif';
  // WebP files start with RIFF and have WEBP at byte 8
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') {
    return ext === '.webp';
  }
  return false;
}

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.isFile() && e.name.toLowerCase() !== 'readme.md') acc.push(full);
  }
  return acc;
}

const files = walk(ROOT);
if (files.length === 0) {
  console.log('> server/product-images/ contains no image files yet — nothing to validate.');
  console.log('> Imagery is blocked on approved assets.');
  process.exit(0);
}

let failures = 0;
for (const full of files) {
  const rel = relative(ROOT, full).split('\\').join('/');
  const problems = [];
  const ext = extname(full).toLowerCase();

  if (!ALLOWED_EXT.has(ext)) problems.push(`extension ${ext || '(none)'} not allowed`);
  if (buildProductImageAssetUrl(rel) === null) problems.push('path would be rejected by buildProductImageAssetUrl');

  let size = 0;
  try {
    size = statSync(full).size;
  } catch {
    problems.push('cannot stat file');
  }
  if (size === 0) problems.push('zero-byte file');
  if (size > MAX_BYTES) problems.push(`size ${(size / 1024).toFixed(0)} KB exceeds ${MAX_BYTES / 1024} KB`);

  if (size > 0 && ALLOWED_EXT.has(ext)) {
    try {
      const fd = openSync(full, 'r');
      const head = Buffer.alloc(16);
      readSync(fd, head, 0, 16, 0);
      closeSync(fd);
      if (!magicMatches(head, ext)) problems.push('file header does not match its extension');
    } catch {
      problems.push('cannot read file header');
    }
  }

  if (problems.length === 0) {
    console.log(`ok   ${rel}  (${(size / 1024).toFixed(0)} KB) → ${buildProductImageAssetUrl(rel)}`);
  } else {
    failures += 1;
    console.log(`FAIL ${rel}\n     - ${problems.join('\n     - ')}`);
  }
}

console.log(`\n${files.length - failures}/${files.length} image file(s) valid.`);
process.exit(failures === 0 ? 0 : 1);
