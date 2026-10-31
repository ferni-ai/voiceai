/**
 * Apple Health disconnect: erase everything the sync kept about a person, then read it back.
 *
 * Every place HealthKit-derived data is kept, in the order it is erased:
 * - apple_health_tokens/{uid} (token hash, device id): first, so no new sync gets in.
 * - activity days indexed to semantic memory (vectors, entityType wellness_checkin, entityId
 *   activity_{date}), found by owner and type: the queued ones not yet written are dropped,
 *   the written ones removed through the vector store (its fallback cache too), and the
 *   person's search cache cleared. A write still queued on another instance checks the token
 *   first (apple-health-sync.ts), so it is skipped once the token is gone.
 * - apple_health_status/{uid}, and apple_health_data/{uid} with every subcollection
 *   (daily/{date}, legacy workouts/{id}).
 * - the status cache in apple-health-sync.ts (this instance; another's expires in a minute).
 * Account deletion erases the same stores (user-stores.ts). No tool or prompt reads this data.
 *
 * @module services/identity/apple-health-erase
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { getFirestoreVectorStore } from '../../memory/firestore-vector-store/index.js';
import { DEFAULT_COLLECTION_NAME as VECTORS } from '../../memory/firestore-vector-store/types.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { forgetIndexedDoc } from '../data-layer/max-per-user.js';
import { dropPendingChanges } from '../data-layer/store-hooks.js';
import { eraseStore, holdsUser } from '../platform/erase-store.js';
import { erasureErrorCode } from '../platform/erasure-step.js';
import type { OwnedStore } from '../platform/user-stores.js';
import {
  DATA_COLLECTION,
  INDEXED_DAY_PREFIX,
  STATUS_COLLECTION,
  SYNC_TOKEN_COLLECTION,
  forgetCachedStatus,
} from './apple-health-sync.js';

const log = createLogger({ module: 'apple-health-erase' });

type Db = FirebaseFirestore.Firestore;

const TOKEN_STORE: OwnedStore = { collection: SYNC_TOKEN_COLLECTION, doc: 'uid' };
const STATUS_STORE: OwnedStore = { collection: STATUS_COLLECTION, doc: 'uid' };
const DATA_STORE: OwnedStore = { collection: DATA_COLLECTION, doc: 'uid' };

/** Every per-person store the sync writes, each erased with all its subcollections */
export const APPLE_HEALTH_STORES: readonly OwnedStore[] = [TOKEN_STORE, STATUS_STORE, DATA_STORE];

/** Attempts per disconnect; a pass that throws or leaves data behind is retried */
export const ERASE_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;

const INDEXED_TYPE = 'wellness_checkin';
/** More of one person's check-ins than this (the cap is 30) and the listing is not trusted */
const INDEX_PAGE = 500;
const isIndexedDay = (m: Record<string, unknown> | undefined): boolean =>
  m?.storeType === 'health' && String(m.entityId ?? '').startsWith(INDEXED_DAY_PREFIX);

/** The ids of the person's own indexed activity days, in Firestore and in the fallback cache */
async function indexedDayIds(db: Db, userId: string): Promise<string[]> {
  const snap = await db
    .collection(VECTORS)
    .where('metadata.userId', '==', userId)
    .where('metadata.entityType', '==', INDEXED_TYPE)
    .select('metadata')
    .limit(INDEX_PAGE)
    .get();
  if (snap.docs.length >= INDEX_PAGE) throw new Error('indexed days listing cut short');
  const cached = await getFirestoreVectorStore().cached({ userId });
  const ids = [
    ...snap.docs.filter((d) => isIndexedDay(d.get('metadata') as Record<string, unknown>)),
    ...cached.docs.filter(
      (d) => d.metadata.entityType === INDEXED_TYPE && isIndexedDay(d.metadata)
    ),
  ].map((d) => d.id);
  return [...new Set(ids)];
}

/** One erase pass; returns the stores still holding the person's data (empty: all gone) */
async function erasePass(db: Db, userId: string): Promise<string[]> {
  await eraseStore(db, TOKEN_STORE, userId);
  dropPendingChanges(userId, INDEXED_TYPE, INDEXED_DAY_PREFIX);
  const store = getFirestoreVectorStore();
  for (const id of await indexedDayIds(db, userId)) {
    if (await store.removeDocument(id)) forgetIndexedDoc(userId, INDEXED_TYPE, id);
  }
  store.invalidateSearchCacheForUser(userId);
  await Promise.all([STATUS_STORE, DATA_STORE].map(async (s) => eraseStore(db, s, userId)));

  const held = await Promise.all(APPLE_HEALTH_STORES.map(async (s) => holdsUser(db, s, userId)));
  const left = APPLE_HEALTH_STORES.filter((_, i) => held[i]).map((s) => s.collection);
  return (await indexedDayIds(db, userId)).length > 0 ? [...left, VECTORS] : left;
}

/**
 * Delete the person's Apple Health data from every store above. ok only once a read-back
 * finds none left. Running it again (after success or failure) is safe: each pass starts
 * from what is still stored. Every failed pass is logged and retried; after the last one
 * the caller answers 500, so the person can disconnect again.
 */
export async function disconnectAppleHealth(
  userId: string,
  retryDelayMs = RETRY_DELAY_MS
): Promise<{ ok: boolean }> {
  forgetCachedStatus(userId);
  const db = getFirestoreDb();
  if (!db) {
    log.error({ userId }, 'Apple Health disconnect: no database, nothing erased');
    return { ok: false };
  }
  for (let attempt = 1; attempt <= ERASE_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(retryDelayMs * attempt);
    try {
      const left = await erasePass(db, userId);
      if (left.length === 0) {
        forgetCachedStatus(userId);
        log.info({ userId, attempt }, 'Apple Health disconnected and erased');
        return { ok: true };
      }
      log.warn({ userId, attempt, left }, 'Apple Health disconnect: a pass left data');
    } catch (error) {
      const code = erasureErrorCode(error);
      log.warn({ userId, attempt, error: code }, 'Apple Health disconnect: a pass failed');
    }
  }
  log.error({ userId, attempts: ERASE_ATTEMPTS }, 'Apple Health disconnect: data left behind');
  return { ok: false };
}
