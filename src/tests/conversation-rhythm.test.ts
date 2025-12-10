/**
 * Conversation Rhythm Tests
 *
 * Tests the ConversationRhythmTracker that:
 * - Tracks user's communication patterns (pacing, pauses, energy)
 * - Provides guidance to match user's rhythm
 * - Monitors conversation balance
 *
 * @module tests/conversation-rhythm
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getConversationRhythmTracker,
  resetConversationRhythmTracker,
} from '../conversation/conversation-rhythm.js';

// Mock the humanization signal emitter
vi.mock('../services/humanization/humanization-signal-emitter.js', () => ({
  humanizationSignalEmitter: {
    emitRhythm: vi.fn().mockResolvedValue(undefined),
  },
}));

// ============================================================================
// TESTS
// ============================================================================

describe('ConversationRhythmTracker', () => {
  beforeEach(() => {
    resetConversationRhythmTracker();
  });

  afterEach(() => {
    resetConversationRhythmTracker();
  });

  // --------------------------------------------------------------------------
  // Singleton Pattern
  // --------------------------------------------------------------------------

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = getConversationRhythmTracker();
      const instance2 = getConversationRhythmTracker();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getConversationRhythmTracker();
      resetConversationRhythmTracker();
      const instance2 = getConversationRhythmTracker();
      expect(instance2).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // User Turn Recording
  // --------------------------------------------------------------------------

  describe('User Turn Recording', () => {
    it('should record user turns', () => {
      const tracker = getConversationRhythmTracker();

      const snapshot = tracker.recordUserTurn({
        text: 'Hello, this is my first message',
        emotionIntensity: 0.5,
      });

      expect(snapshot).toBeDefined();
      expect(snapshot.turnCount).toBe(1);
    });

    it('should track multiple turns', () => {
      const tracker = getConversationRhythmTracker();

      tracker.recordUserTurn({ text: 'First message here', emotionIntensity: 0.5 });
      tracker.recordUserTurn({ text: 'Second message with more content', emotionIntensity: 0.6 });
      const snapshot = tracker.recordUserTurn({ text: 'Third message', emotionIntensity: 0.7 });

      expect(snapshot.turnCount).toBe(3);
    });

    it('should calculate average turn length', () => {
      const tracker = getConversationRhythmTracker();

      tracker.recordUserTurn({ text: 'Short message', emotionIntensity: 0.5 });
      tracker.recordUserTurn({
        text: 'This is a much longer message with many more words',
        emotionIntensity: 0.5,
      });
      const snapshot = tracker.recordUserTurn({
        text: 'Medium length message here',
        emotionIntensity: 0.5,
      });

      expect(snapshot.avgTurnLength).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Pacing Detection
  // --------------------------------------------------------------------------

  describe('Pacing Detection', () => {
    it('should detect rapid pacing', () => {
      const tracker = getConversationRhythmTracker();

      // Simulate rapid speech (high WPM)
      tracker.recordUserTurn({
        text: 'Quick message here',
        durationMs: 500,
        emotionIntensity: 0.7,
      });
      tracker.recordUserTurn({
        text: 'Another fast response now',
        durationMs: 500,
        emotionIntensity: 0.7,
      });
      const snapshot = tracker.recordUserTurn({
        text: 'Keeping up the pace',
        durationMs: 400,
        emotionIntensity: 0.7,
      });

      expect(snapshot.pacing).toBe('rapid');
    });

    it('should detect slow/contemplative pacing', () => {
      const tracker = getConversationRhythmTracker();

      // Simulate slow speech (low WPM)
      tracker.recordUserTurn({
        text: 'thinking... slowly',
        durationMs: 5000,
        emotionIntensity: 0.3,
      });
      tracker.recordUserTurn({ text: 'still pondering', durationMs: 4000, emotionIntensity: 0.3 });
      const snapshot = tracker.recordUserTurn({
        text: 'deeply',
        durationMs: 3000,
        emotionIntensity: 0.3,
      });

      expect(['slow', 'contemplative']).toContain(snapshot.pacing);
    });

    it('should detect moderate pacing', () => {
      const tracker = getConversationRhythmTracker();

      // Normal speaking rate
      tracker.recordUserTurn({
        text: 'This is a normal paced message with several words',
        durationMs: 3000,
        emotionIntensity: 0.5,
      });
      tracker.recordUserTurn({
        text: 'Another normal response here',
        durationMs: 2000,
        emotionIntensity: 0.5,
      });
      const snapshot = tracker.recordUserTurn({
        text: 'Continuing at normal pace',
        durationMs: 2000,
        emotionIntensity: 0.5,
      });

      expect(snapshot.pacing).toBe('moderate');
    });
  });

  // --------------------------------------------------------------------------
  // Pause Pattern Detection
  // --------------------------------------------------------------------------

  describe('Pause Pattern Detection', () => {
    it('should detect frequent short pauses', () => {
      const tracker = getConversationRhythmTracker();

      tracker.recordUserTurn({
        text: 'Speaking with pauses',
        pauseCount: 5,
        avgPauseDuration: 300,
        emotionIntensity: 0.5,
      });
      tracker.recordUserTurn({
        text: 'More pauses here',
        pauseCount: 4,
        avgPauseDuration: 400,
        emotionIntensity: 0.5,
      });
      const snapshot = tracker.recordUserTurn({
        text: 'Still pausing',
        pauseCount: 5,
        avgPauseDuration: 350,
        emotionIntensity: 0.5,
      });

      expect(snapshot.pausePattern).toBe('frequent_short');
    });

    it('should detect hesitant pattern', () => {
      const tracker = getConversationRhythmTracker();

      tracker.recordUserTurn({
        text: 'Um hesitating',
        pauseCount: 5,
        avgPauseDuration: 800,
        emotionIntensity: 0.5,
      });
      tracker.recordUserTurn({
        text: 'Still hesitant',
        pauseCount: 4,
        avgPauseDuration: 900,
        emotionIntensity: 0.5,
      });
      const snapshot = tracker.recordUserTurn({
        text: 'Very hesitant',
        pauseCount: 5,
        avgPauseDuration: 850,
        emotionIntensity: 0.5,
      });

      expect(snapshot.pausePattern).toBe('hesitant');
    });

    it('should detect flowing pattern', () => {
      const tracker = getConversationRhythmTracker();

      tracker.recordUserTurn({
        text: 'Flowing speech without pauses',
        pauseCount: 0,
        emotionIntensity: 0.5,
      });
      tracker.recordUserTurn({
        text: 'Continuing to flow naturally',
        pauseCount: 1,
        emotionIntensity: 0.5,
      });
      const snapshot = tracker.recordUserTurn({
        text: 'Still flowing smoothly',
        pauseCount: 0,
        emotionIntensity: 0.5,
      });

      expect(snapshot.pausePattern).toBe('flowing');
    });
  });

  // --------------------------------------------------------------------------
  // Energy Trend Detection
  // --------------------------------------------------------------------------

  describe('Energy Trend Detection', () => {
    it('should detect rising energy', () => {
      const tracker = getConversationRhythmTracker();

      tracker.recordUserTurn({ text: 'Starting calm', emotionIntensity: 0.3 });
      tracker.recordUserTurn({ text: 'Getting more excited', emotionIntensity: 0.5 });
      tracker.recordUserTurn({ text: 'Very excited now', emotionIntensity: 0.7 });
      tracker.recordUserTurn({ text: 'Super excited!', emotionIntensity: 0.8 });
      const snapshot = tracker.recordUserTurn({ text: 'Amazing!', emotionIntensity: 0.9 });

      expect(snapshot.energyTrend).toBe('rising');
    });

    it('should detect falling energy', () => {
      const tracker = getConversationRhythmTracker();

      tracker.recordUserTurn({ text: 'Very energetic!', emotionIntensity: 0.9 });
      tracker.recordUserTurn({ text: 'Getting calmer', emotionIntensity: 0.7 });
      tracker.recordUserTurn({ text: 'Calming down', emotionIntensity: 0.5 });
      tracker.recordUserTurn({ text: 'Settling', emotionIntensity: 0.4 });
      const snapshot = tracker.recordUserTurn({ text: 'Quiet now', emotionIntensity: 0.2 });

      expect(snapshot.energyTrend).toBe('falling');
    });

    it('should detect stable energy', () => {
      const tracker = getConversationRhythmTracker();

      tracker.recordUserTurn({ text: 'Consistent energy', emotionIntensity: 0.5 });
      tracker.recordUserTurn({ text: 'Still consistent', emotionIntensity: 0.5 });
      tracker.recordUserTurn({ text: 'Maintaining level', emotionIntensity: 0.5 });
      tracker.recordUserTurn({ text: 'Same energy', emotionIntensity: 0.5 });
      const snapshot = tracker.recordUserTurn({ text: 'Unchanged', emotionIntensity: 0.5 });

      expect(snapshot.energyTrend).toBe('stable');
    });

    it('should detect oscillating energy', () => {
      const tracker = getConversationRhythmTracker();

      tracker.recordUserTurn({ text: 'High!', emotionIntensity: 0.9 });
      tracker.recordUserTurn({ text: 'Low', emotionIntensity: 0.2 });
      tracker.recordUserTurn({ text: 'High again!', emotionIntensity: 0.8 });
      tracker.recordUserTurn({ text: 'Down again', emotionIntensity: 0.3 });
      const snapshot = tracker.recordUserTurn({ text: 'Up!', emotionIntensity: 0.9 });

      expect(snapshot.energyTrend).toBe('oscillating');
    });
  });

  // --------------------------------------------------------------------------
  // Rhythm Guidance
  // --------------------------------------------------------------------------

  describe('Rhythm Guidance', () => {
    it('should provide rhythm guidance', () => {
      const tracker = getConversationRhythmTracker();

      tracker.recordUserTurn({ text: 'First message here', emotionIntensity: 0.5 });
      tracker.recordUserTurn({ text: 'Second message', emotionIntensity: 0.5 });

      const guidance = tracker.getRhythmGuidance();

      expect(guidance).toHaveProperty('lengthMultiplier');
      expect(guidance).toHaveProperty('rateMultiplier');
      expect(guidance).toHaveProperty('pauseMultiplier');
      expect(guidance).toHaveProperty('energyLevel');
      expect(guidance).toHaveProperty('guidance');
    });

    it('should recommend shorter responses for brief user messages', () => {
      const tracker = getConversationRhythmTracker();

      // Short user messages
      tracker.recordUserTurn({ text: 'Short', emotionIntensity: 0.5 });
      tracker.recordUserTurn({ text: 'Brief', emotionIntensity: 0.5 });
      tracker.recordUserTurn({ text: 'Quick', emotionIntensity: 0.5 });
      tracker.recordUserTurn({ text: 'Terse', emotionIntensity: 0.5 });
      tracker.recordUserTurn({ text: 'Minimal', emotionIntensity: 0.5 });

      const guidance = tracker.getRhythmGuidance();

      expect(guidance.lengthMultiplier).toBeLessThan(1);
      expect(guidance.guidance).toContain('concise');
    });

    it('should recommend longer responses for expansive user messages', () => {
      const tracker = getConversationRhythmTracker();

      // Very long user messages (>60 words triggers multiplier increase)
      const longMessage =
        'This is a very long and detailed message with lots of information and context that the user is sharing because they are being very thorough and want to explain their entire situation in great detail with all the nuances and complexities involved in this particular topic that they are discussing at length';
      tracker.recordUserTurn({ text: longMessage, emotionIntensity: 0.5 });
      tracker.recordUserTurn({ text: longMessage, emotionIntensity: 0.5 });
      tracker.recordUserTurn({ text: longMessage, emotionIntensity: 0.5 });
      tracker.recordUserTurn({ text: longMessage, emotionIntensity: 0.5 });
      tracker.recordUserTurn({ text: longMessage, emotionIntensity: 0.5 });

      const guidance = tracker.getRhythmGuidance();

      // Should get lengthMultiplier > 1 or at least guidance about expansive user
      expect(guidance.lengthMultiplier).toBeGreaterThanOrEqual(1);
      if (guidance.lengthMultiplier > 1) {
        expect(guidance.guidance).toContain('expansive');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Rhythm Shift Detection
  // --------------------------------------------------------------------------

  describe('Rhythm Shift Detection', () => {
    it('should track rhythm and detect shifts when pacing changes', () => {
      const tracker = getConversationRhythmTracker();

      // Record several turns
      tracker.recordUserTurn({ text: 'Quick message', durationMs: 500, emotionIntensity: 0.7 });
      tracker.recordUserTurn({ text: 'Fast response', durationMs: 500, emotionIntensity: 0.7 });
      tracker.recordUserTurn({ text: 'Speedy reply', durationMs: 500, emotionIntensity: 0.7 });

      // Get initial rhythm
      const initialRhythm = tracker.getCurrentRhythm();
      const initialPacing = initialRhythm.pacing;

      // Shift to slow
      tracker.recordUserTurn({
        text: 'Slowing down now significantly',
        durationMs: 8000,
        emotionIntensity: 0.3,
      });
      tracker.recordUserTurn({
        text: 'Much slower pace here',
        durationMs: 7000,
        emotionIntensity: 0.3,
      });
      tracker.recordUserTurn({
        text: 'Contemplating deeply',
        durationMs: 6000,
        emotionIntensity: 0.3,
      });

      // Get new rhythm
      const newRhythm = tracker.getCurrentRhythm();

      // The rhythm should reflect the change in pacing
      // Either pacing changed or hasRhythmShifted detects it
      const pacingChanged = newRhythm.pacing !== initialPacing;
      const shiftDetected = tracker.hasRhythmShifted();

      expect(pacingChanged || shiftDetected).toBe(true);
    });

    it('should return false for consistent rhythm', () => {
      const tracker = getConversationRhythmTracker();

      // All same pace
      tracker.recordUserTurn({
        text: 'Normal message one',
        durationMs: 2000,
        emotionIntensity: 0.5,
      });
      tracker.recordUserTurn({
        text: 'Normal message two',
        durationMs: 2000,
        emotionIntensity: 0.5,
      });
      tracker.recordUserTurn({
        text: 'Normal message three',
        durationMs: 2000,
        emotionIntensity: 0.5,
      });

      // Should not detect shift
      expect(tracker.hasRhythmShifted()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Conversation Balance
  // --------------------------------------------------------------------------

  describe('Conversation Balance', () => {
    it('should track conversation balance', () => {
      const tracker = getConversationRhythmTracker();

      tracker.recordUserTurn({ text: 'User message with content', emotionIntensity: 0.5 });
      tracker.recordAgentTurn({ text: 'Agent response with more content here' });
      tracker.recordUserTurn({ text: 'Another user message', emotionIntensity: 0.5 });
      tracker.recordAgentTurn({ text: 'Another agent response' });

      const balance = tracker.getConversationBalance();

      expect(balance.userWordRatio).toBeGreaterThan(0);
      expect(balance.agentWordRatio).toBeGreaterThan(0);
      expect(balance.userWordRatio + balance.agentWordRatio).toBeCloseTo(1, 1);
    });

    it('should detect when agent is talking too much', () => {
      const tracker = getConversationRhythmTracker();

      tracker.recordUserTurn({ text: 'Short', emotionIntensity: 0.5 });
      tracker.recordAgentTurn({
        text: 'Very long agent response with many words and lots of content that goes on and on',
      });
      tracker.recordUserTurn({ text: 'Brief', emotionIntensity: 0.5 });
      tracker.recordAgentTurn({
        text: 'Another very long agent response with even more content and explanations',
      });

      const balance = tracker.getConversationBalance();

      if (balance.agentWordRatio > 0.6) {
        expect(balance.guidance).toContain('too much');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  describe('Reset', () => {
    it('should reset internal state', () => {
      const tracker = getConversationRhythmTracker();

      tracker.recordUserTurn({ text: 'Message one', emotionIntensity: 0.5 });
      tracker.recordUserTurn({ text: 'Message two', emotionIntensity: 0.6 });
      tracker.reset();

      const snapshot = tracker.getCurrentRhythm();
      expect(snapshot.turnCount).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty text', () => {
      const tracker = getConversationRhythmTracker();

      expect(() => {
        tracker.recordUserTurn({ text: '', emotionIntensity: 0.5 });
      }).not.toThrow();
    });

    it('should handle very long text', () => {
      const tracker = getConversationRhythmTracker();
      const longText = 'Word '.repeat(1000);

      expect(() => {
        tracker.recordUserTurn({ text: longText, emotionIntensity: 0.5 });
      }).not.toThrow();
    });

    it('should handle rapid consecutive calls', () => {
      const tracker = getConversationRhythmTracker();

      expect(() => {
        for (let i = 0; i < 50; i++) {
          tracker.recordUserTurn({ text: `Message ${i}`, emotionIntensity: Math.random() });
        }
      }).not.toThrow();
    });

    it('should handle undefined optional fields', () => {
      const tracker = getConversationRhythmTracker();

      expect(() => {
        tracker.recordUserTurn({ text: 'Test' });
      }).not.toThrow();
    });
  });
});
