/**
 * Forgetting removes only the caller's own indexed copy. Fact ids are hashes
 * of a fact's words, so two callers with the same fact share an id; one
 * caller's forget must leave the other's copy searchable.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { removeOwnedConversationDocument } from '../conversation-index.js';
import { setActiveVectorStore } from '../semantic-rag.js';

const docs = new Map<string, { metadata: { userId?: string } }>();
const fakeStore = {
  getDocument: async (id: string) => docs.get(id),
  removeDocument: async (id: string) => docs.delete(id),
};

beforeEach(() => {
  docs.clear();
  setActiveVectorStore(fakeStore as never);
});

describe('removeOwnedConversationDocument', () => {
  it("removes the caller's copy", async () => {
    docs.set('conversation_fact_abc', { metadata: { userId: 'u1' } });
    expect(await removeOwnedConversationDocument('fact_abc', 'u1')).toBe(true);
    expect(docs.has('conversation_fact_abc')).toBe(false);
  });

  it("leaves another caller's copy with the same id, and one with no owner", async () => {
    docs.set('conversation_fact_abc', { metadata: { userId: 'u2' } });
    docs.set('conversation_fact_def', { metadata: {} });
    expect(await removeOwnedConversationDocument('fact_abc', 'u1')).toBe(false);
    expect(await removeOwnedConversationDocument('fact_def', 'u1')).toBe(false);
    expect(await removeOwnedConversationDocument('fact_none', 'u1')).toBe(false);
    expect([...docs.keys()]).toEqual(['conversation_fact_abc', 'conversation_fact_def']);
  });
});
