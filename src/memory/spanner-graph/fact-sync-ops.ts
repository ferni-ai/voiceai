/**
 * The graph sync's fact queue on Firestore and the graph store: the
 * FactSyncOps port of dynamic/spanner-sync-forget.ts, and the queue reads.
 * Re-exported by client.ts for firestore-spanner-sync.ts.
 *
 * @module memory/spanner-graph/fact-sync-ops
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  retryAfter,
  retryDue,
  type FactDoc,
  type FactSyncOps,
} from '../dynamic/spanner-sync-forget.js';

const log = createLogger({ module: 'fact-sync-ops' });

/**
 * Marks a dynamic fact synced in a transaction that re-reads it: with
 * onlyIfLive, a fact forgotten since the sync read it stays unsynced (false).
 */
export async function markFactSynced(
  userId: string,
  docId: string,
  opts: { onlyIfLive: boolean }
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;
  const ref = db.collection('bogle_users').doc(userId).collection('dynamic_facts').doc(docId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const forgottenAt = snap.exists ? snap.get('forgottenAt') : undefined;
    if (opts.onlyIfLive && (!snap.exists || (forgottenAt !== undefined && forgottenAt !== null))) {
      return false;
    }
    if (snap.exists) {
      tx.update(ref, { syncedToSpanner: true, syncedAt: new Date().toISOString() });
    }
    return true;
  });
}

/** The sync's real operations on Firestore, the graph store and its index. */
export function firestoreFactSyncOps(): FactSyncOps {
  return {
    insert: async (fact) => {
      const { insertSyncedFact } = await import('./fact-sync-writes.js');
      return insertSyncedFact({
        factId: `fact_${fact.userId}_${fact.id}`,
        userId: fact.userId,
        factType: fact.factType as 'attribute' | 'event' | 'relationship' | 'state' | 'preference',
        key: fact.key,
        value: fact.value,
        domain: 'general',
        confidence: fact.confidence,
        sourceSession: undefined,
        extractedAt: new Date(fact.extractedAt),
      });
    },
    remove: async (userId, factId) => {
      const { deleteFact } = await import('./fact-sync-writes.js');
      await deleteFact(userId, factId);
    },
    markSynced: async (userId, docId, opts) => markFactSynced(userId, docId, opts),
    deferRetry: async (userId, docId, attempts) => {
      const db = getFirestoreDb();
      if (!db) return;
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('dynamic_facts')
        .doc(docId)
        .update({
          syncedToSpanner: 'retry',
          syncRetryCount: attempts,
          syncRetryAfter: retryAfter(attempts, Date.now()),
        });
    },
  };
}

export const RETRIES_PER_CYCLE = 10;

/**
 * Facts waiting to sync, oldest first; with queue 'retry', facts that
 * failed before and are due again (same index: extractedAt, syncedToSpanner).
 */
export async function getUnsyncedFactDocs(
  limit: number,
  minAgeMs: number,
  queue: false | 'retry' = false
): Promise<FactDoc[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  const cutoffTime = new Date(Date.now() - minAgeMs).toISOString();
  const facts: FactDoc[] = [];
  try {
    const snapshot = await db
      .collectionGroup('dynamic_facts')
      .where('extractedAt', '<', cutoffTime)
      .where('syncedToSpanner', '==', queue)
      .orderBy('extractedAt', 'asc')
      .limit(queue === 'retry' ? limit * 5 : limit)
      .get();
    const now = Date.now();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (queue === 'retry' && !retryDue(data, now)) continue;
      facts.push({ id: doc.id, path: doc.ref.path, data });
      if (facts.length >= limit) break;
    }
  } catch (error) {
    log.warn(
      { error: String(error) },
      'Collection group query failed for facts - check Firestore composite index'
    );
  }
  return facts;
}
