import type { TranslationKey } from '../i18n/translations';

// Translates stored English subcategory labels. Unknown values are shown as stored.

// Normalise a stored subcategory for lookup: string, trimmed, lower-cased, inner whitespace collapsed.
export function normalizeSubcategory(value: unknown): string {
  if (typeof value !== 'string') {
    if (value == null) return '';
    value = String(value);
  }
  return (value as string).trim().toLowerCase().replace(/\s+/g, ' ');
}

// Stored subcategory -> translation key.
export const SUBCATEGORY_LABEL_KEY_BY_NORMALIZED: Readonly<Record<string, TranslationKey>> = {
  // English subcategory labels stored for curated products.
  'pasta': 'catalog.subcategory.pasta',
  'rice and grains': 'catalog.subcategory.riceAndGrains',
  'cooking sauces': 'catalog.subcategory.cookingSauces',
  'cooking oil': 'catalog.subcategory.cookingOil',
  'canned fish': 'catalog.subcategory.cannedFish',
  'canned pulses': 'catalog.subcategory.cannedPulses',
  'canned vegetables': 'catalog.subcategory.cannedVegetables',
  'milk': 'catalog.subcategory.milk',
  'dairy': 'catalog.subcategory.dairy',
  'spreads': 'catalog.subcategory.spreads',
  'cheese': 'catalog.subcategory.cheese',
  'baking': 'catalog.subcategory.baking',
  'eggs': 'catalog.subcategory.eggs',
  'tomato products': 'catalog.subcategory.tomatoProducts',
  'biscuits': 'catalog.subcategory.biscuits',
  'cakes': 'catalog.subcategory.cakes',
  'chips': 'catalog.subcategory.chips',
  'snacks': 'catalog.subcategory.snacks',
  'bread': 'catalog.subcategory.bread',
  'tortillas': 'catalog.subcategory.tortillas',
  'yogurt': 'catalog.subcategory.yogurt',
  'soft drinks': 'catalog.subcategory.softDrinks',
  'juice': 'catalog.subcategory.juice',
  'coffee and tea': 'catalog.subcategory.coffeeAndTea',
  'laundry': 'catalog.subcategory.laundry',
  'dishwashing': 'catalog.subcategory.dishwashing',
  'household cleaning': 'catalog.subcategory.householdCleaning',
  'hair care': 'catalog.subcategory.hairCare',
  'bath and body': 'catalog.subcategory.bathAndBody',
  'oral care': 'catalog.subcategory.oralCare',
  'deodorant': 'catalog.subcategory.deodorant',
  'fragrance': 'catalog.subcategory.fragrance',
  'kitchen wrap': 'catalog.subcategory.kitchenWrap',
  'batteries': 'catalog.subcategory.batteries',
  'household sundries': 'catalog.subcategory.householdSundries',

  // Unused English labels from the earlier 33-product demo.
  'water': 'catalog.subcategory.water',
  'cleaning tools': 'catalog.subcategory.cleaningTools',
  'bin bags': 'catalog.subcategory.binBags',
  'paper': 'catalog.subcategory.paper',

  // Older French values still found in some rows.
  'tomate': 'catalog.subcategory.tomatoProducts',
  'oeufs': 'catalog.subcategory.eggs',
  'thon': 'catalog.subcategory.cannedFish',
  'savon': 'catalog.subcategory.bathAndBody',
  'shampoing': 'catalog.subcategory.hairCare',
  'lait': 'catalog.subcategory.milk',
  'jus': 'catalog.subcategory.juice',
  'soda': 'catalog.subcategory.softDrinks',
  'café': 'catalog.subcategory.coffeeAndTea',
  'cafe': 'catalog.subcategory.coffeeAndTea',
  'fromage rapé': 'catalog.subcategory.cheese',
  'fromage rape': 'catalog.subcategory.cheese',
  'fromage portions': 'catalog.subcategory.cheese',
  'pâtes spéciales': 'catalog.subcategory.pasta',
  'pates speciales': 'catalog.subcategory.pasta',
  'olive': 'catalog.subcategory.cookingOil',
  'yaourt': 'catalog.subcategory.yogurt',
  'dentifrice': 'catalog.subcategory.oralCare',
  'déodorants': 'catalog.subcategory.deodorant',
  'deodorants': 'catalog.subcategory.deodorant',
  'soin de linge': 'catalog.subcategory.laundry',
  'crèmes & soins': 'catalog.subcategory.bathAndBody',
  'cremes & soins': 'catalog.subcategory.bathAndBody',
  'stick': 'catalog.subcategory.deodorant',
  'accessoire hygiene': 'catalog.subcategory.fragrance',
  'sauce': 'catalog.subcategory.cookingSauces',
  'pâtes de riz': 'catalog.subcategory.riceAndGrains',
  'pates de riz': 'catalog.subcategory.riceAndGrains',
  'netoyant sanitaire': 'catalog.subcategory.householdCleaning',
  'netoyant spécifique': 'catalog.subcategory.householdCleaning',
  'netoyant specifique': 'catalog.subcategory.householdCleaning',
  'accessoire de netoyage': 'catalog.subcategory.householdCleaning',
};

// English subcategory labels used by the 91 curated products.
export const CURATED_SUBCATEGORIES: readonly string[] = [
  'Baking',
  'Bath and body',
  'Batteries',
  'Biscuits',
  'Bread',
  'Cakes',
  'Canned fish',
  'Canned pulses',
  'Canned vegetables',
  'Cheese',
  'Chips',
  'Coffee and tea',
  'Cooking oil',
  'Cooking sauces',
  'Dairy',
  'Deodorant',
  'Dishwashing',
  'Eggs',
  'Fragrance',
  'Hair care',
  'Household cleaning',
  'Household sundries',
  'Juice',
  'Kitchen wrap',
  'Laundry',
  'Milk',
  'Oral care',
  'Pasta',
  'Rice and grains',
  'Snacks',
  'Soft drinks',
  'Spreads',
  'Tomato products',
  'Tortillas',
  'Yogurt',
];

// Translation key for a stored subcategory, or `null` when it is unknown / empty.
export function subcategoryLabelKey(value: unknown): TranslationKey | null {
  const norm = normalizeSubcategory(value);
  if (norm === '') return null;
  return SUBCATEGORY_LABEL_KEY_BY_NORMALIZED[norm] ?? null;
}

// Translated subcategory, or the stored text if unknown.
export function subcategoryLabel(
  value: string | null | undefined,
  t: (key: TranslationKey) => string,
): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw === '') return '';
  const key = subcategoryLabelKey(raw);
  return key ? t(key) : raw;
}
