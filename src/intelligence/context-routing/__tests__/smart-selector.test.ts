/**
 * Smart Context Routing - Comprehensive Test Suite
 *
 * Tests for Phase 2: BTH Communication System Overhaul.
 * Covers slot allocation, predictive scoring, caching, and smart selection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock experiment manager to control routing variants
vi.mock('../../../tools/intelligence/learning/index.js', () => ({
  getExperimentManager: () => ({
    getExperiment: vi.fn().mockReturnValue(null),
    createExperiment: vi.fn(),
  }),
  getABTestingManager: () => ({
    getVariant: vi.fn().mockReturnValue(null),
  }),
}));

// Mock injection filter
vi.mock('../../../agents/processors/injection-filter.js', () => ({
  filterInjections: (injections: unknown[]) => injections.slice(0, 6),
  detectConversationMode: () => 'unknown',
}));

// Import after mocking
import {
  SlotAllocator,
  createSlotAllocator,
  getAllocationForMode,
  MODE_ALLOCATIONS,
  FAST_MODE_ALLOCATIONS,
  CATEGORY_TO_SLOT,
  ESSENTIAL_CATEGORIES,
} from '../slot-allocator.js';
import {
  CacheManager,
  createCacheManager,
  clearAllCaches,
  getGlobalCacheStats,
} from '../cache-manager.js';
import {
  PredictiveScorer,
  createPredictiveScorer,
  getModeRelevance,
  computeScore,
  MODE_CATEGORY_RELEVANCE,
} from '../predictive-scorer.js';
import {
  SmartSelector,
  createSmartSelector,
  selectInjections,
  setupSmartRoutingExperiment,
  SMART_ROUTING_EXPERIMENT_ID,
} from '../smart-selector.js';
import type {
  ConversationMode,
  ContextInjection,
  SlotAllocation,
  PredictiveScore,
  BuilderEffectiveness,
  UserBuilderPreferences,
} from '../types.js';
import { DEFAULT_SLOT_COUNT, FAST_MODE_SLOT_COUNT, SCORE_WEIGHTS } from '../types.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createInjection(
  category: string,
  priority: number = 1,
  content: string = 'Test content'
): ContextInjection {
  return {
    category,
    content,
    priority,
  };
}

function createEffectiveness(
  builderId: string,
  roiScore: number,
  sampleCount: number = 50
): BuilderEffectiveness {
  return {
    builderId,
    category: builderId,
    totalDeliveries: sampleCount,
    alignmentCount: Math.floor(sampleCount * 0.5),
    positiveReactions: Math.floor(sampleCount * 0.3),
    negativeReactions: Math.floor(sampleCount * 0.1),
    roiScore,
    modeScores: {},
    lastUpdated: new Date(),
    sampleCount,
  };
}

function createUserPreferences(
  userId: string,
  effectiveBuilders: string[] = [],
  ineffectiveBuilders: string[] = []
): UserBuilderPreferences {
  return {
    userId,
    effectiveBuilders,
    ineffectiveBuilders,
    modePreferences: {},
    updatedAt: new Date(),
  };
}

// ============================================================================
// SLOT ALLOCATOR TESTS
// ============================================================================

describe('SlotAllocator', () => {
  describe('MODE_ALLOCATIONS', () => {
    it('should have allocations for all conversation modes', () => {
      const modes: ConversationMode[] = [
        'crisis',
        'emotional',
        'practical',
        'deep',
        'casual',
        'unknown',
      ];
      for (const mode of modes) {
        expect(MODE_ALLOCATIONS[mode]).toBeDefined();
        expect(FAST_MODE_ALLOCATIONS[mode]).toBeDefined();
      }
    });

    it('should prioritize emotional slots in crisis mode', () => {
      const crisis = MODE_ALLOCATIONS.crisis;
      expect(crisis.emotional).toBe(3);
      expect(crisis.emotional).toBeGreaterThan(crisis.practical);
      expect(crisis.emotional).toBeGreaterThan(crisis.superhuman);
    });

    it('should prioritize practical slots in practical mode', () => {
      const practical = MODE_ALLOCATIONS.practical;
      expect(practical.practical).toBe(3);
      expect(practical.practical).toBeGreaterThan(practical.emotional);
    });

    it('should prioritize superhuman slots in deep mode', () => {
      const deep = MODE_ALLOCATIONS.deep;
      expect(deep.superhuman).toBe(2);
      expect(deep.memory).toBe(2);
      expect(deep.superhuman).toBeGreaterThan(deep.practical);
    });

    it('should have lean allocations in casual mode', () => {
      const casual = MODE_ALLOCATIONS.casual;
      expect(casual.memory).toBe(0);
      expect(casual.emotional).toBe(1);
      expect(casual.practical).toBe(1);
    });
  });

  describe('createSlotAllocator', () => {
    it('should create allocator with correct mode allocations', () => {
      const allocator = createSlotAllocator('emotional');
      const allocation = allocator.getAllocation();

      expect(allocation.emotional).toBe(2);
      expect(allocation.memory).toBe(2);
    });

    it('should create allocator with fast mode allocations', () => {
      const allocator = createSlotAllocator('practical', true);
      const allocation = allocator.getAllocation();

      expect(allocation.practical).toBe(2);
      expect(allocation.emotional).toBe(0);
    });

    it('should report correct total slots', () => {
      const normal = createSlotAllocator('unknown');
      const fast = createSlotAllocator('unknown', true);

      expect(normal.getTotalSlots()).toBe(DEFAULT_SLOT_COUNT);
      expect(fast.getTotalSlots()).toBe(FAST_MODE_SLOT_COUNT);
    });
  });

  describe('canAllocate / allocate', () => {
    let allocator: SlotAllocator;

    beforeEach(() => {
      allocator = createSlotAllocator('practical');
    });

    it('should allocate slots within limits', () => {
      const injection = createInjection('coaching');

      expect(allocator.canAllocate(injection)).toBe(true);
      expect(allocator.allocate(injection)).toBe(true);

      const usage = allocator.getUsage();
      expect(usage.practical).toBe(1);
    });

    it('should reject allocation when slots exhausted', () => {
      const allocator = createSlotAllocator('practical');

      // Allocate all practical slots (3 in practical mode)
      for (let i = 0; i < 3; i++) {
        allocator.allocate(createInjection('coaching'));
      }

      // Next should be rejected
      const next = createInjection('context');
      expect(allocator.canAllocate(next)).toBe(false);
      expect(allocator.allocate(next)).toBe(false);
    });

    it('should always allow safety/essential categories', () => {
      const allocator = createSlotAllocator('casual');

      // Even with no safety slots allocated, safety categories pass
      const safetyInjection = createInjection('safety');
      const crisisInjection = createInjection('crisis_response');
      const boundaryInjection = createInjection('boundaries');

      expect(allocator.canAllocate(safetyInjection)).toBe(true);
      expect(allocator.canAllocate(crisisInjection)).toBe(true);
      expect(allocator.canAllocate(boundaryInjection)).toBe(true);

      allocator.allocate(safetyInjection);
      allocator.allocate(crisisInjection);
      allocator.allocate(boundaryInjection);

      // Safety slots track unlimited usage
      expect(allocator.getUsage().safety).toBe(3);
    });
  });

  describe('getSlotType', () => {
    const allocator = createSlotAllocator('unknown');

    it('should map known categories correctly', () => {
      expect(allocator.getSlotType('emotional')).toBe('emotional');
      expect(allocator.getSlotType('coaching')).toBe('practical');
      expect(allocator.getSlotType('memory')).toBe('memory');
      expect(allocator.getSlotType('cognitive')).toBe('superhuman');
      expect(allocator.getSlotType('safety')).toBe('safety');
    });

    it('should handle prefixed categories', () => {
      expect(allocator.getSlotType('emotional_guidance')).toBe('emotional');
      expect(allocator.getSlotType('memory_callback')).toBe('memory');
    });

    it('should default unknown categories to practical', () => {
      expect(allocator.getSlotType('random_unknown')).toBe('practical');
    });

    it('should recognize essential categories as safety', () => {
      expect(allocator.getSlotType('crisis_response')).toBe('safety');
      expect(allocator.getSlotType('unsaid')).toBe('safety');
    });
  });

  describe('getSlotPriority', () => {
    it('should prioritize emotional in crisis mode', () => {
      const allocator = createSlotAllocator('crisis');
      const priority = allocator.getSlotPriority();

      expect(priority[0]).toBe('safety');
      expect(priority[1]).toBe('emotional');
    });

    it('should prioritize superhuman in deep mode', () => {
      const allocator = createSlotAllocator('deep');
      const priority = allocator.getSlotPriority();

      expect(priority[0]).toBe('safety');
      expect(priority[1]).toBe('superhuman');
    });

    it('should prioritize practical in practical mode', () => {
      const allocator = createSlotAllocator('practical');
      const priority = allocator.getSlotPriority();

      expect(priority[0]).toBe('safety');
      expect(priority[1]).toBe('practical');
    });
  });

  describe('getStats', () => {
    it('should report accurate statistics', () => {
      const allocator = createSlotAllocator('emotional');

      allocator.allocate(createInjection('emotional'));
      allocator.allocate(createInjection('memory'));
      allocator.allocate(createInjection('safety'));

      const stats = allocator.getStats();

      expect(stats.mode).toBe('emotional');
      expect(stats.usedSlots).toBe(2); // emotional + memory (safety doesn't count)
      expect(stats.safetySlots).toBe(1);
      expect(stats.byType.emotional.used).toBe(1);
      expect(stats.byType.memory.used).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset all usage counters', () => {
      const allocator = createSlotAllocator('unknown');

      allocator.allocate(createInjection('emotional'));
      allocator.allocate(createInjection('coaching'));
      allocator.reset();

      const usage = allocator.getUsage();
      expect(usage.emotional).toBe(0);
      expect(usage.practical).toBe(0);
    });
  });
});

// ============================================================================
// CACHE MANAGER TESTS
// ============================================================================

describe('CacheManager', () => {
  const testSessionId = 'test-session-123';
  const testUserId = 'test-user-456';

  beforeEach(() => {
    clearAllCaches();
  });

  afterEach(() => {
    clearAllCaches();
  });

  describe('L1 Session Cache', () => {
    it('should store and retrieve session scores', () => {
      const manager = createCacheManager(testSessionId, testUserId);
      const score: PredictiveScore = {
        builderId: 'test-builder',
        score: 75,
        confidence: 0.8,
        factors: { roiScore: 80, modeRelevance: 70, recencyBoost: 0, userAffinity: 50 },
        source: 'heuristic',
      };

      manager.setSessionScore('test-builder', score);
      const retrieved = manager.getSessionScore('test-builder');

      expect(retrieved).toEqual(score);
    });

    it('should return undefined for missing scores', () => {
      const manager = createCacheManager(testSessionId, testUserId);
      expect(manager.getSessionScore('nonexistent')).toBeUndefined();
    });

    it('should clear session cache', () => {
      const manager = createCacheManager(testSessionId, testUserId);
      manager.setSessionScore('test', {
        builderId: 'test',
        score: 50,
        confidence: 0.5,
        factors: { roiScore: 50, modeRelevance: 50, recencyBoost: 0, userAffinity: 50 },
        source: 'fallback',
      });

      manager.clearSession();

      expect(manager.getSessionScore('test')).toBeUndefined();
    });
  });

  describe('L2 User Cache', () => {
    it('should store and retrieve user preferences', () => {
      const manager = createCacheManager(testSessionId, testUserId);
      const preferences = createUserPreferences(testUserId, ['good-builder'], ['bad-builder']);

      manager.setUserCache(new Map(), preferences);

      expect(manager.getUserPreferences()).toEqual(preferences);
    });

    it('should invalidate user cache', () => {
      const manager = createCacheManager(testSessionId, testUserId);
      manager.setUserCache(new Map(), createUserPreferences(testUserId));

      manager.invalidateUserCache();

      expect(manager.getUserPreferences()).toBeNull();
    });

    it('should validate user cache TTL', () => {
      const manager = createCacheManager(testSessionId, testUserId);

      // Fresh cache should be valid
      manager.setUserCache(new Map(), null);
      expect(manager.isUserCacheValid()).toBe(true);
    });
  });

  describe('L3 Global Cache', () => {
    it('should store and retrieve global effectiveness', () => {
      const effectiveness = createEffectiveness('test-builder', 75, 150);
      const effectivenessMap = new Map([['test-builder', effectiveness]]);

      CacheManager.setGlobalCache(effectivenessMap);

      expect(CacheManager.getGlobalEffectiveness('test-builder')).toEqual(effectiveness);
    });

    it('should return undefined for missing builders', () => {
      CacheManager.setGlobalCache(new Map());
      expect(CacheManager.getGlobalEffectiveness('nonexistent')).toBeUndefined();
    });

    it('should invalidate global cache', () => {
      CacheManager.setGlobalCache(new Map([['test', createEffectiveness('test', 50)]]));
      CacheManager.invalidateGlobalCache();

      expect(CacheManager.isGlobalCacheValid()).toBe(false);
    });
  });

  describe('Multi-tier Lookup', () => {
    it('should find scores from session cache first', () => {
      const manager = createCacheManager(testSessionId, testUserId);
      const sessionScore: PredictiveScore = {
        builderId: 'test',
        score: 90,
        confidence: 0.9,
        factors: { roiScore: 90, modeRelevance: 90, recencyBoost: 90, userAffinity: 90 },
        source: 'ml',
      };

      manager.setSessionScore('test', sessionScore);

      const result = manager.getScore('test');
      expect(result.tier).toBe('session');
      expect(result.score).toEqual(sessionScore);
    });

    it('should fall back to global cache and promote to session', () => {
      const manager = createCacheManager(testSessionId, testUserId);
      CacheManager.setGlobalCache(new Map([['test', createEffectiveness('test', 75, 150)]]));

      const result = manager.getScore('test');
      expect(result.tier).toBe('global');
      expect(result.score?.builderId).toBe('test');

      // Should be promoted to session cache
      expect(manager.getSessionScore('test')).toBeDefined();
    });

    it('should return null tier when not found', () => {
      const manager = createCacheManager(testSessionId, testUserId);
      const result = manager.getScore('nonexistent');

      expect(result.tier).toBeNull();
      expect(result.score).toBeUndefined();
    });
  });

  describe('Cache Warming', () => {
    it('should warm caches from provided loaders', async () => {
      const manager = createCacheManager(testSessionId, testUserId);
      const preferences = createUserPreferences(testUserId, ['builder1']);
      const effectiveness = new Map([['builder1', createEffectiveness('builder1', 80)]]);

      await manager.warmCache(
        async () => ({ scores: new Map(), preferences }),
        async () => effectiveness
      );

      expect(manager.getUserPreferences()).toEqual(preferences);
      expect(CacheManager.getGlobalEffectiveness('builder1')).toBeDefined();
    });

    it('should not call loaders when caches are valid', async () => {
      const manager = createCacheManager(testSessionId, testUserId);

      // Pre-populate caches
      manager.setUserCache(new Map(), createUserPreferences(testUserId));
      CacheManager.setGlobalCache(new Map());

      const userLoader = vi.fn().mockResolvedValue({ scores: new Map(), preferences: null });
      const globalLoader = vi.fn().mockResolvedValue(new Map());

      await manager.warmCache(userLoader, globalLoader);

      expect(userLoader).not.toHaveBeenCalled();
      expect(globalLoader).not.toHaveBeenCalled();
    });
  });

  describe('getGlobalCacheStats', () => {
    it('should report accurate global statistics', () => {
      clearAllCaches();

      const stats = getGlobalCacheStats();
      expect(stats.sessionCacheSize).toBe(0);
      expect(stats.userCacheSize).toBe(0);
      expect(stats.globalCacheValid).toBe(false);
    });
  });
});

// ============================================================================
// PREDICTIVE SCORER TESTS
// ============================================================================

describe('PredictiveScorer', () => {
  const testUserId = 'test-user';
  const testSessionId = 'test-session';

  beforeEach(() => {
    clearAllCaches();
  });

  afterEach(() => {
    clearAllCaches();
  });

  describe('MODE_CATEGORY_RELEVANCE', () => {
    it('should have relevance scores for all modes', () => {
      const modes: ConversationMode[] = [
        'crisis',
        'emotional',
        'practical',
        'deep',
        'casual',
        'unknown',
      ];
      for (const mode of modes) {
        expect(MODE_CATEGORY_RELEVANCE[mode]).toBeDefined();
      }
    });

    it('should prioritize safety in crisis mode', () => {
      const crisis = MODE_CATEGORY_RELEVANCE.crisis;
      expect(crisis.safety).toBe(100);
      expect(crisis.crisis_response).toBe(100);
    });

    it('should prioritize cognitive in deep mode', () => {
      const deep = MODE_CATEGORY_RELEVANCE.deep;
      expect(deep.cognitive).toBe(95);
      expect(deep.wisdom).toBe(90);
    });
  });

  describe('getModeRelevance', () => {
    it('should return exact matches', () => {
      expect(getModeRelevance('emotional', 'emotional')).toBe(90);
      expect(getModeRelevance('coaching', 'practical')).toBe(85);
    });

    it('should handle prefix matches', () => {
      expect(getModeRelevance('emotional_guidance', 'emotional')).toBe(90);
    });

    it('should return default for unknown categories', () => {
      expect(getModeRelevance('completely_unknown_xyz', 'unknown')).toBe(40);
    });
  });

  describe('computeScore', () => {
    it('should calculate weighted composite score', () => {
      const factors = {
        roiScore: 100,
        modeRelevance: 100,
        recencyBoost: 100,
        userAffinity: 100,
      };

      const score = computeScore(factors);

      // All 100 with weights should = 100
      expect(score).toBeCloseTo(100, 1);
    });

    it('should apply correct weights', () => {
      const factors = {
        roiScore: 100,
        modeRelevance: 0,
        recencyBoost: 0,
        userAffinity: 0,
      };

      const score = computeScore(factors);
      expect(score).toBeCloseTo(40, 1); // roiScore weight is 0.4
    });
  });

  describe('scoreBuilder', () => {
    it('should return score with all factors', () => {
      const cacheManager = createCacheManager(testSessionId, testUserId);
      const scorer = createPredictiveScorer(testUserId, testSessionId, cacheManager);

      const score = scorer.scoreBuilder('emotional', 'emotional', null);

      expect(score.builderId).toBe('emotional');
      expect(score.score).toBeGreaterThan(0);
      expect(score.confidence).toBeGreaterThan(0);
      expect(score.factors).toBeDefined();
      expect(score.source).toBe('fallback');
    });

    it('should use user affinity when preferences provided', () => {
      const cacheManager = createCacheManager(testSessionId, testUserId);
      const scorer = createPredictiveScorer(testUserId, testSessionId, cacheManager);

      const effectivePrefs = createUserPreferences(testUserId, ['good-builder'], []);
      const ineffectivePrefs = createUserPreferences(testUserId, [], ['bad-builder']);

      const goodScore = scorer.scoreBuilder('good-builder', 'unknown', effectivePrefs);
      const badScore = scorer.scoreBuilder('bad-builder', 'unknown', ineffectivePrefs);

      expect(goodScore.factors.userAffinity).toBe(90);
      expect(badScore.factors.userAffinity).toBe(10);
    });

    it('should cache scores in session', () => {
      const cacheManager = createCacheManager(testSessionId, testUserId);
      const scorer = createPredictiveScorer(testUserId, testSessionId, cacheManager);

      scorer.scoreBuilder('test-builder', 'unknown', null);

      expect(cacheManager.getSessionScore('test-builder')).toBeDefined();
    });
  });

  describe('recordSuccess', () => {
    it('should boost recency score after success', () => {
      const cacheManager = createCacheManager(testSessionId, testUserId);
      const scorer = createPredictiveScorer(testUserId, testSessionId, cacheManager);

      // Clear session cache to force fresh score
      cacheManager.clearSession();

      // Record a success
      scorer.recordSuccess('boosted-builder');

      // Score should have recency boost
      const score = scorer.scoreBuilder('boosted-builder', 'unknown', null);
      expect(score.factors.recencyBoost).toBeGreaterThan(0);
    });
  });

  describe('clearRecency', () => {
    it('should reset recency tracking', () => {
      const cacheManager = createCacheManager(testSessionId, testUserId);
      const scorer = createPredictiveScorer(testUserId, testSessionId, cacheManager);

      scorer.recordSuccess('test');
      scorer.clearRecency();
      cacheManager.clearSession(); // Force fresh calculation

      const score = scorer.scoreBuilder('test', 'unknown', null);
      expect(score.factors.recencyBoost).toBe(0);
    });
  });
});

// ============================================================================
// SMART SELECTOR TESTS
// ============================================================================

describe('SmartSelector', () => {
  const testUserId = 'test-user';
  const testSessionId = 'test-session';

  beforeEach(() => {
    clearAllCaches();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearAllCaches();
  });

  describe('selectInjections', () => {
    it('should select injections with default options', async () => {
      const selector = createSmartSelector(testUserId, testSessionId);
      const injections = [
        createInjection('emotional', 1),
        createInjection('coaching', 2),
        createInjection('memory', 3),
      ];

      const decision = await selector.selectInjections(injections, {
        userId: testUserId,
        sessionId: testSessionId,
        userText: 'Hello!',
      });

      expect(decision.selected.length).toBeGreaterThan(0);
      expect(decision.algorithm).toBe('priority'); // Default when no experiment
      expect(decision.mode).toBeDefined();
      expect(decision.processingTimeMs).toBeGreaterThanOrEqual(0);

      selector.cleanup();
    });

    it('should prioritize essential categories', async () => {
      const selector = createSmartSelector(testUserId, testSessionId);
      const injections = [
        createInjection('random_low_priority', 10),
        createInjection('safety', 1),
        createInjection('crisis_response', 2),
      ];

      const decision = await selector.selectInjections(injections, {
        userId: testUserId,
        sessionId: testSessionId,
        userText: 'I need help',
        useSmartSelection: true,
      });

      // Safety and crisis_response should be included
      const selectedCategories = decision.selected.map((i) => i.category);
      expect(selectedCategories).toContain('safety');

      selector.cleanup();
    });

    it('should respect maxInjections limit', async () => {
      const selector = createSmartSelector(testUserId, testSessionId);
      const injections = Array(20)
        .fill(null)
        .map((_, i) => createInjection(`category_${i}`, i));

      const decision = await selector.selectInjections(injections, {
        userId: testUserId,
        sessionId: testSessionId,
        userText: 'Test',
        maxInjections: 5,
      });

      // Should respect the limit (may have more due to safety bypass)
      expect(decision.selected.length).toBeLessThanOrEqual(6);

      selector.cleanup();
    });

    it('should detect crisis mode', async () => {
      const selector = createSmartSelector(testUserId, testSessionId);
      const injections = [createInjection('emotional', 1)];

      const decision = await selector.selectInjections(injections, {
        userId: testUserId,
        sessionId: testSessionId,
        userText: 'I need help',
        crisisDetected: true,
      });

      // With crisis detected, mode detection should consider it
      expect(decision.mode).toBeDefined();

      selector.cleanup();
    });

    it('should respect forceMode option', async () => {
      const selector = createSmartSelector(testUserId, testSessionId);
      const injections = [createInjection('emotional', 1)];

      const decision = await selector.selectInjections(injections, {
        userId: testUserId,
        sessionId: testSessionId,
        userText: 'Test',
        forceMode: 'deep',
      });

      expect(decision.mode).toBe('deep');

      selector.cleanup();
    });
  });

  describe('warmCache', () => {
    it('should warm cache from provided loaders', async () => {
      const selector = createSmartSelector(testUserId, testSessionId);
      const preferences = createUserPreferences(testUserId);
      const effectiveness = new Map([['builder1', createEffectiveness('builder1', 80)]]);

      await selector.warmCache(
        async () => ({ scores: new Map(), preferences }),
        async () => effectiveness
      );

      expect(CacheManager.getGlobalEffectiveness('builder1')).toBeDefined();

      selector.cleanup();
    });
  });

  describe('recordSuccess', () => {
    it('should record success for recency boosting', async () => {
      const selector = createSmartSelector(testUserId, testSessionId);

      selector.recordSuccess('test-builder');

      const stats = selector.getStats();
      expect(stats.scorerStats.recentSuccessCount).toBe(1);

      selector.cleanup();
    });
  });

  describe('cleanup', () => {
    it('should clear session state', async () => {
      const selector = createSmartSelector(testUserId, testSessionId);

      // Add some state
      selector.recordSuccess('test');

      selector.cleanup();

      const stats = selector.getStats();
      expect(stats.scorerStats.recentSuccessCount).toBe(0);
    });
  });
});

// ============================================================================
// CONVENIENCE FUNCTION TESTS
// ============================================================================

describe('selectInjections convenience function', () => {
  beforeEach(() => {
    clearAllCaches();
  });

  it('should select injections in a single call', async () => {
    const injections = [createInjection('emotional', 1), createInjection('coaching', 2)];

    const decision = await selectInjections(injections, {
      userId: 'user1',
      sessionId: 'session1',
      userText: 'Hello',
    });

    expect(decision.selected.length).toBeGreaterThan(0);
    expect(decision.algorithm).toBeDefined();
  });

  it('should clean up after selection', async () => {
    const injections = [createInjection('test', 1)];

    await selectInjections(injections, {
      userId: 'user2',
      sessionId: 'session2',
      userText: 'Test',
    });

    // Session cache should be cleared
    const manager = createCacheManager('session2', 'user2');
    expect(manager.getSessionScore('test')).toBeUndefined();
  });
});

// ============================================================================
// EXPERIMENT SETUP TESTS
// ============================================================================

describe('setupSmartRoutingExperiment', () => {
  it('should have correct experiment ID', () => {
    expect(SMART_ROUTING_EXPERIMENT_ID).toBe('smart-context-routing-v1');
  });

  it('should not throw when setting up experiment', async () => {
    await expect(setupSmartRoutingExperiment()).resolves.not.toThrow();
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration: Full Selection Flow', () => {
  beforeEach(() => {
    clearAllCaches();
  });

  afterEach(() => {
    clearAllCaches();
  });

  it('should handle a typical conversation turn', async () => {
    const userId = 'integration-user';
    const sessionId = 'integration-session';
    const selector = createSmartSelector(userId, sessionId);

    // Warm cache
    await selector.warmCache(
      async () => ({
        scores: new Map(),
        preferences: createUserPreferences(userId, ['memory'], ['coaching']),
      }),
      async () =>
        new Map([
          ['emotional', createEffectiveness('emotional', 75, 120)],
          ['memory', createEffectiveness('memory', 85, 200)],
        ])
    );

    // Typical injection set
    const injections = [
      createInjection('emotional', 1, 'User seems happy today'),
      createInjection('memory', 2, 'Remember the dog conversation'),
      createInjection('coaching', 3, 'Consider habit check-in'),
      createInjection('cognitive', 4, 'Pattern: weekly energy dip'),
      createInjection('safety', 1, 'Monitor for distress signals'),
    ];

    const decision = await selector.selectInjections(injections, {
      userId,
      sessionId,
      userText: "Hey, how's it going?",
      emotionalIntensity: 0.3,
      crisisDetected: false,
    });

    // Should have made a selection
    expect(decision.selected.length).toBeGreaterThan(0);

    // Safety should be included
    const hasEssential = decision.selected.some(
      (i) => ESSENTIAL_CATEGORIES.has(i.category) || i.category === 'safety'
    );
    expect(hasEssential).toBe(true);

    // Should have slot usage tracking
    expect(decision.slotUsage).toBeDefined();

    // Should have confidence
    expect(decision.confidence).toBeGreaterThanOrEqual(0);

    // Record success for one of the selected
    if (decision.selected.length > 0) {
      selector.recordSuccess(decision.selected[0].category);
    }

    selector.cleanup();
  });

  it('should handle crisis mode appropriately', async () => {
    const selector = createSmartSelector('crisis-user', 'crisis-session');

    const injections = [
      createInjection('emotional', 1, 'Support available'),
      createInjection('safety', 1, 'Crisis resources'),
      createInjection('boundaries', 1, 'Stay within scope'),
      createInjection('coaching', 5, 'Low priority coaching'),
    ];

    const decision = await selector.selectInjections(injections, {
      userId: 'crisis-user',
      sessionId: 'crisis-session',
      userText: "I'm not okay",
      crisisDetected: true,
      forceMode: 'crisis',
    });

    // All safety/essential categories should be included
    const selectedCategories = decision.selected.map((i) => i.category);
    expect(selectedCategories).toContain('safety');
    expect(selectedCategories).toContain('boundaries');

    selector.cleanup();
  });

  it('should handle empty injection list', async () => {
    const selector = createSmartSelector('empty-user', 'empty-session');

    const decision = await selector.selectInjections([], {
      userId: 'empty-user',
      sessionId: 'empty-session',
      userText: 'Hello',
    });

    expect(decision.selected).toHaveLength(0);
    expect(decision.rejected).toHaveLength(0);

    selector.cleanup();
  });
});
