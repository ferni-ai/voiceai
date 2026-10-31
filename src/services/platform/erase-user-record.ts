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

import { erasingMark } from '../../utils/erasing-mark.js';
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
import { eraseStore, holdsUser } from './erase-store.js';
import {
  ERASED_STORES,
  storeLabel,
  USER_RECORDS_COLLECTION,
  type OwnedStore,
} from './user-stores.js';

const log = createLogger({ module: 'erase-user-record' });

export { USER_RECORDS_COLLECTION };

/** gRPC NOT_FOUND: an update of a document that doesn't exist */
const NOT_FOUND = 5;

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
  // The records this erasure deletes are marked before anything goes
  if (stores.some((store) => storeLabel(store) === `${USER_RECORDS_COLLECTION}/{uid}`))
    await markErasing(db, [userId, ...linked]);
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
 * Marks each record `erasing` (utils/erasing-mark.ts) before anything is deleted. A write still running for the
 * person (a live call's team insight, insight-store.ts) reads the record in its own
 * transaction and stops on the mark, so it can't recreate a document under a record that
 * is about to go: the record itself is deleted last, since a retry reads the keys from it
 * (erasure-keys.ts). One update, which needs the record to exist: a write that read the
 * record before the mark either lands first (and is erased with the rest) or is retried
 * and finds the mark. A record that doesn't exist isn't created. Any other failure fails
 * the erasure before anything is deleted.
 */
async function markErasing(db: Db, userIds: readonly string[]): Promise<void> {
  const mark = erasingMark();
  await Promise.all(
    userIds.map(async (uid) =>
      db
        .collection(USER_RECORDS_COLLECTION)
        .doc(uid)
        .update(mark)
        .catch((error: unknown) => {
          if ((error as { code?: unknown } | null)?.code !== NOT_FOUND) throw error;
        })
    )
  );
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
