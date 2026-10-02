/**
 * Stores that hold sensitive-category data, registered for "how much is
 * stored" and "delete it all" (see category-data.ts).
 *
 * - every category: extracted facts that belong to it (category label or
 *   classifier match), deleted through memory control so tombstones and
 *   cascades apply;
 * - health: the health memory items, the mood timeline, and medically advised
 *   food restrictions. Allergies and intolerances are NOT deleted: they are a
 *   safety exception and stay whatever the Health switch says.
 *
 * Money and beliefs stores: register yours here.
 *
 * @module services/memory-consent/builtin-category-stores
 */

import { registerCategoryStore } from './category-data.js';
import { categoryForFactType, sensitiveCategoriesOf } from './classifier.js';
import { SENSITIVE_CATEGORIES, type SensitiveCategory } from './types.js';

const FACT_LABELS: Readonly<Record<SensitiveCategory, readonly string[]>> = {
  health: ['health'],
  finances: ['finance', 'finances', 'money'],
  beliefs: ['belief', 'beliefs', 'faith'],
};

async function factIdsIn(userId: string, category: SensitiveCategory): Promise<string[]> {
  const { listMemories } = await import('../memory-control/index.js');
  const overview = await listMemories(userId);
  if (!overview.ok) throw new Error('facts unavailable');
  return overview.value.facts
    .filter(
      (f) =>
        FACT_LABELS[category].includes((f.category ?? '').toLowerCase()) ||
        categoryForFactType(f.category) === category ||
        sensitiveCategoriesOf(f.text).includes(category)
    )
    .map((f) => f.id);
}

function registerFactStore(category: SensitiveCategory): void {
  registerCategoryStore({
    category,
    name: 'facts',
    count: async (userId) => (await factIdsIn(userId, category)).length,
    deleteAll: async (userId) => {
      const { deleteFact } = await import('../memory-control/index.js');
      let deleted = 0;
      for (const id of await factIdsIn(userId, category)) {
        const r = await deleteFact(userId, id, 'user_deleted');
        if (r.ok) deleted++;
      }
      return deleted;
    },
  });
}

async function medicalFoodPrefs(userId: string): Promise<string[]> {
  const { listPreferences } = await import('../user-preferences/index.js');
  return (await listPreferences(userId, { fresh: true }))
    .filter((p) => p.domain === 'food' && p.key.startsWith('medical:'))
    .map((p) => p.id);
}

export function registerBuiltInCategoryStores(): void {
  for (const category of SENSITIVE_CATEGORIES) registerFactStore(category);

  registerCategoryStore({
    category: 'health',
    name: 'healthMemory',
    count: async (userId) => (await import('../health-memory/store.js')).countHealthItems(userId),
    deleteAll: async (userId) =>
      (await import('../health-memory/store.js')).deleteAllHealth(userId),
  });
  registerCategoryStore({
    category: 'health',
    name: 'moodTimeline',
    count: async (userId) => (await import('../health-memory/mood-timeline.js')).countMood(userId),
    deleteAll: async (userId) =>
      (await import('../health-memory/mood-timeline.js')).deleteAllMood(userId),
  });
  registerCategoryStore({
    category: 'health',
    name: 'medicalFoodRestrictions',
    count: async (userId) => (await medicalFoodPrefs(userId)).length,
    deleteAll: async (userId) => {
      const { deletePreference } = await import('../user-preferences/index.js');
      let deleted = 0;
      for (const id of await medicalFoodPrefs(userId)) {
        if (await deletePreference(userId, id, 'user_deleted')) deleted++;
      }
      return deleted;
    },
  });
}
