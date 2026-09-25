import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateContextualExclusion, CONTEXTUAL_EXCLUSION_RULES } from './productInterpretationExclusions.js';

test('only "egg" has rules today; an unknown/other product type never excludes', () => {
  // Deterministic: the same input always yields the same (deep-equal) result.
  assert.deepEqual(
    evaluateContextualExclusion({ name: 'EGG SLICER' }, 'egg'),
    evaluateContextualExclusion({ name: 'EGG SLICER' }, 'egg'),
  );
  assert.deepEqual(evaluateContextualExclusion({ name: 'EGG SLICER' }, 'pasta'), { excluded: false, ruleId: null, reason: null });
  assert.deepEqual(evaluateContextualExclusion({ name: 'EGG SLICER' }, null), { excluded: false, ruleId: null, reason: null });
  assert.ok(Object.keys(CONTEXTUAL_EXCLUSION_RULES).length === 1 && CONTEXTUAL_EXCLUSION_RULES.egg);
});

// --- real false positives that must stay excluded from egg recipe evidence ---

test('EGG SLICER is excluded as a kitchen tool', () => {
  const r = evaluateContextualExclusion({ name: 'EGG SLICER' }, 'egg');
  assert.equal(r.excluded, true);
  assert.equal(r.ruleId, 'kitchen_tool');
  assert.match(r.reason, /kitchen tool/i);
});

test('names containing TOY or TOYS are excluded', () => {
  for (const name of ['OEUF SURPRISE TOY', 'TOYS EGG SET', 'JOUET OEUF SURPRISE']) {
    const r = evaluateContextualExclusion({ name }, 'egg');
    assert.equal(r.excluded, true, name);
    assert.equal(r.ruleId, 'toy', name);
  }
});

test('chocolate/confectionery products containing EGG/EGGS are excluded', () => {
  for (const name of ['OEUFS CHOCOLAT 100G', 'CHOCOLATE EGG 150G', 'OEUF EN CHOCOLAT']) {
    const r = evaluateContextualExclusion({ name }, 'egg');
    assert.equal(r.excluded, true, name);
    assert.equal(r.ruleId, 'confectionery', name);
  }
  // Family or subfamily context alone (`CONFISERIE`) also excludes.
  const r = evaluateContextualExclusion({ name: 'OEUFS SPECIAL PAQUES', family: 'CONFISERIE' }, 'egg');
  assert.equal(r.excluded, true);
  assert.equal(r.ruleId, 'confectionery');
});

test('CRISPY EGGS is excluded (snack wording)', () => {
  const r = evaluateContextualExclusion({ name: 'CRISPY EGGS 200G' }, 'egg');
  assert.equal(r.excluded, true);
  assert.equal(r.ruleId, 'snack_wording');
});

test('pet food (kitten/cat/dog) products containing chicken/egg wording are excluded', () => {
  for (const name of [
    'CROQUETTES CHAT POULET OEUF',
    'KITTEN FOOD EGG PROTEIN',
    'DOG FOOD CHICKEN AND EGG',
    'PATE CHIEN OEUF',
  ]) {
    const r = evaluateContextualExclusion({ name }, 'egg');
    assert.equal(r.excluded, true, name);
    assert.equal(r.ruleId, 'pet_food', name);
  }
  const r = evaluateContextualExclusion({ name: 'OEUFS FRAIS 30', family: 'ANIMALERIE' }, 'egg');
  assert.equal(r.excluded, true);
});

test('egg storage/accessory (box FOR eggs, not a box OF eggs) is excluded', () => {
  for (const name of ['BOITE A OEUFS PLASTIQUE', 'PORTE OEUFS INOX', 'RANGE OEUFS FRIGO', 'CONSERVATION OEUFS']) {
    const r = evaluateContextualExclusion({ name }, 'egg');
    assert.equal(r.excluded, true, name);
    assert.equal(r.ruleId, 'storage_accessory', name);
  }
});

// --- real products that must be preserved (never excluded) ---

test('real egg-box products are never excluded (no false rejection)', () => {
  for (const name of ['BOITE DE 06 OEUFS', 'BOITE DE 15 OEUFS', 'BOITE DE 30 OEUFS', 'OEUFS FRAIS X6', 'DOUZAINE OEUFS']) {
    const r = evaluateContextualExclusion({ name }, 'egg');
    assert.deepEqual(r, { excluded: false, ruleId: null, reason: null }, name);
  }
});

test('a generic product unrelated to eggs is unaffected even with adjacent keywords elsewhere', () => {
  // "chien" (dog) appears, but productType is not egg -> no rule set applies.
  const r = evaluateContextualExclusion({ name: 'CROQUETTES CHIEN POULET' }, 'chicken');
  assert.deepEqual(r, { excluded: false, ruleId: null, reason: null });
});

test('every rule returns a distinct id and a human-readable reason', () => {
  const ids = CONTEXTUAL_EXCLUSION_RULES.egg.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const rule of CONTEXTUAL_EXCLUSION_RULES.egg) {
    assert.ok(rule.reason.length > 0 && rule.reason.length < 200);
  }
});
