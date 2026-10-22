/**
 * The graph sync's writes for one dynamic fact: copy it (and its semantic
 * index entry) and remove a forgotten one (firestore-spanner-sync.ts via
 * dynamic/spanner-sync-forget.ts).
 *
 * The copy is an upsert, so a retry after a write that committed but wasn't
 * marked never fails on a duplicate key, and it waits for the index entry:
 * if the fact turns out to have been forgotten meanwhile, the removal that
 * follows can't be overtaken by a late index write. The removal throws
 * unless both the row and the index copy are confirmed gone.
 *
 * @module memory/spanner-graph/fact-sync-writes
 */
import { getDatabase, isSpannerReady } from './client.js';
import { graphWriteSkipped } from './graph-write-gate.js';
import type { GraphFact } from './schema.js';

/** Upserts the fact and waits for its semantic-index copy. false when the graph write fails. */
export async function insertSyncedFact(fact: Omit<GraphFact, 'createdAt'>): Promise<boolean> {
  if (!isSpannerReady() || graphWriteSkipped('insertSyncedFact')) return false;
  const domain = fact.domain || 'general';
  try {
    await getDatabase().runTransactionAsync(async (transaction) => {
      await transaction.runUpdate({
        sql: `
          INSERT OR UPDATE INTO facts
          (fact_id, user_id, fact_type, key, value, domain, confidence, source_session, extracted_at, created_at)
          VALUES
          (@factId, @userId, @factType, @key, @value, @domain, @confidence, @sourceSession, @extractedAt, @createdAt)
        `,
        params: {
          factId: fact.factId,
          userId: fact.userId,
          factType: fact.factType,
          key: fact.key,
          value: fact.value,
          domain,
          confidence: fact.confidence,
          sourceSession: fact.sourceSession || null,
          extractedAt: fact.extractedAt.toISOString(),
          createdAt: new Date().toISOString(),
        },
      });
      await transaction.commit();
    });
  } catch {
    return false;
  }
  const { indexMemory } = await import('../retrieval/semantic-memory-search.js');
  await indexMemory(fact.userId, `${fact.key}: ${fact.value}`, 'fact', fact.factId, {
    domain,
    factType: fact.factType,
    confidence: fact.confidence,
  });
  return true;
}

/**
 * Deletes a forgotten fact, its entity links, and its semantic-index copy.
 * Throws unless all are confirmed gone, so the sync never marks it done.
 */
export async function deleteFact(userId: string, factId: string): Promise<void> {
  if (!isSpannerReady() || graphWriteSkipped('deleteFact')) throw new Error('Spanner not ready');
  await getDatabase().runTransactionAsync(async (transaction) => {
    await transaction.runUpdate({
      sql: 'DELETE FROM entity_facts WHERE user_id = @userId AND fact_id = @factId',
      params: { userId, factId },
    });
    await transaction.runUpdate({
      sql: 'DELETE FROM facts WHERE user_id = @userId AND fact_id = @factId',
      params: { userId, factId },
    });
    await transaction.commit();
  });
  // Not removeIndexedMemory: it logs and swallows a failure.
  const { getFirestoreVectorStore } = await import('../firestore-vector-store.js');
  const store = getFirestoreVectorStore();
  if (!store.isInitialized) await store.initialize();
  if (!(await store.removeDocument(`fact_${factId}`))) {
    throw new Error('Index copy not removed');
  }
}
