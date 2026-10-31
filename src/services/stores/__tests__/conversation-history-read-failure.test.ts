/**
 * History reads fail loudly. getHistory used to catch every store error and
 * return no sessions, so GET /api/conversations answered 200 with an empty
 * history and the panel told people they had never talked to Ferni.
 * (The write -> read contract lives in src/api/__tests__/menu-history.emulator.test.ts.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getConversationSessions = vi.fn();
vi.mock('../../engagement/engagement-store.js', () => ({
  getEngagementStore: async () => ({ getConversationSessions }),
}));

const query = { orderBy: vi.fn(), limit: vi.fn(), select: vi.fn(), get: vi.fn() };
query.orderBy.mockReturnValue(query);
query.limit.mockReturnValue(query);
query.select.mockReturnValue(query); // sessions-together reads the same calls for the total
const db = {
  collection: () => ({ doc: () => ({ collection: () => query }) }),
};
const getFirestoreDb = vi.fn<() => unknown>(() => db);
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb }));

const { getConversationHistoryService } = await import('../conversation-history.js');

beforeEach(() => {
  vi.clearAllMocks();
  getFirestoreDb.mockReturnValue(db);
  query.get.mockResolvedValue({ docs: [] });
  getConversationSessions.mockResolvedValue([]);
});

describe('conversation history read failures', () => {
  it('rejects when the call records cannot be read', async () => {
    query.get.mockRejectedValueOnce(new Error('DEADLINE_EXCEEDED'));
    await expect(getConversationHistoryService().getHistory('u1')).rejects.toThrow(
      'DEADLINE_EXCEEDED'
    );
  });

  it('rejects when the web hang-up summaries cannot be read', async () => {
    getConversationSessions.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    await expect(getConversationHistoryService().getHistory('u1')).rejects.toThrow(
      'PERMISSION_DENIED'
    );
  });

  it('rejects when Firestore is unavailable', async () => {
    getFirestoreDb.mockReturnValueOnce(null);
    await expect(getConversationHistoryService().getHistory('u1')).rejects.toThrow(
      'Firestore unavailable'
    );
  });

  it('an empty history is still a 200-shaped answer', async () => {
    await expect(getConversationHistoryService().getHistory('u1')).resolves.toMatchObject({
      sessions: [],
      totalSessions: 0,
    });
  });
});
