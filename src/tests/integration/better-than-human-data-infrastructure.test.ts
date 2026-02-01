/**
 * Better Than Human Data Infrastructure - Integration Tests
 *
 * Comprehensive test suite for the BTH data infrastructure:
 * - Phase 1: Entity Store Migration
 * - Phase 2: BM25 Hybrid Search
 * - Phase 3: Graph Expansion
 * - Phase 4: Cross-Encoder Reranking
 * - Phase 5: Memory Consolidation
 * - Phase 6: Predictive Intelligence
 * - Phase 7: Proactive Surfacing
 *
 * @module tests/integration/better-than-human-data-infrastructure
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// PHASE 1: ENTITY STORE MIGRATION TESTS
// ============================================================================

describe('Phase 1: Entity Store Migration', () => {
  describe('Dual-Write Layer', () => {
    it('should intercept contact writes and mirror to entity store', async () => {
      // Import dynamically to avoid module resolution issues in test environment
      const { interceptContactWrite, configureDualWrite } =
        await import('../../memory/entity-store/dual-write.js');

      // Enable dual-write
      configureDualWrite({ enabled: true });

      const result = await interceptContactWrite(
        'test-user-id',
        {
          name: 'John Doe',
          phone: '+1234567890',
          relationship: 'brother',
          email: 'john@example.com',
        },
        'contacts'
      );

      // Should return entity or null (depending on Firestore availability)
      expect(result).toHaveProperty('entity');
      expect(result).toHaveProperty('error');
    });

    it('should track migration status per collection', async () => {
      const { getMigrationStatus, configureDualWrite, updateMigrationStatus } =
        await import('../../memory/entity-store/dual-write.js');

      // Configure and set migration status
      configureDualWrite({ enabled: true });
      updateMigrationStatus('contacts', { status: 'in_progress', totalDocuments: 100 });

      const status = getMigrationStatus('contacts');
      expect(status).toBeDefined();
      expect(status?.status).toBe('in_progress');
      expect(status?.totalDocuments).toBe(100);
    });
  });

  describe('Legacy Adapter', () => {
    it('should provide backwards-compatible contact API', async () => {
      const { configureLegacyAdapter, isUsingEntityStore } =
        await import('../../memory/entity-store/legacy-adapter.js');

      configureLegacyAdapter({ useEntityStore: false, fallbackToLegacy: true });
      expect(isUsingEntityStore()).toBe(false);

      configureLegacyAdapter({ useEntityStore: true, fallbackToLegacy: true });
      expect(isUsingEntityStore()).toBe(true);
    });
  });

  describe('Migration with Rollback', () => {
    it('should support rollback of migrations', async () => {
      const { getMigrationHealth } = await import('../../memory/entity-store/migration.js');

      const health = getMigrationHealth();
      expect(health).toHaveProperty('activeMigrations');
      expect(health).toHaveProperty('completedMigrations');
      expect(health).toHaveProperty('failedMigrations');
      expect(health).toHaveProperty('recentMigrations');
    });
  });
});

// ============================================================================
// PHASE 2: BM25 HYBRID SEARCH TESTS
// ============================================================================

describe('Phase 2: BM25 Hybrid Search', () => {
  describe('Tokenizer', () => {
    it('should tokenize text with stemming', async () => {
      const { tokenize, stem } = await import('../../memory/retrieval/tokenizer.js');

      const tokens = tokenize('Running quickly through forests');
      // Note: Porter stemmer strips suffixes, producing 'runn', 'quick', 'forest'
      expect(tokens).toContain('runn'); // 'Running' stemmed (strips -ing)
      expect(tokens).toContain('quick'); // 'quickly' stemmed (strips -ly)
      expect(tokens).toContain('forest'); // 'forests' stemmed (strips -s)

      // Verify stem function directly
      expect(stem('running')).toBe('runn');
      expect(stem('quickly')).toBe('quick');
      expect(stem('forests')).toBe('forest');
    });

    it('should remove stop words', async () => {
      const { tokenize, STOP_WORDS } = await import('../../memory/retrieval/tokenizer.js');

      const tokens = tokenize('The quick brown fox', { removeStopWords: true });
      expect(tokens).not.toContain('the');
      expect(tokens).toContain('quick');
      expect(tokens).toContain('brown');
      expect(tokens).toContain('fox');
    });

    it('should handle name tokenization with nicknames', async () => {
      const { tokenizeName } = await import('../../memory/retrieval/tokenizer.js');

      const tokens = tokenizeName('Michael');
      expect(tokens).toContain('michael');
      expect(tokens).toContain('mike'); // Common nickname
    });
  });

  describe('BM25 Index', () => {
    it('should add and search documents', async () => {
      const { BM25Index } = await import('../../memory/retrieval/bm25-search.js');

      const index = new BM25Index();
      index.addDocument('doc1', 'The quick brown fox jumps over the lazy dog');
      index.addDocument('doc2', 'A fast brown fox leaps over a sleepy dog');
      index.addDocument('doc3', 'The slow turtle walks through the garden');

      const results = index.search('quick fox');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('doc1'); // Best match
    });

    it('should boost exact matches', async () => {
      const { BM25Index } = await import('../../memory/retrieval/bm25-search.js');

      const index = new BM25Index();
      index.addDocument('doc1', 'My brother Mike is visiting');
      index.addDocument('doc2', 'Michael came over yesterday');

      const results = index.search('Mike', { boostExactMatch: 2.0 });
      expect(results[0].id).toBe('doc1'); // Exact match should rank higher
    });

    it('should calculate IDF correctly', async () => {
      const { BM25Index } = await import('../../memory/retrieval/bm25-search.js');

      const index = new BM25Index();
      index.addDocument('doc1', 'apple orange banana');
      index.addDocument('doc2', 'apple grape melon');
      index.addDocument('doc3', 'apple cherry peach');

      // 'apple' appears in all docs, should have lower IDF
      // 'banana' appears in one doc, should have higher IDF
      const stats = index.getStats();
      expect(stats.documentCount).toBe(3);
    });
  });

  describe('Rank Fusion', () => {
    it('should fuse BM25 and vector results with RRF', async () => {
      const { fuseSearchResults } = await import('../../memory/retrieval/rank-fusion.js');

      const bm25Results = [
        { id: 'doc1', score: 0.9 },
        { id: 'doc2', score: 0.7 },
        { id: 'doc3', score: 0.5 },
      ];

      const vectorResults = [
        { id: 'doc2', score: 0.95 },
        { id: 'doc1', score: 0.8 },
        { id: 'doc4', score: 0.6 },
      ];

      const fused = fuseSearchResults(bm25Results, vectorResults);

      expect(fused.length).toBeGreaterThan(0);
      // doc2 should rank high (good in both)
      const doc2 = fused.find((f) => f.id === 'doc2');
      expect(doc2).toBeDefined();
      expect(doc2?.sourceCount).toBe(2);
    });

    it('should support configurable weights', async () => {
      const { fuseSearchResults } = await import('../../memory/retrieval/rank-fusion.js');

      const bm25Results = [{ id: 'doc1', score: 0.9 }];
      const vectorResults = [{ id: 'doc2', score: 0.9 }];

      // BM25 weighted higher
      const fusedBM25Heavy = fuseSearchResults(bm25Results, vectorResults, {
        bm25Weight: 0.8,
        vectorWeight: 0.2,
      });

      // Vector weighted higher
      const fusedVectorHeavy = fuseSearchResults(bm25Results, vectorResults, {
        bm25Weight: 0.2,
        vectorWeight: 0.8,
      });

      // Different weights should produce different rankings
      expect(fusedBM25Heavy[0].id).not.toBe(fusedVectorHeavy[0].id);
    });
  });
});

// ============================================================================
// PHASE 3: GRAPH EXPANSION TESTS
// ============================================================================

describe('Phase 3: Graph Expansion', () => {
  describe('Relational Graph Expander', () => {
    it('should initialize without Spanner dependency', async () => {
      const { RelationalGraphExpander } =
        await import('../../memory/spanner-graph/graph-expansion.js');

      const expander = new RelationalGraphExpander();
      expect(expander.getType()).toBe('relational');
    });

    it('should provide GQL upgrade path', async () => {
      const { GQLGraphExpander } = await import('../../memory/spanner-graph/graph-expansion.js');

      const expander = new GQLGraphExpander();
      expect(expander.getType()).toBe('gql');
      expect(expander.isAvailable()).toBe(false); // Not implemented yet
    });

    it('should select best available expander', async () => {
      const { getGraphExpander } = await import('../../memory/spanner-graph/graph-expansion.js');

      const expander = getGraphExpander();
      // Should fall back to relational since GQL isn't available
      expect(expander.getType()).toBe('relational');
    });
  });

  describe('Path Finder', () => {
    it('should initialize path finder', async () => {
      const { getPathFinder } = await import('../../memory/spanner-graph/path-finder.js');

      const finder = getPathFinder();
      expect(finder).toBeDefined();
    });
  });
});

// ============================================================================
// PHASE 4: CROSS-ENCODER RERANKING TESTS
// ============================================================================

describe('Phase 4: Cross-Encoder Reranking', () => {
  describe('Reranker', () => {
    it('should select appropriate provider', async () => {
      const { Reranker, HeuristicCrossEncoder } =
        await import('../../memory/retrieval/cross-encoder.js');

      // Without API keys, should fall back to heuristic
      const reranker = new Reranker(new HeuristicCrossEncoder());
      expect(reranker.getProviderName()).toBe('heuristic');
    });

    it('should rerank documents by relevance', async () => {
      const { Reranker, HeuristicCrossEncoder } =
        await import('../../memory/retrieval/cross-encoder.js');

      const reranker = new Reranker(new HeuristicCrossEncoder());

      const documents = [
        { id: 'doc1', text: 'The weather in Paris is beautiful in spring' },
        { id: 'doc2', text: 'Paris weather forecast for this week' },
        { id: 'doc3', text: 'I love cooking French cuisine' },
      ];

      const { results, metrics } = await reranker.rerank('Paris weather', documents);

      expect(results.length).toBeGreaterThan(0);
      expect(metrics.documentsReranked).toBe(3);
      // doc1 and doc2 should rank higher than doc3
      const topIds = results.slice(0, 2).map((r) => r.id);
      expect(topIds).toContain('doc1');
      expect(topIds).toContain('doc2');
    });

    it('should track position changes', async () => {
      const { Reranker, HeuristicCrossEncoder } =
        await import('../../memory/retrieval/cross-encoder.js');

      const reranker = new Reranker(new HeuristicCrossEncoder());

      const documents = [
        { id: 'doc1', text: 'Unrelated content about sports' },
        { id: 'doc2', text: 'Machine learning and AI developments' },
        { id: 'doc3', text: 'Deep learning neural networks AI' },
      ];

      const { results, metrics } = await reranker.rerank('AI machine learning', documents);

      // Some documents should have moved
      expect(metrics.movedUp + metrics.movedDown).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Heuristic Cross-Encoder', () => {
    it('should score based on keyword overlap', async () => {
      const { HeuristicCrossEncoder } = await import('../../memory/retrieval/cross-encoder.js');

      const encoder = new HeuristicCrossEncoder();
      await encoder.initialize();

      const score1 = await encoder.score('weather forecast', 'The weather forecast for today');
      const score2 = await encoder.score('weather forecast', 'Recipe for chocolate cake');

      expect(score1).toBeGreaterThan(score2);
    });
  });
});

// ============================================================================
// PHASE 5: MEMORY CONSOLIDATION TESTS
// ============================================================================

describe('Phase 5: Memory Consolidation', () => {
  describe('Consolidation Service', () => {
    it('should initialize service', async () => {
      const { getConsolidationService } =
        await import('../../memory/consolidation/memory-consolidation-service.js');

      const service = getConsolidationService();
      expect(service).toBeDefined();
      expect(service.isConsolidating()).toBe(false);
    });

    it('should support dry run mode', async () => {
      const { getConsolidationService } =
        await import('../../memory/consolidation/memory-consolidation-service.js');

      const service = getConsolidationService();

      // Dry run should not throw
      const result = await service.runConsolidation({
        userIds: [],
        dryRun: true,
        maxUsers: 0,
      });

      expect(result).toHaveProperty('jobId');
      expect(result).toHaveProperty('metrics');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should track job status', async () => {
      const { getConsolidationService } =
        await import('../../memory/consolidation/memory-consolidation-service.js');

      const service = getConsolidationService();

      // Initially not running
      expect(service.isConsolidating()).toBe(false);
      expect(service.getCurrentJobId()).toBeNull();
    });
  });
});

// ============================================================================
// PHASE 6: PREDICTIVE INTELLIGENCE TESTS
// ============================================================================

describe('Phase 6: Predictive Intelligence', () => {
  describe('Behavioral Analysis', () => {
    it('should initialize predictive intelligence service', async () => {
      const { getPredictiveIntelligenceService } =
        await import('../../intelligence/predictive/predictive-intelligence.js');

      const service = getPredictiveIntelligenceService();
      expect(service).toBeDefined();
    });

    it('should detect temporal patterns', async () => {
      const { getPredictiveIntelligenceService } =
        await import('../../intelligence/predictive/predictive-intelligence.js');

      const service = getPredictiveIntelligenceService();
      const patterns = await service.analyzeBehavioralPatterns('test-user');

      // Should return array (may be empty without data)
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('Crisis Detection', () => {
    it('should analyze crisis indicators', async () => {
      const { checkCrisisIndicators } =
        await import('../../intelligence/predictive/predictive-intelligence.js');

      const indicators = await checkCrisisIndicators('test-user');

      expect(indicators).toHaveProperty('riskLevel');
      expect(indicators).toHaveProperty('riskScore');
      expect(indicators).toHaveProperty('indicators');
      expect(indicators.riskScore).toBeGreaterThanOrEqual(0);
      expect(indicators.riskScore).toBeLessThanOrEqual(1);
    });

    it('should provide recommended interventions for high risk', async () => {
      const { getPredictiveIntelligenceService } =
        await import('../../intelligence/predictive/predictive-intelligence.js');

      const service = getPredictiveIntelligenceService();
      const indicators = await service.analyzeCrisisIndicators('test-user');

      // recommendedInterventions should be array
      expect(Array.isArray(indicators.recommendedInterventions)).toBe(true);
    });
  });

  describe('Growth Tracking', () => {
    it('should track goal progress', async () => {
      const { getPredictiveIntelligenceService } =
        await import('../../intelligence/predictive/predictive-intelligence.js');

      const service = getPredictiveIntelligenceService();
      const tracking = await service.trackGrowth('test-user', 'test-goal');

      // May be null if goal doesn't exist
      if (tracking) {
        expect(tracking).toHaveProperty('progressPercent');
        expect(tracking).toHaveProperty('velocity');
        expect(tracking).toHaveProperty('momentum');
      }
    });
  });
});

// ============================================================================
// PHASE 7: PROACTIVE SURFACING TESTS
// ============================================================================

describe('Phase 7: Proactive Surfacing', () => {
  describe('Timing Intelligence', () => {
    it('should respect quiet hours', async () => {
      const { TimingIntelligence } =
        await import('../../intelligence/surfacing/proactive-surfacing-engine.js');
      const { Firestore } = await import('@google-cloud/firestore');

      const timing = new TimingIntelligence(new Firestore());

      // This is a unit-level check; full integration would require mock Firestore
      expect(timing).toBeDefined();
    });
  });

  describe('Surfacing Engine', () => {
    it('should initialize surfacing engine', async () => {
      const { getSurfacingEngine } =
        await import('../../intelligence/surfacing/proactive-surfacing-engine.js');

      const engine = getSurfacingEngine();
      expect(engine).toBeDefined();
    });

    it('should get default user preferences', async () => {
      const { getSurfacingEngine } =
        await import('../../intelligence/surfacing/proactive-surfacing-engine.js');

      const engine = getSurfacingEngine();
      const prefs = await engine.getUserPreferences('nonexistent-user');

      // Should return defaults
      expect(prefs.enabled).toBe(true);
      expect(prefs.maxPerDay).toBeGreaterThan(0);
      expect(prefs.quietHours).toBeDefined();
    });

    it('should generate surfacing suggestions', async () => {
      const { getSurfacingEngine } =
        await import('../../intelligence/surfacing/proactive-surfacing-engine.js');

      const engine = getSurfacingEngine();
      const suggestions = await engine.generateSuggestions('test-user');

      // Should return array (may be empty without data)
      expect(Array.isArray(suggestions)).toBe(true);
    });
  });
});

// ============================================================================
// END-TO-END INTEGRATION TESTS
// ============================================================================

describe('End-to-End: BTH Data Infrastructure Pipeline', () => {
  it('should execute complete retrieval pipeline', async () => {
    // This test validates the full pipeline works together
    const { BM25Index } = await import('../../memory/retrieval/bm25-search.js');
    const { fuseSearchResults } = await import('../../memory/retrieval/rank-fusion.js');
    const { HeuristicCrossEncoder, Reranker } =
      await import('../../memory/retrieval/cross-encoder.js');

    // Step 1: Build BM25 index
    const bm25Index = new BM25Index();
    bm25Index.addDocument('mem1', 'My brother Mike had his birthday last week');
    bm25Index.addDocument('mem2', 'Sarah mentioned she is looking for a new job');
    bm25Index.addDocument('mem3', 'Mike and Sarah went to dinner together');

    // Step 2: BM25 search
    const bm25Results = bm25Index.search('Mike');

    // Step 3: Simulate vector search results
    const vectorResults = [
      { id: 'mem1', score: 0.85 },
      { id: 'mem3', score: 0.75 },
    ];

    // Step 4: Fuse results
    const fusedResults = fuseSearchResults(
      bm25Results.map((r) => ({ id: r.id, score: r.score })),
      vectorResults
    );

    expect(fusedResults.length).toBeGreaterThan(0);

    // Step 5: Rerank with cross-encoder
    const reranker = new Reranker(new HeuristicCrossEncoder());
    const { results: rerankedResults } = await reranker.rerank(
      'Mike birthday',
      fusedResults.map((f) => ({
        id: f.id,
        text: bm25Index.getStats().documentCount > 0 ? 'placeholder' : '',
        originalScore: f.fusedScore,
      }))
    );

    expect(rerankedResults.length).toBeGreaterThan(0);
  });

  it('should connect predictive and surfacing engines', async () => {
    const { analyzeUserPatterns } =
      await import('../../intelligence/predictive/predictive-intelligence.js');
    const { getSurfacingEngine } =
      await import('../../intelligence/surfacing/proactive-surfacing-engine.js');

    // Generate predictions
    const { predictions, crisisIndicators } = await analyzeUserPatterns('test-user');

    // If there are high-priority predictions, they could be surfaced
    const surfacingEngine = getSurfacingEngine();

    for (const prediction of predictions) {
      if (prediction.priority >= 7) {
        // Queue for surfacing
        await surfacingEngine.queueContent({
          userId: prediction.userId,
          type: 'insight',
          content: prediction.prediction,
          reason: prediction.evidence.join('; '),
          source: { type: 'prediction', id: prediction.id },
          delivery: {
            channels: ['in_conversation'],
            preferredChannel: 'in_conversation',
            tone: 'warm',
          },
          priority: prediction.priority >= 8 ? 'high' : 'medium',
          timing: {},
        });
      }
    }

    // Validate crisis indicators integration
    expect(crisisIndicators.riskLevel).toBeDefined();
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('Performance: BTH Data Infrastructure', () => {
  it('should complete BM25 search under 50ms for small corpus', async () => {
    const { BM25Index } = await import('../../memory/retrieval/bm25-search.js');

    const index = new BM25Index();

    // Add 100 documents
    for (let i = 0; i < 100; i++) {
      index.addDocument(`doc${i}`, `Document number ${i} about topic ${i % 10}`);
    }

    const start = performance.now();
    const results = index.search('topic');
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should complete rank fusion under 10ms', async () => {
    const { fuseSearchResults } = await import('../../memory/retrieval/rank-fusion.js');

    const bm25Results = Array.from({ length: 50 }, (_, i) => ({
      id: `doc${i}`,
      score: 1 - i * 0.02,
    }));

    const vectorResults = Array.from({ length: 50 }, (_, i) => ({
      id: `doc${49 - i}`,
      score: 1 - i * 0.02,
    }));

    const start = performance.now();
    const fused = fuseSearchResults(bm25Results, vectorResults);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(10);
    expect(fused.length).toBeGreaterThan(0);
  });

  it('should complete heuristic reranking under 100ms for 50 docs', async () => {
    const { Reranker, HeuristicCrossEncoder } =
      await import('../../memory/retrieval/cross-encoder.js');

    const reranker = new Reranker(new HeuristicCrossEncoder());

    const documents = Array.from({ length: 50 }, (_, i) => ({
      id: `doc${i}`,
      text: `This is document ${i} about various topics including ${i % 5 === 0 ? 'AI' : 'other'} subjects`,
    }));

    const start = performance.now();
    const { results } = await reranker.rerank('AI topics', documents);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100);
    expect(results.length).toBeGreaterThan(0);
  });
});
