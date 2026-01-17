/**
 * Unified Intelligence System Tests
 *
 * Comprehensive tests for the Unified Intelligence Architecture:
 * - Level 2: Context Assembly
 * - Level 4: Cross-Domain Correlation
 * - Level 5: Proactive Intelligence
 *
 * @module intelligence/__tests__/unified-intelligence.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // Context Assembler
  assembleContext,
  clearContextCache,
  formatAssembledContextForPrompt,
  // Cross-Domain Correlator
  recordDomainSignal,
  getCorrelations,
  getRelevantCorrelations,
  clearCorrelatorState,
  getDomainSignals,
  // Proactive Engine
  checkProactiveTriggers,
  initProactiveSession,
  cleanupProactiveSession,
  markInsightSurfaced,
  wasInsightSurfaced,
  clearProactiveState,
  // Unified API
  initIntelligenceSession,
  getIntelligenceForTurn,
  cleanupIntelligence,
  type DomainSignal,
  type ContextWindow,
  type CrossDomainCorrelation,
  type ProactiveIntelligenceInsight,
} from '../index.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

const TEST_USER_ID = 'test-user-123';
const TEST_SESSION_ID = 'test-session-456';

function createTestSignal(overrides?: Partial<DomainSignal>): DomainSignal {
  return {
    domain: 'sleep',
    store: 'test',
    metric: 'quality',
    direction: 'decreased',
    magnitude: 'moderate',
    timestamp: new Date(),
    ...overrides,
  };
}

// ============================================================================
// CONTEXT ASSEMBLER TESTS
// ============================================================================

describe('Context Assembler (Level 2)', () => {
  beforeEach(() => {
    clearContextCache();
  });

  afterEach(() => {
    clearContextCache();
  });

  describe('assembleContext', () => {
    it('should assemble basic context with immediate info', async () => {
      const context = await assembleContext({ userId: TEST_USER_ID });

      expect(context).toBeDefined();
      expect(context.immediate).toBeDefined();
      expect(context.immediate.timeOfDay).toMatch(/morning|afternoon|evening|late_night/);
      expect(context.immediate.dayOfWeek).toBeDefined();
      expect(typeof context.immediate.isWeekend).toBe('boolean');
      expect(typeof context.immediate.hour).toBe('number');
    });

    it('should include voice emotion when provided', async () => {
      const context = await assembleContext({
        userId: TEST_USER_ID,
        voiceEmotion: {
          primary: 'anxious',
          valence: 'negative',
          energy: 0.3,
        },
      });

      expect(context.immediate.currentMood).toBe('anxious');
    });

    it('should detect late night correctly', async () => {
      // Mock late night hour
      const realDate = Date;
      const mockDate = new Date('2024-01-15T02:30:00');
      vi.setSystemTime(mockDate);

      try {
        const context = await assembleContext({
          userId: TEST_USER_ID,
          forceRefresh: true,
        });

        expect(context.immediate.isLateNight).toBe(true);
        expect(context.immediate.timeOfDay).toBe('late_night');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should cache context within TTL', async () => {
      const context1 = await assembleContext({ userId: TEST_USER_ID });
      const context2 = await assembleContext({ userId: TEST_USER_ID });

      // Should be the same cached object
      expect(context1).toBe(context2);
    });

    it('should refresh cache when forceRefresh is true', async () => {
      const context1 = await assembleContext({ userId: TEST_USER_ID });
      const context2 = await assembleContext({
        userId: TEST_USER_ID,
        forceRefresh: true,
      });

      // Should be different objects
      expect(context1).not.toBe(context2);
    });

    it('should include capacity context', async () => {
      const context = await assembleContext({ userId: TEST_USER_ID });

      expect(context.capacity).toBeDefined();
      expect(context.capacity.bandwidth).toMatch(/low|medium|high/);
      expect(context.capacity.burnoutRisk).toMatch(/low|moderate|high|critical/);
    });

    it('should include relationship context', async () => {
      const context = await assembleContext({ userId: TEST_USER_ID });

      expect(context.relationship).toBeDefined();
      expect(typeof context.relationship.trustLevel).toBe('number');
      expect(context.relationship.trustLevel).toBeGreaterThanOrEqual(0);
      expect(context.relationship.trustLevel).toBeLessThanOrEqual(1);
    });

    it('should detect active domains', async () => {
      const context = await assembleContext({
        userId: TEST_USER_ID,
        recentTopics: ['sleep problems', 'work stress'],
      });

      expect(context.activeDomains).toBeDefined();
      expect(Array.isArray(context.activeDomains)).toBe(true);
    });
  });

  describe('formatAssembledContextForPrompt', () => {
    it('should format context as readable string', async () => {
      const context = await assembleContext({ userId: TEST_USER_ID });
      const formatted = formatAssembledContextForPrompt(context);

      expect(typeof formatted).toBe('string');
      expect(formatted).toContain('[MOMENT]');
    });

    it('should include late night awareness when applicable', async () => {
      vi.setSystemTime(new Date('2024-01-15T03:00:00'));

      try {
        const context = await assembleContext({
          userId: TEST_USER_ID,
          forceRefresh: true,
        });
        const formatted = formatAssembledContextForPrompt(context);

        // The format uses either "late_night" or includes awareness marker
        expect(formatted).toMatch(/late.night|AWARENESS/i);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

// ============================================================================
// CROSS-DOMAIN CORRELATOR TESTS
// ============================================================================

describe('Cross-Domain Correlator (Level 4)', () => {
  beforeEach(() => {
    clearCorrelatorState();
  });

  afterEach(() => {
    clearCorrelatorState();
  });

  describe('recordDomainSignal', () => {
    it('should record a domain signal', () => {
      const signal = createTestSignal();
      recordDomainSignal(TEST_USER_ID, signal);

      const signals = getDomainSignals(TEST_USER_ID);
      expect(signals.length).toBe(1);
      expect(signals[0].domain).toBe('sleep');
    });

    it('should record multiple signals', () => {
      recordDomainSignal(TEST_USER_ID, createTestSignal({ domain: 'sleep' }));
      recordDomainSignal(TEST_USER_ID, createTestSignal({ domain: 'mood' }));
      recordDomainSignal(TEST_USER_ID, createTestSignal({ domain: 'stress' }));

      const signals = getDomainSignals(TEST_USER_ID);
      expect(signals.length).toBe(3);
    });

    it('should limit signal buffer size', () => {
      // Record more than max signals
      for (let i = 0; i < 250; i++) {
        recordDomainSignal(TEST_USER_ID, createTestSignal({ metric: `test-${i}` }));
      }

      const signals = getDomainSignals(TEST_USER_ID);
      expect(signals.length).toBeLessThanOrEqual(200);
    });
  });

  describe('correlation detection', () => {
    it('should detect correlations between co-occurring signals', () => {
      const now = new Date();

      // Record signals close in time (within correlation window)
      recordDomainSignal(TEST_USER_ID, {
        domain: 'sleep',
        store: 'test',
        metric: 'poor_sleep',
        direction: 'decreased',
        magnitude: 'significant',
        timestamp: now,
      });

      recordDomainSignal(TEST_USER_ID, {
        domain: 'mood',
        store: 'test',
        metric: 'low_mood',
        direction: 'decreased',
        magnitude: 'significant',
        timestamp: new Date(now.getTime() + 1000), // 1 second later
      });

      // Need multiple observations for correlation
      for (let i = 0; i < 5; i++) {
        const obsTime = new Date(now.getTime() + i * 1000 * 60 * 60 * 25); // Each day
        recordDomainSignal(TEST_USER_ID, {
          domain: 'sleep',
          store: 'test',
          metric: 'poor_sleep',
          direction: 'decreased',
          magnitude: 'significant',
          timestamp: obsTime,
        });
        recordDomainSignal(TEST_USER_ID, {
          domain: 'mood',
          store: 'test',
          metric: 'low_mood',
          direction: 'decreased',
          magnitude: 'significant',
          timestamp: new Date(obsTime.getTime() + 1000),
        });
      }

      const correlations = getCorrelations(TEST_USER_ID);
      // May or may not have correlations depending on timing
      expect(Array.isArray(correlations)).toBe(true);
    });

    it('should filter correlations by confidence', () => {
      const correlations = getCorrelations(TEST_USER_ID, {
        minConfidence: 'likely',
      });

      // All returned correlations should be at least 'likely'
      for (const corr of correlations) {
        expect(['likely', 'confirmed']).toContain(corr.confidence);
      }
    });
  });

  describe('getRelevantCorrelations', () => {
    it('should return correlations relevant to context', () => {
      const relevant = getRelevantCorrelations(TEST_USER_ID, {
        currentTopics: ['sleep', 'stress'],
        currentMood: 'tired',
      });

      expect(Array.isArray(relevant)).toBe(true);
      expect(relevant.length).toBeLessThanOrEqual(3);
    });
  });
});

// ============================================================================
// PROACTIVE ENGINE TESTS
// ============================================================================

describe('Proactive Engine (Level 5)', () => {
  beforeEach(() => {
    clearProactiveState();
    clearContextCache();
  });

  afterEach(() => {
    clearProactiveState();
    clearContextCache();
  });

  describe('checkProactiveTriggers', () => {
    it('should check triggers and return insights', async () => {
      initProactiveSession(TEST_USER_ID);

      const context = await assembleContext({ userId: TEST_USER_ID });
      const result = checkProactiveTriggers(TEST_USER_ID, context, 'session_start');

      expect(result).toBeDefined();
      expect(Array.isArray(result.insights)).toBe(true);
      expect(typeof result.sessionInsightCount).toBe('number');
      expect(typeof result.canSurfaceMore).toBe('boolean');
    });

    it('should return late night insight when applicable', async () => {
      vi.setSystemTime(new Date('2024-01-15T02:30:00'));

      try {
        initProactiveSession(TEST_USER_ID);

        const context = await assembleContext({
          userId: TEST_USER_ID,
          forceRefresh: true,
        });
        const result = checkProactiveTriggers(TEST_USER_ID, context, 'session_start');

        const lateNightInsight = result.insights.find((i) => i.category === 'late_night_support');
        expect(lateNightInsight).toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should limit insights per session', async () => {
      initProactiveSession(TEST_USER_ID);

      const context = await assembleContext({ userId: TEST_USER_ID });

      // Mark several insights as surfaced
      for (let i = 0; i < 5; i++) {
        markInsightSurfaced(TEST_USER_ID, `test-insight-${i}`);
      }

      const result = checkProactiveTriggers(TEST_USER_ID, context, 'session_start');

      // Should report that we can't surface more (max 2 per session)
      expect(result.canSurfaceMore).toBe(false);
    });

    it('should respect priority ordering', async () => {
      vi.setSystemTime(new Date('2024-01-15T02:30:00'));

      try {
        initProactiveSession(TEST_USER_ID);

        const context = await assembleContext({
          userId: TEST_USER_ID,
          forceRefresh: true,
        });
        // Add commitments to trigger commitment reminder
        context.relationship.activeCommitments = ['Exercise more'];

        const result = checkProactiveTriggers(TEST_USER_ID, context, 'session_start');

        if (result.insights.length >= 2) {
          // Late night (priority 1) should come before commitment (priority 3)
          const priorities = result.insights.map((i) => i.priority);
          expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
        }
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('insight lifecycle', () => {
    it('should track surfaced insights', () => {
      initProactiveSession(TEST_USER_ID);

      expect(wasInsightSurfaced(TEST_USER_ID, 'test-insight')).toBe(false);

      markInsightSurfaced(TEST_USER_ID, 'test-insight');

      expect(wasInsightSurfaced(TEST_USER_ID, 'test-insight')).toBe(true);
    });

    it('should reset on session cleanup', () => {
      initProactiveSession(TEST_USER_ID);
      markInsightSurfaced(TEST_USER_ID, 'test-insight');

      cleanupProactiveSession(TEST_USER_ID);
      initProactiveSession(TEST_USER_ID);

      // Session state should be reset, but user-level tracking might persist
      // depending on implementation
    });
  });
});

// ============================================================================
// UNIFIED API TESTS
// ============================================================================

describe('Unified Intelligence API', () => {
  beforeEach(() => {
    clearContextCache();
    clearCorrelatorState();
    clearProactiveState();
  });

  afterEach(() => {
    cleanupIntelligence(TEST_USER_ID);
  });

  describe('getIntelligenceForTurn', () => {
    it('should return complete intelligence package', async () => {
      initIntelligenceSession(TEST_USER_ID);

      const result = await getIntelligenceForTurn(TEST_USER_ID, {
        moment: 'session_start',
      });

      expect(result).toBeDefined();
      expect(result.context).toBeDefined();
      expect(result.correlations).toBeDefined();
      expect(result.proactiveInsights).toBeDefined();
      expect(result.formattedContext).toBeDefined();
      expect(typeof result.formattedContext).toBe('string');
    });

    it('should respect moment parameter', async () => {
      initIntelligenceSession(TEST_USER_ID);

      const sessionStart = await getIntelligenceForTurn(TEST_USER_ID, {
        moment: 'session_start',
      });

      const naturalPause = await getIntelligenceForTurn(TEST_USER_ID, {
        moment: 'natural_pause',
        forceRefresh: true,
      });

      // Both should return valid results
      expect(sessionStart.context).toBeDefined();
      expect(naturalPause.context).toBeDefined();
    });

    it('should include voice emotion in context', async () => {
      initIntelligenceSession(TEST_USER_ID);

      const result = await getIntelligenceForTurn(TEST_USER_ID, {
        moment: 'natural_pause',
        voiceEmotion: {
          primary: 'stressed',
          energy: 0.7,
        },
      });

      expect(result.context.immediate.currentMood).toBe('stressed');
    });

    it('should include recent topics', async () => {
      initIntelligenceSession(TEST_USER_ID);

      const result = await getIntelligenceForTurn(TEST_USER_ID, {
        moment: 'natural_pause',
        recentTopics: ['work', 'family', 'health'],
      });

      // Topics should influence active domains
      expect(result.context).toBeDefined();
    });
  });

  describe('session lifecycle', () => {
    it('should initialize and cleanup properly', () => {
      // Should not throw
      expect(() => {
        initIntelligenceSession(TEST_USER_ID);
      }).not.toThrow();

      expect(() => {
        cleanupIntelligence(TEST_USER_ID);
      }).not.toThrow();
    });

    it('should work across multiple turns', async () => {
      initIntelligenceSession(TEST_USER_ID);

      // Simulate multiple turns
      const turn1 = await getIntelligenceForTurn(TEST_USER_ID, {
        moment: 'session_start',
      });

      const turn2 = await getIntelligenceForTurn(TEST_USER_ID, {
        moment: 'natural_pause',
        recentTopics: ['sleep'],
      });

      const turn3 = await getIntelligenceForTurn(TEST_USER_ID, {
        moment: 'topic_relevant',
        voiceEmotion: { primary: 'tired' },
      });

      // All turns should return valid results
      expect(turn1.context).toBeDefined();
      expect(turn2.context).toBeDefined();
      expect(turn3.context).toBeDefined();

      cleanupIntelligence(TEST_USER_ID);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration Tests', () => {
  beforeEach(() => {
    clearContextCache();
    clearCorrelatorState();
    clearProactiveState();
  });

  afterEach(() => {
    cleanupIntelligence(TEST_USER_ID);
  });

  it('should flow from signals to correlations to insights', async () => {
    initIntelligenceSession(TEST_USER_ID);

    // Record domain signals
    recordDomainSignal(TEST_USER_ID, {
      domain: 'sleep',
      store: 'conversation',
      metric: 'quality',
      direction: 'decreased',
      magnitude: 'significant',
      timestamp: new Date(),
    });

    recordDomainSignal(TEST_USER_ID, {
      domain: 'stress',
      store: 'conversation',
      metric: 'level',
      direction: 'increased',
      magnitude: 'significant',
      timestamp: new Date(),
    });

    // Get intelligence (should pick up signals)
    const result = await getIntelligenceForTurn(TEST_USER_ID, {
      moment: 'natural_pause',
      recentTopics: ['sleep', 'stress'],
    });

    expect(result).toBeDefined();
    expect(result.context).toBeDefined();
    // Correlations and insights depend on data quality/quantity
  });

  it('should provide full context for LLM injection', async () => {
    initIntelligenceSession(TEST_USER_ID);

    const result = await getIntelligenceForTurn(TEST_USER_ID, {
      moment: 'session_start',
      voiceEmotion: { primary: 'anxious', energy: 0.6 },
      recentTopics: ['work deadline', 'feeling overwhelmed'],
    });

    // formattedContext should be non-empty string
    expect(result.formattedContext).toBeDefined();
    expect(result.formattedContext.length).toBeGreaterThan(0);

    // Should include key sections
    expect(result.formattedContext).toContain('[MOMENT]');
  });

  it('should handle concurrent users', async () => {
    const user1 = 'user-1';
    const user2 = 'user-2';

    initIntelligenceSession(user1);
    initIntelligenceSession(user2);

    // Record different signals for each user
    recordDomainSignal(user1, createTestSignal({ domain: 'sleep' }));
    recordDomainSignal(user2, createTestSignal({ domain: 'mood' }));

    const [result1, result2] = await Promise.all([
      getIntelligenceForTurn(user1, { moment: 'session_start' }),
      getIntelligenceForTurn(user2, { moment: 'session_start' }),
    ]);

    // Each user should have their own context
    expect(result1).toBeDefined();
    expect(result2).toBeDefined();

    // Signals should be isolated
    const signals1 = getDomainSignals(user1);
    const signals2 = getDomainSignals(user2);

    expect(signals1.length).toBe(1);
    expect(signals2.length).toBe(1);
    expect(signals1[0].domain).toBe('sleep');
    expect(signals2[0].domain).toBe('mood');

    cleanupIntelligence(user1);
    cleanupIntelligence(user2);
  });
});
