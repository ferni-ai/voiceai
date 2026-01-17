/**
 * Semantic Tool Presence Tests
 *
 * Tests the "Better than Human" emotion-aware tool feedback system
 * that provides natural, human-like acknowledgment during tool execution.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import {
  PRESENCE_PATTERNS,
  TOOL_SEMANTICS,
  TIME_MODIFIERS,
  selectPresenceFeedback,
  startToolPresence,
  stopToolPresence,
  cleanupSessionToolPresence,
  toolPresenceEvents,
  type EmotionalContext,
  type ToolExecutionContext,
} from '../semantic-tool-presence.js';

describe('Semantic Tool Presence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Clean up any lingering session data
    cleanupSessionToolPresence('test-session');
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanupSessionToolPresence('test-session');
  });

  describe('PRESENCE_PATTERNS', () => {
    it('should have patterns for all emotional contexts', () => {
      const emotions: EmotionalContext[] = [
        'anxious',
        'excited',
        'curious',
        'sad',
        'tired',
        'neutral',
      ];

      for (const emotion of emotions) {
        expect(PRESENCE_PATTERNS[emotion]).toBeDefined();
        expect(PRESENCE_PATTERNS[emotion].initial.length).toBeGreaterThan(0);
        expect(PRESENCE_PATTERNS[emotion].stillHere.length).toBeGreaterThan(0);
        expect(PRESENCE_PATTERNS[emotion].completion.length).toBeGreaterThan(0);
      }
    });

    it('should have human-like, non-robotic phrases', () => {
      // Verify phrases don't sound like enterprise software
      const roboticPhrases = [
        'Please wait',
        'Processing your request',
        'Loading',
        'One moment please',
      ];

      for (const emotion of Object.keys(PRESENCE_PATTERNS) as EmotionalContext[]) {
        const allPhrases = [
          ...PRESENCE_PATTERNS[emotion].initial,
          ...PRESENCE_PATTERNS[emotion].stillHere,
          ...PRESENCE_PATTERNS[emotion].completion,
        ];

        for (const phrase of allPhrases) {
          for (const robotic of roboticPhrases) {
            expect(phrase.toLowerCase()).not.toContain(robotic.toLowerCase());
          }
        }
      }
    });
  });

  describe('TOOL_SEMANTICS', () => {
    it('should have semantics for common tools', () => {
      expect(TOOL_SEMANTICS.calendar).toBeDefined();
      expect(TOOL_SEMANTICS.memory).toBeDefined();
      expect(TOOL_SEMANTICS.weather).toBeDefined();
      expect(TOOL_SEMANTICS.music).toBeDefined();
    });

    it('should have action and domain for each tool', () => {
      for (const [, semantics] of Object.entries(TOOL_SEMANTICS)) {
        expect(semantics.action).toBeTruthy();
        expect(semantics.domain).toBeTruthy();
        // Actions should be conversational verbs (lowercase)
        expect(semantics.action).not.toMatch(/^[A-Z]/);
      }
    });
  });

  describe('TIME_MODIFIERS', () => {
    it('should have time modifiers for different times of day', () => {
      const timesOfDay = ['morning', 'afternoon', 'evening', 'late-night'];

      for (const timeOfDay of timesOfDay) {
        expect(TIME_MODIFIERS[timeOfDay]).toBeDefined();
        expect(TIME_MODIFIERS[timeOfDay].speedAdjust).toBeGreaterThan(0);
        expect(TIME_MODIFIERS[timeOfDay].pauseMultiplier).toBeGreaterThan(0);
      }
    });

    it('should have slower speech for late-night', () => {
      expect(TIME_MODIFIERS['late-night'].speedAdjust).toBeLessThan(
        TIME_MODIFIERS.afternoon.speedAdjust
      );
    });
  });

  describe('selectPresenceFeedback', () => {
    it('should return feedback with shouldSpeak=false for very fast responses', () => {
      const context: ToolExecutionContext = {
        toolName: 'calendar',
        sessionId: 'test-session',
        userId: 'test-user',
        personaId: 'ferni',
        startTime: Date.now(),
        userEmotion: 'neutral',
      };

      // Under 800ms should return shouldSpeak=false for initial phase
      const feedback = selectPresenceFeedback('initial', context, 100);
      expect(feedback.shouldSpeak).toBe(false);
      expect(feedback.reason).toContain('fast');
    });

    it('should return feedback after 800ms threshold for initial phase', () => {
      const context: ToolExecutionContext = {
        toolName: 'calendar',
        sessionId: 'test-session',
        userId: 'test-user',
        personaId: 'ferni',
        startTime: Date.now(),
        userEmotion: 'excited', // Excited has non-silent phrases
      };

      // After 800ms threshold, should get text (though shouldSpeak depends on text content)
      const feedback = selectPresenceFeedback('initial', context, 1000);
      expect(feedback.text).toBeTruthy();
    });

    it('should use emotion-appropriate patterns', () => {
      const anxiousContext: ToolExecutionContext = {
        toolName: 'calendar',
        sessionId: 'test-session',
        userId: 'test-user',
        personaId: 'ferni',
        startTime: Date.now(),
        userEmotion: 'anxious',
      };

      // Anxious patterns should have caring/supportive text
      const feedback = selectPresenceFeedback('initial', anxiousContext, 1000);
      expect(feedback.text).toBeTruthy();
      expect(feedback.reason).toContain('anxious');
    });

    it('should include timing information in the reason', () => {
      const context: ToolExecutionContext = {
        toolName: 'weather',
        sessionId: 'test-session',
        userId: 'test-user',
        personaId: 'ferni',
        startTime: Date.now(),
        userEmotion: 'curious',
      };

      const feedback = selectPresenceFeedback('stillHere', context, 5000);
      expect(feedback.timing).toBe('progressive');
      expect(feedback.reason).toContain('5000ms');
    });
  });

  describe('startToolPresence and stopToolPresence', () => {
    it('should track tool execution and return timing on stop', () => {
      const context: ToolExecutionContext = {
        toolName: 'calendar',
        sessionId: 'test-session',
        userId: 'test-user',
        personaId: 'ferni',
        startTime: Date.now(),
      };

      // Start tracking
      startToolPresence(context);

      // Advance time
      vi.advanceTimersByTime(1500);

      // Stop tracking
      const timing = stopToolPresence('test-session', 'calendar');

      expect(timing).not.toBeNull();
      expect(timing!.durationMs).toBeGreaterThanOrEqual(1500);
      expect(timing!.toolName).toBe('calendar');
    });

    it('should return null when stopping non-existent tracking', () => {
      const timing = stopToolPresence('non-existent-session', 'calendar');
      expect(timing).toBeNull();
    });

    it('should emit progress events during long execution', async () => {
      const progressCallback = vi.fn();
      const context: ToolExecutionContext = {
        toolName: 'weather',
        sessionId: 'progress-test-session',
        userId: 'test-user',
        personaId: 'ferni',
        startTime: Date.now(),
        userEmotion: 'excited', // Use excited for non-silent responses
      };

      // Start with callback
      startToolPresence(context, progressCallback);

      // Progress timer fires every 2500ms and only emits after 2000ms elapsed
      // Advance past first interval trigger (2500ms) + some buffer
      await vi.advanceTimersByTimeAsync(3000);

      // Should have received at least one callback (if feedback shouldSpeak is true)
      // Note: The callback only fires if the feedback shouldSpeak is true
      // For excited emotion with elapsedMs > 2000, shouldSpeak should be true
      expect(progressCallback).toHaveBeenCalled();

      // Cleanup
      stopToolPresence('progress-test-session', 'weather');
    });
  });

  describe('cleanupSessionToolPresence', () => {
    it('should clean up all tool tracking for a session', () => {
      const sessionId = 'cleanup-test-session';

      // Start multiple tools
      startToolPresence({
        toolName: 'calendar',
        sessionId,
        userId: 'test-user',
        personaId: 'ferni',
        startTime: Date.now(),
      });

      startToolPresence({
        toolName: 'weather',
        sessionId,
        userId: 'test-user',
        personaId: 'ferni',
        startTime: Date.now(),
      });

      // Cleanup
      cleanupSessionToolPresence(sessionId);

      // Both should return null after cleanup
      expect(stopToolPresence(sessionId, 'calendar')).toBeNull();
      expect(stopToolPresence(sessionId, 'weather')).toBeNull();
    });
  });

  describe('toolPresenceEvents', () => {
    it('should be an EventEmitter for presence updates', () => {
      expect(toolPresenceEvents).toBeDefined();
      expect(typeof toolPresenceEvents.on).toBe('function');
      expect(typeof toolPresenceEvents.emit).toBe('function');
    });

    it('should emit presence events during tool execution', async () => {
      const eventHandler = vi.fn();
      toolPresenceEvents.on('presence', eventHandler);

      const context: ToolExecutionContext = {
        toolName: 'memory',
        sessionId: 'event-test-session',
        userId: 'test-user',
        personaId: 'ferni',
        startTime: Date.now(),
        userEmotion: 'curious',
      };

      startToolPresence(context);

      // Advance past initial delay (1800ms for curious)
      await vi.advanceTimersByTimeAsync(2000);

      // Should have emitted event
      expect(eventHandler).toHaveBeenCalled();

      // Cleanup
      stopToolPresence('event-test-session', 'memory');
      toolPresenceEvents.removeListener('presence', eventHandler);
    });
  });
});
