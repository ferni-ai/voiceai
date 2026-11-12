/**
 * writeSessionContinuity writes one thing: the Firestore memory capsule. The
 * capsule keeps the threads it already had (newest first) and merges the
 * session's detected anchors in by significance. Nothing else is written, and
 * the result reports no thread or anchor writes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const capsuleGet = vi.fn();
const capsuleSet = vi.fn();
const capsuleRef = { get: capsuleGet };

vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({ collection: () => ({ doc: () => capsuleRef }) }),
    }),
    runTransaction: async (
      fn: (tx: { get: (ref: typeof capsuleRef) => unknown; set: typeof capsuleSet }) => unknown
    ) => fn({ get: (ref) => ref.get(), set: capsuleSet }),
  }),
}));

const indexMemoriesBatch = vi.fn(async (_userId: string, _items: unknown[]) => undefined);
vi.mock('../../retrieval/semantic-memory-search.js', () => ({ indexMemoriesBatch }));

// The graph's writers, mocked so that a call coming back shows up: nothing may reach them.
const upsertMemoryThread = vi.fn(async (_thread: unknown) => undefined);
const insertMemoryAnchor = vi.fn(async (_anchor: unknown) => undefined);
vi.mock('../../spanner-graph/client.js', () => ({
  isSpannerReady: () => true,
  upsertMemoryThread,
  insertMemoryAnchor,
}));

const { writeSessionContinuity } = await import('../memory-continuity.js');
type SessionData = import('../memory-continuity.js').SessionContinuityData;

const session = (over: Partial<SessionData> = {}): SessionData => ({
  sessionId: 'session-sam-2',
  userId: 'user-sam',
  mainTopics: ['career', 'health'],
  naturalSummary: 'Sam talked about a new job offer and sleeping badly.',
  insights: [
    { type: 'breakthrough', content: 'Sam sees the offer as a fresh start', confidence: 0.9 },
  ],
  endingEmotionalState: 'hopeful',
  unfinishedTopics: ['sleep'],
  commitmentsMade: [],
  wasSignificant: false,
  significanceScore: 0.4,
  durationSeconds: 600,
  ...over,
});

describe('writeSessionContinuity writes only the Firestore capsule', () => {
  beforeEach(() => {
    capsuleGet.mockReset();
    capsuleSet.mockReset();
    indexMemoriesBatch.mockClear();
    upsertMemoryThread.mockClear();
    insertMemoryAnchor.mockClear();
  });

  it('keeps existing threads newest first and merges detected anchors by significance', async () => {
    capsuleGet.mockResolvedValue({
      data: () => ({
        rollingSummary: 'Earlier: Sam planned a garden.',
        activeThreads: [
          { theme: 'career', lastUpdated: '2026-11-01T00:00:00.000Z', sessionCount: 3 },
          { theme: 'garden', lastUpdated: '2026-11-05T00:00:00.000Z', sessionCount: 1 },
        ],
        topAnchors: [{ type: 'growth', summary: 'Sam started journaling', significance: 0.6 }],
        pendingTopics: ['garden beds'],
        version: 4,
      }),
    });

    const result = await writeSessionContinuity(session());

    expect(result).toEqual({ threadsUpdated: 0, anchorsCreated: 0, capsuleUpdated: true });
    expect(capsuleSet).toHaveBeenCalledTimes(1);
    const written = capsuleSet.mock.calls[0][1];
    // No thread is created from the session's topics: only the stored ones, newest first.
    expect(written.activeThreads.map((t: { theme: string }) => t.theme)).toEqual([
      'garden',
      'career',
    ]);
    expect(written.topAnchors).toEqual([
      { type: 'breakthrough', summary: 'Sam sees the offer as a fresh start', significance: 1 },
      { type: 'growth', summary: 'Sam started journaling', significance: 0.6 },
    ]);
    expect(written.pendingTopics).toEqual(['garden beds', 'sleep']);
    expect(written.version).toBe(5);
    // Nothing else is written: no graph thread for the topics, no graph anchor.
    expect(upsertMemoryThread).not.toHaveBeenCalled();
    expect(insertMemoryAnchor).not.toHaveBeenCalled();
    // Only the session summary is indexed for search; detected anchors are not.
    expect(indexMemoriesBatch).toHaveBeenCalledTimes(1);
    expect(indexMemoriesBatch.mock.calls[0][1]).toEqual([
      expect.objectContaining({ source: 'session_summary', sourceId: 'session-sam-2' }),
    ]);
  });

  it('writes nothing for a session under 30 seconds', async () => {
    const result = await writeSessionContinuity(session({ durationSeconds: 20 }));

    expect(result).toEqual({ threadsUpdated: 0, anchorsCreated: 0, capsuleUpdated: false });
    expect(capsuleSet).not.toHaveBeenCalled();
  });
});
