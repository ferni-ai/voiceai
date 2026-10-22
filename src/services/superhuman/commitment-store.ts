/**
 * Reads of bogle_users/{uid}/commitments, behind a short process cache.
 *
 * The voice agent saves commitments in its own process and the UI server reads
 * them in another, so a write can never clear the other process's cache. The
 * cache used to live forever, so "Your Day" showed whatever the UI server first
 * read until its instance restarted. Entries now expire.
 */

import type { Commitment } from './commitment-keeper.js';
import { commitmentsShown } from './commitment-forget.js';
import { getFirestoreDb, recordDegradation } from './firestore-utils.js';

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

  delete(key: string): void {
    this.entries.delete(key);
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

  const [snapshot, shown] = await Promise.all([
    db
      .collection('bogle_users')
      .doc(userId)
      .collection('commitments')
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get(),
    commitmentsShown(userId),
  ]);

  // Never one they asked Ferni to forget (commitment-forget.ts). An after-call commitment
  // is saved with .add(), so its id is only the document's.
  const commitments = snapshot.docs
    .filter((doc) => shown(doc.data()))
    .map((doc) => {
      const data = doc.data() as Commitment;
      return { ...data, id: doc.id ?? data.id };
    });
  commitmentCache.set(userId, commitments);
  return commitments;
}

/** How the app closes a commitment: done, or dismissed (no longer theirs to keep, not "gave up"). */
export type ClosedBy = 'completed' | 'dismissed';

/** closed: this call closed it; already: it was already closed this way (a retry); missing: neither. */
export type CloseOutcome = 'closed' | 'already' | 'missing';

/**
 * Close one of the caller's own active commitments. The document is read under
 * their uid, so only its owner can. A repeat of the same close is 'already', so
 * a caller can retry the steps after it. Throws when it can't be written, so no
 * caller reports a close that didn't land.
 */
export async function closeCommitmentOrThrow(
  userId: string,
  commitmentId: string,
  status: ClosedBy,
  now = Date.now()
): Promise<CloseOutcome> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore unavailable');
  const ref = db.collection('bogle_users').doc(userId).collection('commitments').doc(commitmentId);
  const outcome = await db.runTransaction(async (tx): Promise<CloseOutcome> => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.get('status') === status) return 'already';
    if (!snap.exists || snap.get('status') !== 'active') return 'missing';
    tx.update(ref, { status, closedAt: now, closedVia: 'app', lastMentioned: now });
    return 'closed';
  });
  if (outcome === 'closed') commitmentCache.delete(userId);
  return outcome;
}
