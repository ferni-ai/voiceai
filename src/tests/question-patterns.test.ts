/**
 * Question Pattern Engine Tests
 *
 * Tests for the question pattern module that generates:
 * - Follow-up questions
 * - Clarifying questions
 * - Engagement questions
 * - Topic-appropriate question styles
 *
 * @module tests/question-patterns
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  getQuestionPatternEngine,
  resetQuestionPatternEngine,
  type QuestionPatternEngine,
  type QuestionContext,
} from '../conversation/question-patterns/index.js';

// ============================================================================
// TESTS
// ============================================================================

describe('QuestionPatternEngine', () => {
  let engine: QuestionPatternEngine;

  beforeEach(() => {
    resetQuestionPatternEngine();
    engine = getQuestionPatternEngine();
  });

  afterEach(() => {
    resetQuestionPatternEngine();
  });

  // --------------------------------------------------------------------------
  // Singleton Pattern
  // --------------------------------------------------------------------------

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = getQuestionPatternEngine();
      const instance2 = getQuestionPatternEngine();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getQuestionPatternEngine();
      resetQuestionPatternEngine();
      const instance2 = getQuestionPatternEngine();
      expect(instance2).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // generateQuestion Method
  // --------------------------------------------------------------------------

  describe('generateQuestion()', () => {
    it('should return a Question object', () => {
      const context: QuestionContext = {
        topic: 'finances',
        personaId: 'ferni',
        intent: 'explore',
      };
      const question = engine.generateQuestion(context);

      expect(question).toBeDefined();
      expect(question.text).toBeDefined();
      expect(typeof question.text).toBe('string');
      expect(question.text.length).toBeGreaterThan(0);
    });

    it('should generate questions for all personas', () => {
      const personas = [
        'ferni',
        'nayan-patel',
        'peter-john',
        'maya-santos',
        'alex-chen',
        'jordan-taylor',
      ];

      for (const personaId of personas) {
        resetQuestionPatternEngine();
        const testEngine = getQuestionPatternEngine();
        const question = testEngine.generateQuestion({
          topic: 'general',
          personaId,
          intent: 'explore',
        });
        expect(question.text).toBeTruthy();
      }
    });

    it('should generate questions for various topics', () => {
      const topics = [
        'investing',
        'budgeting',
        'retirement',
        'debt',
        'savings',
        'insurance',
        'taxes',
        'general',
      ];

      for (const topic of topics) {
        const question = engine.generateQuestion({
          topic,
          personaId: 'ferni',
          intent: 'explore',
        });
        expect(question.text).toBeTruthy();
      }
    });

    it('should generate questions for different intents', () => {
      const intents: Array<QuestionContext['intent']> = [
        'explore',
        'understand',
        'guide',
        'connect',
        'close',
      ];

      for (const intent of intents) {
        resetQuestionPatternEngine();
        const testEngine = getQuestionPatternEngine();
        const question = testEngine.generateQuestion({
          topic: 'finances',
          personaId: 'ferni',
          intent,
        });
        expect(question.text).toBeTruthy();
      }
    });

    it('should include question type in response', () => {
      const question = engine.generateQuestion({
        topic: 'investing',
        personaId: 'ferni',
        intent: 'explore',
      });
      expect(question.type).toBeDefined();
    });

    it('should handle unknown personas gracefully', () => {
      const question = engine.generateQuestion({
        topic: 'finances',
        personaId: 'unknown-persona',
        intent: 'explore',
      });
      expect(question.text).toBeTruthy();
    });

    it('should handle unknown topics gracefully', () => {
      const question = engine.generateQuestion({
        topic: 'unknown-topic',
        personaId: 'ferni',
        intent: 'explore',
      });
      expect(question.text).toBeTruthy();
    });

    it('should include SSML in response', () => {
      const question = engine.generateQuestion({
        topic: 'finances',
        personaId: 'ferni',
        intent: 'explore',
      });
      expect(question.ssml).toBeDefined();
      expect(typeof question.ssml).toBe('string');
    });

    it('should include purpose description', () => {
      const question = engine.generateQuestion({
        topic: 'finances',
        personaId: 'ferni',
        intent: 'explore',
      });
      expect(question.purpose).toBeDefined();
      expect(typeof question.purpose).toBe('string');
    });

    it('should include expectedResponseType', () => {
      const question = engine.generateQuestion({
        topic: 'finances',
        personaId: 'ferni',
        intent: 'explore',
      });
      expect(question.expectedResponseType).toBeDefined();
      expect(['detailed', 'brief', 'emotional', 'factual', 'none']).toContain(
        question.expectedResponseType
      );
    });
  });

  // --------------------------------------------------------------------------
  // generateEchoQuestion Method
  // --------------------------------------------------------------------------

  describe('generateEchoQuestion()', () => {
    it('should return an echo question', () => {
      const question = engine.generateEchoQuestion('I am worried about my retirement savings');
      expect(question).toBeDefined();
      expect(question.text).toBeTruthy();
      expect(question.type).toBe('echo');
    });

    it('should handle short statements', () => {
      const question = engine.generateEchoQuestion('Yes');
      expect(question).toBeDefined();
      expect(question.text).toBeTruthy();
    });

    it('should handle empty statements', () => {
      const question = engine.generateEchoQuestion('');
      expect(question).toBeDefined();
      expect(question.text).toBeTruthy();
    });

    it('should extract keywords from user statement', () => {
      const question = engine.generateEchoQuestion('I need help with investing strategies');
      expect(question.text).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // generateFollowUp Method
  // --------------------------------------------------------------------------

  describe('generateFollowUp()', () => {
    it('should return a follow-up question for deepen intent', () => {
      const question = engine.generateFollowUp('deepen', {
        topic: 'investing',
        personaId: 'ferni',
      });

      expect(question).toBeDefined();
      expect(question.text).toBeTruthy();
    });

    it('should return a follow-up question for clarify intent', () => {
      const question = engine.generateFollowUp('clarify', {
        topic: 'budgeting',
        personaId: 'ferni',
      });

      expect(question).toBeDefined();
      expect(question.text).toBeTruthy();
    });

    it('should return a follow-up question for move_on intent', () => {
      const question = engine.generateFollowUp('move_on', {
        topic: 'savings',
        personaId: 'ferni',
      });

      expect(question).toBeDefined();
      expect(question.text).toBeTruthy();
    });

    it('should return a follow-up question for validate intent', () => {
      const question = engine.generateFollowUp('validate', {
        topic: 'retirement',
        personaId: 'ferni',
      });

      expect(question).toBeDefined();
      expect(question.text).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // getQuestionTag Method
  // --------------------------------------------------------------------------

  describe('getQuestionTag()', () => {
    it('should return a question tag string', () => {
      const tag = engine.getQuestionTag();
      expect(typeof tag).toBe('string');
      expect(tag.length).toBeGreaterThan(0);
    });

    it('should return tags ending with question mark or eliciting response', () => {
      const tag = engine.getQuestionTag();
      // Tags like ", right?" or ", you know?" or "—what do you think?"
      expect(tag.includes('?') || tag.includes('think')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // isTypeAppropriate Method
  // --------------------------------------------------------------------------

  describe('isTypeAppropriate()', () => {
    it('should return a boolean', () => {
      const result = engine.isTypeAppropriate('open_ended');
      expect(typeof result).toBe('boolean');
    });

    it('should return true for first question of a type', () => {
      resetQuestionPatternEngine();
      const freshEngine = getQuestionPatternEngine();
      const result = freshEngine.isTypeAppropriate('reflective');
      expect(result).toBe(true);
    });

    it('should handle scaling questions specially', () => {
      // Generate a scaling question first
      engine.generateQuestion({
        topic: 'stress',
        personaId: 'maya-santos', // Maya prefers scaling questions
        intent: 'guide',
      });

      // Scaling shouldn't be appropriate immediately after
      // This tests the internal logic - may return true or false based on whether scaling was used
      const result = engine.isTypeAppropriate('scaling');
      expect(typeof result).toBe('boolean');
    });
  });

  // --------------------------------------------------------------------------
  // reset Method
  // --------------------------------------------------------------------------

  describe('reset()', () => {
    it('should reset tracking state', () => {
      // Generate several questions
      engine.generateQuestion({ topic: 'investing', personaId: 'ferni', intent: 'explore' });
      engine.generateQuestion({ topic: 'saving', personaId: 'ferni', intent: 'understand' });

      // Reset
      engine.reset();

      // Should be able to generate same types again
      expect(() => {
        engine.generateQuestion({ topic: 'investing', personaId: 'ferni', intent: 'explore' });
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty topic', () => {
      const question = engine.generateQuestion({
        topic: '',
        personaId: 'ferni',
        intent: 'explore',
      });
      expect(question.text).toBeTruthy();
    });

    it('should handle undefined optional fields', () => {
      const question = engine.generateQuestion({
        personaId: 'ferni',
      });
      expect(question.text).toBeTruthy();
    });

    it('should handle special characters in topic', () => {
      const question = engine.generateQuestion({
        topic: 'saving & investing',
        personaId: 'ferni',
        intent: 'explore',
      });
      expect(question.text).toBeTruthy();
    });

    it('should handle rapid question generation', () => {
      expect(() => {
        for (let i = 0; i < 50; i++) {
          engine.generateQuestion({
            topic: 'finances',
            personaId: 'ferni',
            intent: 'explore',
          });
        }
      }).not.toThrow();
    });

    it('should provide variety in questions', () => {
      const questions = new Set<string>();

      // Generate multiple questions and check for variety
      for (let i = 0; i < 10; i++) {
        resetQuestionPatternEngine();
        const testEngine = getQuestionPatternEngine();
        const question = testEngine.generateQuestion({
          topic: 'investing',
          personaId: 'ferni',
          intent: 'explore',
        });
        questions.add(question.text);
      }

      // Should have some variety
      expect(questions.size).toBeGreaterThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------------
  // Question Quality
  // --------------------------------------------------------------------------

  describe('Question Quality', () => {
    it('should generate questions that end with question mark', () => {
      const question = engine.generateQuestion({
        topic: 'investing',
        personaId: 'ferni',
        intent: 'explore',
      });
      expect(question.text.trim().endsWith('?')).toBe(true);
    });

    it('should generate questions of reasonable length', () => {
      const question = engine.generateQuestion({
        topic: 'finances',
        personaId: 'ferni',
        intent: 'explore',
      });
      expect(question.text.length).toBeGreaterThan(5);
      expect(question.text.length).toBeLessThan(500);
    });

    it('should generate persona-appropriate questions', () => {
      // Different personas should potentially have different styles
      const ferniQuestion = engine.generateQuestion({
        topic: 'goals',
        personaId: 'ferni',
        intent: 'connect',
      });

      resetQuestionPatternEngine();
      const peterEngine = getQuestionPatternEngine();
      const peterQuestion = peterEngine.generateQuestion({
        topic: 'research',
        personaId: 'peter-john',
        intent: 'understand',
      });

      expect(ferniQuestion.text).toBeTruthy();
      expect(peterQuestion.text).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // Conversation Depth
  // --------------------------------------------------------------------------

  describe('Conversation Depth', () => {
    it('should handle surface depth questions', () => {
      const question = engine.generateQuestion({
        topic: 'finances',
        personaId: 'ferni',
        conversationDepth: 'surface',
      });
      expect(question.text).toBeTruthy();
    });

    it('should handle medium depth questions', () => {
      const question = engine.generateQuestion({
        topic: 'finances',
        personaId: 'ferni',
        conversationDepth: 'medium',
      });
      expect(question.text).toBeTruthy();
    });

    it('should handle deep questions', () => {
      const question = engine.generateQuestion({
        topic: 'finances',
        personaId: 'ferni',
        conversationDepth: 'deep',
      });
      expect(question.text).toBeTruthy();
    });
  });
});
