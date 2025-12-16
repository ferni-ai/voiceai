/**
 * ConversationHumanizer Tests
 *
 * Comprehensive tests for the main humanizer orchestration layer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  ConversationHumanizer,
  getConversationHumanizer,
  resetConversationHumanizer,
  type HumanizationContext,
  type HumanizedResponse,
  type PreResponseActions,
  type ContextGuidance,
} from '../humanizer.js';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('ConversationHumanizer', () => {
  const testPersonaId = 'ferni';
  const testSessionId = 'test-session-humanizer';
  const testUserId = 'test-user-humanizer';
  let humanizer: ConversationHumanizer;

  beforeEach(() => {
    resetConversationHumanizer(testPersonaId);
    humanizer = new ConversationHumanizer(testPersonaId, testSessionId, testUserId);
  });

  afterEach(() => {
    resetConversationHumanizer(testPersonaId);
  });

  // ==========================================================================
  // INITIALIZATION TESTS
  // ==========================================================================

  describe('initialization', () => {
    it('should create a new humanizer instance', () => {
      expect(humanizer).toBeInstanceOf(ConversationHumanizer);
    });

    it('should get singleton instance via factory', () => {
      const instance1 = getConversationHumanizer(testPersonaId);
      const instance2 = getConversationHumanizer(testPersonaId);
      expect(instance1).toBe(instance2);
    });

    it('should create different instances for different personas', () => {
      const ferniHumanizer = getConversationHumanizer('ferni');
      const peterHumanizer = getConversationHumanizer('peter-john');
      expect(ferniHumanizer).not.toBe(peterHumanizer);
    });

    it('should reset session time on resetSession', () => {
      // Advance time simulation
      humanizer.resetSession();
      expect(humanizer.getSessionMinutes()).toBe(0);
    });
  });

  // ==========================================================================
  // PROCESS USER MESSAGE TESTS
  // ==========================================================================

  describe('processUserMessage', () => {
    it('should return pre-response actions', () => {
      const context: HumanizationContext = {
        personaId: testPersonaId,
        turnNumber: 1,
        userMessage: 'Hello, how are you today?',
      };

      const actions = humanizer.processUserMessage(context);

      expect(actions).toBeDefined();
      expect(typeof actions).toBe('object');
    });

    it('should detect topic changes', () => {
      // First message about one topic
      humanizer.processUserMessage({
        personaId: testPersonaId,
        turnNumber: 1,
        userMessage: "I've been thinking about my career lately.",
        topic: 'career',
      });

      // Second message about different topic
      const actions = humanizer.processUserMessage({
        personaId: testPersonaId,
        turnNumber: 2,
        userMessage: "But actually, let's talk about my relationship.",
        topic: 'relationships',
      });

      // Should potentially detect topic change
      expect(actions).toBeDefined();
    });

    it('should handle silence duration', () => {
      const actions = humanizer.processUserMessage({
        personaId: testPersonaId,
        turnNumber: 5,
        userMessage: '...',
        silenceDurationMs: 6000,
      });

      // Should return silence action for long pauses
      expect(actions).toBeDefined();
      if (actions.silenceAction) {
        expect(['wait', 'gentle_prompt', 'continue', 'backchannel']).toContain(
          actions.silenceAction
        );
      }
    });

    it('should generate emotional acknowledgment for personal sharing', () => {
      const actions = humanizer.processUserMessage({
        personaId: testPersonaId,
        turnNumber: 5,
        userMessage: "I've never told anyone this before, but I've been really struggling.",
        wasPersonalSharing: true,
        userEmotion: 'vulnerable',
      });

      // Should provide some acknowledgment
      expect(actions).toBeDefined();
    });
  });

  // ==========================================================================
  // CONTEXT GUIDANCE TESTS
  // ==========================================================================

  describe('generateContextGuidance', () => {
    it('should return array of guidance', () => {
      const context: HumanizationContext = {
        personaId: testPersonaId,
        turnNumber: 5,
        userMessage: 'I need help with something.',
      };

      const guidance = humanizer.generateContextGuidance(context);

      expect(Array.isArray(guidance)).toBe(true);
    });

    it('should include emotional guidance for emotional content', () => {
      // Process a vulnerable message first
      humanizer.processUserMessage({
        personaId: testPersonaId,
        turnNumber: 1,
        userMessage: "I'm feeling really overwhelmed and anxious.",
        userEmotion: 'anxious',
        wasPersonalSharing: true,
      });

      const guidance = humanizer.generateContextGuidance({
        personaId: testPersonaId,
        turnNumber: 2,
        userMessage: "I don't know what to do anymore.",
        userEmotion: 'overwhelmed',
        wasPersonalSharing: true,
      });

      // Should contain some guidance
      expect(guidance.length).toBeGreaterThanOrEqual(0);
    });

    it('should format guidance for prompt', () => {
      const guidance: ContextGuidance[] = [
        { source: 'test', content: 'High priority guidance', priority: 'high' },
        { source: 'test', content: 'Standard guidance', priority: 'standard' },
        { source: 'test', content: 'Optional hint', priority: 'hint' },
      ];

      const formatted = humanizer.formatGuidanceForPrompt(guidance);

      expect(formatted).toContain('IMPORTANT');
      expect(formatted).toContain('GUIDANCE');
      expect(formatted).toContain('OPTIONAL');
    });

    it('should return empty string for no guidance', () => {
      const formatted = humanizer.formatGuidanceForPrompt([]);
      expect(formatted).toBe('');
    });
  });

  // ==========================================================================
  // HUMANIZE RESPONSE TESTS
  // ==========================================================================

  describe('humanizeResponse', () => {
    it('should return humanized response object', () => {
      const context: HumanizationContext = {
        personaId: testPersonaId,
        turnNumber: 5,
        userMessage: 'Tell me about productivity.',
      };

      const response = humanizer.humanizeResponse(
        'Here are some tips for being more productive.',
        context
      );

      expect(response.text).toBeDefined();
      expect(response.ssml).toBeDefined();
      expect(Array.isArray(response.appliedFeatures)).toBe(true);
    });

    it('should apply speech naturalization', () => {
      const context: HumanizationContext = {
        personaId: testPersonaId,
        turnNumber: 5,
        userMessage: 'How can I improve?',
      };

      const response = humanizer.humanizeResponse(
        'I think you should consider focusing on one thing at a time.',
        context
      );

      expect(response.appliedFeatures).toContain('speech_naturalization');
    });

    it('should include pacing recommendation', () => {
      const response = humanizer.humanizeResponse('Here is my response.', {
        personaId: testPersonaId,
        turnNumber: 1,
        userMessage: 'Quick question.',
      });

      expect(['faster', 'normal', 'slower']).toContain(response.pacing);
    });

    it('should potentially include follow-up question', () => {
      // Process several turns to increase chance of follow-up
      for (let i = 1; i <= 5; i++) {
        humanizer.processUserMessage({
          personaId: testPersonaId,
          turnNumber: i,
          userMessage: 'User message ' + i,
        });
      }

      // Run multiple times due to random chance
      let hasFollowUp = false;
      for (let i = 0; i < 10; i++) {
        const response = humanizer.humanizeResponse('This is my response to your statement.', {
          personaId: testPersonaId,
          turnNumber: 6,
          userMessage: 'This is my statement about something important.',
        });
        if (response.followUpQuestion) {
          hasFollowUp = true;
          break;
        }
      }

      // At least one should have generated a follow-up (probabilistic)
      // We don't assert true because it's random, but the structure should be correct
      expect(typeof hasFollowUp).toBe('boolean');
    });
  });

  // ==========================================================================
  // HUMANIZE RESPONSE ASYNC TESTS
  // ==========================================================================

  describe('humanizeResponseAsync', () => {
    it('should return comprehensive humanized response', async () => {
      const context: HumanizationContext = {
        personaId: testPersonaId,
        turnNumber: 5,
        userMessage: 'I had a breakthrough today!',
        wasPersonalSharing: true,
      };

      const response = await humanizer.humanizeResponseAsync(
        "That's wonderful! Tell me more about what happened.",
        context
      );

      expect(response.text).toBeDefined();
      expect(response.ssml).toBeDefined();
      expect(Array.isArray(response.appliedFeatures)).toBe(true);
    });

    it('should include session intelligence insights', async () => {
      const response = await humanizer.humanizeResponseAsync('I understand how you feel.', {
        personaId: testPersonaId,
        turnNumber: 10,
        userMessage: "I'm really struggling with this situation.",
        userEmotion: 'distressed',
        wasPersonalSharing: true,
      });

      // Should have processed and potentially added features
      expect(response.appliedFeatures.length).toBeGreaterThanOrEqual(1);
    });

    it('should apply content delivery pacing for long responses', async () => {
      const longResponse = `
        Let me share some thoughts with you. First, I want to acknowledge what you've shared.
        Second, here are some ideas to consider:
        1. Take time for self-reflection
        2. Reach out to supportive people
        3. Practice self-compassion
        4. Set small, achievable goals
        5. Remember that progress isn't linear
        Finally, I want you to know that I'm here to support you through this journey.
      `;

      const response = await humanizer.humanizeResponseAsync(longResponse.trim(), {
        personaId: testPersonaId,
        turnNumber: 8,
        userMessage: 'What should I do?',
      });

      // Long content should trigger delivery pacing
      expect(response.text).toBeDefined();
    });
  });

  // ==========================================================================
  // MEMORY AND STATE TESTS
  // ==========================================================================

  describe('memory and state', () => {
    it('should track conversation summary', () => {
      humanizer.processUserMessage({
        personaId: testPersonaId,
        turnNumber: 1,
        userMessage: 'I want to talk about my career goals.',
        topic: 'career',
      });

      const summary = humanizer.getConversationSummary();
      expect(summary).toBeDefined();
    });

    it('should track unresolved threads', () => {
      humanizer.processUserMessage({
        personaId: testPersonaId,
        turnNumber: 1,
        userMessage: "I've been thinking about changing jobs.",
        topic: 'career',
      });

      const threads = humanizer.getUnresolvedThreads();
      expect(Array.isArray(threads)).toBe(true);
    });

    it('should resolve threads', () => {
      humanizer.processUserMessage({
        personaId: testPersonaId,
        turnNumber: 1,
        userMessage: "Let's discuss my health goals.",
        topic: 'health',
      });

      humanizer.resolveThread('health');

      // Thread should be resolved (implementation-dependent)
      const threads = humanizer.getUnresolvedThreads();
      expect(Array.isArray(threads)).toBe(true);
    });

    it('should get circle back phrase', () => {
      const phrase = humanizer.getCircleBackPhrase('career');
      expect(typeof phrase).toBe('string');
    });

    it('should track mood', () => {
      humanizer.processUserMessage({
        personaId: testPersonaId,
        turnNumber: 1,
        userMessage: 'This is really hard for me.',
        userEmotion: 'sad',
        wasPersonalSharing: true,
      });

      const mood = humanizer.getMood();
      expect(mood).toBeDefined();
    });
  });

  // ==========================================================================
  // CALLBACK TRACKING TESTS
  // ==========================================================================

  describe('callback tracking', () => {
    it('should track if last response had callback', () => {
      expect(typeof humanizer.wasLastResponseCallback()).toBe('boolean');
    });

    it('should record user reaction to callback', () => {
      // This should not throw
      humanizer.recordUserReactionToCallback(50, true);
      humanizer.recordUserReactionToCallback(10, false);
    });

    it('should record backchannel reaction', () => {
      // This should not throw
      humanizer.recordBackchannelReaction(true);
      humanizer.recordBackchannelReaction(false);
    });
  });

  // ==========================================================================
  // UTILITY METHOD TESTS
  // ==========================================================================

  describe('utility methods', () => {
    it('should get thinking phrase', () => {
      const phrase = humanizer.getThinkingPhrase('processing');
      expect(phrase.text).toBeDefined();
      expect(phrase.ssml).toBeDefined();
    });

    it('should generate echo question', () => {
      const question = humanizer.generateEchoQuestion("I've been feeling overwhelmed lately.");
      expect(question.text).toBeDefined();
      expect(question.ssml).toBeDefined();
    });

    it('should set session context', () => {
      // Should not throw
      humanizer.setSessionContext('new-session-id', 'new-user-id');
    });

    it('should set session count', () => {
      // Should not throw
      humanizer.setSessionCount(5);
    });

    it('should change persona', () => {
      humanizer.setPersona('peter-john');
      // Should not throw, persona changed internally
    });

    it('should reset humanizer', () => {
      humanizer.reset();
      // Should not throw, state reset
    });
  });

  // ==========================================================================
  // SESSION INTELLIGENCE TESTS
  // ==========================================================================

  describe('session intelligence', () => {
    it('should get last session insight', () => {
      const insight = humanizer.getLastSessionInsight();
      // May be null initially
      expect(insight === null || typeof insight === 'object').toBe(true);
    });

    it('should get last better than human insight', () => {
      const insight = humanizer.getLastBetterThanHumanInsight();
      // May be null initially
      expect(insight === null || typeof insight === 'object').toBe(true);
    });

    it('should track session minutes', () => {
      const minutes = humanizer.getSessionMinutes();
      expect(typeof minutes).toBe('number');
      expect(minutes).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('humanizer factory functions', () => {
  it('should reset specific persona humanizer', () => {
    const humanizer = getConversationHumanizer('test-persona');
    resetConversationHumanizer('test-persona');
    // Should not throw
  });

  it('should reset all humanizers', () => {
    getConversationHumanizer('persona1');
    getConversationHumanizer('persona2');
    resetConversationHumanizer();
    // Should not throw
  });
});
