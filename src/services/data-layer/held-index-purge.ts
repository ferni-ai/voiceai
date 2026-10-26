/**
 * MINOR_CARE: the semantic index entries a held call made before its hold began.
 *
 * store-hooks.ts indexes nothing for a held caller (writeHeld). But what the stores indexed between
 * the call's start and the age statement is the held caller's: reading between the lines keeps what
 * they said, an inside joke the words it came from. The purge removes the user's auto-synced
 * entries indexed inside the held window; older ones stay.
 *
 * @module services/data-layer/held-index-purge
 */
import { getFirestoreVectorStore } from '../../memory/firestore-vector-store/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { forgetIndexedDoc, type CappedVectorStore } from './max-per-user.js';

const log = createLogger({ module: 'held-index-purge' });

/**
 * Remove this user's store_auto_sync entries whose indexedAt `indexedWhileHeld` covers. Resolves
 * the count removed, or -1 on a failure (logged). Never rejects. The store lists at most 500 of a
 * user's entries, as maxPerUser does.
 */
export async function purgeHeldIndexEntries(
  userId: string,
  indexedWhileHeld: (indexedAt: string) => boolean,
  store: CappedVectorStore = getFirestoreVectorStore()
): Promise<number> {
  try {
    let removed = 0;
    for (const { id, metadata: m } of await store.list({ userId })) {
      if (!id || m?.userId !== userId || m.source !== 'store_auto_sync') continue;
      if (!indexedWhileHeld(String(m.indexedAt ?? ''))) continue;
      await store.removeDocument(id);
      forgetIndexedDoc(userId, String(m.entityType), id);
      removed++;
    }
    log.info({ userId, removed }, 'MINOR_CARE held index entries removed');
    return removed;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'MINOR_CARE held index purge failed');
    return -1;
  }
}
