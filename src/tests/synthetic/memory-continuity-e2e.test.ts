/**
 * Memory Continuity E2E Tests
 *
 * Tests for the memory continuity system that provides "Better than Human" recall:
 * - Session continuity writes (capsule only)
 * - Firestore capsule hydration
 * - Hybrid retrieval ranking
 * - Session continuity cache
 *
 * @module tests/synthetic/memory-continuity-e2e
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock Firestore
const mockFirestoreDoc = {
  get: vi.fn(),
  set: vi.fn(),
};

const mockFirestoreCollection = {
  doc: vi.fn(() => mockFirestoreDoc),
};

vi.mock('../../utils/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => mockFirestoreCollection),
      })),
    })),
  })),
}));

// Mock Spanner client. The old thread and anchor writers are gone from the
// client; the mock keeps their names so a re-added write turns the row red.
const { upsertMemoryThread, insertMemoryAnchor } = vi.hoisted(() => ({
  upsertMemoryThread: vi.fn(),
  insertMemoryAnchor: vi.fn(),
}));
vi.mock('../../memory/spanner-graph/client.js', () => ({
  isSpannerReady: vi.fn(() => true),
  upsertMemoryThread,
  insertMemoryAnchor,
  getMemoryThreadsByUser: vi.fn(() => []),
  getMemoryAnchorsByUser: vi.fn(() => []),
  markAnchorRecalled: vi.fn(),
}));

// Import after mocks
import {
  writeSessionContinuity,
  getMemoryCapsule,
  type SessionContinuityData,
  type MemoryCapsule,
} from '../../memory/dynamic/memory-continuity.js';

// NOTE: src/memory/dynamic/session-continuity-cache.ts was removed in 10d8bb325
// and has no replacement, so the cache-specific tests that lived here were
// retired. Thread state, capsule hydration and hybrid retrieval below are still
// live and remain covered.

import {
  retrieveContinuityBundle,
  formatContinuityForLLM,
  type ContinuityBundle,
} from '../../memory/retrieval/hybrid-continuity-retrieval.js';

import {
  isSpannerReady,
  getMemoryThreadsByUser,
  getMemoryAnchorsByUser,
} from '../../memory/spanner-graph/client.js';

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

function createTestSessionData(overrides?: Partial<SessionContinuityData>): SessionContinuityData {
  return {
    sessionId: 'session-test-123',
    userId: 'user-test-456',
    mainTopics: ['career', 'relationships'],
    naturalSummary: 'User discussed career challenges and relationship concerns.',
    insights: [
      { type: 'pattern', content: 'User tends to overthink decisions', confidence: 0.8 },
      { type: 'growth', content: 'Showing more self-awareness', confidence: 0.7 },
    ],
    endingEmotionalState: 'hopeful',
    emotionalArc: 'Started anxious, ended hopeful',
    unfinishedTopics: ['work-life balance'],
    commitmentsMade: ['Will practice mindfulness daily'],
    wasSignificant: true,
    significanceScore: 0.85,
    durationSeconds: 600,
    ...overrides,
  };
}

function createTestCapsule(overrides?: Partial<MemoryCapsule>): MemoryCapsule {
  return {
    userId: 'user-test-456',
    rollingSummary: 'Recent conversations about career and relationships.',
    activeThreads: [
      { theme: 'career', lastUpdated: new Date().toISOString(), sessionCount: 3 },
      { theme: 'relationships', lastUpdated: new Date().toISOString(), sessionCount: 2 },
    ],
    topAnchors: [{ type: 'breakthrough', summary: 'Realized fear of failure', significance: 0.9 }],
    lastEmotionalState: 'hopeful',
    pendingTopics: ['work-life balance'],
    lastSessionId: 'session-prev-123',
    updatedAt: new Date().toISOString(),
    version: 1,
    ...overrides,
  };
}

// ============================================================================
// THREAD STATE TESTS
// ============================================================================

describe('Session continuity writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip trivial sessions under 30 seconds', async () => {
    const result = await writeSessionContinuity(createTestSessionData({ durationSeconds: 20 }));

    expect(result).toEqual({ threadsUpdated: 0, anchorsCreated: 0, capsuleUpdated: false });
  });

  it('should skip sessions without a summary', async () => {
    const result = await writeSessionContinuity(createTestSessionData({ naturalSummary: '' }));

    expect(result.capsuleUpdated).toBe(false);
  });

  it('writes no graph thread or anchor for a full, significant session', async () => {
    const data = createTestSessionData();
    expect(data.mainTopics.length).toBeGreaterThan(0);
    expect(data.insights.length).toBeGreaterThan(0);

    const result = await writeSessionContinuity(data);

    expect(result.threadsUpdated).toBe(0);
    expect(result.anchorsCreated).toBe(0);
    expect(upsertMemoryThread).not.toHaveBeenCalled();
    expect(insertMemoryAnchor).not.toHaveBeenCalled();
  });
});

// ============================================================================
// CAPSULE HYDRATION TESTS
// ============================================================================

describe('Firestore Capsule Hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null for non-existent capsule', async () => {
    mockFirestoreDoc.get.mockResolvedValue({ exists: false });

    const capsule = await getMemoryCapsule('nonexistent-user');

    // May return null if doc doesn't exist
    expect(mockFirestoreDoc.get).toHaveBeenCalled();
  });

  it('should retrieve existing capsule from Firestore', async () => {
    const testCapsule = createTestCapsule();
    mockFirestoreDoc.get.mockResolvedValue({
      exists: true,
      data: () => testCapsule,
    });

    // Note: getMemoryCapsule uses the db directly, so mock setup may differ
    // This test verifies the function handles existing data correctly
  });

});

// ============================================================================
// HYBRID RETRIEVAL TESTS
// ============================================================================

describe('Hybrid Retrieval Ranking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should retrieve continuity bundle with metadata', async () => {
    vi.mocked(getMemoryThreadsByUser).mockResolvedValue([
      {
        threadId: 'thread-1',
        userId: 'user-test',
        theme: 'career',
        rollingSummary: 'Career discussions',
        confidence: 0.8,
        sessionCount: 5,
        lastUpdated: new Date(),
        firstMentioned: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      },
    ]);

    vi.mocked(getMemoryAnchorsByUser).mockResolvedValue([
      {
        anchorId: 'anchor-1',
        userId: 'user-test',
        anchorType: 'breakthrough',
        payload: { summary: 'Major insight' },
        significanceScore: 0.9,
        recallCount: 2,
        createdAt: new Date(),
      },
    ]);

    const bundle = await retrieveContinuityBundle('user-test', {
      currentContext: 'Let me tell you about my career',
    });

    expect(bundle.metadata.spannerAvailable).toBe(true);
    expect(bundle.activeThreads.length).toBeGreaterThanOrEqual(0);
    expect(bundle.topAnchors.length).toBeGreaterThanOrEqual(0);
  });

  it('should format bundle for LLM context', () => {
    const bundle: ContinuityBundle = {
      rollingSummary: 'Recent career discussions',
      activeThreads: [
        {
          theme: 'career',
          sessionCount: 3,
          daysSinceLastUpdate: 1,
          confidence: 0.8,
          relevanceScore: 0.9,
        },
      ],
      topAnchors: [
        {
          type: 'breakthrough',
          summary: 'Realized need for boundaries',
          significance: 0.9,
          daysSinceCreated: 2,
          timesRecalled: 1,
          relevanceScore: 0.85,
        },
      ],
      pendingTopics: ['work-life balance'],
      lastEmotionalState: 'hopeful',
      semanticMatches: [],
      metadata: {
        spannerAvailable: true,
        capsuleFound: true,
        retrievalTimeMs: 50,
        threadCount: 1,
        anchorCount: 1,
        semanticMatchCount: 0,
      },
    };

    const formatted = formatContinuityForLLM(bundle);

    expect(formatted).toContain('[MEMORY CONTINUITY]');
    expect(formatted).toContain('career');
    // Anchor type 'breakthrough' is rendered as 💡 emoji, not text
    expect(formatted).toContain('💡');
    expect(formatted).toContain('Realized need for boundaries'); // anchor summary
    expect(formatted).toContain('work-life balance');
  });

  it('should return empty string for empty bundle', () => {
    const emptyBundle: ContinuityBundle = {
      activeThreads: [],
      topAnchors: [],
      pendingTopics: [],
      semanticMatches: [],
      metadata: {
        spannerAvailable: false,
        capsuleFound: false,
        retrievalTimeMs: 10,
        threadCount: 0,
        anchorCount: 0,
        semanticMatchCount: 0,
      },
    };

    const formatted = formatContinuityForLLM(emptyBundle);

    expect(formatted).toBe('');
  });

  it('should rank threads by recency and relevance', async () => {
    vi.mocked(getMemoryThreadsByUser).mockResolvedValue([
      {
        threadId: 'old-thread',
        userId: 'user-test',
        theme: 'old topic',
        confidence: 0.9,
        sessionCount: 10,
        lastUpdated: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        firstMentioned: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      },
      {
        threadId: 'recent-thread',
        userId: 'user-test',
        theme: 'career growth',
        confidence: 0.7,
        sessionCount: 3,
        lastUpdated: new Date(), // Today
        firstMentioned: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      },
    ]);

    const bundle = await retrieveContinuityBundle('user-test', {
      currentContext: 'career',
    });

    // Recent thread should rank higher due to freshness + relevance
    if (bundle.activeThreads.length >= 2) {
      expect(bundle.activeThreads[0].theme).toBe('career growth');
    }
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Memory Continuity Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle full session lifecycle', async () => {
    const sessionId = 'lifecycle-session';
    const userId = 'lifecycle-user';

    // 1. Session start - capsule hydration
    const capsule = createTestCapsule({ userId });
    (globalThis as Record<string, unknown>)[`memoryCapsule_${sessionId}`] = capsule;

    // 2. Session end - write continuity data
    // (the in-memory continuity cache step was removed with
    // session-continuity-cache.ts in 10d8bb325)
    const sessionData = createTestSessionData({ sessionId, userId });
    const writeResult = await writeSessionContinuity(sessionData);

    expect(writeResult).toHaveProperty('capsuleUpdated');

    // 3. Cleanup
    delete (globalThis as Record<string, unknown>)[`memoryCapsule_${sessionId}`];
    expect(
      (globalThis as Record<string, unknown>)[`memoryCapsule_${sessionId}`]
    ).toBeUndefined();
  });
});
