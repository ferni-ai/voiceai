/**
 * MINOR_CARE: the semantic index entries a held call made before its hold began.
 *
 * store-hooks.ts indexes nothing for a held caller (writeHeld). But what the stores indexed between
 * the call's start and the age statement is the held caller's: reading between the lines keeps what
 * they said, an inside joke the words it came from. The purge removes the user's auto-synced
 * entries indexed inside the held window; older ones stay. Search drops them too
 * (forget-filter.ts), so a purge that failed never hands them to a later call.
 *
 * @module services/data-layer/held-index-purge
 */
import { FieldPath } from 'firebase-admin/firestore';
import { getFirestoreVectorStore } from '../../memory/firestore-vector-store/index.js';
import { DEFAULT_COLLECTION_NAME } from '../../memory/firestore-vector-store/types.js';
import { getAdminFirestore } from '../../utils/firebase-admin-app.js';
import { createLogger } from '../../utils/safe-logger.js';
import { forgetIndexedDoc } from './max-per-user.js';

const log = createLogger({ module: 'held-index-purge' });

const PAGE = 500;
/** Past this many of one user's entries, the purge stops and reports a failure. */
export const MAX_PAGES = 40;

/**
 * Remove this user's store_auto_sync entries whose indexedAt `indexedWhileHeld` covers, reading
 * every one of the user's entries a page at a time (metadata only). Resolves the count removed,
 * or -1 when the listing failed or was cut short (logged with counts only). Never rejects.
 */
export async function purgeHeldIndexEntries(
  userId: string,
  indexedWhileHeld: (indexedAt: string) => boolean,
  store: { removeDocument(id: string): Promise<boolean> } = getFirestoreVectorStore()
): Promise<number> {
  let read = 0;
  let removed = 0;
  try {
    const mine = getAdminFirestore()
      .collection(DEFAULT_COLLECTION_NAME)
      .where('metadata.userId', '==', userId)
      .orderBy(FieldPath.documentId())
      .select('metadata')
      .limit(PAGE);
    let page = await mine.get();
    for (let n = 1; ; n++) {
      read += page.size;
      for (const doc of page.docs) {
        const m = (doc.get('metadata') ?? {}) as Record<string, unknown>;
        if (m.source !== 'store_auto_sync' || !indexedWhileHeld(String(m.indexedAt ?? ''))) continue;
        await store.removeDocument(doc.id);
        forgetIndexedDoc(userId, String(m.entityType), doc.id);
        removed++;
      }
      if (page.size < PAGE) break;
      if (n >= MAX_PAGES) throw new Error('listing cut short');
      page = await mine.startAfter(page.docs[page.size - 1]).get();
    }
    log.info({ userId, read, removed }, 'MINOR_CARE held index entries removed');
    return removed;
  } catch (error) {
    log.warn({ userId, read, removed, error: String(error) }, 'MINOR_CARE held index purge failed');
    return -1;
  }
}
