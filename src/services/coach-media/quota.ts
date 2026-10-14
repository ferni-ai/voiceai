/**
 * What coaching picks may spend. The YouTube Data API's default quota is
 * 10,000 units a day and search.list costs 100, so about 100 searches a day for
 * everyone; grounded queries cost $14 per 1,000 after 5,000 free a month. So:
 *
 * - candidates are cached per topic for CACHE_DAYS (Firestore, with an
 *   in-process layer), so a repeated ask costs nothing;
 * - search.list runs only within a shared daily budget (SEARCH_BUDGET_PER_DAY,
 *   counted in Firestore so every worker sees it);
 * - grounded queries are capped per user per day (GROUNDING_PER_USER_PER_DAY).
 *
 * Without Firestore the counters and cache are per process.
 *
 * @module services/coach-media/quota
 */

import { createHash } from 'node:crypto';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';

export const CACHE_DAYS = 7;
export const SEARCH_BUDGET_PER_DAY = 50;
export const GROUNDING_PER_USER_PER_DAY = 30;

const DAY_MS = 86_400_000;
const memoryCache = new Map<string, { at: number; value: unknown }>();
const memoryCounts = new Map<string, number>();

const docId = (key: string): string => createHash('sha256').update(key).digest('hex').slice(0, 40);
const today = (): string => new Date().toISOString().slice(0, 10);

/** The cached value for `key` if younger than CACHE_DAYS, else `load()` (cached when non-empty). */
export async function cachedFor<T>(key: string, load: () => Promise<T[]>): Promise<T[]> {
  const id = docId(key);
  const fresh = (at: number): boolean => Date.now() - at < CACHE_DAYS * DAY_MS;
  const hit = memoryCache.get(id);
  if (hit && fresh(hit.at)) return hit.value as T[];
  const db = getFirestoreDb();
  const ref = db?.collection('coach_media_cache').doc(id);
  try {
    const doc = await ref?.get();
    const data = doc?.exists ? (doc.data() as { at?: number; value?: T[] }) : undefined;
    if (data?.at && data.value && fresh(data.at)) {
      memoryCache.set(id, { at: data.at, value: data.value });
      return data.value;
    }
  } catch (error) {
    getLogger().debug({ error: String(error) }, 'coach-media: cache read failed');
  }
  const value = await load();
  if (value.length > 0) {
    const at = Date.now();
    memoryCache.set(id, { at, value });
    await ref?.set({ at, value }).catch((error: unknown) => {
      getLogger().debug({ error: String(error) }, 'coach-media: cache write failed');
    });
  }
  return value;
}

/** Takes one unit of today's `name` budget; false when `limit` is already spent. */
export async function takeDailyBudget(name: string, limit: number): Promise<boolean> {
  const key = `${today()}:${name}`;
  const db = getFirestoreDb();
  if (!db) {
    const used = memoryCounts.get(key) ?? 0;
    if (used >= limit) return false;
    memoryCounts.set(key, used + 1);
    return true;
  }
  const ref = db.collection('coach_media_quota').doc(docId(key));
  try {
    return await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const used = Number((doc.data() as { used?: number } | undefined)?.used ?? 0);
      if (used >= limit) return false;
      tx.set(ref, { name, day: today(), used: used + 1 });
      return true;
    });
  } catch (error) {
    getLogger().warn({ error: String(error), name }, 'coach-media: budget check failed');
    return false;
  }
}

/** For tests: forget the in-process cache and counters. */
export function resetQuotaMemory(): void {
  memoryCache.clear();
  memoryCounts.clear();
}
