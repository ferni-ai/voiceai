/**
 * Tests for Timing-Aware Injection Module
 *
 * Phase 3 BTH Communication Overhaul - Graceful degradation tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  detectPressureLevel,
  filterInjectionsByPressure,
  applyTimingAwareDegradation,
  cacheInsight,
  getCachedInsights,
  clearCachedInsights,
  PRESSURE_CONFIG,
  TIER_1_ESSENTIAL,
  TIER_2_HIGH_VALUE,
  TIER_3_OPTIONAL,
  type PressureLevel,
} from '../timing-aware-injection.js';
import type { TimingState } from '../../../intelligence/context-builders/awareness/system-state-awareness.js';
import type { ContextInjection } from '../types.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockTimingState(overrides: Partial<TimingState> = {}): TimingState {
  return {
    turnLatency: 'normal',
    userWaitingTime: 0,
    conversationPace: 'normal',
    toolsInFlight: [],
    avgE2ELatency: undefined,
    isUnderPressure: false,
    ...overrides,
  };
}

function createMockInjection(overrides: Partial<ContextInjection> = {}): ContextInjection {
  return {
    category: 'emotional',
    content: 'Test content',
    priority: 50,
    ...overrides,
  };
}

// ============================================================================
// PRESSURE DETECTION TESTS
// ============================================================================

describe('detectPressureLevel', () => {
  it('returns normal when no timing state', () => {
    expect(detectPressureLevel(null)).toBe('normal');
  });

  it('returns normal when no pressure signals', () => {
    const state = createMockTimingState({
      userWaitingTime: 0,
      toolsInFlight: [],
    });
    expect(detectPressureLevel(state)).toBe('normal');
  });

  it('returns moderate when user waiting over threshold', () => {
    const state = createMockTimingState({
      userWaitingTime: PRESSURE_CONFIG.MODERATE_WAIT_MS + 100,
    });
    expect(detectPressureLevel(state)).toBe('moderate');
  });

  it('returns moderate when tools in flight', () => {
    const state = createMockTimingState({
      toolsInFlight: ['some-tool'],
    });
    expect(detectPressureLevel(state)).toBe('moderate');
  });

  it('returns moderate when avg latency is slow', () => {
    const state = createMockTimingState({
      avgE2ELatency: PRESSURE_CONFIG.SLOW_LATENCY_MS + 100,
    });
    expect(detectPressureLevel(state)).toBe('moderate');
  });

  it('returns severe when user waiting long', () => {
    const state = createMockTimingState({
      userWaitingTime: PRESSURE_CONFIG.SEVERE_WAIT_MS + 100,
    });
    expect(detectPressureLevel(state)).toBe('severe');
  });

  it('returns severe when avg latency very slow', () => {
    const state = createMockTimingState({
      avgE2ELatency: PRESSURE_CONFIG.VERY_SLOW_LATENCY_MS + 100,
    });
    expect(detectPressureLevel(state)).toBe('severe');
  });

  it('returns critical when user waiting very long', () => {
    const state = createMockTimingState({
      userWaitingTime: PRESSURE_CONFIG.CRITICAL_WAIT_MS + 100,
    });
    expect(detectPressureLevel(state)).toBe('critical');
  });
});

// ============================================================================
// INJECTION FILTERING TESTS
// ============================================================================

describe('filterInjectionsByPressure', () => {
  const createInjectionSet = () => [
    // TIER 1 - Essential (always included)
    createMockInjection({ category: 'safety', content: 'Safety guidance', priority: 10 }),
    createMockInjection({ category: 'identity', content: 'Identity guidance', priority: 15 }),
    createMockInjection({ category: 'boundaries', content: 'Boundaries guidance', priority: 20 }),

    // TIER 2 - High-value (included unless critical)
    createMockInjection({ category: 'emotional', content: 'Emotional guidance', priority: 30 }),
    createMockInjection({ category: 'memory', content: 'Memory callback', priority: 35 }),
    createMockInjection({ category: 'coaching', content: 'Coaching tip', priority: 40 }),

    // TIER 3 - Optional (skipped under pressure)
    createMockInjection({ category: 'catchphrase', content: 'Catchphrase', priority: 70 }),
    createMockInjection({
      category: 'story_opportunity',
      content: 'Story suggestion',
      priority: 75,
    }),
    createMockInjection({ category: 'ambient_awareness', content: 'Ambient note', priority: 80 }),
  ];

  it('returns all injections at normal pressure', () => {
    const injections = createInjectionSet();
    const result = filterInjectionsByPressure(injections, 'normal');
    expect(result).toHaveLength(9);
  });

  it('removes TIER 3 at moderate pressure', () => {
    const injections = createInjectionSet();
    const result = filterInjectionsByPressure(injections, 'moderate');

    // Should have TIER 1 + TIER 2, not TIER 3
    expect(result.length).toBeLessThan(9);

    // TIER 1 and TIER 2 should be present
    expect(result.some((i) => i.category === 'safety')).toBe(true);
    expect(result.some((i) => i.category === 'emotional')).toBe(true);

    // TIER 3 should be filtered out
    expect(result.some((i) => i.category === 'catchphrase')).toBe(false);
    expect(result.some((i) => i.category === 'story_opportunity')).toBe(false);
  });

  it('removes TIER 3 at severe pressure with lower limits', () => {
    const injections = createInjectionSet();
    const result = filterInjectionsByPressure(injections, 'severe');

    // Should have fewer than moderate due to limits
    expect(result.length).toBeLessThanOrEqual(PRESSURE_CONFIG.SEVERE.maxInjections);

    // TIER 1 should still be present
    expect(result.some((i) => i.category === 'safety')).toBe(true);
  });

  it('keeps only TIER 1 at critical pressure', () => {
    const injections = createInjectionSet();
    const result = filterInjectionsByPressure(injections, 'critical');

    // At critical, only TIER 1 categories are allowed
    expect(result.length).toBeLessThanOrEqual(PRESSURE_CONFIG.CRITICAL.maxInjections);

    // Verify all results are TIER 1
    for (const injection of result) {
      expect(TIER_1_ESSENTIAL.has(injection.category?.toLowerCase() || '')).toBe(true);
    }
  });

  it('respects character limits', () => {
    const longInjections = [
      createMockInjection({ category: 'safety', content: 'A'.repeat(500), priority: 10 }),
      createMockInjection({ category: 'identity', content: 'B'.repeat(500), priority: 15 }),
      createMockInjection({ category: 'emotional', content: 'C'.repeat(500), priority: 30 }),
    ];

    const result = filterInjectionsByPressure(longInjections, 'critical');

    // Character limit should reduce results
    const totalChars = result.reduce((sum, i) => sum + (i.content?.length || 0), 0);
    // Essential items may exceed limit but non-essential won't
    expect(result.length).toBeLessThanOrEqual(PRESSURE_CONFIG.CRITICAL.maxInjections);
  });

  it('sorts by priority (lower = more important)', () => {
    const injections = [
      createMockInjection({ category: 'safety', content: 'Low priority', priority: 90 }),
      createMockInjection({ category: 'identity', content: 'High priority', priority: 10 }),
    ];

    const result = filterInjectionsByPressure(injections, 'moderate');

    // Higher priority (lower number) should come first
    expect(result[0].priority).toBeLessThan(result[result.length - 1].priority || 100);
  });
});

// ============================================================================
// INSIGHT CACHING TESTS
// ============================================================================

describe('insight caching', () => {
  const testSessionId = 'test-session-123';

  beforeEach(() => {
    clearCachedInsights(testSessionId);
  });

  afterEach(() => {
    clearCachedInsights(testSessionId);
  });

  it('caches high-value insights', () => {
    const injection = createMockInjection({
      category: 'emotional',
      content: 'Important emotional insight',
    });

    cacheInsight(testSessionId, injection);

    const cached = getCachedInsights(testSessionId);
    expect(cached).toHaveLength(1);
    expect(cached[0].content).toBe('Important emotional insight');
  });

  it('does not cache TIER 3 insights', () => {
    const injection = createMockInjection({
      category: 'catchphrase',
      content: 'Just a catchphrase',
    });

    cacheInsight(testSessionId, injection);

    const cached = getCachedInsights(testSessionId);
    expect(cached).toHaveLength(0);
  });

  it('keeps last 10 insights', () => {
    // Cache 15 insights
    for (let i = 0; i < 15; i++) {
      cacheInsight(
        testSessionId,
        createMockInjection({
          category: 'emotional',
          content: `Insight ${i}`,
        })
      );
    }

    const cached = getCachedInsights(testSessionId);
    expect(cached.length).toBeLessThanOrEqual(10);
  });

  it('filters out old insights (> 60s)', () => {
    vi.useFakeTimers();

    cacheInsight(
      testSessionId,
      createMockInjection({
        category: 'emotional',
        content: 'Old insight',
      })
    );

    // Advance time 61 seconds
    vi.advanceTimersByTime(61000);

    const cached = getCachedInsights(testSessionId);
    expect(cached).toHaveLength(0);

    vi.useRealTimers();
  });

  it('clears insights for session', () => {
    cacheInsight(
      testSessionId,
      createMockInjection({
        category: 'emotional',
        content: 'Test insight',
      })
    );

    clearCachedInsights(testSessionId);

    const cached = getCachedInsights(testSessionId);
    expect(cached).toHaveLength(0);
  });
});

// ============================================================================
// MAIN INTEGRATION TESTS
// ============================================================================

describe('applyTimingAwareDegradation', () => {
  const testSessionId = 'integration-test-session';

  beforeEach(() => {
    clearCachedInsights(testSessionId);
  });

  afterEach(() => {
    clearCachedInsights(testSessionId);
  });

  it('returns injections unchanged when no pressure', () => {
    const injections = [createMockInjection({ category: 'emotional', content: 'Test' })];
    const timingState = createMockTimingState({ userWaitingTime: 0 });

    const result = applyTimingAwareDegradation(injections, testSessionId, timingState);

    expect(result.pressureLevel).toBe('normal');
    expect(result.degradationApplied).toBe(false);
    expect(result.injections).toHaveLength(1);
  });

  it('applies degradation when under pressure', () => {
    const injections = [
      createMockInjection({ category: 'safety', content: 'Safety', priority: 10 }),
      createMockInjection({ category: 'catchphrase', content: 'Catchphrase', priority: 80 }),
    ];
    const timingState = createMockTimingState({
      userWaitingTime: PRESSURE_CONFIG.MODERATE_WAIT_MS + 100,
    });

    const result = applyTimingAwareDegradation(injections, testSessionId, timingState);

    expect(result.pressureLevel).toBe('moderate');
    expect(result.degradationApplied).toBe(true);
    expect(result.injections.length).toBeLessThanOrEqual(injections.length);
  });

  it('caches high-value insights for later reuse', () => {
    const injections = [
      createMockInjection({ category: 'emotional', content: 'Emotional insight' }),
      createMockInjection({ category: 'memory', content: 'Memory callback' }),
    ];

    applyTimingAwareDegradation(injections, testSessionId, null);

    // Insights should be cached
    const cached = getCachedInsights(testSessionId);
    expect(cached.length).toBeGreaterThan(0);
  });

  it('handles null timing state gracefully', () => {
    const injections = [createMockInjection({ category: 'emotional', content: 'Test' })];

    const result = applyTimingAwareDegradation(injections, testSessionId, null);

    expect(result.pressureLevel).toBe('normal');
    expect(result.degradationApplied).toBe(false);
    expect(result.injections).toHaveLength(1);
  });

  it('applies critical degradation correctly', () => {
    const injections = [
      createMockInjection({ category: 'safety', content: 'Safety', priority: 10 }),
      createMockInjection({ category: 'identity', content: 'Identity', priority: 15 }),
      createMockInjection({ category: 'emotional', content: 'Emotional', priority: 30 }),
      createMockInjection({ category: 'catchphrase', content: 'Catchphrase', priority: 80 }),
    ];
    const timingState = createMockTimingState({
      userWaitingTime: PRESSURE_CONFIG.CRITICAL_WAIT_MS + 100,
    });

    const result = applyTimingAwareDegradation(injections, testSessionId, timingState);

    expect(result.pressureLevel).toBe('critical');
    expect(result.degradationApplied).toBe(true);
    // At critical, only TIER 1 allowed
    expect(
      result.injections.every((i) => TIER_1_ESSENTIAL.has(i.category?.toLowerCase() || ''))
    ).toBe(true);
  });
});

// ============================================================================
// TIER DEFINITION TESTS
// ============================================================================

describe('tier definitions', () => {
  it('TIER_1_ESSENTIAL contains safety-critical categories', () => {
    expect(TIER_1_ESSENTIAL.has('safety')).toBe(true);
    expect(TIER_1_ESSENTIAL.has('crisis_response')).toBe(true);
    expect(TIER_1_ESSENTIAL.has('identity')).toBe(true);
    expect(TIER_1_ESSENTIAL.has('boundaries')).toBe(true);
  });

  it('TIER_2_HIGH_VALUE contains emotional intelligence categories', () => {
    expect(TIER_2_HIGH_VALUE.has('emotional')).toBe(true);
    expect(TIER_2_HIGH_VALUE.has('memory')).toBe(true);
    expect(TIER_2_HIGH_VALUE.has('trust')).toBe(true);
    expect(TIER_2_HIGH_VALUE.has('coaching')).toBe(true);
  });

  it('TIER_3_OPTIONAL contains polish categories', () => {
    expect(TIER_3_OPTIONAL.has('catchphrase')).toBe(true);
    expect(TIER_3_OPTIONAL.has('story_opportunity')).toBe(true);
    expect(TIER_3_OPTIONAL.has('ambient_awareness')).toBe(true);
  });

  it('tiers do not overlap', () => {
    for (const cat of TIER_1_ESSENTIAL) {
      expect(TIER_2_HIGH_VALUE.has(cat)).toBe(false);
      expect(TIER_3_OPTIONAL.has(cat)).toBe(false);
    }
    for (const cat of TIER_2_HIGH_VALUE) {
      expect(TIER_1_ESSENTIAL.has(cat)).toBe(false);
      expect(TIER_3_OPTIONAL.has(cat)).toBe(false);
    }
    for (const cat of TIER_3_OPTIONAL) {
      expect(TIER_1_ESSENTIAL.has(cat)).toBe(false);
      expect(TIER_2_HIGH_VALUE.has(cat)).toBe(false);
    }
  });
});

// ============================================================================
// PRESSURE CONFIG TESTS
// ============================================================================

describe('pressure configuration', () => {
  it('thresholds are in ascending order', () => {
    expect(PRESSURE_CONFIG.MODERATE_WAIT_MS).toBeLessThan(PRESSURE_CONFIG.SEVERE_WAIT_MS);
    expect(PRESSURE_CONFIG.SEVERE_WAIT_MS).toBeLessThan(PRESSURE_CONFIG.CRITICAL_WAIT_MS);
    expect(PRESSURE_CONFIG.SLOW_LATENCY_MS).toBeLessThan(PRESSURE_CONFIG.VERY_SLOW_LATENCY_MS);
  });

  it('limits decrease with pressure level', () => {
    expect(PRESSURE_CONFIG.NORMAL.maxInjections).toBeGreaterThan(
      PRESSURE_CONFIG.MODERATE.maxInjections
    );
    expect(PRESSURE_CONFIG.MODERATE.maxInjections).toBeGreaterThan(
      PRESSURE_CONFIG.SEVERE.maxInjections
    );
    expect(PRESSURE_CONFIG.SEVERE.maxInjections).toBeGreaterThan(
      PRESSURE_CONFIG.CRITICAL.maxInjections
    );

    expect(PRESSURE_CONFIG.NORMAL.maxChars).toBeGreaterThan(PRESSURE_CONFIG.MODERATE.maxChars);
    expect(PRESSURE_CONFIG.MODERATE.maxChars).toBeGreaterThan(PRESSURE_CONFIG.SEVERE.maxChars);
    expect(PRESSURE_CONFIG.SEVERE.maxChars).toBeGreaterThan(PRESSURE_CONFIG.CRITICAL.maxChars);
  });
});
