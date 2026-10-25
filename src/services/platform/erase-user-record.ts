/**
 * Erase everything Firestore keeps for a user: both records (bogle_users/{userId},
 * where the voice agent keeps what it knows, and users/{userId}, where the app keeps
 * the calendar, journal, routines and practices), every subcollection under them, and
 * every store kept elsewhere for the person (user-stores.ts, the list the export reads).
 *
 * Account deletion used to skip this: its "profile" step deleted from the UI
 * server's in-memory store, so the whole record survived a "delete my account"
 * that reported success. Verified in the Firestore emulator on 2026-10-06: 0 of
 * 91 seeded documents removed. On 2026-10-12 users/{uid}, user_seeds and
 * contact_relationships still survived, because only bogle_users was erased.
 *
 * @module services/platform/erase-user-record
 */

import { getAdminFirestore } from '../../utils/firebase-admin-app.js';
import { ensureFirebaseAdmin } from '../identity/firebase-auth.js';
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { queueBqErasure } from '../analytics/bq-erasure.js';
import { KEYED_STORES, type KeyedStore } from './erase-other-keys.js';
import {
  gatherErasureKeys,
  keepStripeCustomersForCleanup,
  type ErasureKeys,
} from './erasure-keys.js';
import { erasureErrorCode } from './erasure-step.js';
import { ERASED_STORES, storeLabel, type OwnedStore } from './user-stores.js';

const log = createLogger({ module: 'erase-user-record' });

export const USER_RECORDS_COLLECTION = 'bogle_users';

const PAGE = 300;
/** A query that keeps returning documents after they were deleted must not loop forever */
const MAX_PAGES = 1_000;

type Db = FirebaseFirestore.Firestore;

/**
 * A user id names exactly one document. A '/' would make doc() address a
 * different path (a subcollection, or another user's document), so refuse it.
 */
export function assertErasableUserId(userId: string): void {
  if (!userId || userId.includes('/') || userId === '.' || userId === '..') {
    throw new Error(`Refusing to erase an invalid user id: ${JSON.stringify(userId)}`);
  }
}

/** The stores that still hold something for the user (labels from storeLabel); empty means erased */
export async function findUserRecordRemnants(
  db: Db,
  userId: string,
  stores: readonly OwnedStore[] = ERASED_STORES
): Promise<string[]> {
  // A store that can't be read can't be shown to be empty
  const left = await Promise.all(
    stores.map((store) => holdsUser(db, store, userId).catch(() => true))
  );
  return stores.filter((_, i) => left[i]).map(storeLabel);
}

/**
 * `{mapKey}.{uid}` as a field path. A '.' in the uid would address a deeper key, and
 * Firestore refuses some characters, so such a uid fails the erasure (it is retried).
 */
function entryPath(mapKey: string, userId: string): string {
  if (/[.~*[\]`]/.test(userId)) throw new Error("A uid that can't name a map entry");
  return `${mapKey}.${userId}`;
}

/** The documents holding the person's entry (single-field index on the map subfield) */
const holdingEntry = (db: Db, collection: string, path: string, limit: number) =>
  db.collection(collection).where(path, '!=', null).limit(limit);

async function holdsUser(db: Db, store: OwnedStore, userId: string): Promise<boolean> {
  const collection = db.collection(store.collection);
  if ('mapKey' in store) {
    const path = entryPath(store.mapKey, userId);
    return !(await holdingEntry(db, store.collection, path, 1).get()).empty;
  }
  if ('doc' in store) {
    const ref = collection.doc(userId);
    const [snap, subs] = await Promise.all([ref.get(), ref.listCollections()]);
    return snap.exists || subs.length > 0;
  }
  return !(await collection.where(store.field, '==', userId).limit(1).get()).empty;
}

/** Delete one store's documents for the user, and everything under them (Firestore doesn't cascade) */
async function eraseStore(db: Db, store: OwnedStore, userId: string): Promise<void> {
  const collection = db.collection(store.collection);
  if ('mapKey' in store) return eraseEntries(db, store, userId);
  if ('doc' in store) {
    await db.recursiveDelete(collection.doc(userId));
    return;
  }
  const query = collection.where(store.field, '==', userId).limit(PAGE);
  for (let page = 0; page < MAX_PAGES; page++) {
    const snap = await query.get();
    if (snap.empty) return;
    await Promise.all(snap.docs.map((doc) => db.recursiveDelete(doc.ref)));
  }
}

/**
 * Only the person's entry goes; the rest of each document (another member's entry, the
 * contact's own STOP) stays. In a transaction, so a write racing it isn't lost.
 */
async function eraseEntries(
  db: Db,
  store: { collection: string; mapKey: string },
  userId: string
): Promise<void> {
  const query = holdingEntry(db, store.collection, entryPath(store.mapKey, userId), PAGE);
  for (let page = 0; page < MAX_PAGES; page++) {
    const snap = await query.get();
    if (snap.empty) return;
    await Promise.all(
      snap.docs.map(async (doc) =>
        db.runTransaction(async (tx) => {
          const map: unknown = (await tx.get(doc.ref)).get(store.mapKey);
          if (!map || typeof map !== 'object' || !Object.hasOwn(map, userId)) return;
          const { [userId]: _dropped, ...kept } = map as Record<string, unknown>;
          tx.update(doc.ref, { [store.mapKey]: kept });
        })
      )
    );
  }
}

interface Job {
  label: string;
  erase: () => Promise<void>;
  /** A store that can't be read can't be shown to be empty */
  remains: () => Promise<boolean>;
}

/**
 * The stores the keys are read from (erasure-keys.ts), erased only once everything
 * else is gone, so a retry after a failure finds the same keys: 1 the access grants
 * (by uid here, by email in erase-other-keys.ts) and the sponsored identities, then 2 the record, whose links (and, for a
 * linked phone profile, whose existence) is how the person's phone profiles are found.
 */
const KEY_TIER = new Map([
  ['user_profiles[firebaseUid]', 1],
  ['sponsored_identities[sponsorUserId]', 1],
  [`${USER_RECORDS_COLLECTION}/{uid}`, 2],
]);

/**
 * Erase every job, then check them all; throws naming whatever is left. Logs store
 * labels and error codes only: a Firestore error's message can carry the document
 * path it failed on, which for a phone profile or an email-keyed store is the phone
 * number or the (base64) email.
 */
async function runPhase(jobs: readonly Job[], userId: string): Promise<void> {
  const results = await Promise.allSettled(jobs.map(async (job) => job.erase()));
  const errors = jobs.filter((job, i) => {
    const result = results[i];
    if (result?.status !== 'rejected') return false;
    log.warn(
      { error: erasureErrorCode(result.reason), userId, store: job.label },
      'Store not erased'
    );
    return true;
  });
  const left = await Promise.all(jobs.map(async (job) => job.remains()));
  const stuck = new Set([...errors, ...jobs.filter((_, i) => left[i])].map((job) => job.label));
  if (stuck.size > 0) {
    log.warn({ userId, stores: [...stuck] }, 'User record not fully erased');
    throw new Error(`User record not fully erased: ${[...stuck].join(',')}`);
  }
}

/**
 * Delete every store kept for the user, by uid (user-stores.ts, for the uid and every
 * phone profile that is the same person) and by their other keys (erase-other-keys.ts),
 * then check that nothing is left. Throws when Firestore or Firebase Auth is
 * unreachable or anything survives, so callers never report an erasure that did not
 * happen. Runs in phases, each only once the one before left nothing: everything
 * else, then the linked phone profiles' key stores (tier 1, then their records), then
 * the user's own.
 */
export async function eraseUserRecord(
  userId: string,
  firestore?: Db,
  stores: readonly OwnedStore[] = ERASED_STORES,
  keyed: readonly KeyedStore[] = KEYED_STORES
): Promise<void> {
  assertErasableUserId(userId);
  // Outreach held in memory goes before and after the sweep, refused from then on (a live session)
  const { eraseUserOutreachData } = await import('../outreach/outreach-intelligence.js');
  await eraseUserOutreachData(userId);
  const db = firestore ?? defaultDb();
  // Gathered first: the sweep erases the records the keys are read from
  const keys = keyed.length > 0 ? await gatherKeys(db, userId, keyed) : null;
  const linked = keys?.linkedUserIds ?? [];
  linked.forEach(assertErasableUserId);
  // BQ_ERASURE: their BigQuery rows go in a later batch, after the streaming buffer (bq-erasure.ts)
  if (flagOn('BQ_ERASURE')) await queueBqErasure(db, [userId, ...linked]);
  const uidJobs = (uid: string, tier: number): Job[] =>
    stores
      .filter((store) => (KEY_TIER.get(storeLabel(store)) ?? 0) === tier)
      .map((store) => ({
        label: uid === userId ? storeLabel(store) : `${storeLabel(store)} (linked phone profile)`,
        erase: async () => eraseStore(db, store, uid),
        remains: async () => holdsUser(db, store, uid).catch(() => true),
      }));
  const keyedJobs = (tier: number): Job[] =>
    keys
      ? keyed
          .filter((k) => (k.keyTier ?? 0) === tier)
          .map((k) => ({
            label: k.label,
            erase: async () => k.erase(db, keys),
            remains: async () => k.remains(db, keys).catch(() => true),
          }))
      : [];
  await runPhase(
    [...keyedJobs(0), ...[userId, ...linked].flatMap((uid) => uidJobs(uid, 0))],
    userId
  );
  for (const tier of [1, 2]) {
    if (linked.length > 0)
      await runPhase(
        linked.flatMap((uid) => uidJobs(uid, tier)),
        userId
      );
  }
  for (const tier of [1, 2]) {
    await runPhase([...keyedJobs(tier), ...uidJobs(userId, tier)], userId);
  }
  await eraseUserOutreachData(userId);
}

/**
 * Without the keys the stores they name can't be erased or shown empty, so nothing is
 * erased and the erasure fails, to be retried; the Stripe ids are kept before any
 * profile holding them goes.
 */
async function gatherKeys(
  db: Db,
  userId: string,
  keyed: readonly KeyedStore[]
): Promise<ErasureKeys> {
  try {
    const keys = await gatherErasureKeys(db, userId);
    await keepStripeCustomersForCleanup(db, keys.stripeCustomerIds);
    return keys;
  } catch (error) {
    log.error(
      { error: erasureErrorCode(error), userId },
      "Couldn't read the keys to erase by; nothing erased"
    );
    const labels = keyed.map((k) => k.label).join(',');
    throw new Error(`User record not fully erased: keys unreadable, so not erased: ${labels}`);
  }
}

function defaultDb(): Db {
  if (!ensureFirebaseAdmin()) throw new Error('Firebase Admin is not initialized');
  return getAdminFirestore();
}
