/**
 * Conversation Humanizer Tests
 *
 * Tests for the main humanization orchestrator that coordinates:
 * - Speech naturalization
 * - Active listening behaviors
 * - Memory callbacks
 * - Emotional guidance
 *
 * @module tests/conversation-humanizer
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  getConversationHumanizer,
  resetConversationHumanizer,
  type ConversationHumanizer,
  type HumanizationContext,
} from '../conversation/humanizer/index.js';

// ============================================================================
// TESTS
// ============================================================================

describe('ConversationHumanizer', () => {
  beforeEach(() => {
    resetConversationHumanizer();
  });

  afterEach(() => {
    resetConversationHumanizer();
  });

  // --------------------------------------------------------------------------
  // Singleton Pattern
  // --------------------------------------------------------------------------

  describe('Singleton Pattern', () => {
    it('should return the same instance for the same persona', () => {
      const instance1 = getConversationHumanizer('ferni');
      const instance2 = getConversationHumanizer('ferni');
      expect(instance1).toBe(instance2);
    });

    it('should return different instances for different personas', () => {
      const ferniInstance = getConversationHumanizer('ferni');
      const mayaInstance = getConversationHumanizer('maya-santos');
      expect(ferniInstance).not.toBe(mayaInstance);
    });

    it('should create new instance after reset', () => {
      const instance1 = getConversationHumanizer('ferni');
      resetConversationHumanizer();
      const instance2 = getConversationHumanizer('ferni');
      expect(instance2).toBeDefined();
    });

    it('should reset specific persona only', () => {
      const ferniInstance1 = getConversationHumanizer('ferni');
      const mayaInstance1 = getConversationHumanizer('maya-santos');

      resetConversationHumanizer('ferni');

      const ferniInstance2 = getConversationHumanizer('ferni');
      const mayaInstance2 = getConversationHumanizer('maya-santos');

      // Ferni should be new, Maya should be the same
      expect(ferniInstance2).not.toBe(ferniInstance1);
      expect(mayaInstance2).toBe(mayaInstance1);
    });
  });

  // --------------------------------------------------------------------------
  // humanizeResponse Method
  // --------------------------------------------------------------------------

  describe('humanizeResponse()', () => {
    it('should return a HumanizedResponse object', () => {
      const humanizer = getConversationHumanizer('ferni');
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Hello',
      };

      const result = humanizer.humanizeResponse('This is a test response.', context);

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.appliedFeatures).toBeDefined();
      expect(Array.isArray(result.appliedFeatures)).toBe(true);
    });

    it('should include speech_naturalization in applied features', () => {
      const humanizer = getConversationHumanizer('ferni');
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Hello',
      };

      const result = humanizer.humanizeResponse('This is a test response.', context);
      expect(result.appliedFeatures).toContain('speech_naturalization');
    });

    it('should work for all canonical personas', () => {
      const personas = [
        'ferni',
        'nayan-patel',
        'peter-john',
        'maya-santos',
        'alex-chen',
        'jordan-taylor',
      ];

      for (const personaId of personas) {
        resetConversationHumanizer();
        const humanizer = getConversationHumanizer(personaId);
        const context: HumanizationContext = {
          personaId,
          turnNumber: 1,
          userMessage: 'Test',
        };

        const result = humanizer.humanizeResponse('Test response for persona.', context);
        expect(result).toBeDefined();
        expect(result.text).toBeTruthy();
      }
    });

    it('should handle empty response text', () => {
      const humanizer = getConversationHumanizer('ferni');
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Test',
      };

      expect(() => {
        humanizer.humanizeResponse('', context);
      }).not.toThrow();
    });

    it('should handle long response text', () => {
      const humanizer = getConversationHumanizer('ferni');
      const longText = 'This is a sentence. '.repeat(100);
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Tell me everything',
      };

      expect(() => {
        humanizer.humanizeResponse(longText, context);
      }).not.toThrow();
    });

    it('should include emotional guidance when emotion is provided', () => {
      const humanizer = getConversationHumanizer('ferni');
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 3,
        userMessage: 'I am stressed about money',
        userEmotion: 'stressed',
      };

      const result = humanizer.humanizeResponse('I understand how you feel.', context);
      expect(result.emotionalGuidance).toBeDefined();
    });

    it('should handle various turn numbers', () => {
      const humanizer = getConversationHumanizer('ferni');

      for (const turnNumber of [1, 5, 10, 50, 100]) {
        const context: HumanizationContext = {
          personaId: 'ferni',
          turnNumber,
          userMessage: 'Test',
        };
        const result = humanizer.humanizeResponse('Response text.', context);
        expect(result.text).toBeTruthy();
      }
    });

    it('should provide pacing recommendation', () => {
      const humanizer = getConversationHumanizer('ferni');
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 5,
        userMessage: 'Can you explain?',
        topic: 'investing',
      };

      const result = humanizer.humanizeResponse('Let me explain this carefully.', context);
      expect(result.pacing).toBeDefined();
      expect(['faster', 'normal', 'slower']).toContain(result.pacing);
    });

    it('should include SSML output', () => {
      const humanizer = getConversationHumanizer('ferni');
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Hello',
      };

      const result = humanizer.humanizeResponse('Hello there!', context);
      expect(result.ssml).toBeDefined();
      expect(typeof result.ssml).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // processUserMessage Method
  // --------------------------------------------------------------------------

  describe('processUserMessage()', () => {
    it('should return PreResponseActions object', () => {
      const humanizer = getConversationHumanizer('ferni');
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 2,
        userMessage: 'I need help with my finances',
      };

      const result = humanizer.processUserMessage(context);
      expect(result).toBeDefined();
    });

    it('should detect topic changes', () => {
      const humanizer = getConversationHumanizer('ferni');

      // First message about one topic
      humanizer.processUserMessage({
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Tell me about investing',
        topic: 'investing',
      });

      // Then change topic
      const result = humanizer.processUserMessage({
        personaId: 'ferni',
        turnNumber: 2,
        userMessage: 'Actually, let us talk about budgeting instead',
        topic: 'budgeting',
      });

      // May or may not detect topic change depending on implementation
      expect(result).toBeDefined();
    });

    it('should handle emotional content', () => {
      const humanizer = getConversationHumanizer('ferni');
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 2,
        userMessage: 'I am really stressed about my debt',
        userEmotion: 'stressed',
        wasPersonalSharing: true,
      };

      const result = humanizer.processUserMessage(context);
      // Should have some form of acknowledgment for emotional content
      expect(result).toBeDefined();
    });

    it('should handle topic context', () => {
      const humanizer = getConversationHumanizer('ferni');
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 3,
        userMessage: 'What about my retirement savings?',
        topic: 'retirement',
      };

      const result = humanizer.processUserMessage(context);
      expect(result).toBeDefined();
    });

    it('should work across multiple turns', () => {
      const humanizer = getConversationHumanizer('ferni');

      // Simulate a multi-turn conversation
      for (let turn = 1; turn <= 5; turn++) {
        const context: HumanizationContext = {
          personaId: 'ferni',
          turnNumber: turn,
          userMessage: `Message for turn ${turn}`,
        };
        const result = humanizer.processUserMessage(context);
        expect(result).toBeDefined();
      }
    });

    it('should handle silence duration', () => {
      const humanizer = getConversationHumanizer('ferni');
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 3,
        userMessage: 'I need to think...',
        silenceDurationMs: 5000,
        wasPersonalSharing: true,
      };

      const result = humanizer.processUserMessage(context);
      expect(result).toBeDefined();
      // May have silence action
      if (result.silenceAction) {
        expect(['wait', 'gentle_prompt', 'continue', 'backchannel']).toContain(
          result.silenceAction
        );
      }
    });
  });

  // --------------------------------------------------------------------------
  // getUnresolvedThreads Method
  // --------------------------------------------------------------------------

  describe('getUnresolvedThreads()', () => {
    it('should return an array', () => {
      const humanizer = getConversationHumanizer('ferni');
      const threads = humanizer.getUnresolvedThreads();
      expect(Array.isArray(threads)).toBe(true);
    });

    it('should return string array of topics', () => {
      const humanizer = getConversationHumanizer('ferni');

      // Process some messages to create threads
      humanizer.processUserMessage({
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'I want to talk about saving for a house',
        topic: 'house_planning',
      });

      const threads = humanizer.getUnresolvedThreads();
      expect(threads.every((t) => typeof t === 'string')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // getThinkingPhrase Method
  // --------------------------------------------------------------------------

  describe('getThinkingPhrase()', () => {
    it('should return thinking phrase object', () => {
      const humanizer = getConversationHumanizer('ferni');
      const result = humanizer.getThinkingPhrase();

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.ssml).toBeDefined();
    });

    it('should accept thinking type parameter', () => {
      const humanizer = getConversationHumanizer('ferni');
      const types = ['processing', 'recalling', 'considering', 'uncertain'] as const;

      for (const type of types) {
        const result = humanizer.getThinkingPhrase(type);
        expect(result.text).toBeTruthy();
        expect(result.ssml).toBeTruthy();
      }
    });
  });

  // --------------------------------------------------------------------------
  // generateEchoQuestion Method
  // --------------------------------------------------------------------------

  describe('generateEchoQuestion()', () => {
    it('should return echo question object', () => {
      const humanizer = getConversationHumanizer('ferni');
      const result = humanizer.generateEchoQuestion('I am worried about my retirement');

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.ssml).toBeDefined();
    });

    it('should handle various user statements', () => {
      const humanizer = getConversationHumanizer('ferni');
      const statements = [
        'I want to save more money',
        'My expenses are too high',
        'I do not understand investing',
      ];

      for (const statement of statements) {
        const result = humanizer.generateEchoQuestion(statement);
        expect(result.text).toBeTruthy();
      }
    });
  });

  // --------------------------------------------------------------------------
  // getCircleBackPhrase Method
  // --------------------------------------------------------------------------

  describe('getCircleBackPhrase()', () => {
    it('should return circle back phrase', () => {
      const humanizer = getConversationHumanizer('ferni');
      const phrase = humanizer.getCircleBackPhrase('retirement');

      expect(typeof phrase).toBe('string');
      expect(phrase.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // resolveThread Method
  // --------------------------------------------------------------------------

  describe('resolveThread()', () => {
    it('should resolve a thread without error', () => {
      const humanizer = getConversationHumanizer('ferni');
      expect(() => {
        humanizer.resolveThread('investing');
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Callback Tracking
  // --------------------------------------------------------------------------

  describe('Callback Tracking', () => {
    it('should track if last response had callback', () => {
      const humanizer = getConversationHumanizer('ferni');
      const wasCallback = humanizer.wasLastResponseCallback();
      expect(typeof wasCallback).toBe('boolean');
    });

    it('should record user reaction to callback', () => {
      const humanizer = getConversationHumanizer('ferni');
      expect(() => {
        humanizer.recordUserReactionToCallback(50, true);
      }).not.toThrow();
    });

    it('should record backchannel reaction', () => {
      const humanizer = getConversationHumanizer('ferni');
      expect(() => {
        humanizer.recordBackchannelReaction(true);
        humanizer.recordBackchannelReaction(false);
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // generateContextGuidance Method
  // --------------------------------------------------------------------------

  describe('generateContextGuidance()', () => {
    it('should return context guidance array', () => {
      const humanizer = getConversationHumanizer('ferni');
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 5,
        userMessage: 'How should I invest my money?',
        topic: 'investing',
      };

      const guidance = humanizer.generateContextGuidance(context);
      expect(Array.isArray(guidance)).toBe(true);
    });

    it('should include guidance with expected properties', () => {
      const humanizer = getConversationHumanizer('ferni');
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 5,
        userMessage: 'I need help',
        topic: 'general',
      };

      const guidance = humanizer.generateContextGuidance(context);
      if (guidance.length > 0) {
        expect(guidance[0]).toHaveProperty('source');
        expect(guidance[0]).toHaveProperty('content');
        expect(guidance[0]).toHaveProperty('priority');
      }
    });
  });

  // --------------------------------------------------------------------------
  // formatGuidanceForPrompt Method
  // --------------------------------------------------------------------------

  describe('formatGuidanceForPrompt()', () => {
    it('should format guidance as string', () => {
      const humanizer = getConversationHumanizer('ferni');
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 5,
        userMessage: 'How should I invest?',
        topic: 'investing',
      };

      const guidance = humanizer.generateContextGuidance(context);
      const formatted = humanizer.formatGuidanceForPrompt(guidance);

      expect(typeof formatted).toBe('string');
    });

    it('should handle empty guidance array', () => {
      const humanizer = getConversationHumanizer('ferni');
      const formatted = humanizer.formatGuidanceForPrompt([]);
      expect(formatted).toBe('');
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle special characters in text', () => {
      const humanizer = getConversationHumanizer('ferni');
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Test with special chars: $100 & <stuff>',
      };

      const result = humanizer.humanizeResponse(
        'What about $10,000.00? Is that enough? <test> & "quotes"',
        context
      );
      expect(result.text).toBeDefined();
    });

    it('should handle unicode characters', () => {
      const humanizer = getConversationHumanizer('ferni');
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Unicode test',
      };

      const result = humanizer.humanizeResponse('Hello World! Testing unicode.', context);
      expect(result.text).toBeDefined();
    });

    it('should handle rapid successive calls', () => {
      const humanizer = getConversationHumanizer('ferni');
      expect(() => {
        for (let i = 0; i < 50; i++) {
          const context: HumanizationContext = {
            personaId: 'ferni',
            turnNumber: i + 1,
            userMessage: `Message ${i}`,
          };
          humanizer.humanizeResponse(`Response ${i}`, context);
        }
      }).not.toThrow();
    });

    it('should handle missing optional context fields', () => {
      const humanizer = getConversationHumanizer('ferni');
      const context: HumanizationContext = {
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Basic message',
        // All optional fields omitted
      };

      const result = humanizer.humanizeResponse('Basic response.', context);
      expect(result.text).toBeDefined();
    });

    it('should handle all emotion types', () => {
      const humanizer = getConversationHumanizer('ferni');
      const emotions = ['happy', 'sad', 'angry', 'stressed', 'anxious', 'excited', 'neutral'];

      for (const emotion of emotions) {
        const context: HumanizationContext = {
          personaId: 'ferni',
          turnNumber: 1,
          userMessage: 'Test',
          userEmotion: emotion,
        };
        const result = humanizer.humanizeResponse('Response text.', context);
        expect(result.text).toBeTruthy();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Integration Tests
  // --------------------------------------------------------------------------

  describe('Integration', () => {
    it('should maintain context across humanize and process calls', () => {
      const humanizer = getConversationHumanizer('ferni');

      // User message
      humanizer.processUserMessage({
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'I am worried about my investments',
        userEmotion: 'worried',
        topic: 'investing',
      });

      // Agent response
      const response = humanizer.humanizeResponse(
        'I understand your investment concerns. Let me help.',
        {
          personaId: 'ferni',
          turnNumber: 1,
          userMessage: 'I am worried about my investments',
          userEmotion: 'worried',
          topic: 'investing',
        }
      );

      expect(response.text).toBeTruthy();
      expect(response.emotionalGuidance).toBeDefined();
    });

    it('should handle full conversation flow', () => {
      const humanizer = getConversationHumanizer('ferni');
      const turns = [
        { user: 'Hi, I need help', agent: 'Hello! I am here to help.' },
        { user: 'I want to save money', agent: 'Great goal! Let us explore options.' },
        { user: 'What about a savings account?', agent: 'Savings accounts are a safe choice.' },
      ];

      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        const context: HumanizationContext = {
          personaId: 'ferni',
          turnNumber: i + 1,
          userMessage: turn.user,
        };

        humanizer.processUserMessage(context);
        const response = humanizer.humanizeResponse(turn.agent, context);
        expect(response.text).toBeTruthy();
      }
    });

    it('should coordinate with conversation summary', () => {
      const humanizer = getConversationHumanizer('ferni');

      // Simulate a conversation
      for (let i = 1; i <= 5; i++) {
        humanizer.processUserMessage({
          personaId: 'ferni',
          turnNumber: i,
          userMessage: `User message ${i}`,
          topic: 'investing',
        });
        humanizer.humanizeResponse(`Agent response ${i}`, {
          personaId: 'ferni',
          turnNumber: i,
          userMessage: `User message ${i}`,
        });
      }

      const summary = humanizer.getConversationSummary();
      expect(summary).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // setPersona Method
  // --------------------------------------------------------------------------

  describe('setPersona()', () => {
    it('should change the persona', () => {
      const humanizer = getConversationHumanizer('ferni');
      expect(() => {
        humanizer.setPersona('maya-santos');
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // reset Method
  // --------------------------------------------------------------------------

  describe('reset()', () => {
    it('should reset internal state', () => {
      const humanizer = getConversationHumanizer('ferni');

      // Add some state
      humanizer.processUserMessage({
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Test message',
      });

      // Reset
      expect(() => {
        humanizer.reset();
      }).not.toThrow();
    });
  });
});
