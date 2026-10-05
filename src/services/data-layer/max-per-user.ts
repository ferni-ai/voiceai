/**
 * Keeps each user's auto-indexed store entities (habits, tasks, goals...)
 * under their policy's maxPerUser cap without reading Firestore on every
 * change.
 *
 * Before: every change listed up to 500 of the user's vector docs, embeddings
 * included, just to count one entity type (1,404 such reads in one dev log
 * window, 2026-10-05). And at the cap, re-indexing a doc that was already
 * there still deleted the user's oldest doc.
 *
 * Doc ids are deterministic (storeType_entityType_entityId), so the ids for a
 * user + entity type are read once, and again after REFRESH_MS because other
 * instances index too. Re-indexing a known id costs nothing; only a new id at
 * the cap removes the oldest.
 *
 * @module services/data-layer/max-per-user
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getEntityPolicy } from './indexing-policy.js';
import type { EntityType } from './types.js';

const log = createLogger({ module: 'max-per-user' });

export interface CappedVectorStore {
  list(filter: { userId: string }): Promise<Array<{ id?: string; metadata?: Record<string, unknown> }>>;
  removeDocument(id: string): Promise<boolean>;
}

/** Re-read after this long: another instance may have indexed for this user. */
const REFRESH_MS = 30 * 60_000;
/** Users x entity types kept in memory; the oldest entry goes first. */
const MAX_TRACKED = 5_000;

interface Tracked {
  /** doc id -> indexedAt (ISO), the order docs are evicted in. */
  ids: Map<string, string>;
  loadedAt: number;
}

const tracked = new Map<string, Tracked>();
const loading = new Map<string, Promise<Tracked>>();
const keyOf = (userId: string, entityType: string) => `${userId}\u0000${entityType}`;

async function load(store: CappedVectorStore, userId: string, entityType: string, now: number) {
  const key = keyOf(userId, entityType);
  const pending = loading.get(key);
  if (pending) return pending;
  const read = (async () => {
    const ids = new Map<string, string>();
    for (const doc of await store.list({ userId })) {
      if (doc.id && doc.metadata?.entityType === entityType) {
        ids.set(doc.id, String(doc.metadata.indexedAt ?? ''));
      }
    }
    const entry = { ids, loadedAt: now };
    tracked.delete(key);
    if (tracked.size >= MAX_TRACKED) tracked.delete(tracked.keys().next().value as string);
    tracked.set(key, entry);
    return entry;
  })().finally(() => loading.delete(key));
  loading.set(key, read);
  return read;
}

/**
 * Make room for `docId` under the user's cap for this entity type, before it
 * is indexed. Returns the ids removed. Best effort: a failure is logged and
 * the doc is indexed anyway.
 */
export async function enforceMaxPerUser(
  store: CappedVectorStore,
  userId: string,
  entityType: EntityType,
  docId: string,
  now = Date.now()
): Promise<string[]> {
  const max = getEntityPolicy(entityType)?.conditions?.maxPerUser;
  if (!max || max <= 0) return [];
  try {
    const cached = tracked.get(keyOf(userId, entityType));
    const t =
      cached && now - cached.loadedAt <= REFRESH_MS
        ? cached
        : await load(store, userId, entityType, now);
    const indexedAt = new Date(now).toISOString();
    if (t.ids.has(docId)) {
      t.ids.set(docId, indexedAt);
      return [];
    }
    const excess = t.ids.size - max + 1;
    const oldest =
      excess > 0
        ? [...t.ids]
            .sort((a, b) => a[1].localeCompare(b[1]))
            .slice(0, excess)
            .map(([id]) => id)
        : [];
    for (const id of oldest) {
      await store.removeDocument(id);
      t.ids.delete(id);
    }
    t.ids.set(docId, indexedAt);
    if (oldest.length > 0) {
      log.info({ userId, entityType, removed: oldest.length, limit: max }, 'maxPerUser limit enforced');
    }
    return oldest;
  } catch (error) {
    log.debug({ userId, entityType, error: String(error) }, 'maxPerUser enforcement skipped');
    return [];
  }
}

/** A doc was deleted from the index; stop counting it. */
export function forgetIndexedDoc(userId: string, entityType: string, docId: string): void {
  tracked.get(keyOf(userId, entityType))?.ids.delete(docId);
}

/** For tests. */
export function resetMaxPerUserCache(): void {
  tracked.clear();
  loading.clear();
}
