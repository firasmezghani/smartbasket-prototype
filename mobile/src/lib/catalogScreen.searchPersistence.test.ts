import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const screenPath = join(process.cwd(), 'src/screens/CatalogScreen.tsx');

test('CatalogScreen keeps a single FormField outside the product grid', () => {
  const src = readFileSync(screenPath, 'utf8');
  assert.equal((src.match(/<FormField/g) || []).length, 1, 'search FormField must exist exactly once');
  assert.doesNotMatch(src, /const searchField\s*=/, 'must not clone the same element into two trees');
  assert.match(src, /searchChrome/, 'persistent search chrome must wrap the field');
  assert.match(src, /\{searchChrome\}/, 'search chrome must render above the grid');
  assert.doesNotMatch(src, /ListHeaderComponent=\{searchChrome\}/);
  assert.doesNotMatch(src, /renderLanding/);
  assert.match(src, /autoFocus=\{false\}/, 'must not autofocus the search field');
  assert.match(src, /keyboardDismissMode="on-drag"/);
  assert.match(src, /keyboardShouldPersistTaps="handled"/);
  assert.match(src, /createRequestGeneration/);
  assert.match(src, /gen\.isCurrent\(token\)/);
  assert.match(src, /setTimeout\(\s*\(\)\s*=>\s*setDebouncedSearch\(search\.trim\(\)\),\s*350\s*\)/);
  assert.match(src, /catalogChipSelection/);
  assert.match(src, /catalogColumnCount/);
});

test('CatalogScreen starts on All products and does not reset that selection on focus', () => {
  const src = readFileSync(screenPath, 'utf8');
  assert.match(src, /useState<CatalogSelection\s*\|\s*null>\(\{\s*kind:\s*'all'\s*\}\)/);
  assert.match(src, /setSelection\(\{\s*kind:\s*'all'\s*\}\)/);
  assert.doesNotMatch(src, /useFocusEffect/);
  assert.doesNotMatch(src, /setSelection\(null\)/);
});
