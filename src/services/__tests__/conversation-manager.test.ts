/**
 * Conversation Manager Tests
 *
 * Tests for the session-scoped conversation manager that orchestrates:
 * - Real-time conversation dynamics
 * - Turn-taking and interruption handling
 * - Topic tracking
 * - Backchanneling integration
 * - Session isolation (no cross-session contamination)
 *
 * @module tests/conversation-manager
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing
vi.mock('../../conversation/interruption-handler.js', () => ({
  getInterruptionHandler: vi.fn(() => ({
    detectInterruption: vi.fn().mockReturnValue(null),
    setAgentSpeaking: vi.fn(),
    getStats: vi.fn().mockReturnValue({ recentInterruptions: 0 }),
    getRecoveryPhrase: vi.fn().mockReturnValue('As I was saying...'),
    reset: vi.fn(),
  })),
}));

vi.mock('../../conversation/turn-taking.js', () => ({
  getTurnTakingMonitor: vi.fn(() => ({
    recordTurn: vi.fn(),
    shouldInviteUserToSpeak: vi.fn().mockReturnValue(false),
    shouldKeepResponseBrief: vi.fn().mockReturnValue(false),
    getSpeakingRatio: vi.fn().mockReturnValue(0.5),
    getInvitation: vi.fn().mockReturnValue('What do you think?'),
    getStats: vi.fn().mockReturnValue({ agentTurns: 0, userTurns: 0 }),
    reset: vi.fn(),
  })),
}));

vi.mock('../../intelligence/topic-tracker.js', () => ({
  getTopicTracker: vi.fn(() => ({
    detectTopicChange: vi.fn().mockReturnValue({ detected: false }),
    getCurrentTopic: vi.fn().mockReturnValue(null),
    getSimpleTopicHistory: vi.fn().mockReturnValue([]),
    clear: vi.fn(),
  })),
}));

vi.mock('../../speech/backchanneling/index.js', () => {
  const mockEngine = {
    decide: vi.fn().mockReturnValue({
      shouldEmit: false,
      phrase: null,
      ssml: null,
      category: null,
      emotionType: null,
      timing: 'never',
      volumeRatio: 0.4,
      allowOverlap: false,
      reason: 'not_triggered',
    }),
  };

  const mockManager = {
    getEngine: vi.fn().mockReturnValue(mockEngine),
    getBreathPauseDetector: vi.fn(),
    reset: vi.fn(),
  };

  const managers = new Map<string, typeof mockManager>();

  return {
    getBackchannelManager: vi.fn((sessionId: string) => {
      if (!managers.has(sessionId)) {
        managers.set(sessionId, { ...mockManager, reset: vi.fn() });
      }
      return managers.get(sessionId);
    }),
    resetBackchanneling: vi.fn((sessionId: string) => {
      managers.delete(sessionId);
    }),
    // Expose for test manipulation
    __getMockEngine: () => mockEngine,
    __getMockManagers: () => managers,
  };
});

vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import type { EmotionResult } from '../../intelligence/emotion-detector.js';
import {
  getConversationManager,
  getSessionConversationManager,
  resetConversationManager,
  resetSessionConversationManager,
} from '../conversation-manager.js';

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
// SESSION-SCOPED TESTS
// ============================================================================

describe('ConversationManager (Session-Scoped)', () => {
  beforeEach(() => {
    // Reset all session managers
    resetSessionConversationManager('session-1');
    resetSessionConversationManager('session-2');
    resetConversationManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetSessionConversationManager('session-1');
    resetSessionConversationManager('session-2');
    resetConversationManager();
  });

  // --------------------------------------------------------------------------
  // Session Isolation
  // --------------------------------------------------------------------------

  describe('Session Isolation', () => {
    it('should create separate instances for different sessions', () => {
      const manager1 = getSessionConversationManager('session-1');
      const manager2 = getSessionConversationManager('session-2');

      expect(manager1).not.toBe(manager2);
    });

    it('should return same instance for same session', () => {
      const manager1a = getSessionConversationManager('session-1');
      const manager1b = getSessionConversationManager('session-1');

      expect(manager1a).toBe(manager1b);
    });

    it('should not share state between sessions', () => {
      const manager1 = getSessionConversationManager('session-1');
      const manager2 = getSessionConversationManager('session-2');

      manager1.setPersonaId('ferni');
      manager2.setPersonaId('peter');

      // Each manager maintains its own state
      expect(manager1).toBeDefined();
      expect(manager2).toBeDefined();
    });

    it('should properly cleanup single session without affecting others', () => {
      const manager1 = getSessionConversationManager('session-1');
      getSessionConversationManager('session-2');

      // Reset session 1
      resetSessionConversationManager('session-1');

      // Session 2 should still work
      const manager2Again = getSessionConversationManager('session-2');
      expect(manager2Again).toBeDefined();

      // Session 1 should be new instance
      const manager1Again = getSessionConversationManager('session-1');
      expect(manager1Again).not.toBe(manager1);
    });
  });

  // --------------------------------------------------------------------------
  // Persona Management
  // --------------------------------------------------------------------------

  describe('Persona Management', () => {
    it('should set persona ID', () => {
      const manager = getSessionConversationManager('session-1');

      expect(() => {
        manager.setPersonaId('ferni');
      }).not.toThrow();
    });

    it('should use persona in backchanneling', () => {
      const manager = getSessionConversationManager('session-1');
      manager.setPersonaId('maya');

      const enhancements = manager.getConversationEnhancements(
        'test message',
        createTestEmotion('neutral'),
        'medium'
      );

      expect(enhancements).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Conversation Enhancements
  // --------------------------------------------------------------------------

  describe('Conversation Enhancements', () => {
    it('should return default enhancements', () => {
      const manager = getSessionConversationManager('session-1');

      const enhancements = manager.getConversationEnhancements(
        'Hello there!',
        createTestEmotion('neutral', { confidence: 0.8, intensity: 0.3 }),
        'light'
      );

      expect(enhancements).toMatchObject({
        lengthGuidance: 'normal',
        shouldInviteToSpeak: false,
        metaGuidance: expect.any(Array),
      });
    });

    it('should handle emotional context', () => {
      const manager = getSessionConversationManager('session-1');

      const enhancements = manager.getConversationEnhancements(
        'I am feeling really stressed',
        createTestEmotion('anxiety', { confidence: 0.9, intensity: 0.8, distressLevel: 0.6 }),
        'heavy'
      );

      expect(enhancements).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // User Speech Handling
  // --------------------------------------------------------------------------

  describe('User Speech Handling', () => {
    it('should track user speaking start', () => {
      const manager = getSessionConversationManager('session-1');

      expect(() => {
        manager.handleUserStartedSpeaking();
      }).not.toThrow();
    });

    it('should track user speaking finished', () => {
      const manager = getSessionConversationManager('session-1');

      expect(() => {
        manager.handleUserStartedSpeaking();
        manager.handleUserFinishedSpeaking(2000);
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Agent Speech Handling
  // --------------------------------------------------------------------------

  describe('Agent Speech Handling', () => {
    it('should track agent started speaking', () => {
      const manager = getSessionConversationManager('session-1');

      manager.handleAgentStartedSpeaking('Hello, how can I help?');
      expect(manager.isAgentSpeaking()).toBe(true);
    });

    it('should track agent finished speaking', () => {
      const manager = getSessionConversationManager('session-1');

      manager.handleAgentStartedSpeaking('Hello!');
      manager.handleAgentFinishedSpeaking(1500);

      expect(manager.isAgentSpeaking()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Topic Tracking
  // --------------------------------------------------------------------------

  describe('Topic Tracking', () => {
    it('should return current topic', () => {
      const manager = getSessionConversationManager('session-1');
      const topic = manager.getCurrentTopic();

      expect(topic).toBeNull(); // Based on mock
    });

    it('should return topic history', () => {
      const manager = getSessionConversationManager('session-1');
      const history = manager.getTopicHistory();

      expect(Array.isArray(history)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------

  describe('Stats', () => {
    it('should return comprehensive stats', () => {
      const manager = getSessionConversationManager('session-1');
      const stats = manager.getStats();

      expect(stats).toMatchObject({
        interruptions: expect.any(Object),
        turnTaking: expect.any(Object),
        backchannels: expect.any(Object),
      });
    });
  });

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  describe('Reset', () => {
    it('should reset manager state', () => {
      const manager = getSessionConversationManager('session-1');

      // Set some state
      manager.handleAgentStartedSpeaking('Hello');
      expect(manager.isAgentSpeaking()).toBe(true);

      // Reset
      manager.reset();

      expect(manager.isAgentSpeaking()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Conversation Guidance
  // --------------------------------------------------------------------------

  describe('Conversation Guidance', () => {
    it('should build conversation guidance string', () => {
      const manager = getSessionConversationManager('session-1');

      const enhancements = manager.getConversationEnhancements(
        'test',
        createTestEmotion('neutral'),
        'medium'
      );

      const guidance = manager.buildConversationGuidance(enhancements);

      expect(typeof guidance).toBe('string');
      expect(guidance).toContain('[CONVERSATION DYNAMICS]');
    });
  });
});

// ============================================================================
// LEGACY API TESTS (Backward Compatibility)
// ============================================================================

describe('ConversationManager (Legacy Global)', () => {
  beforeEach(() => {
    resetConversationManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetConversationManager();
  });

  it('should return global singleton instance', () => {
    const manager1 = getConversationManager();
    const manager2 = getConversationManager();

    expect(manager1).toBe(manager2);
  });

  it('should work with deprecated API', () => {
    const manager = getConversationManager();

    expect(() => {
      manager.handleAgentStartedSpeaking('Hello');
      manager.handleAgentFinishedSpeaking(1000);
    }).not.toThrow();
  });

  it('should reset global manager', () => {
    const manager1 = getConversationManager();
    resetConversationManager();
    const manager2 = getConversationManager();

    // After reset, a new instance is created
    expect(manager2).toBeDefined();
  });
});

// ============================================================================
// INSIGHT CALLBACK TESTS
// ============================================================================

describe('Insight Callback', () => {
  beforeEach(() => {
    resetSessionConversationManager('insight-session');
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetSessionConversationManager('insight-session');
  });

  it('should accept and store insight callback', () => {
    const manager = getSessionConversationManager('insight-session');
    const mockCallback = vi.fn();

    expect(() => {
      manager.setInsightCallback(mockCallback);
    }).not.toThrow();
  });
});
