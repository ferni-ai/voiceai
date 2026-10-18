/**
 * Reads of bogle_users/{uid}/commitments, behind a short process cache.
 *
 * The voice agent saves commitments in its own process and the UI server reads
 * them in another, so a write can never clear the other process's cache. The
 * cache used to live forever, so "Your Day" showed whatever the UI server first
 * read until its instance restarted. Entries now expire.
 */

import type { Commitment } from './commitment-keeper.js';
import { getFirestoreDb, recordDegradation } from './firestore-utils.js';
import { shownRows, singleWriterFor } from './commitment-single-writer.js';

/** How long a process may serve a user's commitments without reading the store. */
export const COMMITMENT_CACHE_TTL_MS = 15_000;

class ExpiringCache<T> {
  private readonly entries = new Map<string, { at: number; value: T }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.at >= this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.set(key, { at: Date.now(), value });
  }
}

export const commitmentCache = new ExpiringCache<Commitment[]>(COMMITMENT_CACHE_TTL_MS);

/**
 * A user's active commitments, newest first (at most 50). Throws when the store
 * can't be read, so a panel can tell a failure from having none.
 */
export async function loadActiveCommitmentsOrThrow(userId: string): Promise<Commitment[]> {
  const cached = commitmentCache.get(userId);
  if (cached) return cached;

  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('commitment-keeper');
    throw new Error('Firestore unavailable');
  }

  const snapshot = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('commitments')
    .where('status', '==', 'active')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  // COMMITMENT_SINGLE_WRITER: only judged rows, nothing forgotten (judged-commitments.ts).
  const shown = await shownRows(userId, await singleWriterFor(userId));
  const docs = snapshot.docs.filter((doc) => shown(doc.data()));
  const commitments = docs.map((doc) => doc.data() as Commitment);
  commitmentCache.set(userId, commitments);
  return commitments;
}
