/**
 * Derived memory stores: the Firestore vector store (semantic RAG) and the
 * optional Spanner graph. Every removal here is best-effort — a failure is
 * logged and reported as 0, never thrown, so the primary deletion still
 * completes and the response stays truthful about what was removed.
 *
 * @module services/memory-control/derived-stores
 */

import { getFirestoreVectorStore } from '../../memory/firestore-vector-store.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { UndoJournal } from './db.js';

const log = createLogger({ module: 'MemoryControlDerived' });

/** Vector doc ID used by `indexConversationSummary` in memory/retrieval/semantic-rag.ts. */
export function summaryVectorId(summaryId: string): string {
  return `conversation_${summaryId}`;
}

export async function removeVectors(
  userId: string,
  ids: readonly string[],
  journal?: UndoJournal
): Promise<number> {
  if (ids.length === 0) return 0;
  try {
    const store = getFirestoreVectorStore();
    // Only count (and journal) documents that are actually indexed.
    const present: string[] = [];
    for (const id of ids) {
      const doc = await store.getDocument(id);
      // Vector IDs are global: never remove an entry that belongs to someone else.
      if (!doc || (doc.metadata.userId && doc.metadata.userId !== userId)) continue;
      present.push(id);
      journal?.vectors.push(doc);
    }
    if (present.length === 0) return 0;
    return await store.removeDocumentsForUser(userId, present);
  } catch (error) {
    log.warn({ error: String(error), count: ids.length }, 'Vector removal failed');
    return 0;
  }
}

/** Wipe a user's vectors. Failures are logged and, when `errors` is given, recorded there. */
export async function removeAllVectors(userId: string, errors?: string[]): Promise<number> {
  try {
    return await getFirestoreVectorStore().removeAllForUser(userId);
  } catch (error) {
    log.warn({ error: String(error) }, 'Vector wipe failed');
    errors?.push(`vectors: ${String(error)}`);
    return 0;
  }
}

/** Vector doc ID used by memory/signals/user-memory-indexer.ts for a fact. */
export function factVectorId(factDocId: string): string {
  return `conversation_fact_${factDocId}`;
}

/** Replace the text (and so the embedding) of an indexed doc, if it is indexed. */
export async function reindexVector(id: string, text: string): Promise<boolean> {
  try {
    const store = getFirestoreVectorStore();
    const existing = await store.getDocument(id);
    if (!existing) return false;
    await store.addDocument({ id, text, metadata: existing.metadata });
    return true;
  } catch (error) {
    log.warn({ error: String(error) }, 'Vector re-index failed');
    return false;
  }
}

/** Re-add vectors captured in an undo journal. */
export async function restoreVectors(journal: UndoJournal): Promise<void> {
  if (journal.vectors.length === 0) return;
  try {
    const store = getFirestoreVectorStore();
    for (const doc of journal.vectors) {
      await store.addDocument(doc);
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Vector restore failed');
  }
}

/**
 * Remove graph records. Spanner (L3) is off by default; this returns 0 without
 * loading the Spanner client unless SPANNER_ENABLED / SPANNER_EMULATOR_HOST is set.
 */
export async function removeGraphRecords(
  userId: string,
  scope: { factDocIds?: readonly string[]; entityDocIds?: readonly string[]; all?: boolean },
  errors?: string[]
): Promise<number> {
  if (process.env.SPANNER_ENABLED !== 'true' && !process.env.SPANNER_EMULATOR_HOST) return 0;
  try {
    const { deleteUserGraphRecords } = await import('../../memory/spanner-graph/client.js');
    if (scope.all) return await deleteUserGraphRecords(userId);
    return await deleteUserGraphRecords(userId, {
      factIds: (scope.factDocIds ?? []).map((id) => `fact_${userId}_${id}`),
      entityIds: (scope.entityDocIds ?? []).map((id) => `entity_${userId}_${id}`),
    });
  } catch (error) {
    log.warn({ error: String(error) }, 'Graph removal failed');
    errors?.push(`graph: ${String(error)}`);
    return 0;
  }
}
