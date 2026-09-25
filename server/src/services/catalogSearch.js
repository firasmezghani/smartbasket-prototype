// Bilingual catalogue search: English or French food words also match their translations and types.

import { transliterateLigatures } from './recipe/ingredientMapping.service.js';

// Cap on `LIKE` patterns for one request.
export const CATALOG_SEARCH_MAX_ALIAS_TERMS = 12;
// Hard cap on CanonicalType equality binds for one request.
export const CATALOG_SEARCH_MAX_CANONICAL_TYPES = 8;

// Normalise search text: lower case, no accents or punctuation (numbers kept).
export function normaliseSearchText(text) {
  if (typeof text !== 'string') return '';
  const raw = text.trim();
  if (raw === '') return '';
  const delig = transliterateLigatures(raw);
  const folded = delig.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return folded
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// English/French aliases for the ingredient types used by the recipes (stored normalised).
export const CATALOG_SEARCH_ALIAS_GROUPS = Object.freeze([
  {
    key: 'egg',
    canonicalTypes: Object.freeze(['egg']),
    aliases: Object.freeze(['egg', 'eggs', 'oeuf', 'oeufs', 'uf']),
  },
  {
    key: 'butter',
    canonicalTypes: Object.freeze(['butter']),
    aliases: Object.freeze(['butter', 'beurre']),
  },
  {
    key: 'olive_oil',
    canonicalTypes: Object.freeze(['olive_oil']),
    aliases: Object.freeze(['olive oil', 'huile olive', 'huile d olive', 'huile dolive']),
  },
  {
    key: 'cheese',
    canonicalTypes: Object.freeze(['cheese', 'mozzarella', 'parmesan']),
    aliases: Object.freeze(['cheese', 'fromage']),
  },
  {
    key: 'mozzarella',
    canonicalTypes: Object.freeze(['mozzarella']),
    aliases: Object.freeze(['mozzarella']),
  },
  {
    key: 'parmesan',
    canonicalTypes: Object.freeze(['parmesan']),
    aliases: Object.freeze(['parmesan', 'parmigiano']),
  },
  {
    key: 'flour',
    canonicalTypes: Object.freeze(['flour']),
    aliases: Object.freeze(['flour', 'farine']),
  },
  {
    key: 'milk',
    canonicalTypes: Object.freeze(['milk']),
    aliases: Object.freeze(['milk', 'lait']),
  },
  {
    key: 'sugar',
    canonicalTypes: Object.freeze(['sugar']),
    aliases: Object.freeze(['sugar', 'sucre']),
  },
  {
    key: 'pasta',
    canonicalTypes: Object.freeze(['pasta']),
    aliases: Object.freeze(['pasta', 'pates', 'spaghetti', 'penne']),
  },
  {
    key: 'tomato',
    canonicalTypes: Object.freeze(['tomato']),
    aliases: Object.freeze(['tomato', 'tomatoes', 'tomate', 'tomates']),
  },
  {
    key: 'canned_tuna',
    canonicalTypes: Object.freeze(['canned_tuna']),
    aliases: Object.freeze(['tuna', 'thon', 'canned tuna', 'thon conserve']),
  },
  {
    key: 'mayonnaise',
    canonicalTypes: Object.freeze(['mayonnaise']),
    aliases: Object.freeze(['mayonnaise', 'mayo']),
  },
  {
    key: 'sweetcorn',
    canonicalTypes: Object.freeze(['sweetcorn']),
    aliases: Object.freeze(['sweetcorn', 'sweet corn', 'mais']),
  },
  {
    key: 'chickpeas',
    canonicalTypes: Object.freeze(['chickpeas']),
    aliases: Object.freeze(['chickpeas', 'chick peas', 'pois chiches', 'pois chiche']),
  },
  {
    key: 'rice',
    canonicalTypes: Object.freeze(['rice']),
    aliases: Object.freeze(['rice', 'riz']),
  },
  {
    key: 'mushroom',
    canonicalTypes: Object.freeze(['mushroom']),
    aliases: Object.freeze(['mushroom', 'mushrooms', 'champignon', 'champignons']),
  },
  {
    key: 'peas',
    canonicalTypes: Object.freeze(['peas']),
    aliases: Object.freeze(['peas', 'petit pois', 'petits pois']),
  },
  {
    key: 'tortilla',
    canonicalTypes: Object.freeze(['tortilla']),
    aliases: Object.freeze(['tortilla', 'tortillas']),
  },
  {
    key: 'peanut_butter',
    canonicalTypes: Object.freeze(['peanut_butter']),
    aliases: Object.freeze(['peanut butter', 'beurre de cacahuete', 'beurre cacahuete']),
  },
]);

const ALIAS_INDEX = (() => {
  const map = new Map();
  for (const group of CATALOG_SEARCH_ALIAS_GROUPS) {
    for (const alias of group.aliases) {
      const existing = map.get(alias);
      if (!existing || alias.length > (existing._aliasLength ?? 0)) {
        map.set(alias, group);
      }
    }
  }
  return map;
})();

const ALIASES_LONGEST_FIRST = [...ALIAS_INDEX.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b));

function groupForNormalisedQuery(normalized) {
  for (const alias of ALIASES_LONGEST_FIRST) {
    if (normalized === alias) return ALIAS_INDEX.get(alias);
  }
  return null;
}

// Expand a search string into search terms and ingredient types.
export function expandCatalogSearch(raw) {
  const original = typeof raw === 'string' ? raw.trim() : '';
  if (original === '') {
    return {
      mode: 'none',
      original: '',
      normalised: '',
      foodAlias: false,
      terms: [],
      canonicalTypes: [],
    };
  }

  const normalised = normaliseSearchText(original);
  const group = normalised ? groupForNormalisedQuery(normalised) : null;
  if (group) {
    const terms = [];
    for (const alias of group.aliases) {
      if (!terms.includes(alias) && terms.length < CATALOG_SEARCH_MAX_ALIAS_TERMS) terms.push(alias);
    }
    if (!terms.includes(original.toLowerCase()) && original.trim() !== '' && terms.length < CATALOG_SEARCH_MAX_ALIAS_TERMS) {
      const originalNorm = normaliseSearchText(original);
      if (originalNorm && !terms.includes(originalNorm)) terms.push(originalNorm);
    }
    return {
      mode: 'alias',
      original,
      normalised,
      foodAlias: true,
      terms,
      canonicalTypes: [...group.canonicalTypes].slice(0, CATALOG_SEARCH_MAX_CANONICAL_TYPES),
    };
  }

  return {
    mode: 'literal',
    original,
    normalised,
    foodAlias: false,
    terms: [original],
    canonicalTypes: [],
  };
}

// Escape `LIKE` wildcards (the value is still passed as a parameter).
export function escapeLikePattern(s) {
  return String(s)
    .replace(/!/g, '!!')
    .replace(/%/g, '!%')
    .replace(/_/g, '!_')
    .replace(/\[/g, '![')
    .replace(/\]/g, '!]');
}

function nameLikePredicate(paramName) {
  return `(
      s.LibArt LIKE ${paramName} ESCAPE '!' OR
      s.CodArt LIKE ${paramName} ESCAPE '!' OR
      (m.DisplayName IS NOT NULL AND m.DisplayName LIKE ${paramName} ESCAPE '!') OR
      (m.CleanDisplayNameFr IS NOT NULL AND m.CleanDisplayNameFr LIKE ${paramName} ESCAPE '!') OR
      (s.Marque IS NOT NULL AND s.Marque LIKE ${paramName} ESCAPE '!') OR
      (s.ExLibArtWeb IS NOT NULL AND s.ExLibArtWeb LIKE ${paramName} ESCAPE '!') OR
      (s.ExLibArt IS NOT NULL AND s.ExLibArt LIKE ${paramName} ESCAPE '!') OR
      (m.DisplaySubcategory IS NOT NULL AND m.DisplaySubcategory LIKE ${paramName} ESCAPE '!')
    )`;
}

// Build the parameterised SQL search condition. A food alias matches food
// products only, never household or personal-care items.
export function buildCatalogSearchFilter(rawSearch) {
  const expansion = expandCatalogSearch(rawSearch);
  if (expansion.mode === 'none') {
    return { expansion, sql: '', binds: [] };
  }

  const binds = [];

  if (expansion.mode === 'literal') {
    const terms = [expansion.original];
    if (
      expansion.normalised
      && expansion.normalised !== expansion.original
      && expansion.normalised !== expansion.original.toLowerCase()
    ) {
      terms.push(expansion.normalised);
    }
    const clauses = terms.slice(0, CATALOG_SEARCH_MAX_ALIAS_TERMS).map((term, index) => {
      const name = index === 0 ? 'searchPattern' : `searchPattern${index}`;
      binds.push({ name, value: `%${escapeLikePattern(term)}%` });
      return nameLikePredicate(`@${name}`);
    });
    return { expansion, sql: `(${clauses.join(' OR ')})`, binds };
  }

  const canonicalParams = expansion.canonicalTypes
    .slice(0, CATALOG_SEARCH_MAX_CANONICAL_TYPES)
    .map((type, index) => {
      const name = `searchCanonical${index}`;
      binds.push({ name, value: type });
      return `@${name}`;
    });
  const likeClauses = expansion.terms.slice(0, CATALOG_SEARCH_MAX_ALIAS_TERMS).map((term, index) => {
    const name = `searchAlias${index}`;
    binds.push({ name, value: `%${escapeLikePattern(term)}%` });
    return nameLikePredicate(`@${name}`);
  });
  const canonicalSql = canonicalParams.length
    ? `m.CanonicalType IN (${canonicalParams.join(', ')})`
    : '1 = 0';
  const aliasNameSql = likeClauses.length ? likeClauses.join('\n        OR ') : '1 = 0';
  return {
    expansion,
    sql: `(
      ${canonicalSql}
      OR (
        m.CanonicalType IS NULL
        AND m.DisplayCategory IN (N'food', N'drinks')
        AND (${aliasNameSql})
      )
    )`,
    binds,
  };
}
