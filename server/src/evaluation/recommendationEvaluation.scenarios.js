// Made-up baskets for the offline recommendation evaluation.

function product(id, name, extra = {}) {
  return Object.freeze({ id, name, ...extra });
}

export const RECOMMENDATION_EVALUATION_SCENARIO_VERSION = 2;

export const RECOMMENDATION_EVALUATION_SCENARIOS = Object.freeze([
  {
    id: 'basket-omelette-six-eggs-olive-oil',
    description: 'A six-egg retail pack and olive oil should make the omelette a strong match.',
    basketProducts: [
      product('egg-6', 'BOITE DE 06 OEUFS', { family: 'CREMERIE', basketQuantity: 1 }),
      product('oil-500', 'HUILE D OLIVE EXTRA VIERGE 500 ML', { family: 'EPICERIE', basketQuantity: 1 }),
    ],
    historyProducts: [],
    relevantRecipeIds: ['classic-omelette'],
    expectedEvidenceSource: 'basket',
    checks: [
      { recipeId: 'classic-omelette', requirementKey: 'egg', statuses: ['sufficient'], availableAmount: 6, availableUnit: 'piece' },
      { recipeId: 'classic-omelette', requirementKey: 'butter', statuses: ['matched'], matchedKey: 'olive_oil' },
    ],
  },
  {
    id: 'basket-tomato-pantry-pasta',
    description: 'Pasta, tomato concentrate and olive oil target tomato pantry pasta.',
    basketProducts: [
      product('pasta', 'SPAGHETTI 500 G', { basketQuantity: 1 }),
      product('tomato', 'CONCENTRE DE TOMATE 400 G', { basketQuantity: 1 }),
      product('oil', 'OLIVE OIL 500 ML', { basketQuantity: 1 }),
    ],
    historyProducts: [],
    relevantRecipeIds: ['tomato-pantry-pasta'],
    expectedEvidenceSource: 'basket',
  },
  {
    id: 'basket-mushroom-pea-rice',
    description: 'Rice, canned mushrooms, peas and olive oil target mushroom and pea rice.',
    basketProducts: [
      product('rice', 'RICE 1 KG', { basketQuantity: 1 }),
      product('mushroom', 'CHAMPIGNON MUSHROOMS 400 G', { basketQuantity: 1 }),
      product('peas', 'PETIT POIS 400 G', { basketQuantity: 1 }),
      product('oil', 'OLIVE OIL 500 ML', { basketQuantity: 1 }),
    ],
    historyProducts: [],
    relevantRecipeIds: ['mushroom-pea-rice'],
    expectedEvidenceSource: 'basket',
  },
  {
    id: 'basket-chickpea-tomato-stew',
    description: 'Chickpeas, tomato concentrate and olive oil target chickpea tomato stew.',
    basketProducts: [
      product('chickpeas', 'CHICKPEAS 400 G', { basketQuantity: 1 }),
      product('tomato', 'CONCENTRE DE TOMATE 400 G', { basketQuantity: 1 }),
      product('oil', 'OLIVE OIL 500 ML', { basketQuantity: 1 }),
    ],
    historyProducts: [],
    relevantRecipeIds: ['chickpea-tomato-stew'],
    expectedEvidenceSource: 'basket',
  },
  {
    id: 'basket-fluffy-pancakes',
    description: 'Flour, eggs and milk target fluffy pancakes when peanut butter is absent.',
    basketProducts: [
      product('flour', 'FARINE 1 KG', { basketQuantity: 1 }),
      product('eggs', 'BOITE DE 06 OEUFS', { basketQuantity: 1 }),
      product('milk', 'MILK 1 L', { basketQuantity: 1 }),
    ],
    historyProducts: [],
    relevantRecipeIds: ['fluffy-pancakes'],
    expectedEvidenceSource: 'basket',
    expectedFirstRecipeId: 'fluffy-pancakes',
  },
  {
    id: 'basket-peanut-butter-pancakes',
    description: 'The pancake batter plus peanut butter should prefer the more specific pancake recipe.',
    basketProducts: [
      product('flour', 'FARINE 1 KG', { basketQuantity: 1 }),
      product('eggs', 'BOITE DE 06 OEUFS', { basketQuantity: 1 }),
      product('milk', 'MILK 1 L', { basketQuantity: 1 }),
      product('pb', 'BEURRE DE CACAHUETE 330 G', { basketQuantity: 1 }),
    ],
    historyProducts: [],
    relevantRecipeIds: ['peanut-butter-pancakes'],
    expectedEvidenceSource: 'basket',
    expectedFirstRecipeId: 'peanut-butter-pancakes',
  },
  {
    id: 'basket-rice-pudding',
    description: 'Rice, milk and sugar target rice pudding at the approved family quantities.',
    basketProducts: [
      product('rice', 'RICE 1 KG', { basketQuantity: 1 }),
      product('milk', 'MILK 1 L', { basketQuantity: 1 }),
      product('sugar', 'SUCRE 1 KG', { basketQuantity: 1 }),
    ],
    historyProducts: [],
    relevantRecipeIds: ['rice-pudding'],
    expectedEvidenceSource: 'basket',
  },
  {
    id: 'basket-tuna-pasta-salad-sufficient',
    description: 'Two 130 g tuna cans (260 g) plus pasta and mayonnaise meet the 250 g tuna requirement.',
    basketProducts: [
      product('pasta', 'PENNE 500 G', { basketQuantity: 1 }),
      product('tuna', 'THON MARISSA 130GR', { basketQuantity: 2 }),
      product('mayo', 'MAYONNAISE 480 ML JADIDA', { basketQuantity: 1 }),
    ],
    historyProducts: [],
    relevantRecipeIds: ['tuna-pasta-salad'],
    expectedEvidenceSource: 'basket',
    checks: [
      { recipeId: 'tuna-pasta-salad', requirementKey: 'canned_tuna', statuses: ['sufficient'], availableAmount: 260, availableUnit: 'g' },
    ],
  },
  {
    id: 'history-only-pasta',
    description: 'When the basket has no usable mapping, validated history supplies presence evidence, not current inventory.',
    basketProducts: [product('unknown-current', 'REFERENCE PRODUIT 4488')],
    historyProducts: [
      product('history-pasta', 'SPAGHETTI'),
      product('history-tomato', 'TOMATO'),
      product('history-oil', 'OLIVE OIL'),
    ],
    relevantRecipeIds: ['tomato-pantry-pasta'],
    expectedEvidenceSource: 'history',
  },
  {
    id: 'basket-priority-over-history',
    description: 'Mapped current-basket evidence must take priority over a different history pattern.',
    basketProducts: [
      product('eggs-current', 'BOITE DE 06 OEUFS', { basketQuantity: 1 }),
      product('oil-current', 'OLIVE OIL 500 ML', { basketQuantity: 1 }),
    ],
    historyProducts: [
      product('history-pasta', 'SPAGHETTI'),
      product('history-tomato', 'TOMATO'),
    ],
    relevantRecipeIds: ['classic-omelette'],
    expectedEvidenceSource: 'basket',
  },
  {
    id: 'guardrail-insufficient-eggs',
    description: 'Two eggs are present but must not be described as sufficient for a three-egg omelette.',
    basketProducts: [
      product('egg-2', 'BOITE DE 02 OEUFS', { family: 'CREMERIE', basketQuantity: 1 }),
      product('oil', 'OLIVE OIL 500 ML', { basketQuantity: 1 }),
    ],
    historyProducts: [],
    relevantRecipeIds: [],
    includeInRetrievalMetrics: false,
    expectedEvidenceSource: 'basket',
    checks: [
      { recipeId: 'classic-omelette', requirementKey: 'egg', statuses: ['insufficient'], availableAmount: 2, availableUnit: 'piece' },
    ],
  },
  {
    id: 'guardrail-insufficient-tuna',
    description: 'One 130 g tuna can is present but must not be described as sufficient for a 250 g tuna pasta salad.',
    basketProducts: [
      product('pasta', 'PENNE 500 G', { basketQuantity: 1 }),
      product('tuna', 'THON MARISSA 130GR', { basketQuantity: 1 }),
      product('mayo', 'MAYONNAISE 480 ML JADIDA', { basketQuantity: 1 }),
    ],
    historyProducts: [],
    relevantRecipeIds: [],
    includeInRetrievalMetrics: false,
    expectedEvidenceSource: 'basket',
    checks: [
      { recipeId: 'tuna-pasta-salad', requirementKey: 'canned_tuna', statuses: ['insufficient'], availableAmount: 130, availableUnit: 'g' },
    ],
  },
  {
    id: 'guardrail-non-food-egg-language',
    description: 'Kitchen tools, confectionery and pet food containing egg words must not become egg evidence.',
    basketProducts: [
      product('egg-slicer', 'EGG SLICER', { family: 'USTENSILES' }),
      product('chocolate-eggs', 'OEUFS CHOCOLAT 100G', { family: 'CONFISERIE', basketQuantity: 1 }),
      product('pet-eggs', 'CROQUETTES CHAT POULET OEUF', { family: 'ANIMALERIE', basketQuantity: 1 }),
    ],
    historyProducts: [],
    relevantRecipeIds: [],
    includeInRetrievalMetrics: false,
    expectedEvidenceSource: 'popularity',
    expectedMappedIngredientKeys: [],
  },
  {
    id: 'guardrail-cold-start',
    description: 'No mapped evidence should use the authored popularity fallback without personalised claims.',
    basketProducts: [],
    historyProducts: [],
    relevantRecipeIds: [],
    includeInRetrievalMetrics: false,
    expectedEvidenceSource: 'popularity',
    expectedFirstRecipeId: 'classic-omelette',
  },
]);
