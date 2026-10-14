/**
 * Removing a document the conversation index holds (indexConversationSummary
 * in semantic-rag.ts writes it as "conversation_<id>"), for forgetting.
 *
 * @module memory/retrieval/conversation-index
 */
import { getActiveStore } from './semantic-rag.js';

/** Remove a conversation document indexed by indexConversationSummary (same id). */
export async function removeConversationDocument(id: string): Promise<void> {
  await getActiveStore().removeDocument(`conversation_${id}`);
}

/**
 * Remove an indexed copy only when it is this caller's (metadata.userId, as
 * indexConversationSummary writes it). The ids are not per caller: a fact's
 * is a hash of its words (deep-extraction factDocId), so two callers with the
 * same fact share one, and forgetting it for one must never delete the
 * other's copy. Returns whether a copy was removed.
 */
export async function removeOwnedConversationDocument(
  id: string,
  userId: string
): Promise<boolean> {
  const store = getActiveStore();
  const docId = `conversation_${id}`;
  const doc = await store.getDocument(docId);
  if (doc?.metadata.userId !== userId) return false;
  await store.removeDocument(docId);
  return true;
}
