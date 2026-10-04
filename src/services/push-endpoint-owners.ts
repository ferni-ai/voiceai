/**
 * Push Endpoint Owners
 *
 * A browser push endpoint belongs to exactly one user: whoever subscribed it
 * last. Without this, user A's subscription stays on file after user B signs
 * in on the same browser and subscribes the same endpoint, so A's
 * notifications (which carry A's personal content) are delivered to B.
 *
 * Reads are fresh (not served from a process cache) because subscriptions are
 * written by the API server and read by senders in other processes.
 */

import { createHash } from 'crypto';
import { createPersistenceStore, type PersistenceStore } from './persistence/index.js';

interface EndpointOwner {
  userId: string;
}

let store: PersistenceStore<EndpointOwner> | null = null;

function owners(): PersistenceStore<EndpointOwner> {
  store ??= createPersistenceStore<EndpointOwner>({
    collection: 'push_endpoint_owners',
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
 * Record `userId` as the endpoint's owner. Returns the previous owner when it
 * was someone else, so the caller can drop that user's copy of the endpoint.
 */
export async function claimEndpoint(endpoint: string, userId: string): Promise<string | null> {
  const previous = await getEndpointOwner(endpoint);
  await owners().setImmediate(endpointKey(endpoint), { userId });
  return previous && previous !== userId ? previous : null;
}

/** Forget the owner, but only if it is still `userId`. */
export async function releaseEndpoint(endpoint: string, userId: string): Promise<void> {
  if ((await getEndpointOwner(endpoint)) === userId) {
    await owners().delete(endpointKey(endpoint));
  }
}
