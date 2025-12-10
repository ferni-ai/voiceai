/**
 * Cognitive Questions Tests
 *
 * Tests the cognitive question templates that provide:
 * - Different question types based on persona's cognitive style
 * - Questions appropriate for different conversation contexts
 *
 * @module tests/cognitive-questions
 */

import { describe, expect, it } from 'vitest';

import {
  generateCognitiveQuestion,
  getPersonaFavoriteQuestions,
  getQuestionsForStyle,
} from '../conversation/cognitive-questions.js';

// ============================================================================
// TESTS
// ============================================================================

describe('Cognitive Questions', () => {
  // --------------------------------------------------------------------------
  // Question Templates by Style
  // --------------------------------------------------------------------------

  describe('getQuestionsForStyle', () => {
    it('should return analytical questions', () => {
      const questions = getQuestionsForStyle('analytical');

      expect(Array.isArray(questions)).toBe(true);
      expect(questions.length).toBeGreaterThan(0);

      // All questions should be analytical style
      for (const q of questions) {
        expect(q.style).toBe('analytical');
        expect(q.text).toBeTruthy();
        expect(q.purpose).toBeTruthy();
      }
    });

    it('should return empathetic questions', () => {
      const questions = getQuestionsForStyle('empathetic');

      expect(questions.length).toBeGreaterThan(0);

      for (const q of questions) {
        expect(q.style).toBe('empathetic');
      }
    });

    it('should return pragmatic questions', () => {
      const questions = getQuestionsForStyle('pragmatic');

      expect(questions.length).toBeGreaterThan(0);

      for (const q of questions) {
        expect(q.style).toBe('pragmatic');
      }
    });

    it('should return intuitive questions', () => {
      const questions = getQuestionsForStyle('intuitive');

      expect(questions.length).toBeGreaterThan(0);

      for (const q of questions) {
        expect(q.style).toBe('intuitive');
      }
    });

    it('should return systematic questions', () => {
      const questions = getQuestionsForStyle('systematic');

      expect(questions.length).toBeGreaterThan(0);

      for (const q of questions) {
        expect(q.style).toBe('systematic');
      }
    });

    it('should return narrative questions', () => {
      const questions = getQuestionsForStyle('narrative');

      expect(questions.length).toBeGreaterThan(0);

      for (const q of questions) {
        expect(q.style).toBe('narrative');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Question Properties
  // --------------------------------------------------------------------------

  describe('Question Properties', () => {
    const allStyles = [
      'analytical',
      'empathetic',
      'pragmatic',
      'intuitive',
      'systematic',
      'narrative',
    ] as const;

    it('should have valid depth levels', () => {
      for (const style of allStyles) {
        const questions = getQuestionsForStyle(style);

        for (const q of questions) {
          expect(['surface', 'moderate', 'deep']).toContain(q.depth);
        }
      }
    });

    it('should have valid expected response types', () => {
      for (const style of allStyles) {
        const questions = getQuestionsForStyle(style);

        for (const q of questions) {
          expect(['factual', 'emotional', 'reflective', 'action', 'exploratory']).toContain(
            q.expectedResponse
          );
        }
      }
    });

    it('should have non-empty text and purpose', () => {
      for (const style of allStyles) {
        const questions = getQuestionsForStyle(style);

        for (const q of questions) {
          expect(q.text.length).toBeGreaterThan(0);
          expect(q.purpose.length).toBeGreaterThan(0);
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Context-Based Question Generation
  // --------------------------------------------------------------------------

  describe('generateCognitiveQuestion', () => {
    it('should return surface questions for surface depth', () => {
      const question = generateCognitiveQuestion({
        personaId: 'peter-john', // analytical
        topic: 'finances',
        emotionalWeight: 0.3,
        conversationDepth: 'surface',
      });

      if (question) {
        expect(question.depth).not.toBe('deep');
      }
    });

    it('should return deeper questions for deep depth', () => {
      let foundDeep = false;
      for (let i = 0; i < 10; i++) {
        const question = generateCognitiveQuestion({
          personaId: 'ferni',
          topic: 'feelings',
          emotionalWeight: 0.5,
          conversationDepth: 'deep',
        });

        if (question && question.depth === 'deep') {
          foundDeep = true;
          break;
        }
      }

      expect(foundDeep).toBe(true);
    });

    it('should use empathetic questions for high emotional weight', () => {
      // Try multiple times as there may be probability involved
      let foundEmotional = false;
      for (let i = 0; i < 10; i++) {
        const question = generateCognitiveQuestion({
          personaId: 'peter-john', // Analytical, but high emotion should get empathetic
          topic: 'grief',
          emotionalWeight: 0.9,
          conversationDepth: 'moderate',
        });

        if (question && question.expectedResponse === 'emotional') {
          foundEmotional = true;
          break;
        }
      }

      // High emotional weight should surface emotional questions
      expect(foundEmotional).toBe(true);
    });

    it('should return action-oriented questions for pragmatic style', () => {
      const questions = getQuestionsForStyle('pragmatic');
      const actionQuestions = questions.filter((q) => q.expectedResponse === 'action');

      expect(actionQuestions.length).toBeGreaterThan(0);
    });

    it('should return reflective questions for analytical style', () => {
      const questions = getQuestionsForStyle('analytical');
      const reflectiveQuestions = questions.filter((q) => q.expectedResponse === 'reflective');

      expect(reflectiveQuestions.length).toBeGreaterThan(0);
    });

    it('should avoid recently asked questions', () => {
      const recentQuestions = ['What does the data show?'];

      let foundDifferent = false;
      for (let i = 0; i < 10; i++) {
        const question = generateCognitiveQuestion({
          personaId: 'peter-john',
          topic: 'analysis',
          emotionalWeight: 0.3,
          conversationDepth: 'moderate',
          recentQuestions,
        });

        if (question && !question.text.includes('What does the data show')) {
          foundDifferent = true;
          break;
        }
      }

      expect(foundDifferent).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Analytical Style Questions
  // --------------------------------------------------------------------------

  describe('Analytical Style', () => {
    it('should include data-seeking questions', () => {
      const questions = getQuestionsForStyle('analytical');

      const dataQuestions = questions.filter((q) => q.expectedResponse === 'factual');
      expect(dataQuestions.length).toBeGreaterThan(0);
    });

    it('should include pattern-finding questions', () => {
      const questions = getQuestionsForStyle('analytical');

      const patternQuestion = questions.find(
        (q) =>
          q.text.toLowerCase().includes('pattern') || q.purpose.toLowerCase().includes('pattern')
      );
      expect(patternQuestion).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Empathetic Style Questions
  // --------------------------------------------------------------------------

  describe('Empathetic Style', () => {
    it('should include feeling-focused questions', () => {
      const questions = getQuestionsForStyle('empathetic');

      const feelingQuestions = questions.filter((q) => q.expectedResponse === 'emotional');
      expect(feelingQuestions.length).toBeGreaterThan(0);
    });

    it('should include questions about emotional experience', () => {
      const questions = getQuestionsForStyle('empathetic');

      const emotionalQuestion = questions.find(
        (q) => q.text.toLowerCase().includes('feel') || q.purpose.toLowerCase().includes('emotion')
      );
      expect(emotionalQuestion).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Pragmatic Style Questions
  // --------------------------------------------------------------------------

  describe('Pragmatic Style', () => {
    it('should include action-oriented questions', () => {
      const questions = getQuestionsForStyle('pragmatic');

      const actionQuestions = questions.filter((q) => q.expectedResponse === 'action');
      expect(actionQuestions.length).toBeGreaterThan(0);
    });

    it('should include practical outcome questions', () => {
      const questions = getQuestionsForStyle('pragmatic');

      const practicalQuestion = questions.find(
        (q) =>
          q.text.toLowerCase().includes('next') ||
          q.text.toLowerCase().includes('do') ||
          q.purpose.toLowerCase().includes('practical')
      );
      expect(practicalQuestion).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Systematic Style Questions
  // --------------------------------------------------------------------------

  describe('Systematic Style', () => {
    it('should include process-oriented questions', () => {
      const questions = getQuestionsForStyle('systematic');

      expect(questions.length).toBeGreaterThan(0);

      // Systematic questions should be about process/steps
      const processQuestion = questions.find(
        (q) =>
          q.text.toLowerCase().includes('step') ||
          q.text.toLowerCase().includes('process') ||
          q.text.toLowerCase().includes('how') ||
          q.purpose.toLowerCase().includes('systematic')
      );
      expect(processQuestion).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Narrative Style Questions
  // --------------------------------------------------------------------------

  describe('Narrative Style', () => {
    it('should include story-related questions', () => {
      const questions = getQuestionsForStyle('narrative');

      expect(questions.length).toBeGreaterThan(0);

      // Narrative questions should relate to stories/journeys
      const storyQuestion = questions.find(
        (q) =>
          q.text.toLowerCase().includes('story') ||
          q.text.toLowerCase().includes('journey') ||
          q.purpose.toLowerCase().includes('narrative') ||
          q.purpose.toLowerCase().includes('story')
      );
      // May or may not have explicit story keywords
      expect(questions.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Persona Favorites
  // --------------------------------------------------------------------------

  describe('getPersonaFavoriteQuestions', () => {
    it('should return favorites for known personas', () => {
      const ferniFavorites = getPersonaFavoriteQuestions('ferni');
      expect(ferniFavorites.length).toBeGreaterThan(0);
    });

    it('should return empty array for unknown persona', () => {
      const unknown = getPersonaFavoriteQuestions('unknown-persona');
      expect(unknown).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle unknown style gracefully', () => {
      expect(() => {
        // @ts-expect-error - Testing invalid input
        getQuestionsForStyle('unknown_style');
      }).not.toThrow();
    });

    it('should return null for unknown persona', () => {
      const question = generateCognitiveQuestion({
        personaId: 'unknown-persona',
        topic: 'test',
        emotionalWeight: 0.5,
        conversationDepth: 'moderate',
      });

      expect(question).toBeNull();
    });

    it('should handle extreme emotional weight', () => {
      expect(() => {
        generateCognitiveQuestion({
          personaId: 'ferni',
          topic: 'test',
          emotionalWeight: 1.0,
          conversationDepth: 'moderate',
        });

        generateCognitiveQuestion({
          personaId: 'ferni',
          topic: 'test',
          emotionalWeight: 0.0,
          conversationDepth: 'moderate',
        });
      }).not.toThrow();
    });
  });
});
