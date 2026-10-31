/**
 * PersistenceStore.updateIfUnchanged: an update that cannot undo a newer write.
 *
 * Re-sealing a token on read is "read, then write back a changed copy". Written with set(),
 * a disconnect that lands in between brings the deleted link back and a refresh that lands in
 * between is overwritten. So the write is an update() that carries the lastUpdateTime of the
 * read it is based on: Firestore refuses it if the doc was written since (FAILED_PRECONDITION)
 * or deleted since (NOT_FOUND), and update() never creates a doc.
 */
import type { DocumentReference, Firestore } from '@google-cloud/firestore';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { timestampsToDates } from './timestamps.js';

export type UpdateIfUnchanged<T> = (
  userId: string,
  unchanged: (current: T) => boolean,
  fields: Partial<T>
) => Promise<'updated' | 'missing' | 'changed'>;

const NOT_FOUND = 5;
const FAILED_PRECONDITION = 9;

interface Deps<T> {
  cache: Map<string, T>;
  dirty: Set<string>;
  collection: string;
  getFirestore: () => Promise<Firestore | null>;
  refFor: (firestore: Firestore, userId: string) => DocumentReference;
}

/**
 * 'missing': no such doc (or a held/shared id, which is never stored); 'changed': `unchanged`
 * was false, a local write is pending, or the precondition failed. Throws when Firestore is
 * absent or the call fails for another reason.
 */
export function updateIfUnchangedFor<T>(
  deps: Deps<T>,
  blocked: (userId: string) => boolean
): UpdateIfUnchanged<T> {
  const { cache, dirty, collection, getFirestore, refFor } = deps;
  return async (userId, unchanged, fields) => {
    if (blocked(userId)) return 'missing';
    if (dirty.has(userId)) return 'changed'; // an unflushed local write is newer than any read
    const firestore = await getFirestore();
    if (!firestore) throw new Error(`No Firestore (${collection})`);
    const ref = refFor(firestore, userId);
    const snap = await ref.get();
    if (!snap.exists) return 'missing';
    if (!unchanged(timestampsToDates(snap.data()) as T)) return 'changed';
    try {
      await ref.update(cleanForFirestore({ ...fields }), { lastUpdateTime: snap.updateTime });
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === NOT_FOUND) return 'missing';
      if (code === FAILED_PRECONDITION) return 'changed';
      throw error;
    }
    // Keep the cache on what is stored, but never put back an entry a delete just removed.
    const cached = cache.get(userId);
    if (cached !== undefined && !dirty.has(userId) && unchanged(cached)) {
      cache.set(userId, { ...cached, ...fields });
    }
    return 'updated';
  };
}
