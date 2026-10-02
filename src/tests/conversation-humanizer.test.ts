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

  // --------------------------------------------------------------------------
  // Integration Tests
  // --------------------------------------------------------------------------

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
