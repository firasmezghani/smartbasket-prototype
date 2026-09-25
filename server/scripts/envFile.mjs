import { readFileSync } from 'node:fs';

// Read `KEY=value` lines from a .env file (comments and blank lines skipped).
export function parseEnvFile(filePath) {
  const out = {};
  for (const raw of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}
