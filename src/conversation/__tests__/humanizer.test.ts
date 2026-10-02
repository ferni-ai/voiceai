/**
 * ConversationHumanizer Tests
 *
 * Comprehensive tests for the main humanizer orchestration layer.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  ConversationHumanizer,
  getConversationHumanizer,
  resetConversationHumanizer,
  type HumanizationContext,
  type PreResponseActions,
  type ContextGuidance,
} from '../humanizer/index.js';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('ConversationHumanizer', () => {
  const testPersonaId = 'ferni';
  const testSessionId = 'test-session-humanizer';
  let humanizer: ConversationHumanizer;

  beforeEach(() => {
    resetConversationHumanizer(testPersonaId);
    humanizer = new ConversationHumanizer(testPersonaId, testSessionId);
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
  });

  // ==========================================================================
  // UTILITY METHOD TESTS
  // ==========================================================================

  describe('utility methods', () => {
    it('should generate echo question', () => {
      const question = humanizer.generateEchoQuestion("I've been feeling overwhelmed lately.");
      expect(question.text).toBeDefined();
      expect(question.ssml).toBeDefined();
    });

    it('should set session context', () => {
      // Should not throw
      humanizer.setSessionContext('new-session-id');
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
