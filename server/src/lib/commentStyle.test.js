// Checks that comments stay within 2 lines, with no phase labels, history, dates, emphasis capitals, long dashes or filler words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const ROOTS = ['server/src', 'server/scripts', 'server/test-support', 'client/src', 'mobile/src', 'mobile/App.tsx', 'mobile/index.ts'];
const SKIP_DIRS = new Set(['node_modules', '.test-build', 'dist']);
const MAX_LINES = 2;
const HISTORY = /\b(historical|legacy|deliberately|previously|used to|no longer|originally|old failure mode|this phase)\b/i;
const FILLER = /\b(intentionally|explicitly|authoritative|genuine(ly)?|honest(ly)?|robust|ensures?|leverag\w*|comprehensive|seamless(ly)?|contracts?|semantics?|in order to|note that|it is important|responsible for)\b/i;
const DASH = /[—–]/;
const DIVIDER = /[-=]{6,}/;
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const DATE = new RegExp(`\\b\\d{1,2} (${MONTHS}) \\d{4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b`);
const CAPS = /\b(NOT|NEVER|ONLY|MUST|ALWAYS|EXACTLY|BOTH|NO)\b/;

function listFiles(path) {
  const full = join(repo, path);
  if (statSync(full, { throwIfNoEntry: false })?.isFile()) return [path];
  const out = [];
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(child));
    else if (/\.(m?js|jsx|ts|tsx|css)$/.test(entry.name)) out.push(child);
  }
  return out;
}

function commentBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    let j = i;
    if (t.startsWith('/*') || t.startsWith('{/*')) {
      while (j < lines.length - 1 && !lines[j].includes('*/')) j += 1;
    } else if (t.startsWith('//')) {
      while (j + 1 < lines.length && lines[j + 1].trim().startsWith('//')) j += 1;
    } else continue;
    blocks.push({ start: i + 1, lines: lines.slice(i, j + 1) });
    i = j;
  }
  return blocks;
}

// Comments written after code on the same line, e.g. `x = 1; // note`.
function trailingComments(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    const m = /^\s*[^\s/*{].*?\s\/\/\s(.*)$/.exec(line);
    if (m) out.push({ start: i + 1, lines: [`// ${m[1]}`] });
  });
  return out;
}

function wordingProblems(body) {
  const found = [];
  const prose = body.replace(/`[^`]*`/g, '');
  if (/\bPhase \d/.test(body)) found.push('mentions a phase label');
  if (HISTORY.test(prose)) found.push(`tells history ("${prose.match(HISTORY)[0]}")`);
  if (DATE.test(prose)) found.push(`contains a date ("${prose.match(DATE)[0]}")`);
  if (CAPS.test(prose)) found.push(`uses capitals for emphasis ("${prose.match(CAPS)[0]}")`);
  if (FILLER.test(prose)) found.push(`uses filler wording ("${prose.match(FILLER)[0]}")`);
  if (DASH.test(body)) found.push('uses an em or en dash');
  if (DIVIDER.test(body)) found.push('uses a decorative divider line');
  return found;
}

function forbiddenBlockComments(file, text) {
  if (file.endsWith('.css')) return [];
  const found = [];
  let i = 0;
  let line = 1;
  let lastSig = '';
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === '\n') { line += 1; i += 1; continue; }
    if (c === '"' || c === "'") {
      const q = c; i += 1;
      while (i < n && text[i] !== q) {
        if (text[i] === '\\') i += 1;
        if (text[i] === '\n') line += 1;
        i += 1;
      }
      i += 1; lastSig = 'a'; continue;
    }
    if (c === '`') {
      i += 1; let depth = 0;
      while (i < n) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === '\n') line += 1;
        if (text[i] === '`' && depth === 0) break;
        if (text[i] === '$' && text[i + 1] === '{') { depth += 1; i += 2; continue; }
        if (text[i] === '}' && depth > 0) depth -= 1;
        i += 1;
      }
      i += 1; lastSig = 'a'; continue;
    }
    if (c === '/' && d === '/') {
      while (i < n && text[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && d === '*') {
      const start = line;
      const end = text.indexOf('*/', i + 2);
      const raw = text.slice(i, end < 0 ? n : end + 2);
      const jsx = /\{\s*$/.test(text.slice(text.lastIndexOf('\n', i - 1) + 1, i));
      const directive = /^\s*\/\*+\s*(eslint-|global\b|@ts-|istanbul|jshint|prettier-)/i.test(raw)
        || /eslint-disable|@ts-expect-error|@ts-ignore|@ts-nocheck/.test(raw);
      if (!jsx && !directive) found.push(`${file}:${start} uses a block comment`);
      const extra = raw.split('\n').length - 1;
      line += extra;
      i = end < 0 ? n : end + 2;
      lastSig = 'a';
      continue;
    }
    if (c === '/' && !/[\w)\]$]/.test(lastSig)) {
      i += 1; let cls = false;
      while (i < n && text[i] !== '\n') {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === '[') cls = true;
        else if (text[i] === ']') cls = false;
        else if (text[i] === '/' && !cls) break;
        i += 1;
      }
      i += 1; lastSig = 'a'; continue;
    }
    if (!/\s/.test(c)) lastSig = c;
    i += 1;
  }
  return found;
}

function proseLineCount(blockLines) {
  let count = 0;
  for (const raw of blockLines) {
    const s = raw.trim().replace(/^(\{?\/\*\*?|\*\/\}?|\*|\/\/)\s?/, '').replace(/\*\/\}?$/, '').trim();
    if (s.startsWith('@')) break;
    if (s && !/^[-=*]{3,}$/.test(s)) count += 1;
  }
  return count;
}

test('code comments are short and plain', () => {
  const problems = [];
  for (const root of ROOTS) {
    if (!statSync(join(repo, root), { throwIfNoEntry: false })) continue;
    for (const file of listFiles(root)) {
      const text = readFileSync(join(repo, file), 'utf8');
      for (const block of commentBlocks(text)) {
        if (proseLineCount(block.lines) > MAX_LINES) problems.push(`${file}:${block.start} longer than ${MAX_LINES} lines`);
        for (const p of wordingProblems(block.lines.join('\n'))) problems.push(`${file}:${block.start} ${p}`);
      }
      for (const block of trailingComments(text)) {
        for (const p of wordingProblems(block.lines[0])) problems.push(`${file}:${block.start} ${p}`);
      }
      problems.push(...forbiddenBlockComments(file, text));
    }
  }
  assert.deepEqual(problems, [], `Shorten these comments:\n${problems.join('\n')}`);
});
