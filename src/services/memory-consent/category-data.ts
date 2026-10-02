/**
 * What is stored for each sensitive category, and how to delete it.
 *
 * Turning a category off stops capture at once but never deletes by itself:
 * the user is told how much is stored and offered deletion
 * (`summarizeCategoryData` → "I still have 5 health memories, want me to
 * delete them?" → `deleteCategoryData`).
 *
 * Each store that holds category data registers here:
 *
 *   registerCategoryStore({
 *     category: 'finances',
 *     name: 'moneyMemory',
 *     count: (uid) => ...,      // items currently stored
 *     deleteAll: (uid) => ...,  // delete them, returns how many went
 *   });
 *
 * Built-ins (health memory, mood timeline, health facts, medical food
 * restrictions) load lazily from builtin-category-stores.ts; add new stores
 * there so they are always registered in every process.
 *
 * @module services/memory-consent/category-data
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { SensitiveCategory } from './types.js';

const log = createLogger({ module: 'MemoryConsentData' });

export interface CategoryStore {
  readonly category: SensitiveCategory;
  /** Unique, stable name; key in reports. */
  readonly name: string;
  count(userId: string): Promise<number>;
  deleteAll(userId: string): Promise<number>;
}

export interface CategoryDataReport {
  readonly total: number;
  readonly byStore: Readonly<Record<string, number | 'failed'>>;
}

const stores = new Map<string, CategoryStore>();
let builtInsLoaded = false;

export function registerCategoryStore(store: CategoryStore): void {
  stores.set(`${store.category}:${store.name}`, store);
}

/** Tests: forget every store (built-ins reload on next use unless disabled). */
export function resetCategoryStores(options: { loadBuiltIns?: boolean } = {}): void {
  stores.clear();
  builtInsLoaded = options.loadBuiltIns === false;
}

async function storesFor(category: SensitiveCategory): Promise<CategoryStore[]> {
  if (!builtInsLoaded) {
    builtInsLoaded = true;
    try {
      const { registerBuiltInCategoryStores } = await import('./builtin-category-stores.js');
      registerBuiltInCategoryStores();
    } catch (error) {
      log.warn({ error: String(error) }, 'Could not load built-in category stores');
    }
  }
  return [...stores.values()].filter((s) => s.category === category);
}

async function runEach(
  userId: string,
  category: SensitiveCategory,
  pick: (s: CategoryStore) => Promise<number>,
  what: string
): Promise<CategoryDataReport> {
  const byStore: Record<string, number | 'failed'> = {};
  let total = 0;
  for (const store of await storesFor(category)) {
    try {
      const n = await pick(store);
      byStore[store.name] = n;
      total += n;
    } catch (error) {
      byStore[store.name] = 'failed';
      log.warn({ userId, category, store: store.name, error: String(error) }, `${what} failed`);
    }
  }
  return { total, byStore };
}

/** How much is stored for a category (for "want me to delete it too?"). */
export function summarizeCategoryData(
  userId: string,
  category: SensitiveCategory
): Promise<CategoryDataReport> {
  return runEach(userId, category, (s) => s.count(userId), 'Category count');
}

/** Delete everything stored for a category. Stores are isolated; failures are reported. */
export function deleteCategoryData(
  userId: string,
  category: SensitiveCategory
): Promise<CategoryDataReport> {
  return runEach(userId, category, (s) => s.deleteAll(userId), 'Category delete');
}
