import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATALOG_SECTION_KEYS,
  catalogSectionTitleKey,
  parseCatalogSectionsResponse,
  productCountKey,
} from './catalogSections';

test('parseCatalogSectionsResponse always returns the six sections in order', () => {
  const sections = parseCatalogSectionsResponse({ data: [] });
  assert.deepEqual(
    sections.map((s) => s.key),
    ['featured', 'food', 'drinks', 'household', 'personal-care', 'other'],
  );
  assert.ok(sections.every((s) => s.count === 0));
  assert.equal(sections[0].titleKey, 'catalog.sectionFeatured');
  assert.equal(sections[4].titleKey, 'catalog.categoryPersonalCare');
});

test('parseCatalogSectionsResponse maps counts and ignores unknown keys', () => {
  const sections = parseCatalogSectionsResponse({
    data: [
      { key: 'featured', titleKey: 'x', count: 3 },
      { key: 'food', titleKey: 'x', count: 12 },
      { key: 'mystery', count: 99 },
      { key: 'drinks', count: -4 },
      { key: 'other', count: 2.9 },
    ],
  });
  const byKey = Object.fromEntries(sections.map((s) => [s.key, s.count]));
  assert.equal(byKey.featured, 3);
  assert.equal(byKey.food, 12);
  assert.equal(byKey.drinks, 0); // negative clamped
  assert.equal(byKey.other, 2); // truncated
  assert.equal(byKey.household, 0); // missing -> 0
});

test('parseCatalogSectionsResponse tolerates malformed bodies', () => {
  for (const bad of [null, undefined, {}, { data: null }, { data: 'nope' }, 42]) {
    const sections = parseCatalogSectionsResponse(bad as unknown);
    assert.equal(sections.length, 6);
    assert.ok(sections.every((s) => s.count === 0));
  }
});

test('catalogSectionTitleKey covers every section key', () => {
  for (const key of CATALOG_SECTION_KEYS) {
    assert.ok(catalogSectionTitleKey(key).startsWith('catalog.'));
  }
});

test('productCountKey picks singular only for exactly one', () => {
  assert.equal(productCountKey(1), 'catalog.productCountOne');
  assert.equal(productCountKey(0), 'catalog.productCountOther');
  assert.equal(productCountKey(2), 'catalog.productCountOther');
  assert.equal(productCountKey(23220), 'catalog.productCountOther');
  assert.equal(productCountKey(1.4), 'catalog.productCountOne');
});
