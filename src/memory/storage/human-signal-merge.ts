/**
 * Human Signal Merge Helper
 *
 * Pure merge logic for reconciling the two persisted shapes of human
 * signals (dreams, values, fears, etc.):
 * - `human_memory/profile` — the doc read by `getHumanSignals`
 * - `human_signals/*` shards — written by `persistHumanSignals`
 *
 * Kept dependency-free (no Firestore, no logger) so it can be unit
 * tested without mocking infrastructure.
 *
 * @module memory/storage/human-signal-merge
 */

export interface HumanMemoryProfileLike {
  importantDates: Array<{ id?: string; content?: string; [key: string]: unknown }>;
  values: Array<{ id?: string; content?: string; [key: string]: unknown }>;
  dreams: Array<{ id?: string; content?: string; [key: string]: unknown }>;
  fears: Array<{ id?: string; content?: string; [key: string]: unknown }>;
  growthMarkers: Array<{ id?: string; content?: string; [key: string]: unknown }>;
  comfortPatterns: Array<{ id?: string; content?: string; [key: string]: unknown }>;
  challenges: Array<{ id?: string; content?: string; [key: string]: unknown }>;
  stressTriggers: Array<{ id?: string; content?: string; [key: string]: unknown }>;
  importantPeople: Array<{ id?: string; content?: string; [key: string]: unknown }>;
}

export interface HumanSignalShards {
  importantDates?: unknown[];
  values?: unknown[];
  dreams?: unknown[];
  fears?: unknown[];
  growthMarkers?: unknown[];
  comfortPatterns?: unknown[];
  challenges?: unknown[];
  stressTriggers?: unknown[];
  insideJokes?: unknown[];
  avoidances?: unknown[];
}

function byIdOrContent(items: unknown[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const key = String(item.id || item.content || JSON.stringify(item));
    map.set(key, item);
  }
  return map;
}

function mergeArrays(a: unknown[] = [], b: unknown[] = []): Array<Record<string, unknown>> {
  const map = byIdOrContent(a);
  for (const [key, item] of byIdOrContent(b)) {
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

/**
 * Merge profile-shaped memory with human_signals shard documents.
 * Profile wins on id collision; shards fill gaps.
 */
export function mergeHumanSignalSources(
  profile: HumanMemoryProfileLike,
  shards: HumanSignalShards
): HumanMemoryProfileLike {
  return {
    importantDates: mergeArrays(
      profile.importantDates,
      shards.importantDates
    ) as HumanMemoryProfileLike['importantDates'],
    values: mergeArrays(profile.values, shards.values) as HumanMemoryProfileLike['values'],
    dreams: mergeArrays(profile.dreams, shards.dreams) as HumanMemoryProfileLike['dreams'],
    fears: mergeArrays(profile.fears, shards.fears) as HumanMemoryProfileLike['fears'],
    growthMarkers: mergeArrays(
      profile.growthMarkers,
      shards.growthMarkers
    ) as HumanMemoryProfileLike['growthMarkers'],
    comfortPatterns: mergeArrays(
      profile.comfortPatterns,
      shards.comfortPatterns
    ) as HumanMemoryProfileLike['comfortPatterns'],
    challenges: mergeArrays(
      profile.challenges,
      shards.challenges
    ) as HumanMemoryProfileLike['challenges'],
    stressTriggers: mergeArrays(
      profile.stressTriggers,
      shards.stressTriggers
    ) as HumanMemoryProfileLike['stressTriggers'],
    importantPeople: profile.importantPeople,
  };
}
