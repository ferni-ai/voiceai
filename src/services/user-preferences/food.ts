/**
 * Food & cooking — the `food` domain of the preference profile.
 *
 * Dietary needs are SAFETY-CRITICAL:
 *   - Any stored allergy/intolerance is honoured, whatever its confidence or
 *     evidence count (erring toward caution is always right here).
 *   - getDietaryConstraints(userId) is the single read for every food, recipe,
 *     meal-plan, grocery and restaurant suggestion.
 *   - Medically advised restrictions (`medical:*`) are health data: they are only
 *     returned/captured when the health category is enabled (see setHealthConsentCheck).
 *
 * Keys: allergy|intolerance|diet|medical (needs) · cuisine|dish|comfort|ingredient|drink|restaurant
 * (tastes) · signature|recipe|equipment|routine|cooksFor|goal (cooking) · single keys
 * spiceTolerance, cookingSkill.
 *
 * @module services/user-preferences/food
 */

import { createLogger } from '../../utils/safe-logger.js';
import { isActive } from './rules.js';
import { listPreferences, upsertPreference } from './store.js';
import type { AllergySeverity, InterestPerson, UserPreference } from './types.js';

const log = createLogger({ module: 'UserPreferenceFood' });

// ── health consent integration point ─────────────────────────────────────────

type HealthConsentCheck = (userId: string) => Promise<boolean>;

/** Default: the user's Health switch (services/memory-consent). Off until they agree. */
const consentServiceCheck: HealthConsentCheck = async (userId) => {
  const { isCategoryEnabled } = await import('../memory-consent/store.js');
  return isCategoryEnabled(userId, 'health');
};
let healthConsentCheck: HealthConsentCheck = consentServiceCheck;

/**
 * The health-category consent check used for medically advised restrictions.
 * Wired to the memory-consent service by default; tests may replace it.
 * Allergies and intolerances never consult it (safety exception).
 */
export function setHealthConsentCheck(check: HealthConsentCheck): void {
  healthConsentCheck = check;
}

export async function isHealthCategoryEnabled(userId: string): Promise<boolean> {
  try {
    return await healthConsentCheck(userId);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Health consent check failed; treating as disabled');
    return false;
  }
}

// ── constraints ──────────────────────────────────────────────────────────────

export interface Allergen {
  readonly item: string;
  readonly severity?: AllergySeverity;
}

export interface DietaryConstraints {
  readonly allergies: readonly Allergen[];
  readonly intolerances: readonly Allergen[];
  /** Dietary patterns: vegetarian, vegan, kosher, halal, keto, gluten-free… */
  readonly diets: readonly string[];
  /** Medically advised restrictions (only when the health category is enabled). */
  readonly medical: readonly string[];
  /** Soft: ingredients/dishes they dislike. */
  readonly dislikes: readonly string[];
  /** Every term a suggestion must never contain (allergens + intolerances + medical). */
  readonly hardAvoid: readonly string[];
}

const EMPTY: DietaryConstraints = {
  allergies: [],
  intolerances: [],
  diets: [],
  medical: [],
  dislikes: [],
  hardAvoid: [],
};

function items(prefs: readonly UserPreference[], prefix: string): UserPreference[] {
  return prefs.filter((p) => p.domain === 'food' && p.key.startsWith(`${prefix}:`));
}

/** Pure: constraints from profile docs. */
export function constraintsFrom(
  prefs: readonly UserPreference[],
  healthEnabled: boolean
): DietaryConstraints {
  const allergen = (p: UserPreference): Allergen => ({
    item: p.value.toLowerCase(),
    ...(p.details?.severity ? { severity: p.details.severity } : {}),
  });
  const allergies = items(prefs, 'allergy').map(allergen);
  const intolerances = items(prefs, 'intolerance').map(allergen);
  const diets = items(prefs, 'diet')
    .filter(isActive)
    .map((p) => p.value.toLowerCase());
  const medical = healthEnabled ? items(prefs, 'medical').map((p) => p.value.toLowerCase()) : [];
  const dislikes = prefs
    .filter(
      (p) =>
        p.domain === 'food' &&
        p.sentiment === 'dislike' &&
        /^(ingredient|dish|cuisine|drink):/.test(p.key)
    )
    .map((p) => p.value.toLowerCase());
  return {
    allergies,
    intolerances,
    diets,
    medical,
    dislikes,
    hardAvoid: [...allergies.map((a) => a.item), ...intolerances.map((a) => a.item), ...medical],
  };
}

export async function getDietaryConstraints(
  userId: string | undefined
): Promise<DietaryConstraints> {
  if (!userId || userId === 'anonymous') return EMPTY;
  const [prefs, health] = await Promise.all([
    listPreferences(userId),
    isHealthCategoryEnabled(userId),
  ]);
  return constraintsFrom(prefs, health);
}

/** Allergen families: "nuts" also means almonds, cashews… */
const FAMILIES: Readonly<Record<string, readonly string[]>> = {
  nut: [
    'nut',
    'nuts',
    'almond',
    'cashew',
    'walnut',
    'pecan',
    'pistachio',
    'hazelnut',
    'macadamia',
    'peanut',
  ],
  'tree nut': ['almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia'],
  peanut: ['peanut', 'peanuts', 'peanut butter', 'satay'],
  shellfish: [
    'shellfish',
    'shrimp',
    'prawn',
    'crab',
    'lobster',
    'clam',
    'mussel',
    'oyster',
    'scallop',
  ],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'anchovy', 'sardine', 'tilapia'],
  dairy: [
    'dairy',
    'milk',
    'cheese',
    'butter',
    'cream',
    'yogurt',
    'yoghurt',
    'parmesan',
    'mozzarella',
    'ghee',
  ],
  lactose: ['milk', 'cheese', 'cream', 'yogurt', 'ice cream', 'lactose'],
  egg: ['egg', 'eggs', 'mayonnaise', 'mayo', 'meringue'],
  gluten: ['gluten', 'wheat', 'flour', 'bread', 'pasta', 'barley', 'rye', 'couscous', 'noodle'],
  wheat: ['wheat', 'flour', 'bread', 'pasta', 'couscous'],
  soy: ['soy', 'soya', 'tofu', 'edamame', 'tempeh', 'miso', 'soy sauce'],
  sesame: ['sesame', 'tahini'],
};

const MEAT = [
  'chicken',
  'beef',
  'pork',
  'bacon',
  'ham',
  'sausage',
  'turkey',
  'lamb',
  'steak',
  'prosciutto',
  'pepperoni',
  'gelatin',
];
const SEAFOOD = [...FAMILIES.fish, ...FAMILIES.shellfish];
const ANIMAL = [...FAMILIES.dairy, ...FAMILIES.egg, 'honey'];
const DIET_EXCLUDES: Readonly<Record<string, readonly string[]>> = {
  vegetarian: [...MEAT, ...SEAFOOD],
  vegan: [...MEAT, ...SEAFOOD, ...ANIMAL],
  pescatarian: MEAT,
  'gluten-free': FAMILIES.gluten,
  'gluten free': FAMILIES.gluten,
  'dairy-free': FAMILIES.dairy,
  'dairy free': FAMILIES.dairy,
  halal: ['pork', 'bacon', 'ham', 'prosciutto', 'pepperoni', 'wine', 'beer'],
  kosher: ['pork', 'bacon', 'ham', 'shellfish', 'shrimp', 'crab', 'lobster'],
  keto: ['sugar', 'bread', 'pasta', 'rice', 'potato'],
};

export function expandAllergen(term: string): string[] {
  const t = term.toLowerCase().replace(/s$/, '');
  return [
    ...new Set([term.toLowerCase(), t, ...(FAMILIES[t] ?? FAMILIES[term.toLowerCase()] ?? [])]),
  ];
}

function mentions(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\W)${escaped}(s|es)?(\\W|$)`, 'i').test(text);
}

export interface FoodLike {
  readonly name: string;
  readonly ingredients?: readonly ({ readonly name: string } | string)[];
  readonly dietaryTags?: readonly string[];
}

/**
 * Pure: why a dish/recipe breaks the constraints, or null when it is safe.
 * Hard (allergy/intolerance/medical/diet) only; dislikes are left to ranking.
 */
export function violationOf(food: FoodLike, c: DietaryConstraints): string | null {
  const text = [
    food.name,
    ...(food.ingredients ?? []).map((i) => (typeof i === 'string' ? i : i.name)),
  ].join(' | ');
  for (const a of [...c.allergies, ...c.intolerances]) {
    const hit = expandAllergen(a.item).find((t) => mentions(text, t));
    if (hit) return `contains ${hit} (${c.allergies.includes(a) ? 'allergy' : 'intolerance'})`;
  }
  for (const m of c.medical) if (mentions(text, m)) return `contains ${m} (doctor's advice)`;
  for (const diet of c.diets) {
    const tags = (food.dietaryTags ?? []).map((t) => t.replace(/_/g, '-').toLowerCase());
    if (tags.includes(diet) || tags.includes(diet.replace(' ', '-'))) continue;
    const hit = (DIET_EXCLUDES[diet] ?? []).find((t) => mentions(text, t));
    if (hit) return `has ${hit} (${diet})`;
  }
  return null;
}

export function filterSafe<T extends FoodLike>(foods: readonly T[], c: DietaryConstraints): T[] {
  return foods.filter((f) => violationOf(f, c) === null);
}

/** Restaurant booking: dietary needs to pass along as special requests. */
export function dietaryRequestsFor(
  c: DietaryConstraints,
  existing: readonly string[] = []
): string[] {
  const out = [...existing];
  const add = (s: string): void => {
    if (!out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  };
  c.allergies.forEach((a) =>
    add(
      `${a.item} allergy${a.severity === 'severe' || a.severity === 'anaphylactic' ? ' (severe)' : ''}`
    )
  );
  c.intolerances.forEach((a) => add(`${a.item} intolerance`));
  c.diets.forEach(add);
  return out;
}

/** One spoken sentence reminding about allergies, or '' when there are none. */
export function allergyReminder(c: DietaryConstraints): string {
  if (c.allergies.length === 0) return '';
  const list = c.allergies.map((a) => a.item).join(' and ');
  return `Heads up: you're allergic to ${list}, so mention it when you order.`;
}

// ── profile ──────────────────────────────────────────────────────────────────

export interface RecipeMemory {
  readonly id: string;
  readonly name: string;
  readonly outcome?: string;
  readonly opinion?: string;
  readonly status?: string;
  readonly lastMentionedAt?: string;
  readonly relatedPeople: readonly InterestPerson[];
}

export interface FoodProfile {
  readonly dietary: DietaryConstraints;
  readonly tastes: {
    readonly cuisines: readonly string[];
    readonly dishes: readonly string[];
    readonly comfortFoods: readonly string[];
    readonly drinks: readonly string[];
    readonly restaurants: readonly string[];
    readonly dislikes: readonly string[];
    readonly spiceTolerance?: string;
  };
  readonly cooking: {
    readonly skill?: string;
    readonly signatureDishes: readonly string[];
    readonly recipes: readonly RecipeMemory[];
    readonly equipment: readonly string[];
    readonly routines: readonly string[];
    readonly cooksFor: readonly InterestPerson[];
    readonly goals: readonly string[];
  };
  /** Gentle follow-ups: recent recipes/goals with no outcome yet ("How did the sourdough turn out?"). */
  readonly followUps: readonly RecipeMemory[];
}

const FOLLOW_UP_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function foodProfileFrom(
  prefs: readonly UserPreference[],
  healthEnabled: boolean,
  now = Date.now()
): FoodProfile {
  const food = prefs.filter((p) => p.domain === 'food');
  const liked = (prefix: string) =>
    items(food, prefix)
      .filter((p) => p.sentiment !== 'dislike' && isActive(p))
      .map((p) => p.value);
  const single = (key: string) => food.find((p) => p.key === key && isActive(p))?.value;
  const recipe = (p: UserPreference): RecipeMemory => ({
    id: p.id,
    name: p.value,
    ...(p.details?.outcome ? { outcome: p.details.outcome } : {}),
    ...(p.details?.opinion ? { opinion: p.details.opinion } : {}),
    ...(p.details?.status ? { status: p.details.status } : {}),
    ...(p.details?.lastMentionedAt ? { lastMentionedAt: p.details.lastMentionedAt } : {}),
    relatedPeople: p.details?.relatedPeople ?? [],
  });
  const recipes = [...items(food, 'recipe'), ...items(food, 'goal')].map(recipe);
  return {
    dietary: constraintsFrom(prefs, healthEnabled),
    tastes: {
      cuisines: liked('cuisine'),
      dishes: liked('dish'),
      comfortFoods: liked('comfort'),
      drinks: liked('drink'),
      restaurants: liked('restaurant'),
      dislikes: food.filter((p) => p.sentiment === 'dislike').map((p) => p.value),
      ...(single('spiceTolerance') ? { spiceTolerance: single('spiceTolerance') } : {}),
    },
    cooking: {
      ...(single('cookingSkill') ? { skill: single('cookingSkill') } : {}),
      signatureDishes: liked('signature'),
      recipes: items(food, 'recipe').map(recipe),
      equipment: liked('equipment'),
      routines: liked('routine'),
      cooksFor: items(food, 'cooksFor').flatMap(
        (p) => p.details?.relatedPeople ?? [{ name: p.value }]
      ),
      goals: liked('goal'),
    },
    followUps: recipes.filter(
      (r) =>
        !r.outcome && r.lastMentionedAt && now - Date.parse(r.lastMentionedAt) < FOLLOW_UP_WINDOW_MS
    ),
  };
}

export async function getFoodProfile(userId: string): Promise<FoodProfile> {
  const [prefs, health] = await Promise.all([
    listPreferences(userId),
    isHealthCategoryEnabled(userId),
  ]);
  return foodProfileFrom(prefs, health);
}

/**
 * Deliberate dietary settings from other tools (e.g. meal-planning's
 * trackDietaryPreferences) — written as user settings so they beat anything inferred.
 */
export async function recordDietarySettings(
  userId: string | undefined,
  settings: {
    allergies?: readonly string[];
    restrictions?: readonly string[];
    disliked?: readonly string[];
  }
): Promise<number> {
  if (!userId || userId === 'anonymous') return 0;
  const writes: { key: string; value: string; sentiment?: 'dislike' }[] = [
    ...(settings.allergies ?? []).map((a) => ({ key: `allergy:${a}`, value: a.toLowerCase() })),
    ...(settings.restrictions ?? []).map((r) => {
      const v = r.toLowerCase().replace(/_/g, '-');
      return { key: `diet:${v}`, value: v };
    }),
    ...(settings.disliked ?? []).map((d) => ({
      key: `ingredient:${d}`,
      value: d.toLowerCase(),
      sentiment: 'dislike' as const,
    })),
  ];
  let saved = 0;
  for (const w of writes) {
    const r = await upsertPreference(userId, {
      domain: 'food',
      key: w.key,
      value: w.value,
      ...(w.sentiment ? { sentiment: w.sentiment } : {}),
      details: {},
      source: 'explicit',
      confidence: 1,
      userEdited: true,
    });
    if (r.preference) saved += 1;
  }
  return saved;
}
