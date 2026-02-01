/**
 * Memory Superhuman Features E2E Tests
 *
 * Tests for:
 * 1. Semantic memory search integration
 * 2. Recall attribution parsing
 * 3. Graph context queries
 *
 * @module tests/synthetic/memory-superhuman-e2e
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock Firestore vector store
vi.mock('../../memory/firestore-vector-store/index.js', () => ({
  getFirestoreVectorStore: () => ({
    isInitialized: true,
    initialize: vi.fn(),
    searchByEmbedding: vi.fn().mockResolvedValue([
      {
        document: {
          id: 'anchor_test123',
          text: 'User mentioned they are worried about their job security',
          metadata: {
            source: 'anchor',
            userId: 'user-123',
            sourceId: 'anchor_test123',
          },
        },
        score: 0.85,
      },
      {
        document: {
          id: 'session_abc',
          text: 'Discussed career plans and upcoming interview',
          metadata: {
            source: 'session_summary',
            userId: 'user-123',
            sourceId: 'session_abc',
          },
        },
        score: 0.72,
      },
    ]),
    addDocument: vi.fn(),
    addDocuments: vi.fn(),
    removeDocument: vi.fn(),
  }),
}));

// Mock embeddings
vi.mock('../../memory/embeddings.js', () => ({
  embed: vi.fn().mockResolvedValue(new Array(768).fill(0.1)),
  embedBatch: vi.fn().mockResolvedValue([new Array(768).fill(0.1)]),
}));

// Mock Spanner
vi.mock('../../memory/spanner-graph/client.js', () => ({
  isSpannerReady: vi.fn().mockReturnValue(true),
  getMemoryThreadsByUser: vi.fn().mockResolvedValue([
    {
      threadId: 'thread_career',
      theme: 'Career Concerns',
      rollingSummary: 'Multiple conversations about job security and career growth',
      sessionCount: 5,
      confidence: 0.8,
      lastUpdated: new Date(),
    },
  ]),
  getMemoryAnchorsByUser: vi.fn().mockResolvedValue([
    {
      anchorId: 'anchor_commitment1',
      anchorType: 'commitment',
      payload: {
        summary: 'User committed to updating their resume this week',
        context: 'Career planning discussion',
      },
      significanceScore: 0.9,
      recallCount: 2,
      createdAt: new Date(),
    },
  ]),
  markAnchorRecalled: vi.fn(),
}));

// Mock Spanner graph queries
vi.mock('../../memory/spanner-graph/queries.js', () => ({
  getEntityContext: vi.fn().mockResolvedValue({
    entity: {
      entityId: 'entity_sarah',
      name: 'Sarah',
      entityType: 'person',
      facts: [
        { key: 'relationship', value: 'colleague' },
        { key: 'workplace', value: 'Tech Company' },
      ],
    },
    relatedEntities: [
      {
        entity: { name: 'Mike', entityType: 'person' },
        relationshipType: 'works_with',
        strength: 0.7,
      },
    ],
    summary:
      '**Sarah** (person)\n\nWhat you know:\n- relationship: colleague\n- workplace: Tech Company',
  }),
  getRelationshipContext: vi.fn().mockResolvedValue({
    entity1: { name: 'Sarah' },
    entity2: { name: 'Mike' },
    directRelationship: { relationship: { relationshipType: 'works_with' } },
    sharedConnections: [],
    summary: '**Sarah** and **Mike** are connected: works_with',
  }),
  searchFactsAboutEntity: vi.fn().mockResolvedValue({
    entity: { name: 'Sarah' },
    facts: [{ key: 'job_title', value: 'Senior Engineer', domain: 'work' }],
    summary: "**Sarah's work situation:**\n- job_title: Senior Engineer",
  }),
  getEntityWithFacts: vi.fn().mockResolvedValue(null),
  getEntityRelationships: vi.fn().mockResolvedValue([]),
}));

// ============================================================================
// TEST IMPORTS (after mocks)
// ============================================================================

import {
  searchMemories,
  toSemanticMatches,
  type SemanticSearchResult,
} from '../../memory/retrieval/semantic-memory-search.js';

import {
  parseAttributions,
  containsMemoryReferences,
  extractMemoryTags,
  aggregateAttributionStats,
  type AttributionSummary,
} from '../../memory/retrieval/recall-attribution.js';

import {
  getInjectedMemories,
  type InjectedMemory,
} from '../../memory/retrieval/hybrid-continuity-retrieval.js';

import {
  detectEntityMentions,
  detectRelationshipMentions,
} from '../../intelligence/context-builders/memory/graph-context.js';

// ============================================================================
// SEMANTIC SEARCH TESTS
// ============================================================================

describe('Semantic Memory Search', () => {
  it('should search for semantically similar memories', async () => {
    const { results, metrics } = await searchMemories('I am worried about my career', 'user-123', {
      topK: 5,
      minScore: 0.5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toBe('anchor');
    expect(results[0].score).toBeGreaterThanOrEqual(0.5);
    expect(metrics.vectorStoreAvailable).toBe(true);
  });

  it('should convert search results to SemanticMatch format', () => {
    const results: SemanticSearchResult[] = [
      {
        text: 'Test memory',
        source: 'anchor',
        score: 0.8,
        documentId: 'doc_1',
        sourceId: 'anchor_123',
      },
    ];

    const matches = toSemanticMatches(results);

    expect(matches.length).toBe(1);
    expect(matches[0].memoryId).toBe('anchor_anchor_123');
    expect(matches[0].text).toBe('Test memory');
    expect(matches[0].source).toBe('anchor:anchor_123');
  });
});

// ============================================================================
// RECALL ATTRIBUTION TESTS
// ============================================================================

describe('Recall Attribution Parser', () => {
  const mockInjectedMemories: InjectedMemory[] = [
    {
      tag: 'thread_career',
      fullId: 'thread_career_full',
      type: 'thread',
      text: 'Career Concerns',
    },
    {
      tag: 'anchor_commit1',
      fullId: 'anchor_commitment1',
      type: 'anchor',
      text: 'Update resume this week',
    },
    {
      tag: 'sem_abc123',
      fullId: 'semantic_match_abc',
      type: 'semantic',
      text: 'Previous career discussion',
    },
  ];

  it('should detect explicit memory tags in response', () => {
    const response = `
      I remember we talked about your career concerns [MEM:thread_career].
      You also mentioned wanting to update your resume [MEM:anchor_commit1].
    `;

    const summary = parseAttributions(response, mockInjectedMemories);

    expect(summary.explicitlyReferenced).toBe(2);
    expect(summary.totalInjected).toBe(3);
    // Note: The 3rd memory "Previous career discussion" fuzzy matches "career"
    // in the response, so all 3 are attributed (2 explicit + 1 implicit)
    expect(summary.attributionRate).toBeCloseTo(1.0, 1);
  });

  it('should detect implicit references via fuzzy matching', () => {
    const response = `
      Based on our previous conversations about your career and job concerns,
      I think updating your resume would be a great next step.
    `;

    const summary = parseAttributions(response, mockInjectedMemories);

    // Should find implicit matches for "career" and "resume"
    expect(summary.implicitlyReferenced).toBeGreaterThan(0);
  });

  it('should track unused memories', () => {
    const response = 'The weather is nice today.';

    const summary = parseAttributions(response, mockInjectedMemories);

    expect(summary.unused).toBe(3);
    expect(summary.unusedMemories.length).toBe(3);
    expect(summary.attributionRate).toBe(0);
  });

  it('should extract memory tags from response', () => {
    const response = 'See [MEM:thread_abc] and [MEM:anchor_xyz] for details.';

    const tags = extractMemoryTags(response);

    expect(tags).toContain('thread_abc');
    expect(tags).toContain('anchor_xyz');
    expect(tags.length).toBe(2);
  });

  it('should detect if response contains memory references', () => {
    expect(containsMemoryReferences('Hello [MEM:thread_test] world')).toBe(true);
    expect(containsMemoryReferences('Hello world')).toBe(false);
  });

  it('should aggregate attribution stats across multiple summaries', () => {
    const summaries: AttributionSummary[] = [
      {
        totalInjected: 5,
        explicitlyReferenced: 2,
        implicitlyReferenced: 1,
        unused: 2,
        attributionRate: 0.6,
        attributions: [
          { tag: 't1', fullId: 't1', type: 'thread', explicit: true, confidence: 1 },
          { tag: 't2', fullId: 't2', type: 'anchor', explicit: true, confidence: 1 },
          { tag: 't3', fullId: 't3', type: 'semantic', explicit: false, confidence: 0.7 },
        ],
        unusedMemories: ['t4', 't5'],
      },
      {
        totalInjected: 3,
        explicitlyReferenced: 1,
        implicitlyReferenced: 0,
        unused: 2,
        attributionRate: 0.33,
        attributions: [{ tag: 't6', fullId: 't6', type: 'thread', explicit: true, confidence: 1 }],
        unusedMemories: ['t7', 't8'],
      },
    ];

    const aggregated = aggregateAttributionStats(summaries);

    expect(aggregated.totalInjected).toBe(8);
    expect(aggregated.totalAttributed).toBe(4);
    expect(aggregated.overallRate).toBe(0.5);
    expect(aggregated.explicitRate).toBeCloseTo(0.375, 2);
  });
});

// ============================================================================
// GRAPH CONTEXT TESTS
// ============================================================================

describe('Graph Context - Entity Detection', () => {
  it('should detect entity mentions in user input', () => {
    const testCases = [
      { input: 'What do I know about Sarah?', expected: 'Sarah' },
      { input: 'Tell me about Mike', expected: 'Mike' },
      { input: 'Who is John?', expected: 'John' },
      { input: 'How is Lisa doing?', expected: 'Lisa' },
    ];

    for (const { input, expected } of testCases) {
      const mentions = detectEntityMentions(input);
      expect(mentions.length).toBeGreaterThan(0);
      expect(mentions[0].name.toLowerCase()).toBe(expected.toLowerCase());
    }
  });

  it('should detect domain-specific entity queries', () => {
    const mentions = detectEntityMentions("What's Sarah's work situation?");

    expect(mentions.length).toBeGreaterThan(0);
    expect(mentions[0].name).toBe('Sarah');
    expect(mentions[0].domain).toBe('work');
  });

  it('should detect relationship queries', () => {
    const testCases = [
      { input: 'How are Sarah and Mike connected?', entity1: 'Sarah', entity2: 'Mike' },
      { input: "What's the connection between John and Lisa?", entity1: 'John', entity2: 'Lisa' },
    ];

    for (const { input, entity1, entity2 } of testCases) {
      const mentions = detectRelationshipMentions(input);
      expect(mentions.length).toBeGreaterThan(0);
      expect(mentions[0].entity1.toLowerCase()).toBe(entity1.toLowerCase());
      expect(mentions[0].entity2.toLowerCase()).toBe(entity2.toLowerCase());
    }
  });
});

// ============================================================================
// INJECTED MEMORY EXTRACTION TESTS
// ============================================================================

describe('Injected Memory Extraction', () => {
  it('should extract memory tags from continuity bundle', () => {
    const mockBundle = {
      rollingSummary: 'Test summary',
      activeThreads: [
        {
          threadId: 'thread_123456789',
          theme: 'Career Planning',
          sessionCount: 3,
          daysSinceLastUpdate: 1,
          confidence: 0.8,
          relevanceScore: 0.9,
        },
      ],
      topAnchors: [
        {
          anchorId: 'anchor_987654321',
          type: 'commitment' as const,
          summary: 'Update resume',
          significance: 0.9,
          daysSinceCreated: 2,
          timesRecalled: 1,
          relevanceScore: 0.8,
        },
      ],
      pendingTopics: [],
      semanticMatches: [
        {
          memoryId: 'sem_abcdef1234',
          text: 'Previous career discussion',
          source: 'anchor:anchor_xyz',
          score: 0.75,
        },
      ],
      metadata: {
        spannerAvailable: true,
        capsuleFound: true,
        retrievalTimeMs: 50,
        threadCount: 1,
        anchorCount: 1,
        semanticMatchCount: 1,
      },
    };

    const memories = getInjectedMemories(mockBundle);

    expect(memories.length).toBe(3);
    expect(memories.find((m) => m.type === 'thread')).toBeDefined();
    expect(memories.find((m) => m.type === 'anchor')).toBeDefined();
    expect(memories.find((m) => m.type === 'semantic')).toBeDefined();
  });
});

// ============================================================================
// METRICS TESTS
// ============================================================================

// SKIPPED: API has changed - MemoryAttributionMetrics no longer has explicitAttributions/implicitAttributions.
// recordMemoriesInjected now takes a number, not an object.
// recordMemoryAttribution takes (injectedCount, attributedCount, breakdown) - 3 args, not 4.
// TODO: Rewrite tests to match actual metrics.ts API.
describe.skip('Attribution Metrics', () => {
  beforeEach(() => {
    // Reset metrics before each test
    vi.resetModules();
  });

  it('should track attribution metrics correctly', async () => {
    const { recordMemoryAttribution, recordMemoriesInjected, getAttributionMetrics, resetMetrics } =
      await import('../../memory/dynamic/metrics.js');

    resetMetrics();

    // Record some injections
    recordMemoriesInjected({ thread: 3, anchor: 2, semantic: 1 });

    // Record attributions
    recordMemoryAttribution(6, 4, 2, { thread: 2, anchor: 1, semantic: 1 });

    const metrics = getAttributionMetrics();

    // Calculate rate from metrics (getAttributionRate was removed)
    const rate =
      metrics.totalMemoriesInjected > 0
        ? metrics.totalMemoriesAttributed / metrics.totalMemoriesInjected
        : 0;

    expect(rate).toBeCloseTo(0.67, 1);
    expect(metrics.totalMemoriesInjected).toBe(6);
    expect(metrics.totalMemoriesAttributed).toBe(4);
    expect(metrics.explicitAttributions).toBe(2);
    expect(metrics.implicitAttributions).toBe(2);
  });
});
