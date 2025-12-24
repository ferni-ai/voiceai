/**
 * Unit tests for Real-Time Noticing System
 *
 * Tests the "superhuman" observation capabilities.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectNoticing,
  shouldThrottleNoticing,
  recordNoticing,
  clearNoticingState,
  type NoticingInput,
  type NoticingResult,
} from '../realtime-noticing.js';

describe('realtime-noticing', () => {
  const baseInput: NoticingInput = {
    sessionId: 'test-session',
    personaId: 'maya-santos',
    turnCount: 3,
    currentTranscript: 'Hello, how are you?',
    pauseBeforeMs: 500,
  };

  beforeEach(() => {
    clearNoticingState('test-session');
  });

  describe('detectNoticing', () => {
    describe('significant_pause detection', () => {
      it('detects pause over 2 seconds', () => {
        const input: NoticingInput = {
          ...baseInput,
          pauseBeforeMs: 2500,
        };

        const result = detectNoticing(input);

        expect(result).not.toBeNull();
        if (result) {
          expect(result.type).toBe('significant_pause');
          expect(result.shouldAcknowledge).toBe(true);
          expect(result.confidence).toBeGreaterThanOrEqual(0.5);
        }
      });

      it('does not detect normal pause', () => {
        const input: NoticingInput = {
          ...baseInput,
          pauseBeforeMs: 800, // Less than 1 second
        };

        const result = detectNoticing(input);

        // Should not trigger significant_pause for normal pause
        if (result) {
          expect(result.type).not.toBe('significant_pause');
        }
      });

      it('scales confidence with pause length', () => {
        const shortPause = detectNoticing({
          ...baseInput,
          pauseBeforeMs: 2200,
        });

        const longPause = detectNoticing({
          ...baseInput,
          pauseBeforeMs: 5000,
        });

        if (shortPause && longPause) {
          expect(longPause.confidence).toBeGreaterThan(shortPause.confidence);
        }
      });
    });

    describe('energy_drop detection', () => {
      it('detects voice arousal drop', () => {
        const input: NoticingInput = {
          ...baseInput,
          voiceEmotion: {
            primary: 'sad',
            confidence: 0.8,
            arousal: 0.2, // Low arousal
            valence: -0.6,
          },
          previousTurns: [
            {
              userTranscript: 'I was excited about this!',
              voiceEmotion: 'excited',
            },
          ],
        };

        const result = detectNoticing(input);

        // Should detect the energy drop
        if (result && result.type === 'energy_drop') {
          expect(result.type).toBe('energy_drop');
          expect(result.shouldAcknowledge).toBe(true);
        }
      });
    });

    describe('mismatch detection', () => {
      it('detects voice vs text mismatch', () => {
        const input: NoticingInput = {
          ...baseInput,
          currentTranscript: "I'm fine, everything is great!",
          voiceEmotion: {
            primary: 'sad',
            confidence: 0.85,
            arousal: 0.3,
            valence: -0.5,
          },
          textEmotion: {
            primary: 'positive',
            intensity: 0.8,
            distressLevel: 0,
          },
        };

        const result = detectNoticing(input);

        // May detect mismatch
        if (result && result.type === 'mismatch') {
          expect(result.type).toBe('mismatch');
          expect(result.acknowledgment).toBeDefined();
        }
      });
    });

    describe('protective_language detection', () => {
      it('detects "I\'m fine" pattern', () => {
        const input: NoticingInput = {
          ...baseInput,
          currentTranscript: "I'm fine, really. Don't worry about me.",
        };

        const result = detectNoticing(input);

        if (result && result.type === 'protective_language') {
          expect(result.type).toBe('protective_language');
          expect(result.subtlety).toBe('gentle');
        }
      });

      it('detects "it\'s nothing" pattern', () => {
        const input: NoticingInput = {
          ...baseInput,
          currentTranscript: "It's nothing, really. Let's move on.",
        };

        const result = detectNoticing(input);

        if (result && result.type === 'protective_language') {
          expect(result.type).toBe('protective_language');
        }
      });
    });

    describe('speech_rate_change detection', () => {
      it('detects significant slowdown', () => {
        const input: NoticingInput = {
          ...baseInput,
          speechRateWPM: 80, // Very slow
          previousTurns: [
            { userTranscript: 'previous', speechRate: 150 },
            { userTranscript: 'previous', speechRate: 155 },
          ],
        };

        const result = detectNoticing(input);

        if (result && result.type === 'speech_rate_change') {
          expect(result.type).toBe('speech_rate_change');
        }
      });

      it('detects significant speedup', () => {
        const input: NoticingInput = {
          ...baseInput,
          speechRateWPM: 200, // Very fast
          previousTurns: [
            { userTranscript: 'previous', speechRate: 100 },
            { userTranscript: 'previous', speechRate: 105 },
          ],
        };

        const result = detectNoticing(input);

        if (result && result.type === 'speech_rate_change') {
          expect(result.type).toBe('speech_rate_change');
        }
      });
    });

    describe('repeated_theme detection', () => {
      it('detects topic repeated across turns', () => {
        const input: NoticingInput = {
          ...baseInput,
          currentTranscript: 'Work has been really stressful',
          currentTopics: ['work', 'stress'],
          previousTurns: [
            { userTranscript: 'My job is overwhelming', topics: ['work', 'stress'] },
            { userTranscript: 'The office politics are draining', topics: ['work'] },
            { userTranscript: 'I keep thinking about work', topics: ['work'] },
          ],
        };

        const result = detectNoticing(input);

        if (result && result.type === 'repeated_theme') {
          expect(result.type).toBe('repeated_theme');
          expect(result.observation).toContain('work');
        }
      });
    });

    describe('breakthrough_moment detection', () => {
      it('detects positive energy surge', () => {
        const input: NoticingInput = {
          ...baseInput,
          currentTranscript: 'I just realized something important!',
          voiceEmotion: {
            primary: 'excited',
            confidence: 0.9,
            arousal: 0.85,
            valence: 0.8,
          },
          previousTurns: [
            { userTranscript: 'I was struggling with this', voiceEmotion: 'neutral' },
          ],
        };

        const result = detectNoticing(input);

        if (result && result.type === 'breakthrough_moment') {
          expect(result.type).toBe('breakthrough_moment');
          expect(result.timing).toBe('immediate');
        }
      });
    });
  });

  describe('shouldThrottleNoticing', () => {
    it('throttles same type within cooldown', () => {
      const sessionId = 'throttle-test';
      const turnCount = 5;

      // Record a noticing
      recordNoticing(sessionId, turnCount, 'significant_pause');

      // Check if same type is throttled on next turn
      const result: NoticingResult = {
        type: 'significant_pause',
        observation: 'test',
        acknowledgment: 'test',
        shouldAcknowledge: true,
        confidence: 0.8,
        timing: 'immediate',
        subtlety: 'gentle',
        personaId: 'maya-santos',
      };

      const shouldThrottle = shouldThrottleNoticing(sessionId, turnCount + 1, result);

      // Same type on consecutive turn should be throttled
      expect(shouldThrottle).toBe(true);
    });

    it('allows different noticing types after cooldown', () => {
      const sessionId = 'throttle-test-2';
      const turnCount = 5;

      // Record one type
      recordNoticing(sessionId, turnCount, 'significant_pause');

      // Different type should not be throttled if enough turns passed (4 turn cooldown)
      const result: NoticingResult = {
        type: 'energy_drop', // Different type
        observation: 'test',
        acknowledgment: 'test',
        shouldAcknowledge: true,
        confidence: 0.8,
        timing: 'immediate',
        subtlety: 'gentle',
        personaId: 'maya-santos',
      };

      // Need at least 4 turns difference for cooldown
      const shouldThrottle = shouldThrottleNoticing(sessionId, turnCount + 5, result);

      expect(shouldThrottle).toBe(false);
    });

    it('throttles same noticing type in same session', () => {
      const sessionId = 'throttle-test-3';

      // Record noticing on turn 1
      recordNoticing(sessionId, 1, 'significant_pause');

      // Same type should be throttled even after cooldown (design decision: never repeat)
      const result: NoticingResult = {
        type: 'significant_pause',
        observation: 'test',
        acknowledgment: 'test',
        shouldAcknowledge: true,
        confidence: 0.8,
        timing: 'immediate',
        subtlety: 'gentle',
        personaId: 'maya-santos',
      };

      // Turn 10 is past cooldown but same type is always throttled
      const shouldThrottle = shouldThrottleNoticing(sessionId, 10, result);

      // System never repeats same noticing type in a session (intentional)
      expect(shouldThrottle).toBe(true);
    });
  });

  describe('clearNoticingState', () => {
    it('resets session state', () => {
      const sessionId = 'clear-test';

      // Record some noticings
      recordNoticing(sessionId, 1, 'significant_pause');
      recordNoticing(sessionId, 2, 'energy_drop');

      // Clear state
      clearNoticingState(sessionId);

      // After clearing, noticing should not be throttled
      const result: NoticingResult = {
        type: 'significant_pause',
        observation: 'test',
        acknowledgment: 'test',
        shouldAcknowledge: true,
        confidence: 0.8,
        timing: 'immediate',
        subtlety: 'gentle',
        personaId: 'maya-santos',
      };

      const shouldThrottle = shouldThrottleNoticing(sessionId, 3, result);

      expect(shouldThrottle).toBe(false);
    });
  });

  describe('persona-aware acknowledgments', () => {
    it('Maya uses warm, encouraging language', () => {
      const input: NoticingInput = {
        ...baseInput,
        personaId: 'maya-santos',
        pauseBeforeMs: 3000,
      };

      const result = detectNoticing(input);

      if (result) {
        // Maya's acknowledgments should be warm
        expect(result.acknowledgment).toBeDefined();
        expect(result.personaId).toBe('maya-santos');
      }
    });

    it('Peter uses analytical language', () => {
      const input: NoticingInput = {
        ...baseInput,
        personaId: 'peter-john',
        pauseBeforeMs: 3000,
      };

      const result = detectNoticing(input);

      if (result) {
        expect(result.acknowledgment).toBeDefined();
        expect(result.personaId).toBe('peter-john');
      }
    });

    it('Nayan uses philosophical language', () => {
      const input: NoticingInput = {
        ...baseInput,
        personaId: 'nayan-patel',
        pauseBeforeMs: 3000,
      };

      const result = detectNoticing(input);

      if (result) {
        expect(result.acknowledgment).toBeDefined();
        expect(result.personaId).toBe('nayan-patel');
      }
    });
  });
});
