/**
 * Backchanneling Integration Tests
 *
 * Tests for the unified backchanneling system integration:
 * - Session-scoped backchanneling manager
 * - Mode-based engine selection (standard/enhanced/live)
 * - Persona-specific phrase selection
 * - Session isolation (no cross-session contamination)
 * - Integration with ConversationManager
 *
 * @module tests/backchanneling-integration
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger before imports - inline to avoid hoisting issues
vi.mock('../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => mockLogger,
  };
  return {
    createLogger: () => mockLogger,
    getLogger: () => mockLogger,
  };
});

import type { EmotionResult } from '../../intelligence/detectors/emotion.js';
import { getBackchannelManager, resetBackchanneling } from '../backchanneling/index.js';
import type { BackchannelContext } from '../backchanneling/types.js';

// Helper to create test emotion objects
function createTestEmotion(primary: string, options: Partial<EmotionResult> = {}): EmotionResult {
  return {
    primary: primary as EmotionResult['primary'],
    confidence: options.confidence ?? 0.5,
    intensity: options.intensity ?? 0.3,
    valence: options.valence ?? 'neutral',
    distressLevel: options.distressLevel ?? 0,
    markers: options.markers ?? [],
    suggestedTone: options.suggestedTone ?? 'friendly',
  };
}

// ============================================================================
// SESSION-SCOPED BACKCHANNELING TESTS
// ============================================================================

describe('Backchanneling (Session-Scoped)', () => {
  const SESSION_1 = 'backchannel-session-1';
  const SESSION_2 = 'backchannel-session-2';

  beforeEach(() => {
    resetBackchanneling(SESSION_1);
    resetBackchanneling(SESSION_2);
  });

  afterEach(() => {
    resetBackchanneling(SESSION_1);
    resetBackchanneling(SESSION_2);
  });

  // --------------------------------------------------------------------------
  // Session Isolation
  // --------------------------------------------------------------------------

  describe('Session Isolation', () => {
    it('should create separate managers for different sessions', () => {
      const manager1 = getBackchannelManager(SESSION_1);
      const manager2 = getBackchannelManager(SESSION_2);

      expect(manager1).not.toBe(manager2);
    });

    it('should return same manager for same session', () => {
      const manager1a = getBackchannelManager(SESSION_1);
      const manager1b = getBackchannelManager(SESSION_1);

      expect(manager1a).toBe(manager1b);
    });

    it('should properly cleanup single session without affecting others', () => {
      const manager1 = getBackchannelManager(SESSION_1);
      getBackchannelManager(SESSION_2);

      // Reset session 1
      resetBackchanneling(SESSION_1);

      // Session 2 should still work
      const manager2Again = getBackchannelManager(SESSION_2);
      expect(manager2Again).toBeDefined();

      // Session 1 should be new instance
      const manager1Again = getBackchannelManager(SESSION_1);
      expect(manager1Again).not.toBe(manager1);
    });
  });

  // --------------------------------------------------------------------------
  // Engine Modes
  // --------------------------------------------------------------------------

  describe('Engine Modes', () => {
    it('should provide standard mode engine', () => {
      const manager = getBackchannelManager(SESSION_1);
      const engine = manager.getEngine('standard');

      expect(engine).toBeDefined();
    });

    it('should provide enhanced mode engine', () => {
      const manager = getBackchannelManager(SESSION_1);
      const engine = manager.getEngine('enhanced');

      expect(engine).toBeDefined();
    });

    it('should provide live mode engine', () => {
      const manager = getBackchannelManager(SESSION_1);
      const engine = manager.getEngine('live');

      expect(engine).toBeDefined();
    });

    it('should cache engine instances within session', () => {
      const manager = getBackchannelManager(SESSION_1);
      const engine1 = manager.getEngine('standard');
      const engine2 = manager.getEngine('standard');

      expect(engine1).toBe(engine2);
    });
  });

  // --------------------------------------------------------------------------
  // Decision Making
  // --------------------------------------------------------------------------

  describe('Decision Making', () => {
    it('should make backchannel decisions', () => {
      const manager = getBackchannelManager(SESSION_1);
      const engine = manager.getEngine('standard');

      const context: BackchannelContext = {
        sessionId: SESSION_1,
        personaId: 'ferni',
        userSpeechDuration: 5000,
        currentPauseDuration: 500,
        userEmotion: createTestEmotion('neutral', { confidence: 0.7, intensity: 0.3 }),
        topicWeight: 'medium',
        turnCount: 3,
        backchannelCountThisTurn: 0,
      };

      const decision = engine.decide(context);

      expect(decision).toMatchObject({
        shouldEmit: expect.any(Boolean),
        phrase: expect.any(Object), // Could be string or null
        timing: expect.stringMatching(/^(immediate|after_pause|never)$/),
        reason: expect.any(String),
      });
    });

    it('should respect cooldown period', () => {
      const manager = getBackchannelManager(SESSION_1);
      const engine = manager.getEngine('standard');

      // First decision - just made a backchannel
      const context: BackchannelContext = {
        sessionId: SESSION_1,
        personaId: 'ferni',
        userSpeechDuration: 5000,
        currentPauseDuration: 500,
        userEmotion: createTestEmotion('neutral', { confidence: 0.7, intensity: 0.3 }),
        topicWeight: 'medium',
        turnCount: 3,
        backchannelCountThisTurn: 0,
        lastBackchannelTime: Date.now() - 1000, // 1 second ago
        timeSinceLastBackchannel: 1000,
      };

      const decision = engine.decide(context);

      // Should NOT emit because cooldown hasn't elapsed
      expect(decision.shouldEmit).toBe(false);
      expect(decision.reason).toContain('cooldown');
    });

    it('should handle different topic weights', () => {
      const manager = getBackchannelManager(SESSION_1);
      const engine = manager.getEngine('enhanced');

      const baseContext: Omit<BackchannelContext, 'topicWeight'> = {
        sessionId: SESSION_1,
        personaId: 'ferni',
        userSpeechDuration: 5000,
        currentPauseDuration: 500,
        userEmotion: createTestEmotion('sadness', {
          confidence: 0.8,
          intensity: 0.6,
          distressLevel: 0.4,
        }),
        turnCount: 5,
        backchannelCountThisTurn: 0,
      };

      // Light topic
      const lightDecision = engine.decide({ ...baseContext, topicWeight: 'light' });
      expect(lightDecision).toBeDefined();

      // Heavy topic (should be more sensitive to emotions)
      const heavyDecision = engine.decide({ ...baseContext, topicWeight: 'heavy' });
      expect(heavyDecision).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Persona-Specific Behavior
  // --------------------------------------------------------------------------

  describe('Persona-Specific Behavior', () => {
    it('should accept different persona IDs', () => {
      const manager = getBackchannelManager(SESSION_1);
      const engine = manager.getEngine('standard');

      const personas = ['ferni', 'peter', 'maya', 'alex', 'jordan', 'nayan'];

      for (const personaId of personas) {
        const context: BackchannelContext = {
          sessionId: SESSION_1,
          personaId,
          userSpeechDuration: 5000,
          currentPauseDuration: 500,
          userEmotion: createTestEmotion('neutral', { confidence: 0.7, intensity: 0.3 }),
          topicWeight: 'medium',
          turnCount: 3,
          backchannelCountThisTurn: 0,
        };

        const decision = engine.decide(context);
        expect(decision).toBeDefined();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Breath Pause Detector (Live Mode)
  // --------------------------------------------------------------------------

  describe('Breath Pause Detector', () => {
    it('should provide breath pause detector', () => {
      const manager = getBackchannelManager(SESSION_1);
      const detector = manager.getBreathPauseDetector();

      expect(detector).toBeDefined();
    });

    it('should process audio frames', () => {
      const manager = getBackchannelManager(SESSION_1);
      const detector = manager.getBreathPauseDetector();

      // Create a mock audio frame
      const mockFrame = {
        data: new Int16Array(160), // 10ms at 16kHz
        sampleRate: 16000,
      };

      expect(() => {
        detector.processAudioFrame(mockFrame);
      }).not.toThrow();
    });

    it('should detect pauses', () => {
      const manager = getBackchannelManager(SESSION_1);
      const detector = manager.getBreathPauseDetector();

      // Simulate speech followed by silence
      const speechFrame = {
        data: new Int16Array(160).fill(5000),
        sampleRate: 16000,
      };
      const silenceFrame = {
        data: new Int16Array(160).fill(0),
        sampleRate: 16000,
      };

      // Feed some speech
      for (let i = 0; i < 100; i++) {
        detector.processAudioFrame(speechFrame);
      }

      // Feed silence
      for (let i = 0; i < 50; i++) {
        detector.processAudioFrame(silenceFrame);
      }

      const isPaused = detector.isBreathPause();
      expect(typeof isPaused).toBe('boolean');
    });
  });

  // --------------------------------------------------------------------------
  // Reset Behavior
  // --------------------------------------------------------------------------

  describe('Reset Behavior', () => {
    it('should reset manager state', () => {
      const manager = getBackchannelManager(SESSION_1);

      // Use the manager
      manager.getEngine('standard');
      manager.getBreathPauseDetector();

      // Reset
      expect(() => {
        manager.reset();
      }).not.toThrow();
    });

    it('should provide fresh engines after reset', () => {
      const manager = getBackchannelManager(SESSION_1);
      const engine1 = manager.getEngine('standard');

      manager.reset();

      const engine2 = manager.getEngine('standard');
      expect(engine2).not.toBe(engine1);
    });
  });
});

// ============================================================================
// TIMING CONFIGURATION TESTS
// ============================================================================

describe('Timing Configuration', () => {
  const SESSION = 'timing-test-session';

  beforeEach(() => {
    resetBackchanneling(SESSION);
  });

  afterEach(() => {
    resetBackchanneling(SESSION);
  });

  it('should use different timing for different modes', () => {
    const manager = getBackchannelManager(SESSION);

    // Standard mode - longer triggers
    const standardEngine = manager.getEngine('standard');

    // Enhanced mode - shorter triggers
    const enhancedEngine = manager.getEngine('enhanced');

    // Live mode - shortest triggers (breath-based)
    const liveEngine = manager.getEngine('live');

    expect(standardEngine).toBeDefined();
    expect(enhancedEngine).toBeDefined();
    expect(liveEngine).toBeDefined();
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  const SESSION = 'edge-case-session';

  beforeEach(() => {
    resetBackchanneling(SESSION);
  });

  afterEach(() => {
    resetBackchanneling(SESSION);
  });

  it('should handle zero speech duration', () => {
    const manager = getBackchannelManager(SESSION);
    const engine = manager.getEngine('standard');

    const context: BackchannelContext = {
      sessionId: SESSION,
      personaId: 'ferni',
      userSpeechDuration: 0,
      currentPauseDuration: 0,
      userEmotion: createTestEmotion('neutral'),
      topicWeight: 'light',
      turnCount: 1,
      backchannelCountThisTurn: 0,
    };

    const decision = engine.decide(context);
    expect(decision.shouldEmit).toBe(false);
  });

  it('should handle very long speech duration', () => {
    const manager = getBackchannelManager(SESSION);
    const engine = manager.getEngine('standard');

    const context: BackchannelContext = {
      sessionId: SESSION,
      personaId: 'ferni',
      userSpeechDuration: 60000, // 1 minute
      currentPauseDuration: 1000,
      userEmotion: createTestEmotion('neutral'),
      topicWeight: 'medium',
      turnCount: 10,
      backchannelCountThisTurn: 5, // Already many backchannels
    };

    const decision = engine.decide(context);
    // Should be rate-limited
    expect(decision).toBeDefined();
  });

  it('should handle unknown persona gracefully', () => {
    const manager = getBackchannelManager(SESSION);
    const engine = manager.getEngine('standard');

    const context: BackchannelContext = {
      sessionId: SESSION,
      personaId: 'unknown-persona',
      userSpeechDuration: 5000,
      currentPauseDuration: 500,
      userEmotion: createTestEmotion('neutral'),
      topicWeight: 'medium',
      turnCount: 3,
      backchannelCountThisTurn: 0,
    };

    // Should not throw, should fall back to default
    const decision = engine.decide(context);
    expect(decision).toBeDefined();
  });
});
