/**
 * A conversation whose turnCount is stored as `{ operand: 1 }` (an old
 * FieldValue.increment write flattened by cleanForFirestore; 427 in prod) must
 * read as 0 turns, not poison the memory summary: getUserMemoryForAPI computed
 * turnCount * 0.5 and sent NaN.
 */
import { describe, expect, it, vi } from 'vitest';

const conversations = vi.hoisted(() => [
  { id: 'c1', turnCount: 12, startedAt: '2026-10-01T10:00:00.000Z' },
  { id: 'c2', turnCount: { operand: 1 }, startedAt: '2026-10-02T10:00:00.000Z' },
  { id: 'c3', turnCount: '7', startedAt: '2026-10-03T10:00:00.000Z' },
]);
const query = {
  orderBy: () => query,
  limit: () => query,
  get: async () => ({ docs: conversations.map((c) => ({ id: c.id, data: () => c })) }),
};
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection = () => ({ doc: () => ({ collection: () => query }) });
  },
  FieldValue: { increment: (n: number) => n },
}));

const { getRecentConversations, getUserMemoryForAPI } = await import('../realtime-memory.js');

describe('turnCount stored as an increment object', () => {
  it('reads as 0, and a real count is kept', async () => {
    const convs = await getRecentConversations('u1', 10);
    expect(Object.fromEntries(convs.map((c) => [c.id, c.turnCount]))).toEqual({
      c1: 12,
      c2: 0,
      c3: 0,
    });
  });

  it('keeps the memory summary a number', async () => {
    const memory = await getUserMemoryForAPI('u1');
    expect(memory?.totalDuration).toBe(6);
    expect(Number.isFinite(memory?.totalDuration)).toBe(true);
  });
});
