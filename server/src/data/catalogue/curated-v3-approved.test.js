import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const artifactPath = join(dirname(fileURLToPath(import.meta.url)), 'curated-v3-approved.json');

const FALSE_POSITIVE_IDS = new Set([
  '028D8FC8-CD26-4B5B-A8AB-D37BF03AD884', // Pril lemon detergent
  'AA0571B3-EC42-479D-944B-9549C8CC3278', // cucumber soap
]);

describe('approved curated catalogue v3 artifact', () => {
  const data = JSON.parse(readFileSync(artifactPath, 'utf8'));

  it('records approval of the 91-product selection', () => {
    assert.equal(data.proposalVersion, '3.5A-3');
    assert.equal(data.curationVersion, 3);
    assert.equal(data.approvedCount, 91);
    assert.ok(data.approvedAt);
    assert.match(String(data.$note ?? ''), /user approved/i);
    assert.match(String(data.displayNameLimitation ?? ''), /not independently human-authored|not a separately authored translation/i);
  });

  it('contains exactly 91 unique source product IDs with barcode and price coverage', () => {
    assert.ok(Array.isArray(data.products));
    assert.equal(data.products.length, 91);
    const ids = new Set();
    for (const p of data.products) {
      const id = String(p.productId).toUpperCase();
      assert.equal(ids.has(id), false, `duplicate ${id}`);
      ids.add(id);
      assert.equal(p.barcodePresent, true, id);
      assert.equal(p.pricePresent, true, id);
      assert.ok(['food', 'drinks', 'household', 'personal-care', 'other'].includes(p.category), id);
    }
    assert.equal(data.composition.barcodeCoverage, 91);
    assert.equal(data.composition.priceCoverage, 91);
  });

  it('keeps CanonicalType null for catalogue-only food/drink and non_food only for genuine non-food', () => {
    let recipeEligible = 0;
    let catalogueOnly = 0;
    let genuineNonFood = 0;
    const byCategory = { food: 0, drinks: 0, household: 0, 'personal-care': 0, other: 0 };
    for (const p of data.products) {
      byCategory[p.category] += 1;
      if (p.recipeEligible) {
        recipeEligible += 1;
        assert.ok(p.canonicalType && p.canonicalType !== 'non_food', p.productId);
        assert.equal(p.category, 'food');
      } else if (p.canonicalType === 'non_food') {
        genuineNonFood += 1;
        assert.ok(['household', 'personal-care', 'other'].includes(p.category), p.productId);
        assert.equal(p.recipeEligible, false);
      } else {
        catalogueOnly += 1;
        assert.equal(p.canonicalType, null);
        assert.ok(['food', 'drinks'].includes(p.category), p.productId);
      }
      if (p.category === 'drinks') {
        assert.notEqual(p.canonicalType, 'non_food', `drink labelled non_food: ${p.productId}`);
        assert.equal(p.recipeEligible, false);
      }
    }
    assert.equal(recipeEligible, 35);
    assert.equal(catalogueOnly, 30);
    assert.equal(genuineNonFood, 26);
    assert.deepEqual(byCategory, data.composition.byDisplayCategory);
    assert.equal(data.composition.recipeEligible, 35);
    assert.equal(data.composition.catalogueOnlyFoodOrDrink, 30);
    assert.equal(data.composition.genuineNonFood, 26);
  });

  it('does not mark contextual false-positive controls as recipe-eligible', () => {
    const fps = data.products.filter((p) => FALSE_POSITIVE_IDS.has(String(p.productId).toUpperCase()));
    assert.equal(fps.length, 2);
    for (const p of fps) {
      assert.equal(p.recipeEligible, false, p.productId);
      assert.equal(p.canonicalType, 'non_food');
      assert.equal(p.functionalRole, 'false_positive_control');
    }
  });

  it('stores a controlled English DisplaySubcategory on every product', () => {
    const allowed = new Set([
      'Baking', 'Bath and body', 'Batteries', 'Biscuits', 'Bread', 'Cakes',
      'Canned fish', 'Canned pulses', 'Canned vegetables', 'Cheese', 'Chips',
      'Coffee and tea', 'Cooking oil', 'Cooking sauces', 'Dairy', 'Deodorant',
      'Dishwashing', 'Eggs', 'Fragrance', 'Hair care', 'Household cleaning',
      'Household sundries', 'Juice', 'Kitchen wrap', 'Laundry', 'Milk',
      'Oral care', 'Pasta', 'Rice and grains', 'Snacks', 'Soft drinks',
      'Spreads', 'Tomato products', 'Tortillas', 'Yogurt',
    ]);
    const leftoverFrench = [
      'Tomate', 'Oeufs', 'Thon', 'Savon', 'Shampoing', 'Café', 'Légumes', 'Beurre',
    ];
    for (const p of data.products) {
      assert.ok(allowed.has(p.subcategory), `${p.productId} has uncontrolled subcategory "${p.subcategory}"`);
      assert.equal(leftoverFrench.includes(p.subcategory), false, p.productId);
    }
    assert.match(String(data.subcategoryContract ?? ''), /controlled English/i);
  });
});
