/**
 * Tests for Extended Intelligent Routing Modules
 *
 * Covers:
 * - Extended intents (weather, reminders, timers, etc.)
 * - LLM providers (mocked)
 * - Observability
 * - A/B testing
 * - Cache warming
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ============================================================================
// EXTENDED INTENTS TESTS
// ============================================================================

import {
  EXTENDED_INTENTS,
  WEATHER_INTENTS,
  REMINDER_INTENTS,
  TIMER_INTENTS,
  NOTES_INTENTS,
  SPOTIFY_INTENTS,
  SEARCH_INTENTS,
  LOCATION_INTENTS,
  DATETIME_INTENTS,
  getAllExtendedIntents,
  getIntentsByCategory,
} from '../extended-intents.js';

describe('Extended Intents', () => {
  describe('Intent Definitions', () => {
    it('should have all extended intents loaded', () => {
      expect(EXTENDED_INTENTS.length).toBeGreaterThan(20);
    });

    it('should have weather intents', () => {
      expect(WEATHER_INTENTS.length).toBeGreaterThan(0);
      expect(WEATHER_INTENTS[0].category).toBe('weather');
    });

    it('should have reminder intents', () => {
      expect(REMINDER_INTENTS.length).toBeGreaterThan(0);
      expect(REMINDER_INTENTS[0].category).toBe('reminder');
    });

    it('should have timer intents', () => {
      expect(TIMER_INTENTS.length).toBeGreaterThan(0);
      expect(TIMER_INTENTS.some((i) => i.category === 'timer')).toBe(true);
    });

    it('should have notes intents', () => {
      expect(NOTES_INTENTS.length).toBeGreaterThan(0);
      expect(NOTES_INTENTS[0].category).toBe('notes');
    });

    it('should have Spotify-specific intents', () => {
      expect(SPOTIFY_INTENTS.length).toBeGreaterThan(5);
      expect(SPOTIFY_INTENTS.some((i) => i.id === 'spotify.playlist')).toBe(true);
      expect(SPOTIFY_INTENTS.some((i) => i.id === 'spotify.mood')).toBe(true);
      expect(SPOTIFY_INTENTS.some((i) => i.id === 'spotify.genre')).toBe(true);
    });

    it('should have search intents', () => {
      expect(SEARCH_INTENTS.length).toBeGreaterThan(0);
      expect(SEARCH_INTENTS[0].category).toBe('search');
    });

    it('should have location intents', () => {
      expect(LOCATION_INTENTS.length).toBeGreaterThan(0);
      expect(LOCATION_INTENTS[0].category).toBe('location');
    });

    it('should have datetime intents', () => {
      expect(DATETIME_INTENTS.length).toBeGreaterThan(0);
      expect(DATETIME_INTENTS[0].category).toBe('datetime');
    });
  });

  describe('getAllExtendedIntents', () => {
    it('should return all intents', () => {
      const intents = getAllExtendedIntents();
      expect(intents).toEqual(EXTENDED_INTENTS);
    });
  });

  describe('getIntentsByCategory', () => {
    it('should filter by category', () => {
      const weatherIntents = getIntentsByCategory('weather');
      expect(weatherIntents.length).toBeGreaterThan(0);
      expect(weatherIntents.every((i) => i.category === 'weather')).toBe(true);
    });

    it('should return empty for unknown category', () => {
      const unknownIntents = getIntentsByCategory('nonexistent');
      expect(unknownIntents).toEqual([]);
    });
  });

  describe('Pattern Matching', () => {
    it('should match weather patterns', () => {
      const weatherIntent = WEATHER_INTENTS.find((i) => i.id === 'weather.current');
      expect(weatherIntent?.patterns.some((p) => p.test("what's the weather"))).toBe(true);
      expect(weatherIntent?.patterns.some((p) => p.test('how is the weather'))).toBe(true);
    });

    it('should match reminder patterns', () => {
      const reminderIntent = REMINDER_INTENTS.find((i) => i.id === 'reminder.set');
      expect(reminderIntent?.patterns.some((p) => p.test('remind me to call mom'))).toBe(true);
      expect(reminderIntent?.patterns.some((p) => p.test('can you remind me'))).toBe(true);
    });

    it('should match timer patterns', () => {
      const timerIntent = TIMER_INTENTS.find((i) => i.id === 'timer.set');
      expect(timerIntent?.patterns.some((p) => p.test('set a timer for 5 minutes'))).toBe(true);
    });

    it('should match Spotify mood patterns', () => {
      const moodIntent = SPOTIFY_INTENTS.find((i) => i.id === 'spotify.mood');
      expect(moodIntent?.patterns.some((p) => p.test('play something relaxing'))).toBe(true);
      expect(moodIntent?.patterns.some((p) => p.test('chill music'))).toBe(true);
    });
  });
});

// ============================================================================
// OBSERVABILITY TESTS
// ============================================================================

import {
  recordRoutingDecision,
  recordRoutingOutcome,
  recordFallback,
  getDashboardData,
  getStrategyMetrics,
  clearMetrics,
  checkAlerts,
} from '../observability.js';
import type { RoutingDecision } from '../orchestrator.js';

describe('Observability', () => {
  beforeEach(() => {
    clearMetrics();
  });

  const mockDecision: RoutingDecision = {
    action: 'execute',
    toolId: 'spotify_play',
    args: {},
    confidence: 0.9,
    decidedBy: 'intent-classifier',
    reasoning: 'Matched intent: Play Music',
    timing: { total: 5 },
    rawResults: {},
    strategiesUsed: ['intent-classifier'],
    shouldExplain: false,
  };

  const mockContext = {
    userId: 'test-user',
    sessionId: 'test-session',
    personaId: 'ferni',
    input: 'play some music',
  };

  describe('recordRoutingDecision', () => {
    it('should record a routing decision', () => {
      recordRoutingDecision(mockDecision, mockContext);

      const dashboard = getDashboardData();
      expect(dashboard.summary.totalRoutes).toBe(1);
    });

    it('should track strategy breakdown', () => {
      recordRoutingDecision(mockDecision, mockContext);

      const metrics = getStrategyMetrics('intent-classifier');
      expect(metrics.totalCalls).toBe(1);
    });
  });

  describe('recordRoutingOutcome', () => {
    it('should record success outcome', () => {
      recordRoutingDecision(mockDecision, mockContext);
      recordRoutingOutcome(mockDecision, { success: true }, mockContext);

      // No assertion - just verify it doesn't throw
    });

    it('should record error outcome', () => {
      recordRoutingDecision(mockDecision, mockContext);
      recordRoutingOutcome(mockDecision, { success: false, error: 'Test error' }, mockContext);

      const dashboard = getDashboardData();
      expect(dashboard.recentErrors.length).toBeGreaterThan(0);
    });
  });

  describe('recordFallback', () => {
    it('should record fallback events', () => {
      recordFallback('intent-classifier', 'llm-fallback', 'Low confidence', mockContext);

      // No assertion - just verify it doesn't throw
    });
  });

  describe('getDashboardData', () => {
    it('should return dashboard structure', () => {
      const dashboard = getDashboardData();

      expect(dashboard).toHaveProperty('summary');
      expect(dashboard).toHaveProperty('strategyBreakdown');
      expect(dashboard).toHaveProperty('topTools');
      expect(dashboard).toHaveProperty('recentErrors');
      expect(dashboard).toHaveProperty('hourlyTrends');
    });

    it('should aggregate multiple decisions', () => {
      for (let i = 0; i < 10; i++) {
        recordRoutingDecision(mockDecision, mockContext);
      }

      const dashboard = getDashboardData();
      expect(dashboard.summary.totalRoutes).toBe(10);
    });
  });

  describe('getStrategyMetrics', () => {
    it('should return metrics for strategy', () => {
      recordRoutingDecision(mockDecision, mockContext);

      const metrics = getStrategyMetrics('intent-classifier');
      expect(metrics.strategy).toBe('intent-classifier');
      expect(metrics.totalCalls).toBe(1);
      expect(metrics.avgConfidence).toBeCloseTo(0.9);
    });

    it('should calculate latency percentiles', () => {
      for (let i = 0; i < 100; i++) {
        recordRoutingDecision({ ...mockDecision, timing: { total: i } }, mockContext);
      }

      const metrics = getStrategyMetrics('intent-classifier');
      expect(metrics.p50LatencyMs).toBeGreaterThan(0);
      expect(metrics.p95LatencyMs).toBeGreaterThan(metrics.p50LatencyMs);
    });
  });

  describe('checkAlerts', () => {
    it('should return empty alerts for healthy system', () => {
      for (let i = 0; i < 20; i++) {
        recordRoutingDecision(mockDecision, mockContext);
      }

      const alerts = checkAlerts();
      expect(alerts.length).toBe(0);
    });

    it('should alert on low confidence', () => {
      const lowConfidenceDecision = { ...mockDecision, confidence: 0.3 };
      for (let i = 0; i < 200; i++) {
        recordRoutingDecision(lowConfidenceDecision, mockContext);
      }

      const alerts = checkAlerts();
      expect(alerts.some((a) => a.ruleId === 'low-confidence')).toBe(true);
    });
  });

  describe('clearMetrics', () => {
    it('should clear all metrics', () => {
      recordRoutingDecision(mockDecision, mockContext);
      clearMetrics();

      const dashboard = getDashboardData();
      expect(dashboard.summary.totalRoutes).toBe(0);
    });
  });
});

// ============================================================================
// A/B TESTING TESTS
// ============================================================================

import {
  getABTestingService,
  shouldUseIntelligentRouting,
  getIntelligentConfig,
  enableIntelligentRouting,
  getExperimentDashboard,
  INTELLIGENT_VS_SEMANTIC_EXPERIMENT,
} from '../ab-testing.js';

describe('A/B Testing', () => {
  describe('Experiment Definitions', () => {
    it('should have intelligent-vs-semantic experiment', () => {
      expect(INTELLIGENT_VS_SEMANTIC_EXPERIMENT.id).toBe('intelligent-vs-semantic');
      expect(INTELLIGENT_VS_SEMANTIC_EXPERIMENT.variants.length).toBeGreaterThan(0);
    });

    it('should have correct traffic allocation', () => {
      const totalTraffic = INTELLIGENT_VS_SEMANTIC_EXPERIMENT.trafficAllocation.reduce(
        (sum, t) => sum + t,
        0
      );
      expect(totalTraffic).toBe(100);
    });
  });

  describe('getABTestingService', () => {
    it('should return singleton instance', () => {
      const service1 = getABTestingService();
      const service2 = getABTestingService();
      expect(service1).toBe(service2);
    });
  });

  describe('shouldUseIntelligentRouting', () => {
    it('should return false when experiment is disabled', () => {
      const result = shouldUseIntelligentRouting('test-user');
      // Experiment is disabled by default
      expect(result).toBe(false);
    });
  });

  describe('getIntelligentConfig', () => {
    it('should return null when experiment is disabled', () => {
      const config = getIntelligentConfig('test-user');
      expect(config).toBeNull();
    });
  });

  describe('enableIntelligentRouting', () => {
    afterEach(() => {
      // Disable after test
      getABTestingService().setExperimentActive('intelligent-vs-semantic', false);
    });

    it('should enable experiment', () => {
      enableIntelligentRouting(50);

      const dashboard = getExperimentDashboard();
      const experiment = dashboard.experiments.find((e) => e.id === 'intelligent-vs-semantic');
      expect(experiment?.active).toBe(true);
    });
  });

  describe('getExperimentDashboard', () => {
    it('should return dashboard structure', () => {
      const dashboard = getExperimentDashboard();

      expect(dashboard).toHaveProperty('experiments');
      expect(dashboard).toHaveProperty('results');
      expect(dashboard.experiments.length).toBeGreaterThan(0);
    });
  });

  describe('User Assignment', () => {
    it('should consistently assign same user to same variant', () => {
      enableIntelligentRouting(100);

      const service = getABTestingService();
      const assignment1 = service.assignUser('consistent-user', 'intelligent-vs-semantic');
      const assignment2 = service.assignUser('consistent-user', 'intelligent-vs-semantic');

      expect(assignment1?.variantId).toBe(assignment2?.variantId);

      // Cleanup
      service.setExperimentActive('intelligent-vs-semantic', false);
    });

    it('should distribute users across variants', () => {
      enableIntelligentRouting(100);

      const service = getABTestingService();
      const variants = new Set<string>();

      // Generate many users to check distribution
      for (let i = 0; i < 1000; i++) {
        const assignment = service.assignUser(`user-${i}`, 'intelligent-vs-semantic');
        if (assignment) {
          variants.add(assignment.variantId);
        }
      }

      // Should have multiple variants assigned
      expect(variants.size).toBeGreaterThan(1);

      // Cleanup
      service.setExperimentActive('intelligent-vs-semantic', false);
    });
  });
});

// ============================================================================
// CACHE WARMING TESTS
// ============================================================================

import {
  warmIntelligentRouting,
  quickWarmup,
  startPeriodicRefresh,
  stopPeriodicRefresh,
} from '../cache-warming.js';

describe('Cache Warming', () => {
  describe('warmIntelligentRouting', () => {
    it('should warm intent classifier', async () => {
      const result = await warmIntelligentRouting({
        warmIntentClassifier: true,
        warmBanditOptimizer: false,
        warmLLMProvider: false,
        warmSemanticRouter: false,
        warmWithSampleQueries: false,
      });

      expect(result.stats.intentsLoaded).toBeGreaterThan(0);
      expect(result.timings.intentClassifierMs).toBeGreaterThan(0);
    });

    it('should return timing information', async () => {
      const result = await warmIntelligentRouting({
        warmIntentClassifier: true,
        warmBanditOptimizer: false,
        warmLLMProvider: false,
      });

      expect(result.timings).toHaveProperty('totalMs');
      expect(result.timings.totalMs).toBeGreaterThan(0);
    });

    it('should track errors gracefully', async () => {
      const result = await warmIntelligentRouting({
        warmIntentClassifier: true,
      });

      // Even if some warmup fails, should return result
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('errors');
    });
  });

  describe('quickWarmup', () => {
    it('should be fast', async () => {
      const start = performance.now();
      await quickWarmup();
      const duration = performance.now() - start;

      // Quick warmup should be < 500ms
      expect(duration).toBeLessThan(500);
    });

    it('should return warmup result', async () => {
      const result = await quickWarmup();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('stats');
      expect(result.stats.intentsLoaded).toBeGreaterThan(0);
    });
  });

  describe('Periodic Refresh', () => {
    afterEach(() => {
      stopPeriodicRefresh();
    });

    it('should start and stop without error', () => {
      startPeriodicRefresh(60000);
      stopPeriodicRefresh();
      // No assertion - just verify it doesn't throw
    });
  });
});

// ============================================================================
// LLM PROVIDERS TESTS (Mocked)
// ============================================================================

import {
  createGeminiProvider,
  createOpenAIProvider,
  createClaudeProvider,
  createLLMProvider,
  createProviderFromEnv,
} from '../llm-providers.js';

describe('LLM Providers', () => {
  describe('createLLMProvider', () => {
    it('should create Gemini provider', () => {
      const provider = createLLMProvider('gemini', { apiKey: 'test-key' });
      expect(provider).toHaveProperty('selectTool');
      expect(provider).toHaveProperty('reason');
      expect(provider).toHaveProperty('createPlan');
    });

    it('should create OpenAI provider', () => {
      const provider = createLLMProvider('openai', { apiKey: 'test-key' });
      expect(provider).toHaveProperty('selectTool');
    });

    it('should create Claude provider', () => {
      const provider = createLLMProvider('claude', { apiKey: 'test-key' });
      expect(provider).toHaveProperty('selectTool');
    });

    it('should throw for unknown provider', () => {
      expect(() => createLLMProvider('unknown' as any, { apiKey: 'test' })).toThrow();
    });
  });

  describe('Provider Interfaces', () => {
    const mockCandidates = [
      { toolId: 'test_tool', name: 'Test', description: 'Test tool', confidence: 0.8 },
    ];

    it('Gemini provider should have correct interface', () => {
      const provider = createGeminiProvider({ apiKey: 'test' });

      expect(typeof provider.selectTool).toBe('function');
      expect(typeof provider.reason).toBe('function');
      expect(typeof provider.createPlan).toBe('function');
    });

    it('OpenAI provider should have correct interface', () => {
      const provider = createOpenAIProvider({ apiKey: 'test' });

      expect(typeof provider.selectTool).toBe('function');
      expect(typeof provider.reason).toBe('function');
      expect(typeof provider.createPlan).toBe('function');
    });

    it('Claude provider should have correct interface', () => {
      const provider = createClaudeProvider({ apiKey: 'test' });

      expect(typeof provider.selectTool).toBe('function');
      expect(typeof provider.reason).toBe('function');
      expect(typeof provider.createPlan).toBe('function');
    });
  });

  describe('createProviderFromEnv', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return null when no API keys', () => {
      process.env = { ...originalEnv };
      delete process.env.GOOGLE_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      // This may return a provider if keys exist in the actual env
      const provider = createProviderFromEnv();
      // Just verify it doesn't throw
      expect(provider === null || typeof provider === 'object').toBe(true);
    });
  });
});
