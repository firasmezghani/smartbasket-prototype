// Rules that stop false egg matches (egg slicer, chocolate egg, pet food) counting as ingredients.

import { normaliseForInterpretation } from '../productInterpretation.service.js';

// Each rule has a test on the product text and a short reason.
export const CONTEXTUAL_EXCLUSION_RULES = Object.freeze({
  egg: Object.freeze([
    {
      id: 'kitchen_tool',
      reason: 'Kitchen tool ("egg slicer"), not edible eggs.',
      test: (ctx) => /\b(slicer|trancheur|whisk|fouet)\b/.test(ctx.name),
    },
    {
      id: 'toy',
      reason: 'Toy product, not edible eggs.',
      test: (ctx) => /\b(toy|toys|jouet|jouets)\b/.test(ctx.name),
    },
    {
      id: 'confectionery',
      reason: 'Confectionery/chocolate product, not real eggs.',
      test: (ctx) =>
        /\b(chocolat|chocolate|confiserie|confectionery|bonbon|bonbons)\b/.test(ctx.name) ||
        /\bconfiserie\b/.test(ctx.family) ||
        /\bconfiserie\b/.test(ctx.subFamily),
    },
    {
      id: 'snack_wording',
      reason: '"Crispy" snack wording alongside "egg", not real eggs.',
      test: (ctx) => /\bcrispy\b/.test(ctx.name),
    },
    {
      id: 'pet_food',
      reason: 'Pet food product, not eggs for a recipe.',
      test: (ctx) =>
        /\b(chat|chaton|chien|chiot|cat|kitten|dog|puppy|croquette|croquettes)\b/.test(ctx.name) ||
        /\b(chat|chien|animalerie|pet\s*food)\b/.test(ctx.family) ||
        /\b(chat|chien|animalerie|pet\s*food)\b/.test(ctx.subFamily),
    },
    {
      id: 'storage_accessory',
      reason: 'Egg storage/accessory item, not edible eggs.',
      test: (ctx) =>
        /\bboite\s+a\s+oeuf/.test(ctx.name) ||
        /\b(porte|rangement|range|conservation|presentoir|support)\s+(a\s+)?oeuf/.test(ctx.name),
    },
  ]),
});

// Check a product against the exclusion rules for an ingredient type.
export function evaluateContextualExclusion(product, productType) {
  const rules = CONTEXTUAL_EXCLUSION_RULES[productType];
  if (!rules || rules.length === 0) {
    return { excluded: false, ruleId: null, reason: null };
  }

  const ctx = {
    name: normaliseForInterpretation(product?.name),
    family: normaliseForInterpretation(product?.family),
    subFamily: normaliseForInterpretation(product?.subFamily),
  };

  for (const rule of rules) {
    if (rule.test(ctx)) {
      return { excluded: true, ruleId: rule.id, reason: rule.reason };
    }
  }
  return { excluded: false, ruleId: null, reason: null };
}
