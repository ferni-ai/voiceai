/**
 * Push Endpoint Owners
 *
 * A browser push endpoint belongs to exactly one user: whoever subscribed it
 * last. Without this, user A's subscription stays on file after user B signs
 * in on the same browser and subscribes the same endpoint, so A's
 * notifications (which carry A's personal content) are delivered to B.
 *
 * Moving an endpoint to a new user requires the subscription's keys
 * (p256dh/auth), which only the browser that created it holds. An endpoint
 * URL alone (logged, leaked, guessed) can't be used to take one over.
 *
 * Reads are fresh (not served from a process cache) because subscriptions are
 * written by the API server and read by senders in other processes.
 */

import { createHash, timingSafeEqual } from 'crypto';
import { getFirestoreDb } from '../utils/firestore-utils.js';
import { createPersistenceStore, type PersistenceStore } from './persistence/index.js';

interface EndpointOwner {
  userId: string;
  /** sha256 of the subscription's p256dh and auth keys. */
  keysHash?: string;
}

export interface SubscriptionKeys {
  p256dh: string;
  auth: string;
}

/** The endpoint belongs to another user and the request didn't prove it holds the subscription. */
export class EndpointOwnedError extends Error {
  constructor() {
    super('Push endpoint belongs to another user');
    this.name = 'EndpointOwnedError';
  }
}

function hashKeys(keys: SubscriptionKeys): string {
  return createHash('sha256').update(`${keys.p256dh}\n${keys.auth}`).digest('hex');
}

function sameHash(stored: string | undefined, presented: string): boolean {
  if (!stored || stored.length !== presented.length) return false;
  return timingSafeEqual(Buffer.from(stored), Buffer.from(presented));
}

const OWNERS_COLLECTION = 'push_endpoint_owners';

let store: PersistenceStore<EndpointOwner> | null = null;

function owners(): PersistenceStore<EndpointOwner> {
  store ??= createPersistenceStore<EndpointOwner>({
    collection: OWNERS_COLLECTION,
    useRootCollection: true,
  });
  return store;
}

/** Endpoints are URLs; Firestore document ids can't contain '/'. */
function endpointKey(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

/** The user an endpoint currently belongs to, if any. */
export async function getEndpointOwner(endpoint: string): Promise<string | null> {
  const owner = await owners().load(endpointKey(endpoint), { fresh: true });
  return owner?.userId ?? null;
}

/**
 * Record `userId` as the endpoint's owner. Taking an endpoint from another user
 * requires the same keys it was registered with (the same browser subscription),
 * otherwise this throws EndpointOwnedError and nothing changes. Returns the
 * previous owner when it was someone else, so the caller can drop their copy.
 */
export async function claimEndpoint(
  endpoint: string,
  keys: SubscriptionKeys,
  userId: string
): Promise<string | null> {
  const current = await owners().load(endpointKey(endpoint), { fresh: true });
  const keysHash = hashKeys(keys);
  const takingOver = Boolean(current && current.userId !== userId);
  if (takingOver && !sameHash(current?.keysHash, keysHash)) {
    throw new EndpointOwnedError();
  }
  await owners().setImmediate(endpointKey(endpoint), { userId, keysHash });
  return takingOver ? (current?.userId ?? null) : null;
}

/** Forget the owner, but only if it is still `userId`. */
export async function releaseEndpoint(endpoint: string, userId: string): Promise<void> {
  if ((await getEndpointOwner(endpoint)) === userId) {
    await owners().delete(endpointKey(endpoint));
  }
}

/**
 * Account deletion: drop the user's push subscriptions (where push-notifications.ts
 * keeps them: bogle_users/<uid>/push_subscriptions/data) and every endpoint they
 * own. Reads and deletes Firestore directly so a failure throws instead of being
 * logged and skipped.
 */
export async function erasePushRecordsFor(userId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore unavailable');
  const owned = await db.collection(OWNERS_COLLECTION).where('userId', '==', userId).get();
  await Promise.all(owned.docs.map(async (doc) => doc.ref.delete()));
  for (const doc of owned.docs) store?.clearCache(doc.id);
  await db.doc(`bogle_users/${userId}/push_subscriptions/data`).delete();
}
