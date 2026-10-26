/**
 * MINOR_CARE: the semantic index entries a held call made before its hold began (store-hooks.ts
 * indexes nothing once it's held): what they said, read between the lines, an inside joke's words.
 * Search drops them too (forget-filter.ts).
 *
 * @module services/data-layer/held-index-purge
 */
import { FieldPath } from 'firebase-admin/firestore';
import { getFirestoreVectorStore } from '../../memory/firestore-vector-store/index.js';
import { DEFAULT_COLLECTION_NAME } from '../../memory/firestore-vector-store/types.js';
import { getAdminFirestore } from '../../utils/firebase-admin-app.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { VectorDocument } from '../../memory/vector-store-interface.js';
import { forgetIndexedDoc } from './max-per-user.js';

const log = createLogger({ module: 'held-index-purge' });

const PAGE = 500;
/** Past this many of one user's entries, the purge stops and reports a failure. */
export const MAX_PAGES = 40;

/** What the purge needs of the vector store (FirestoreVectorStore). */
export interface HeldIndexStore {
  removeDocument(id: string): Promise<boolean>;
  cached(filter: { userId: string }): Promise<{ docs: VectorDocument[]; fallback: boolean }>;
}

/**
 * Remove the user's store_auto_sync entries indexed in a held window: in the fallback cache (so
 * recovery can't migrate them back), then in Firestore, a page at a time (metadata only). Resolves
 * the count removed, or -1 (counts logged; the next session start retries) when a remove failed,
 * the store is in fallback mode, or the listing failed or was cut short. Never rejects.
 */
export async function purgeHeldIndexEntries(
  userId: string,
  indexedWhileHeld: (indexedAt: string) => boolean,
  store: HeldIndexStore = getFirestoreVectorStore()
): Promise<number> {
  let read = 0;
  let removed = 0;
  let failed = 0;
  const done = new Set<string>(); // a cached entry may be in Firestore too
  const remove = async (id: string, m: Record<string, unknown> | undefined) => {
    if (m?.source !== 'store_auto_sync' || !indexedWhileHeld(String(m.indexedAt ?? ''))) return;
    if (done.has(id)) return;
    if (!(await store.removeDocument(id))) return void failed++;
    done.add(id);
    forgetIndexedDoc(userId, String(m.entityType), id);
    removed++;
  };
  try {
    const cache = await store.cached({ userId });
    for (const doc of cache.docs) await remove(doc.id, doc.metadata);
    if (cache.fallback) throw new Error('vector store in fallback mode');
    const mine = getAdminFirestore()
      .collection(DEFAULT_COLLECTION_NAME)
      .where('metadata.userId', '==', userId)
      .orderBy(FieldPath.documentId())
      .select('metadata')
      .limit(PAGE);
    let page = await mine.get();
    for (let n = 1; ; n++) {
      read += page.size;
      for (const doc of page.docs) await remove(doc.id, doc.get('metadata'));
      if (page.size < PAGE) break;
      if (n >= MAX_PAGES) throw new Error('listing cut short');
      page = await mine.startAfter(page.docs[page.size - 1]).get();
    }
    if (failed > 0) throw new Error('a remove failed');
    log.info({ userId, read, removed }, 'MINOR_CARE held index entries removed');
    return removed;
  } catch (error) {
    const counts = { userId, read, removed, failed };
    log.warn({ ...counts, error: String(error) }, 'MINOR_CARE held index purge failed');
    return -1;
  }
}
