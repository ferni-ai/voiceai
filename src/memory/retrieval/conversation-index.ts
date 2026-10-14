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
