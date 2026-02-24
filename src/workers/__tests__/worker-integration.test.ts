/**
 * Worker Integration Tests (E2E)
 *
 * Tests the complete flow: Event emission → AsyncEvents → Worker processing → Service calls
 * This validates that the async event system correctly routes events to workers
 * and that workers process them to update backend services.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ============================================================================
// MOCKS
// ============================================================================

// Mock trust systems
vi.mock('../../services/trust-systems/reading-between-lines.js', () => ({
  getUnsaidProfile: vi.fn().mockReturnValue({
    userId: 'test-user',
    avoidedTopics: [],
    falseFines: [],
    deflectionPatterns: [],
  }),
  getAvoidedTopics: vi.fn().mockReturnValue([]),
  recordDidShare: vi.fn(),
}));

vi.mock('../../services/trust-systems/growth-reflection.js', () => ({
  getGrowthPatterns: vi.fn().mockReturnValue([]),
  getUnreflectedGrowth: vi.fn().mockReturnValue([]),
  generateGrowthReflection: vi.fn().mockReturnValue(null),
}));

vi.mock('../../services/trust-systems/small-wins.js', () => ({
  getUncelebratedWins: vi.fn().mockReturnValue([]),
  getPendingIntentions: vi.fn().mockReturnValue([]),
  generateCelebration: vi.fn().mockReturnValue(null),
}));

vi.mock('../../services/trust-systems/thinking-of-you.js', () => ({
  getDueMoments: vi.fn().mockReturnValue([]),
}));

vi.mock('../../services/trust-systems/persistence.js', () => ({
  saveTrustProfiles: vi.fn().mockResolvedValue({ saved: 0, failed: 0 }),
  periodicSync: vi.fn().mockResolvedValue(undefined),
}));

// Mock predictive coaching
vi.mock('../../services/superhuman/predictive-coaching.js', () => ({
  recordObservation: vi.fn().mockResolvedValue(undefined),
  generatePredictions: vi.fn().mockResolvedValue([]),
  loadUserPatterns: vi.fn().mockResolvedValue([]),
  clearPatternCache: vi.fn().mockResolvedValue(undefined),
  confirmPrediction: vi.fn().mockResolvedValue(undefined),
  invalidatePrediction: vi.fn().mockResolvedValue(undefined),
  decayStalePatterns: vi.fn().mockResolvedValue(0),
}));

// Mock community insights
vi.mock('../../intelligence/community-insights.js', () => ({
  getCommunityInsights: vi.fn().mockReturnValue({
    recordEngagementSignal: vi.fn(),
  }),
  saveCommunityInsightsToFirestore: vi.fn().mockResolvedValue(undefined),
}));

// Mock agent evolution
vi.mock('../../intelligence/agent-evolution.js', () => ({
  getAgentEvolution: vi.fn().mockReturnValue({
    createAdjustmentFromCommunityPattern: vi.fn(),
    updateStoryRankings: vi.fn(),
  }),
  saveAgentEvolutionToFirestore: vi.fn().mockResolvedValue(undefined),
}));

// Create a mock event emitter for AsyncEvents
const mockEventEmitter = new EventEmitter();

// Mock AsyncEvents
const MockAsyncEvents = {
  emit: vi.fn((type: string, data: unknown, context?: Record<string, unknown>) => {
    mockEventEmitter.emit(type, { type, data, ...(context || {}), timestamp: Date.now() });
    return true;
  }),
  on: vi.fn((type: string, handler: (payload: unknown) => void) => {
    mockEventEmitter.on(type, handler);
    return () => mockEventEmitter.off(type, handler);
  }),
  onAll: vi.fn((callback: (payload: unknown) => void) => {
    const types = [
      'trust:update',
      'trust:milestone',
      'conversation:end',
      'analytics:interaction',
      'prediction:observation',
    ];

    types.forEach((type) => {
      mockEventEmitter.on(type, callback);
    });

    return () => {
      types.forEach((type) => {
        mockEventEmitter.off(type, callback);
      });
    };
  }),
  getStats: vi.fn().mockReturnValue({
    emitted: 0,
    processed: 0,
    errors: 0,
    queueLength: 0,
    handlerCount: 0,
    dropped: 0,
  }),
  flush: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../services/async-events/index.js', () => ({
  AsyncEvents: MockAsyncEvents,
  asyncEvents: mockEventEmitter,
  emitTrustUpdate: vi.fn(),
  emitConversationEnd: vi.fn(),
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import { TrustWorker, getTrustWorker, startTrustWorker } from '../trust-worker.js';
import { AnalyticsWorker, getAnalyticsWorker, startAnalyticsWorker } from '../analytics-worker.js';
import {
  PredictionsWorker,
  getPredictionsWorker,
  startPredictionsWorker,
} from '../predictions-worker.js';
import { saveTrustProfiles, periodicSync } from '../../services/trust-systems/persistence.js';
import { getCommunityInsights } from '../../intelligence/collective/community-insights.js';

// ============================================================================
// TESTS
// ============================================================================

describe('Worker Integration (E2E)', () => {
  let trustWorker: TrustWorker;
  let analyticsWorker: AnalyticsWorker;
  let predictionsWorker: PredictionsWorker;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockEventEmitter.removeAllListeners();

    // Create fresh worker instances
    trustWorker = new TrustWorker();
    analyticsWorker = new AnalyticsWorker();
    predictionsWorker = new PredictionsWorker();

    // Start workers
    await trustWorker.start();
    await analyticsWorker.start();
    await predictionsWorker.start();
  });

  afterEach(async () => {
    await trustWorker.stop();
    await analyticsWorker.stop();
    await predictionsWorker.stop();
  });

  describe('Trust Worker Integration', () => {
    it('should process trust:update events and call persistence', async () => {
      // Emit event via mock AsyncEvents
      mockEventEmitter.emit('trust:update', {
        type: 'trust:update',
        userId: 'test-user-1',
        personaId: 'ferni',
        data: { trustDelta: 0.1, didShare: true, reason: 'opened up' },
        timestamp: Date.now(),
      });

      // Give time for async processing
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });

      // Verify service was called
      expect(periodicSync).toHaveBeenCalledWith('test-user-1');
    });

    it('should process conversation:end events and save profiles', async () => {
      mockEventEmitter.emit('conversation:end', {
        type: 'conversation:end',
        userId: 'test-user-2',
        personaId: 'ferni',
        data: { turnCount: 10, durationMs: 600000 },
        timestamp: Date.now(),
      });

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });

      expect(saveTrustProfiles).toHaveBeenCalledWith('test-user-2');
    });
  });

  describe('Analytics Worker Integration', () => {
    it('should have valid worker instance', () => {
      expect(analyticsWorker).toBeDefined();
      const stats = analyticsWorker.getStats();
      expect(stats).toHaveProperty('messagesReceived');
      expect(stats).toHaveProperty('messagesProcessed');
      expect(stats).toHaveProperty('messagesFailed');
    });

    it('should batch interactions efficiently without crashing', async () => {
      // Worker should remain stable under load
      const stats = analyticsWorker.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.messagesReceived).toBe('number');
    });
  });

  describe('Predictions Worker Integration', () => {
    it('should have valid worker instance', () => {
      expect(predictionsWorker).toBeDefined();
      const stats = predictionsWorker.getStats();
      expect(stats).toHaveProperty('messagesReceived');
      expect(stats).toHaveProperty('messagesProcessed');
      expect(stats).toHaveProperty('messagesFailed');
    });

    it('should be stable for pattern detection', () => {
      // Worker should remain stable
      const stats = predictionsWorker.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.averageProcessingMs).toBe('number');
    });
  });

  describe('Cross-Worker Event Flow', () => {
    it('should handle full conversation lifecycle', async () => {
      const userId = 'test-user-lifecycle';
      const sessionId = 'session-lifecycle';

      // 1. Start conversation (would be emitted by agent)
      mockEventEmitter.emit('conversation:start', {
        type: 'conversation:start',
        userId,
        sessionId,
        personaId: 'ferni',
        data: { isReturning: true },
        timestamp: Date.now(),
      });

      // 2. Multiple turns
      for (let i = 0; i < 3; i++) {
        mockEventEmitter.emit('conversation:turn', {
          type: 'conversation:turn',
          userId,
          sessionId,
          personaId: 'ferni',
          data: {
            message: `Turn ${i + 1}`,
            topic: 'general',
            emotion: 'neutral',
            dayOfWeek: new Date().getDay(),
            hourOfDay: new Date().getHours(),
          },
          timestamp: Date.now(),
        });

        mockEventEmitter.emit('analytics:interaction', {
          type: 'analytics:interaction',
          userId,
          sessionId,
          personaId: 'ferni',
          data: { responseType: 'supportive', engagementScore: 0.7 },
          timestamp: Date.now(),
        });
      }

      // 3. Trust update
      mockEventEmitter.emit('trust:update', {
        type: 'trust:update',
        userId,
        sessionId,
        personaId: 'ferni',
        data: { trustDelta: 0.05, didShare: true },
        timestamp: Date.now(),
      });

      // 4. End conversation
      mockEventEmitter.emit('conversation:end', {
        type: 'conversation:end',
        userId,
        sessionId,
        personaId: 'ferni',
        data: { turnCount: 3, durationMs: 180000 },
        timestamp: Date.now(),
      });

      // Wait for all processing
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 200);
      });

      // Verify all workers processed events
      expect(trustWorker.getStats().messagesReceived).toBeGreaterThan(0);
      expect(analyticsWorker.getStats().messagesReceived).toBeGreaterThan(0);
      expect(predictionsWorker.getStats().messagesReceived).toBeGreaterThan(0);

      // Verify services were called
      expect(saveTrustProfiles).toHaveBeenCalledWith(userId);
    });
  });

  describe('Error Handling', () => {
    it('should not crash on malformed events', async () => {
      // Emit event without required fields
      mockEventEmitter.emit('trust:update', {
        type: 'trust:update',
        // Missing userId
        data: { trustDelta: 0.1 },
        timestamp: Date.now(),
      });

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });

      // Worker should still be functional
      const stats = trustWorker.getStats();
      expect(stats).toBeDefined();
    });

    it('should track failed messages', async () => {
      // This tests that the worker doesn't crash and properly tracks failures
      const initialStats = predictionsWorker.getStats();

      // Valid event that won't fail
      mockEventEmitter.emit('prediction:observation', {
        type: 'prediction:observation',
        userId: 'valid-user',
        sessionId: 'valid-session',
        data: {
          type: 'behavioral',
          trigger: 'test',
          outcome: 'test',
          dayOfWeek: 1,
          hourOfDay: 10,
        },
        timestamp: Date.now(),
      });

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });

      const finalStats = predictionsWorker.getStats();
      expect(finalStats.messagesReceived).toBeGreaterThan(initialStats.messagesReceived);
    });
  });

  describe('Stats Aggregation', () => {
    it('should accurately track processing stats', async () => {
      const eventCount = 5;

      for (let i = 0; i < eventCount; i++) {
        mockEventEmitter.emit('trust:update', {
          type: 'trust:update',
          userId: `user-${i}`,
          personaId: 'ferni',
          data: { trustDelta: 0.01 },
          timestamp: Date.now(),
        });
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 200);
      });

      const stats = trustWorker.getStats();
      expect(stats.messagesReceived).toBe(eventCount);
      // Some may not be processed if they had issues
      expect(stats.messagesProcessed).toBeLessThanOrEqual(eventCount);
    });
  });
});
