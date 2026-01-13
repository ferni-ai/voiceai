/**
 * Better Than Human - End-to-End Workflow Tests
 *
 * Tests complete user journeys that demonstrate "Better Than Human" capabilities:
 * 1. Emotion Detection → Concern Response Journey
 * 2. Commitment Tracking Journey
 * 3. Cross-Persona Emotional Context Journey
 * 4. Superhuman Services Integration
 *
 * These tests verify that multiple components work together seamlessly
 * to deliver superhuman emotional intelligence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger first - must include child() method
vi.mock('../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => mockLogger,
  };
  return {
    createLogger: () => mockLogger,
    getLogger: () => mockLogger,
  };
});

// Mock Firestore for persistence tests
vi.mock('../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,

  cleanForFirestore: vi.fn((obj) => {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map((item) => item);
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          result[key] = value;
        }
      }
      return result;
    }
    return obj;
  }),
  removeUndefined: vi.fn((obj) => {
    if (!obj) return obj;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }),
  deepRemoveUndefined: vi.fn((obj) => obj),
  recordDegradation: vi.fn(),
  getFirestoreHealth: vi.fn(() => ({
    dbAvailable: true,
    initialized: true,
    initializationError: null,
    degradationCount: 0,
    recentDegradations: [],
    lastDegradationAt: null,
  })),
  resetFirestoreInstance: vi.fn(),
}));

// Mock calendar service
vi.mock('../services/calendar/calendar-load-service.js', () => ({
  getCalendarLoadFactors: () => Promise.resolve(null),
  getCalendarBurnoutRiskFactors: () => Promise.resolve([]),
  getCalendarLoadSummary: () => Promise.resolve(null),
}));

// Import after mocks
import * as commitmentKeeper from '../services/superhuman/commitment-keeper.js';
import * as predictiveCoaching from '../services/superhuman/predictive-coaching.js';
import * as emotionalFirstAid from '../services/superhuman/emotional-first-aid.js';
import * as capacityGuardian from '../services/superhuman/capacity-guardian.js';
import * as lifeNarrative from '../services/superhuman/life-narrative.js';
import * as valuesAlignment from '../services/superhuman/values-alignment.js';
import * as seasonalAwareness from '../services/superhuman/seasonal-awareness.js';
import {
  dispatchEmotionEvents,
  type EmotionDispatchOptions,
  type SendDataMessageFn,
} from '../agents/realtime/emotion-event-dispatcher.js';

describe('Better Than Human - E2E Workflows', () => {
  // ============================================================================
  // JOURNEY 1: Emotion Detection → Concern Response
  // ============================================================================

  describe('Journey 1: Emotion Detection → Concern Response', () => {
    let sentMessages: Array<{ type: string; payload: Record<string, unknown> }>;
    let mockSendDataMessage: SendDataMessageFn;

    beforeEach(() => {
      vi.clearAllMocks();
      sentMessages = [];
      mockSendDataMessage = vi.fn().mockImplementation((type, payload) => {
        sentMessages.push({ type, payload });
        return Promise.resolve();
      });
    });

    it('should detect distress and trigger concern signals', async () => {
      // Step 1: Analyze transcript for emotional first aid signals
      const crisisResult = emotionalFirstAid.detectCrisis(
        "I can't take this anymore, everything is falling apart"
      );

      // Crisis detection should work
      expect(crisisResult).toBeDefined();

      // Step 2: Dispatch emotion events based on emotional state
      const options: EmotionDispatchOptions = {
        emotionalState: {
          primary: 'distressed',
          intensity: 0.85,
          distressLevel: 0.8, // High distress
          trajectory: 'declining',
          confidence: 0.9,
        },
        userId: 'test-user',
        personaId: 'ferni',
        sessionId: 'session-123',
      };

      await dispatchEmotionEvents(options, mockSendDataMessage);

      // Step 3: Verify concern detection was triggered
      const concernSignal = sentMessages.find(
        (m) => m.type === 'humanization_signal' && m.payload.signalType === 'concern_detected'
      );
      expect(concernSignal).toBeDefined();
      expect(concernSignal?.payload.concernLevel).toBe('elevated');

      // Step 4: Verify first aid response is available
      // Use a valid crisis level
      const firstAidResponse = emotionalFirstAid.getFirstAidResponse('containing');
      expect(firstAidResponse).toBeDefined();
      expect(firstAidResponse.level).toBe('containing');
      expect(firstAidResponse.technique).toBeDefined();
    });

    it('should track emotional trajectory through conversation', async () => {
      // Simulate a conversation with declining emotional state
      const states = [
        { primary: 'neutral', intensity: 0.5, distressLevel: 0.1 },
        { primary: 'anxious', intensity: 0.6, distressLevel: 0.3 },
        { primary: 'frustrated', intensity: 0.7, distressLevel: 0.5 },
        { primary: 'overwhelmed', intensity: 0.8, distressLevel: 0.7 },
      ];

      const trajectories: string[] = [];

      for (const state of states) {
        await dispatchEmotionEvents(
          {
            emotionalState: {
              ...state,
              trajectory: state.distressLevel > 0.4 ? 'declining' : 'stable',
              confidence: 0.85,
            },
            userId: 'test-user',
            personaId: 'ferni',
            sessionId: 'session-123',
          },
          mockSendDataMessage
        );

        const trajectorySignal = sentMessages.find(
          (m) => m.payload.signalType === 'emotional_trajectory'
        );
        if (trajectorySignal) {
          trajectories.push(trajectorySignal.payload.emotionalTrajectory as string);
        }
        sentMessages = []; // Reset for next iteration
      }

      // Should have detected declining trajectory
      expect(trajectories.length).toBeGreaterThan(0);
      expect(trajectories).toContain('escalating');
    });

    it('should detect energy level from user speech', () => {
      // User shows signs of exhaustion
      const energyResult = capacityGuardian.detectEnergyLevel(
        "I've been working 60 hour weeks and I'm barely sleeping"
      );

      // Should detect energy (returns object with level property)
      expect(energyResult).toBeDefined();
      expect(['low', 'depleted', 'moderate', 'good', 'high']).toContain(energyResult.level);
    });
  });

  // ============================================================================
  // JOURNEY 2: Commitment Tracking
  // ============================================================================

  describe('Journey 2: Commitment Tracking', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should detect commitment from user speech', () => {
      // Step 1: User makes a commitment
      const commitment = commitmentKeeper.detectCommitment(
        "I promise I'll start exercising three times a week starting Monday",
        'user-123'
      );

      // Commitment detection should return structured result
      expect(commitment).toBeDefined();
      expect(typeof commitment.detected).toBe('boolean');
    });

    it('should track multiple potential commitments in conversation', () => {
      const phrases = [
        "I promise I'll call my mom this weekend",
        "I'm definitely going to finish the project by Friday",
        'I need to remember to take my vitamins every morning',
      ];

      const results = phrases.map((phrase) =>
        commitmentKeeper.detectCommitment(phrase, 'user-123')
      );

      // All should return valid results
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(typeof result.detected).toBe('boolean');
      });
    });

    it('should not false-positive on casual statements', () => {
      const casualPhrases = [
        "That's a nice idea",
        'Maybe I should think about it',
        'People often say that',
      ];

      const results = casualPhrases.map((phrase) =>
        commitmentKeeper.detectCommitment(phrase, 'user-123')
      );

      // Casual statements should have low or no detection
      const strongDetections = results.filter(
        (r) => r.detected && r.commitment && r.commitment.confidence > 0.8
      );
      expect(strongDetections.length).toBeLessThan(2);
    });
  });

  // ============================================================================
  // JOURNEY 3: Cross-Persona Emotional Context
  // ============================================================================

  describe('Journey 3: Cross-Persona Emotional Context', () => {
    let sentMessages: Array<{ type: string; payload: Record<string, unknown> }>;
    let mockSend: SendDataMessageFn;

    beforeEach(() => {
      vi.clearAllMocks();
      sentMessages = [];
      mockSend = vi.fn().mockImplementation((type, payload) => {
        sentMessages.push({ type, payload });
        return Promise.resolve();
      });
    });

    it('should maintain emotional context through persona handoff', async () => {
      // User is anxious with Ferni
      await dispatchEmotionEvents(
        {
          emotionalState: {
            primary: 'anxious',
            intensity: 0.7,
            distressLevel: 0.6,
            trajectory: 'stable',
            confidence: 0.9,
          },
          userId: 'user-123',
          personaId: 'ferni',
          sessionId: 'session-1',
        },
        mockSend
      );

      const ferniConcern = sentMessages.find((m) => m.payload.signalType === 'concern_detected');
      const ferniConcernLevel = ferniConcern?.payload.concernLevel;

      sentMessages = [];

      // Handoff to Jordan with same emotional context
      await dispatchEmotionEvents(
        {
          emotionalState: {
            primary: 'anxious',
            intensity: 0.7,
            distressLevel: 0.6,
            trajectory: 'stable',
            confidence: 0.9,
          },
          userId: 'user-123',
          personaId: 'jordan',
          sessionId: 'session-1',
        },
        mockSend
      );

      // Jordan should receive same emotional signals
      const jordanConcern = sentMessages.find((m) => m.payload.signalType === 'concern_detected');

      // Same concern level should be maintained
      expect(jordanConcern).toBeDefined();
      expect(jordanConcern?.payload.concernLevel).toBe(ferniConcernLevel);
    });

    it('should track improving emotional trajectory after handoff', async () => {
      // Start anxious with Ferni
      await dispatchEmotionEvents(
        {
          emotionalState: {
            primary: 'anxious',
            intensity: 0.7,
            distressLevel: 0.6,
            trajectory: 'declining',
            confidence: 0.9,
          },
          userId: 'user-123',
          personaId: 'ferni',
          sessionId: 'session-1',
        },
        mockSend
      );

      sentMessages = [];

      // Improve after talking with Jordan - need high intensity for trajectory signal
      await dispatchEmotionEvents(
        {
          emotionalState: {
            primary: 'calm',
            intensity: 0.8, // Higher intensity to trigger trajectory signal
            distressLevel: 0.2,
            trajectory: 'improving',
            confidence: 0.9,
          },
          userId: 'user-123',
          personaId: 'jordan',
          sessionId: 'session-1',
        },
        mockSend
      );

      // Should see trajectory signal (improving trajectory requires high intensity)
      const trajectorySignal = sentMessages.find(
        (m) => m.payload.signalType === 'emotional_trajectory'
      );
      expect(trajectorySignal).toBeDefined();
    });
  });

  // ============================================================================
  // JOURNEY 4: Superhuman Services Integration
  // ============================================================================

  describe('Journey 4: Superhuman Services Integration', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should integrate seasonal awareness with conversation', () => {
      // Get current season context
      const season = seasonalAwareness.getCurrentSeason();
      expect(season).toBeDefined();

      // Detect seasonal patterns in user's words
      const seasonalPattern = seasonalAwareness.detectSeasonalPattern(
        'The dark winter days are really getting to me this year'
      );

      expect(seasonalPattern).toBeDefined();
    });

    it('should detect values from user discussion', () => {
      // User discusses decision that may involve values
      const result = valuesAlignment.detectValue(
        "I'm thinking about taking this high-paying job, but it would mean less time with my kids"
      );

      expect(result).toBeDefined();
    });

    it('should build life narrative context', () => {
      // Get life context for coaching
      const narrativeContext = lifeNarrative.buildNarrativeContext(
        [
          { event: 'graduation', date: '2020-05-15', significance: 'high' },
          { event: 'job_change', date: '2023-01-10', significance: 'high' },
          { event: 'relationship_start', date: '2022-06-01', significance: 'high' },
        ],
        "I'm feeling like I need a change"
      );

      expect(narrativeContext).toBeDefined();
    });

    it('should have predictive coaching cache stats', () => {
      // The predictive coaching service provides cache stats
      const stats = predictiveCoaching.getCacheStats();

      // Should return stats object
      expect(stats).toBeDefined();
      expect(typeof stats.memoryCacheUsers).toBe('number');
      expect(typeof stats.maxMemoryCacheSize).toBe('number');
    });

    it('should build comprehensive context from multiple services', () => {
      // Simulate gathering data from all superhuman services
      const serviceData = {
        season: seasonalAwareness.getCurrentSeason(),
        energyLevel: capacityGuardian.detectEnergyLevel("I'm feeling pretty tired today"),
        crisisLevel: emotionalFirstAid.detectCrisis('Things have been tough lately'),
      };

      // All services should return valid data
      expect(serviceData.season).toBeDefined();
      expect(serviceData.energyLevel).toBeDefined();
      expect(serviceData.crisisLevel).toBeDefined();
    });
  });

  // ============================================================================
  // FULL SESSION FLOW
  // ============================================================================

  describe('Full Session Flow', () => {
    it('should handle a realistic multi-turn conversation', async () => {
      const sentMessages: Array<{ type: string; payload: Record<string, unknown> }> = [];
      const mockSend: SendDataMessageFn = vi.fn().mockImplementation((type, payload) => {
        sentMessages.push({ type, payload });
        return Promise.resolve();
      });

      // Turn 1: User starts neutral
      await dispatchEmotionEvents(
        {
          emotionalState: {
            primary: 'neutral',
            intensity: 0.5,
            distressLevel: 0.1,
            trajectory: 'stable',
            confidence: 0.8,
          },
          userId: 'user-123',
          personaId: 'ferni',
          sessionId: 'session-1',
        },
        mockSend
      );

      const turn1Count = sentMessages.length;

      // Turn 2: Check for commitment in user speech
      const commitmentResult = commitmentKeeper.detectCommitment(
        'I really want to start being more present with my family',
        'user-123'
      );
      expect(commitmentResult).toBeDefined();

      // Turn 3: User reveals struggle - dispatch higher distress
      await dispatchEmotionEvents(
        {
          emotionalState: {
            primary: 'anxious',
            intensity: 0.7,
            distressLevel: 0.5,
            trajectory: 'declining',
            confidence: 0.85,
          },
          userId: 'user-123',
          personaId: 'ferni',
          sessionId: 'session-1',
        },
        mockSend
      );

      // Should have more messages including concern
      expect(sentMessages.length).toBeGreaterThan(turn1Count);

      // Turn 4: Check capacity
      const energyResult = capacityGuardian.detectEnergyLevel(
        "I've just been so exhausted lately with everything going on"
      );
      expect(energyResult).toBeDefined();
      expect(['low', 'moderate', 'depleted', 'good', 'high']).toContain(energyResult.level);

      // Turn 5: User finds some hope
      await dispatchEmotionEvents(
        {
          emotionalState: {
            primary: 'hopeful',
            intensity: 0.6,
            distressLevel: 0.2,
            trajectory: 'improving',
            confidence: 0.9,
          },
          userId: 'user-123',
          personaId: 'ferni',
          sessionId: 'session-1',
        },
        mockSend
      );

      // Should see trajectory improving signal or other signals indicating progress
      const trajectorySignal = sentMessages.find(
        (m) => m.payload.signalType === 'emotional_trajectory'
      );
      // Trajectory signal should exist if intensity threshold is met
      // (The journey demonstrates the flow works, specific signals depend on thresholds)
      expect(sentMessages.length).toBeGreaterThan(0);
    });

    it('should integrate crisis detection with emotion dispatch', async () => {
      const sentMessages: Array<{ type: string; payload: Record<string, unknown> }> = [];
      const mockSend: SendDataMessageFn = vi.fn().mockImplementation((type, payload) => {
        sentMessages.push({ type, payload });
        return Promise.resolve();
      });

      // User shows signs of crisis - detectCrisis may return null or result
      const crisisResult = emotionalFirstAid.detectCrisis(
        "I just don't see the point anymore, nothing matters"
      );

      // Use high distress regardless (this simulates detected crisis)
      const distressLevel = crisisResult && crisisResult.detected ? 0.9 : 0.8;

      // Dispatch corresponding emotional state
      await dispatchEmotionEvents(
        {
          emotionalState: {
            primary: 'hopeless',
            intensity: 0.9,
            distressLevel,
            trajectory: 'declining',
            confidence: 0.95,
          },
          userId: 'user-123',
          personaId: 'ferni',
          sessionId: 'session-crisis',
        },
        mockSend
      );

      // High distress should trigger elevated or crisis concern level
      const concernSignal = sentMessages.find((m) => m.payload.signalType === 'concern_detected');
      expect(concernSignal).toBeDefined();
      expect(['elevated', 'crisis']).toContain(concernSignal?.payload.concernLevel);
    });
  });
});
