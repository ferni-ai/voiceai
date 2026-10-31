/**
 * Apple Health disconnect: erase everything the sync kept about a person, then read it back.
 *
 * Every place HealthKit-derived data is kept, and how each is covered:
 * - apple_health_tokens/{uid}: the sync token's hash and the device id. Erased first, so no
 *   new sync is accepted while the rest goes.
 * - vectors/health_wellness_checkin_activity_{date}: each activity day indexed to semantic
 *   memory (store-hooks.ts names it storeType_entityType_entityId). The id is not per person,
 *   so only a doc whose metadata.userId is theirs is deleted. The stored days are the only
 *   way to find these, so the days are kept until the indexed ones are confirmed gone.
 * - apple_health_status/{uid}: connection status.
 * - apple_health_data/{uid}: daily/{date} totals, plus legacy workouts/{id} (one raw workout
 *   each) and anything else under it: recursiveDelete takes every subcollection.
 * - the status cache in apple-health-sync.ts, on this instance (another's expires in a minute).
 *
 * Account deletion erases the same stores (ERASED_STORES, CREDENTIAL_STORES in user-stores.ts).
 * No agent tool or prompt reads Apple Health data, so there is no derived summary elsewhere.
 *
 * @module services/identity/apple-health-erase
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { DEFAULT_COLLECTION_NAME as VECTORS } from '../../memory/firestore-vector-store/types.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { forgetIndexedDoc } from '../data-layer/max-per-user.js';
import { eraseStore, holdsUser } from '../platform/erase-store.js';
import { erasureErrorCode } from '../platform/erasure-step.js';
import type { OwnedStore } from '../platform/user-stores.js';
import {
  DATA_COLLECTION,
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

const indexedDayId = (date: string): string => `health_wellness_checkin_activity_${date}`;

/** The person's own indexed activity days among these dates */
async function ownIndexedDays(
  db: Db,
  userId: string,
  dates: Iterable<string>
): Promise<FirebaseFirestore.DocumentReference[]> {
  const refs = [...dates].map((date) => db.collection(VECTORS).doc(indexedDayId(date)));
  const snaps = await Promise.all(refs.map(async (ref) => ref.get()));
  return refs.filter((_, i) => snaps[i]?.get('metadata.userId') === userId);
}

/** One erase pass; returns the stores still holding the person's data (empty: all gone) */
async function erasePass(db: Db, userId: string, dates: Set<string>): Promise<string[]> {
  await eraseStore(db, TOKEN_STORE, userId);
  const days = await db.collection(DATA_COLLECTION).doc(userId).collection('daily').listDocuments();
  for (const day of days) dates.add(day.id);

  const indexed = await ownIndexedDays(db, userId, dates);
  await Promise.all(indexed.map(async (ref) => ref.delete()));
  for (const ref of indexed) forgetIndexedDoc(userId, 'wellness_checkin', ref.id);
  if ((await ownIndexedDays(db, userId, dates)).length > 0) return [VECTORS];

  await Promise.all([STATUS_STORE, DATA_STORE].map(async (s) => eraseStore(db, s, userId)));
  const held = await Promise.all(APPLE_HEALTH_STORES.map(async (s) => holdsUser(db, s, userId)));
  return APPLE_HEALTH_STORES.filter((_, i) => held[i]).map((s) => s.collection);
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
  const dates = new Set<string>();
  for (let attempt = 1; attempt <= ERASE_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(retryDelayMs * attempt);
    try {
      const left = await erasePass(db, userId, dates);
      if (left.length === 0) {
        forgetCachedStatus(userId);
        log.info({ userId, days: dates.size, attempt }, 'Apple Health disconnected and erased');
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
