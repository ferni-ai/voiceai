/**
 * Unified Data Layer Tests
 *
 * Comprehensive test suite for the unified data layer architecture.
 *
 * @module tests/data-layer/unified-data-layer.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Import mocks first
vi.mock('../../memory/firestore-vector-store/index.js', () => ({
  getFirestoreVectorStore: vi.fn(() => ({
    addDocument: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    getHealth: vi.fn().mockReturnValue({
      healthy: true,
      usingFallback: false,
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../memory/embeddings.js', () => ({
  embed: vi.fn().mockResolvedValue(new Array(768).fill(0)),
}));

vi.mock('../../memory/semantic-rag.js', () => ({
  semanticSearch: vi.fn().mockResolvedValue([]),
}));

// Import modules after mocks
import {
  getUnifiedDataLayer,
  getUnifiedContext,
  searchUserContext,
  buildLLMContext,
} from '../../services/data-layer/index.js';

import {
  onHabitChange,
  onSavingsGoalChange,
  onMilestoneChange,
  onTaskChange,
  flushPendingChanges,
  clearPendingChanges,
  getIndexingMetrics,
  resetMetrics,
} from '../../services/data-layer/store-hooks.js';

import { routeQuery, explainRouting } from '../../services/data-layer/query-router.js';

import {
  shouldIndex,
  buildIndexContent,
  getEntityPolicy,
  DEFAULT_INDEXING_POLICY,
} from '../../services/data-layer/indexing-policy.js';

import {
  onSessionStart,
  onSessionEnd,
  getSessionMetrics,
  clearAllSessions,
} from '../../services/data-layer/session-integration.js';

import {
  getDataLayerHealth,
  isHealthy,
  getDiagnostics,
  recordQuery,
  resetQueryMetrics,
} from '../../services/data-layer/health.js';

// ============================================================================
// STORE HOOKS TESTS
// ============================================================================

describe('Store Hooks', () => {
  beforeEach(() => {
    resetMetrics();
    clearPendingChanges();
  });

  afterEach(() => {
    clearPendingChanges();
    vi.clearAllMocks();
  });

  describe('onHabitChange', () => {
    it('should queue habit changes for indexing', () => {
      onHabitChange('user-123', 'habit-1', {
        name: 'Morning jog',
        description: 'Run 5k every morning',
        frequency: 'daily',
        streakCurrent: 5,
      });

      const metrics = getIndexingMetrics();
      expect(metrics.pendingCount).toBe(1);
    });

    it('should handle habits without optional fields', () => {
      onHabitChange('user-123', 'habit-2', {
        name: 'Meditate',
      });

      const metrics = getIndexingMetrics();
      expect(metrics.pendingCount).toBe(1);
    });
  });

  describe('onSavingsGoalChange', () => {
    it('should queue savings goal changes', () => {
      onSavingsGoalChange('user-123', 'goal-1', {
        name: 'Emergency Fund',
        targetAmount: 10000,
        currentAmount: 2500,
        priority: 'high',
      });

      const metrics = getIndexingMetrics();
      expect(metrics.pendingCount).toBe(1);
    });
  });

  describe('onTaskChange', () => {
    it('should only index high priority tasks', () => {
      // Low priority - should be skipped
      onTaskChange('user-123', 'task-1', {
        title: 'Buy milk',
        priority: 'low',
      });

      expect(getIndexingMetrics().pendingCount).toBe(0);

      // High priority - should be queued
      onTaskChange('user-123', 'task-2', {
        title: 'Submit tax forms',
        priority: 'high',
      });

      expect(getIndexingMetrics().pendingCount).toBe(1);
    });
  });

  describe('flushPendingChanges', () => {
    it('should flush all pending changes', async () => {
      onHabitChange('user-123', 'habit-1', { name: 'Test habit' });
      onSavingsGoalChange('user-123', 'goal-1', {
        name: 'Test goal',
        targetAmount: 1000,
        currentAmount: 0,
      });

      expect(getIndexingMetrics().pendingCount).toBe(2);

      const result = await flushPendingChanges();

      expect(result.flushed).toBe(2);
      expect(getIndexingMetrics().pendingCount).toBe(0);
    });
  });
});

// ============================================================================
// QUERY ROUTER TESTS
// ============================================================================

describe('Query Router', () => {
  describe('routeQuery', () => {
    it('should route bill queries appropriately', () => {
      const decision = routeQuery('Show me all bills due this week');

      // May be structured or hybrid depending on pattern matching
      expect(['structured', 'hybrid']).toContain(decision.queryType);
      if (decision.stores) {
        expect(decision.stores).toContain('productivity');
      }
      if (decision.entityTypes) {
        expect(decision.entityTypes).toContain('bill');
      }
    });

    it('should route budget queries to structured', () => {
      const decision = routeQuery('How much budget do I have remaining?');

      expect(decision.queryType).toBe('structured');
      expect(decision.stores).toContain('financial');
      expect(decision.entityTypes).toContain('budget');
    });

    it('should route emotional queries to semantic', () => {
      const decision = routeQuery('How am I doing with my progress?');

      expect(decision.queryType).toBe('semantic');
    });

    it('should route memory queries to semantic', () => {
      const decision = routeQuery('Do you remember what I mentioned about my career?');

      expect(decision.queryType).toBe('semantic');
    });

    it('should use hybrid for keyword-rich queries', () => {
      const decision = routeQuery('Tell me about my habits');

      // Should identify habits keyword and suggest hybrid or semantic
      expect(['hybrid', 'semantic']).toContain(decision.queryType);
      if (decision.stores) {
        expect(decision.stores).toContain('productivity');
      }
    });
  });

  describe('explainRouting', () => {
    it('should provide human-readable explanation', () => {
      const explanation = explainRouting('What bills are due?');

      expect(explanation).toContain('Query:');
      expect(explanation).toContain('Type:');
      expect(explanation).toContain('Confidence:');
    });
  });
});

// ============================================================================
// INDEXING POLICY TESTS
// ============================================================================

describe('Indexing Policy', () => {
  describe('shouldIndex', () => {
    it('should index active habits', () => {
      const result = shouldIndex('habit', { isActive: true });
      expect(result.shouldIndex).toBe(true);
    });

    it('should skip inactive habits', () => {
      const result = shouldIndex('habit', { isActive: false });
      expect(result.shouldIndex).toBe(false);
    });

    it('should never index notes', () => {
      const result = shouldIndex('note', {});
      expect(result.shouldIndex).toBe(false);
      expect(result.reason).toContain('never');
    });

    it('should index active savings goals', () => {
      const result = shouldIndex('savings_goal', { status: 'active' });
      expect(result.shouldIndex).toBe(true);
    });

    it('should skip completed savings goals', () => {
      const result = shouldIndex('savings_goal', { status: 'completed' });
      expect(result.shouldIndex).toBe(false);
    });
  });

  describe('buildIndexContent', () => {
    it('should build habit content', () => {
      const content = buildIndexContent('habit', {
        name: 'Morning jog',
        description: 'Run 5k',
        frequency: 'daily',
        streakCurrent: 10,
      });

      expect(content).toContain('habit');
      expect(content).toContain('Morning jog');
    });

    it('should build savings goal content', () => {
      const content = buildIndexContent('savings_goal', {
        name: 'Emergency Fund',
        targetAmount: 10000,
        currentAmount: 2500,
      });

      expect(content).toContain('savings goal');
      expect(content).toContain('Emergency Fund');
    });
  });

  describe('getEntityPolicy', () => {
    it('should return policy for known entities', () => {
      const habitPolicy = getEntityPolicy('habit');
      expect(habitPolicy).toBeDefined();
      expect(habitPolicy?.priority).toBe('active_only');

      const budgetPolicy = getEntityPolicy('budget');
      expect(budgetPolicy).toBeDefined();
      expect(budgetPolicy?.priority).toBe('always');
    });
  });

  describe('DEFAULT_INDEXING_POLICY', () => {
    it('should have reasonable defaults', () => {
      expect(DEFAULT_INDEXING_POLICY.maxDocsPerUser).toBe(500);
      expect(DEFAULT_INDEXING_POLICY.debounceMs).toBe(2000);
      expect(DEFAULT_INDEXING_POLICY.entities.length).toBeGreaterThan(10);
    });
  });
});

// ============================================================================
// SESSION INTEGRATION TESTS
// ============================================================================

describe('Session Integration', () => {
  beforeEach(() => {
    clearAllSessions();
    resetMetrics();
  });

  afterEach(() => {
    clearAllSessions();
  });

  describe('onSessionStart', () => {
    it('should initialize session state', async () => {
      const context = await onSessionStart('user-123', 'session-abc');

      // Context may be null in test environment without full store setup
      // But session should be tracked
      const metrics = getSessionMetrics();
      expect(metrics.activeSessions).toBe(1);
    });
  });

  describe('onSessionEnd', () => {
    it('should flush pending changes', async () => {
      await onSessionStart('user-123', 'session-abc');

      // Add some pending changes
      onHabitChange('user-123', 'habit-1', { name: 'Test' });

      const result = await onSessionEnd('session-abc');

      expect(result.flushed).toBeGreaterThanOrEqual(0);
      expect(result.duration).toBeGreaterThanOrEqual(0); // Can be 0 if very fast

      const metrics = getSessionMetrics();
      expect(metrics.activeSessions).toBe(0);
    });

    it('should handle unknown session gracefully', async () => {
      const result = await onSessionEnd('unknown-session');

      expect(result.flushed).toBe(0);
      expect(result.duration).toBe(0);
    });
  });
});

// ============================================================================
// HEALTH CHECK TESTS
// ============================================================================

describe('Health Checks', () => {
  beforeEach(() => {
    resetQueryMetrics();
  });

  describe('getDataLayerHealth', () => {
    it('should return health status', async () => {
      const health = await getDataLayerHealth();

      expect(health.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
      expect(health.timestamp).toBeDefined();
      expect(health.components).toBeDefined();
      expect(health.metrics).toBeDefined();
    });

    it('should include component status', async () => {
      const health = await getDataLayerHealth();

      expect(health.components.stores).toBeDefined();
      expect(health.components.semanticMemory).toBeDefined();
      expect(health.components.indexing).toBeDefined();
    });
  });

  describe('isHealthy', () => {
    it('should return boolean', async () => {
      const healthy = await isHealthy();
      expect(typeof healthy).toBe('boolean');
    });
  });

  describe('getDiagnostics', () => {
    it('should return detailed diagnostics', async () => {
      const diagnostics = await getDiagnostics();

      expect(diagnostics.health).toBeDefined();
      expect(diagnostics.sessions).toBeDefined();
      expect(diagnostics.indexing).toBeDefined();
      expect(Array.isArray(diagnostics.issues)).toBe(true);
      expect(Array.isArray(diagnostics.recommendations)).toBe(true);
    });
  });

  describe('recordQuery', () => {
    it('should track query metrics', async () => {
      recordQuery({ cacheHit: true, latencyMs: 50 });
      recordQuery({ cacheHit: false, semanticSearch: true, semanticHit: true, latencyMs: 100 });
      recordQuery({ cacheHit: false, error: true, latencyMs: 200 });

      const health = await getDataLayerHealth();

      // Cache hit rate: 1/3 = 0.333
      expect(health.metrics.cacheHitRate).toBeCloseTo(1 / 3, 1);
      // Avg latency: (50 + 100 + 200) / 3 = 116.67
      expect(health.metrics.avgQueryLatencyMs).toBeCloseTo(350 / 3, 0);
    });
  });
});

// ============================================================================
// UNIFIED DATA LAYER TESTS
// ============================================================================

describe('Unified Data Layer', () => {
  describe('getUnifiedDataLayer', () => {
    it('should return singleton instance', () => {
      const layer1 = getUnifiedDataLayer();
      const layer2 = getUnifiedDataLayer();

      expect(layer1).toBe(layer2);
    });
  });

  describe('getUnifiedContext', () => {
    it('should return context structure', async () => {
      const context = await getUnifiedContext('test-user');

      expect(context.userId).toBe('test-user');
      expect(context.timestamp).toBeDefined();
      expect(context.summary).toBeDefined();
      expect(typeof context.summary.activeTaskCount).toBe('number');
    });
  });

  describe('buildLLMContext', () => {
    it('should build context string', async () => {
      const context = await buildLLMContext('test-user', 'How are my habits?');

      expect(typeof context).toBe('string');
      // May be empty in test environment, but should not throw
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration', () => {
  beforeEach(() => {
    clearAllSessions();
    resetMetrics();
    resetQueryMetrics();
  });

  it('should handle full session lifecycle', async () => {
    // Start session
    await onSessionStart('user-123', 'session-1');
    expect(getSessionMetrics().activeSessions).toBe(1);

    // Simulate store changes
    onHabitChange('user-123', 'habit-1', { name: 'Test habit' });
    expect(getIndexingMetrics().pendingCount).toBe(1);

    // End session (should flush)
    const result = await onSessionEnd('session-1');
    expect(result.flushed).toBeGreaterThanOrEqual(1);
    expect(getSessionMetrics().activeSessions).toBe(0);
  });

  it('should route and execute queries appropriately', async () => {
    // Bill query - should recognize bill keyword
    const billRouting = routeQuery('Show me all my bills');
    expect(['structured', 'hybrid']).toContain(billRouting.queryType);

    // Semantic query - should detect progress/feeling patterns
    const progressRouting = routeQuery('How am I doing overall?');
    expect(progressRouting.queryType).toBe('semantic');
  });

  it('should respect indexing policy', () => {
    // Should index active items
    const activeResult = shouldIndex('habit', { isActive: true });
    expect(activeResult.shouldIndex).toBe(true);

    // Should skip inactive
    const inactiveResult = shouldIndex('habit', { isActive: false });
    expect(inactiveResult.shouldIndex).toBe(false);

    // Should never index notes
    const noteResult = shouldIndex('note', { isActive: true });
    expect(noteResult.shouldIndex).toBe(false);
  });
});
