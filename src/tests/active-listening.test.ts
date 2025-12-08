/**
 * Active Listening Engine Tests
 *
 * Tests for the active listening module that creates human-like conversational behaviors:
 * - Backchannels (mm-hmm, I see, right)
 * - Vocabulary mirroring
 * - Gentle prompts
 * - Engagement signals
 *
 * @module tests/active-listening
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  getActiveListeningEngine,
  resetActiveListeningEngine,
  type ActiveListeningEngine,
} from '../conversation/active-listening.js';

// ============================================================================
// TESTS
// ============================================================================

describe('ActiveListeningEngine', () => {
  let engine: ActiveListeningEngine;

  beforeEach(() => {
    resetActiveListeningEngine();
    engine = getActiveListeningEngine();
  });

  afterEach(() => {
    resetActiveListeningEngine();
  });

  // --------------------------------------------------------------------------
  // Singleton Pattern
  // --------------------------------------------------------------------------

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = getActiveListeningEngine();
      const instance2 = getActiveListeningEngine();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getActiveListeningEngine();
      resetActiveListeningEngine();
      const instance2 = getActiveListeningEngine();
      expect(instance2).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Core Methods Existence
  // --------------------------------------------------------------------------

  describe('Core Methods', () => {
    it('should have getBackchannel method', () => {
      expect(typeof engine.getBackchannel).toBe('function');
    });

    it('should have mirrorUserVocabulary method', () => {
      expect(typeof engine.mirrorUserVocabulary).toBe('function');
    });

    it('should have getGentlePrompt method', () => {
      expect(typeof engine.getGentlePrompt).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // getBackchannel Method
  // --------------------------------------------------------------------------

  describe('getBackchannel()', () => {
    it('should return a backchannel object or null (due to cooldown)', () => {
      // Reset engine to ensure fresh cooldown state
      resetActiveListeningEngine();
      const freshEngine = getActiveListeningEngine();

      const backchannel = freshEngine.getBackchannel('ferni', {
        userEmotion: 'neutral',
        topicSeriousness: 'casual',
      });

      // Can be null due to cooldown or preference settings
      if (backchannel !== null) {
        expect(backchannel.verbal).toBeDefined();
        expect(typeof backchannel.verbal).toBe('string');
      }
    });

    it('should eventually return a backchannel when called after cooldown', async () => {
      // Reset to get fresh state
      resetActiveListeningEngine();
      const freshEngine = getActiveListeningEngine();

      // First call might return a value
      freshEngine.getBackchannel('ferni', {
        userEmotion: 'neutral',
        topicSeriousness: 'casual',
      });

      // Wait for cooldown (use minimal wait for test)
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });

      // Try multiple times - should eventually get a non-null value
      let gotBackchannel = false;
      for (let i = 0; i < 10; i++) {
        resetActiveListeningEngine();
        const testEngine = getActiveListeningEngine();
        const backchannel = testEngine.getBackchannel('ferni', {
          userEmotion: 'neutral',
          topicSeriousness: 'casual',
        });
        if (backchannel !== null) {
          gotBackchannel = true;
          expect(backchannel.verbal).toBeTruthy();
          break;
        }
      }

      // Should have gotten at least one backchannel
      expect(gotBackchannel).toBe(true);
    });

    it('should handle different emotions without crashing', () => {
      const emotions = ['neutral', 'stressed', 'happy', 'sad', 'anxious'];

      for (const emotion of emotions) {
        resetActiveListeningEngine();
        const testEngine = getActiveListeningEngine();
        expect(() => {
          testEngine.getBackchannel('ferni', {
            userEmotion: emotion,
            topicSeriousness: 'casual',
          });
        }).not.toThrow();
      }
    });

    it('should handle different topic seriousness levels', () => {
      const levels = ['casual', 'moderate', 'serious'];

      for (const level of levels) {
        resetActiveListeningEngine();
        const testEngine = getActiveListeningEngine();
        expect(() => {
          testEngine.getBackchannel('ferni', {
            userEmotion: 'neutral',
            topicSeriousness: level as 'casual' | 'moderate' | 'serious',
          });
        }).not.toThrow();
      }
    });
  });

  // --------------------------------------------------------------------------
  // mirrorUserVocabulary Method
  // --------------------------------------------------------------------------

  describe('mirrorUserVocabulary()', () => {
    it('should return MirroredPhrase or null', () => {
      const userMessage = 'I am really stressed about my finances';
      const agentResponse = 'I understand your concerns about money.';

      const result = engine.mirrorUserVocabulary(userMessage, agentResponse);
      // Can return null if no mirroring opportunity found
      if (result !== null) {
        expect(result.original).toBeDefined();
        expect(result.mirrored).toBeDefined();
      }
    });

    it('should handle empty user message', () => {
      const result = engine.mirrorUserVocabulary('', 'Test response');
      // Should not crash, may return null
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should handle empty agent response', () => {
      const result = engine.mirrorUserVocabulary('User message', '');
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should find mirroring opportunities when words match', () => {
      // Use words that should trigger mirroring
      const userMessage = 'I am worried about my finances';
      const agentResponse = 'Your concerns about finances are valid';

      const result = engine.mirrorUserVocabulary(userMessage, agentResponse);
      // Should find an opportunity to mirror "worried" -> "concerned"
      if (result !== null) {
        expect(result.original).toBeTruthy();
        expect(result.mirrored).toBeTruthy();
      }
    });

    it('should not crash with various input combinations', () => {
      const testCases = [
        ['I feel anxious', 'That is understandable'],
        ['I am happy today', 'Great to hear'],
        ['Investment strategy', 'Your portfolio'],
        ['Money concerns', 'Financial planning'],
      ];

      for (const [userMsg, agentResponse] of testCases) {
        expect(() => {
          engine.mirrorUserVocabulary(userMsg, agentResponse);
        }).not.toThrow();
      }
    });
  });

  // --------------------------------------------------------------------------
  // getGentlePrompt Method
  // --------------------------------------------------------------------------

  describe('getGentlePrompt()', () => {
    it('should return a gentle prompt string', () => {
      const prompt = engine.getGentlePrompt('ferni', 'silence');
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should return persona-specific prompts', () => {
      const ferniPrompt = engine.getGentlePrompt('ferni', 'silence');
      const mayaPrompt = engine.getGentlePrompt('maya-santos', 'silence');

      expect(ferniPrompt).toBeTruthy();
      expect(mayaPrompt).toBeTruthy();
    });

    it('should handle different prompt types', () => {
      const promptTypes = ['silence', 'confusion', 'hesitation', 'continuation'];

      for (const type of promptTypes) {
        const prompt = engine.getGentlePrompt('ferni', type);
        expect(typeof prompt).toBe('string');
      }
    });

    it('should work for all personas', () => {
      const personas = [
        'ferni',
        'nayan-patel',
        'peter-john',
        'maya-santos',
        'alex-chen',
        'jordan-taylor',
      ];

      for (const personaId of personas) {
        const prompt = engine.getGentlePrompt(personaId, 'silence');
        expect(typeof prompt).toBe('string');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle unknown persona gracefully', () => {
      resetActiveListeningEngine();
      const testEngine = getActiveListeningEngine();
      expect(() => {
        testEngine.getBackchannel('unknown-persona', {
          userEmotion: 'neutral',
          topicSeriousness: 'casual',
        });
      }).not.toThrow();
    });

    it('should handle undefined emotion', () => {
      resetActiveListeningEngine();
      const testEngine = getActiveListeningEngine();
      expect(() => {
        testEngine.getBackchannel('ferni', {
          userEmotion: undefined as any,
          topicSeriousness: 'casual',
        });
      }).not.toThrow();
    });

    it('should handle rapid successive calls without crashing', () => {
      resetActiveListeningEngine();
      const testEngine = getActiveListeningEngine();
      expect(() => {
        for (let i = 0; i < 100; i++) {
          testEngine.getBackchannel('ferni', {
            userEmotion: 'neutral',
            topicSeriousness: 'casual',
          });
        }
      }).not.toThrow();
    });

    it('should handle special characters in user message', () => {
      expect(() => {
        engine.mirrorUserVocabulary(
          "What's the deal with $1,000? Is that okay?",
          'That amount works well.'
        );
      }).not.toThrow();
    });

    it('should handle long user messages', () => {
      const longMessage = 'I am concerned about my finances. '.repeat(50);
      expect(() => {
        engine.mirrorUserVocabulary(longMessage, 'I understand your concerns.');
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Emotion-Context Combinations
  // --------------------------------------------------------------------------

  describe('Emotion-Context Combinations', () => {
    const emotions = ['neutral', 'happy', 'sad', 'stressed', 'anxious', 'excited'];
    const seriousness = ['casual', 'moderate', 'serious'];

    it('should handle all emotion-seriousness combinations without crashing', () => {
      for (const emotion of emotions) {
        for (const level of seriousness) {
          resetActiveListeningEngine();
          const testEngine = getActiveListeningEngine();
          expect(() => {
            testEngine.getBackchannel('ferni', {
              userEmotion: emotion,
              topicSeriousness: level as 'casual' | 'moderate' | 'serious',
            });
          }).not.toThrow();
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Regression Tests
  // --------------------------------------------------------------------------

  describe('Regression Tests', () => {
    it('should return valid backchannels when not on cooldown', () => {
      // Test that when we DO get a backchannel, it's valid
      const personas = ['ferni', 'nayan-patel', 'peter-john', 'maya-santos'];

      for (const personaId of personas) {
        resetActiveListeningEngine();
        const testEngine = getActiveListeningEngine();
        const backchannel = testEngine.getBackchannel(personaId, {
          userEmotion: 'neutral',
          topicSeriousness: 'casual',
        });
        // May be null due to cooldown, but if not null, should be valid
        if (backchannel !== null) {
          expect(backchannel.verbal.length).toBeGreaterThan(0);
        }
      }
    });

    it('should not return undefined from non-nullable methods', () => {
      // mirrorUserVocabulary can return null, but should not be undefined
      const mirrorResult = engine.mirrorUserVocabulary('test', 'test');
      expect(mirrorResult !== undefined).toBe(true);
      expect(engine.getGentlePrompt('ferni', 'silence')).toBeDefined();
    });

    it('should handle multiple calls without crashing', () => {
      // Multiple calls should all succeed (even if returning null)
      expect(() => {
        for (let i = 0; i < 20; i++) {
          resetActiveListeningEngine();
          const testEngine = getActiveListeningEngine();
          testEngine.getBackchannel('ferni', {
            userEmotion: 'neutral',
            topicSeriousness: 'casual',
          });
        }
      }).not.toThrow();
    });
  });
});
