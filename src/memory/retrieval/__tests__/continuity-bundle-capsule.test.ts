/**
 * retrieveContinuityBundle builds threads and anchors from the Firestore
 * memory capsule: every stored thread (capsule order, confidence 0.6) and the
 * anchors with significance >= 0.7, each list capped at 10.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const capsuleGet = vi.fn();

vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({ collection: () => ({ doc: () => ({ get: capsuleGet }) }) }),
    }),
  }),
}));

const searchMemories = vi.fn();
vi.mock('../semantic-memory-search.js', () => ({
  searchMemories,
  toSemanticMatches: () => [],
}));

const { retrieveContinuityBundle } = await import('../hybrid-continuity-retrieval.js');

const day = (iso: string) => new Date(iso).toISOString();

describe('retrieveContinuityBundle reads the memory capsule', () => {
  beforeEach(() => {
    capsuleGet.mockReset();
    searchMemories.mockReset();
  });

  it('returns stored threads and the anchors with significance >= 0.7', async () => {
    capsuleGet.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user-riley',
        rollingSummary: 'Riley is training for a half marathon.',
        activeThreads: [
          { theme: 'running', lastUpdated: day('2026-11-09T00:00:00Z'), sessionCount: 4 },
          { theme: 'work', lastUpdated: day('2026-11-02T00:00:00Z'), sessionCount: 2 },
        ],
        topAnchors: [
          { type: 'milestone', summary: 'Riley ran 15 km', significance: 0.9 },
          { type: 'growth', summary: 'Riley stretches now', significance: 0.5 },
          { type: 'commitment', summary: 'Riley will rest on Sundays', significance: 0.7 },
        ],
        lastEmotionalState: 'proud',
        pendingTopics: ['race day'],
        lastSessionId: 'session-riley-1',
        updatedAt: day('2026-11-09T00:00:00Z'),
        version: 2,
      }),
    });

    const bundle = await retrieveContinuityBundle('user-riley');

    expect(bundle.activeThreads.map((t) => [t.theme, t.sessionCount, t.confidence])).toEqual([
      ['running', 4, 0.6],
      ['work', 2, 0.6],
    ]);
    expect(bundle.topAnchors.map((a) => [a.type, a.summary, a.significance])).toEqual([
      ['milestone', 'Riley ran 15 km', 0.9],
      ['commitment', 'Riley will rest on Sundays', 0.7],
    ]);
    expect(bundle.pendingTopics).toEqual(['race day']);
    expect(bundle.rollingSummary).toBe('Riley is training for a half marathon.');
    expect(bundle.metadata).toMatchObject({ capsuleFound: true, threadCount: 2, anchorCount: 2 });
    expect(searchMemories).not.toHaveBeenCalled();
  });

  it('returns empty lists when there is no capsule', async () => {
    capsuleGet.mockResolvedValue({ exists: false });

    const bundle = await retrieveContinuityBundle('user-mia');

    expect(bundle.activeThreads).toEqual([]);
    expect(bundle.topAnchors).toEqual([]);
    expect(bundle.pendingTopics).toEqual([]);
    expect(bundle.metadata).toMatchObject({ capsuleFound: false, threadCount: 0, anchorCount: 0 });
  });
});
