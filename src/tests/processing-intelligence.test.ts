/**
 * Processing Intelligence Tests
 *
 * Tests the unified context-aware processing phrase composition system.
 *
 * IMPORTANT: The phrase pools have been deprecated in favor of LLM behavioral guidance.
 * See: src/intelligence/context-builders/humanization/dynamic-speech-guidance.ts
 *
 * The new architecture:
 * - Processing phrases are intentionally empty
 * - The LLM generates natural speech based on behavioral guidance
 * - Pauses and avatar expressions still work as expected
 *
 * These tests validate:
 * - Processing type and weight handling
 * - Pause calculations based on time/relationship
 * - SSML formatting
 * - Avatar expression mapping
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock safe-logger
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import {
  composeProcessingExpression,
  formatProcessingAsSSML,
  getProcessingPhrase,
  type ProcessingContext,
} from '../intelligence/processing-intelligence.js';

describe('ProcessingIntelligence', () => {
  describe('composeProcessingExpression', () => {
    it('should compose a basic thinking expression', () => {
      const result = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'medium',
      });

      expect(result).toBeDefined();
      // Phrase is now intentionally empty - LLM generates speech from behavioral guidance
      expect(typeof result.phrase).toBe('string');
      expect(result.prePause).toBeGreaterThanOrEqual(0);
      expect(result.postPause).toBeGreaterThanOrEqual(0);
      expect(result.avatarExpression).toBe('thinking');
    });

    it('should vary phrase by weight', () => {
      const lightResult = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'light',
      });

      const heavyResult = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'heavy',
      });

      // Light should have shorter pauses than heavy
      expect(lightResult.prePause).toBeLessThanOrEqual(heavyResult.prePause);
      expect(lightResult.postPause).toBeLessThanOrEqual(heavyResult.postPause);
    });

    it('should handle emotional processing type', () => {
      const result = composeProcessingExpression({
        trigger: 'emotional',
        weight: 'heavy',
        emotionalState: {
          primary: 'sad',
          intensity: 0.8,
        },
      });

      // Phrase is empty by design - LLM generates natural speech
      expect(typeof result.phrase).toBe('string');
      // Heavy emotional processing should have longer pauses
      expect(result.prePause).toBeGreaterThanOrEqual(200);
      expect(result.avatarExpression).toBe('empathy');
    });

    it('should handle tool_call processing type', () => {
      const result = composeProcessingExpression({
        trigger: 'tool_call',
        weight: 'medium',
      });

      expect(typeof result.phrase).toBe('string');
      expect(result.avatarExpression).toBe('processing');
    });

    it('should handle memory_recall processing type', () => {
      const result = composeProcessingExpression({
        trigger: 'memory_recall',
        weight: 'medium',
      });

      expect(typeof result.phrase).toBe('string');
      expect(result.avatarExpression).toBe('remembering');
    });

    it('should adjust pauses for late night', () => {
      const dayResult = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'medium',
        hourOfDay: 14, // 2 PM
      });

      const nightResult = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'medium',
        hourOfDay: 2, // 2 AM
      });

      // Late night should have longer pauses
      expect(nightResult.prePause).toBeGreaterThanOrEqual(dayResult.prePause);
    });

    it('should adjust pauses for new relationships', () => {
      const newResult = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'medium',
        relationshipStage: 'new',
      });

      const deepResult = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'medium',
        relationshipStage: 'deep',
      });

      // New relationships need more explicit signals
      expect(newResult.prePause).toBeGreaterThanOrEqual(deepResult.prePause);
    });

    it('should support persona-specific overrides', () => {
      const ferniResult = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'light',
        personaId: 'ferni',
      });

      // Phrase is empty by design - persona-specific speech is now LLM-generated
      expect(typeof ferniResult.phrase).toBe('string');
      expect(ferniResult).toBeDefined();
    });
  });

  describe('formatProcessingAsSSML', () => {
    it('should format result as valid SSML', () => {
      const result = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'medium',
      });

      const ssml = formatProcessingAsSSML(result);

      expect(ssml).toContain('<break');
      expect(ssml).toContain('time=');
    });

    it('should include pre and post pauses', () => {
      const result = {
        phrase: 'Let me think...',
        prePause: 200,
        postPause: 300,
      };

      const ssml = formatProcessingAsSSML(result);

      expect(ssml).toContain('200ms');
      expect(ssml).toContain('300ms');
      expect(ssml).toContain('Let me think...');
    });
  });

  describe('getProcessingPhrase', () => {
    it('should return a string for each type and weight combination', () => {
      const types = ['thinking', 'emotional', 'tool_call', 'memory_recall'] as const;
      const weights = ['light', 'medium', 'heavy'] as const;

      for (const type of types) {
        for (const weight of weights) {
          const phrase = getProcessingPhrase(type, weight);
          // Phrases are now intentionally empty - LLM generates natural speech
          expect(typeof phrase).toBe('string');
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should handle undefined optional fields', () => {
      const result = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'medium',
        emotionalState: undefined,
        relationshipStage: undefined,
        hourOfDay: undefined,
        personaId: undefined,
      });

      expect(result).toBeDefined();
      expect(typeof result.phrase).toBe('string');
    });

    it('should handle unknown persona gracefully', () => {
      const result = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'medium',
        personaId: 'unknown-persona-xyz',
      });

      expect(result).toBeDefined();
      expect(typeof result.phrase).toBe('string');
    });

    it('should handle edge hour values', () => {
      // Midnight
      const midnight = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'medium',
        hourOfDay: 0,
      });
      expect(midnight).toBeDefined();

      // 11 PM
      const lateNight = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'medium',
        hourOfDay: 23,
      });
      expect(lateNight).toBeDefined();
    });
  });

  describe('phrase quality', () => {
    it('should return empty phrases (LLM generates speech from behavioral guidance)', () => {
      // This test documents the new architecture:
      // - Phrase pools are deprecated
      // - LLM generates natural speech from dynamic-speech-guidance.ts context builder
      // - Empty phrases are intentional and expected
      const types = ['thinking', 'emotional', 'tool_call', 'memory_recall'] as const;
      const weights = ['light', 'medium', 'heavy'] as const;

      for (const type of types) {
        for (const weight of weights) {
          const result = composeProcessingExpression({
            trigger: type,
            weight,
          });
          // Phrases are now empty by design
          expect(result.phrase).toBe('');
        }
      }
    });

    it('should return human-sounding phrases (no "Executing")', () => {
      const types = ['thinking', 'emotional', 'tool_call', 'memory_recall'] as const;
      const weights = ['light', 'medium', 'heavy'] as const;

      for (const type of types) {
        for (const weight of weights) {
          const result = composeProcessingExpression({
            trigger: type,
            weight,
          });
          // Now empty, but should never contain robotic language
          expect(result.phrase.toLowerCase()).not.toContain('executing');
          expect(result.phrase.toLowerCase()).not.toContain('processing');
          expect(result.phrase.toLowerCase()).not.toContain('querying');
        }
      }
    });
  });

  describe('avatar expressions', () => {
    it('should return correct avatar expressions for each processing type', () => {
      const expectations = {
        thinking: 'thinking',
        emotional: 'empathy',
        tool_call: 'processing',
        memory_recall: 'remembering',
        after_tool_result: 'interested',
        context_loading: 'processing',
      } as const;

      for (const [type, expectedAvatar] of Object.entries(expectations)) {
        const result = composeProcessingExpression({
          trigger: type as keyof typeof expectations,
          weight: 'medium',
        });
        expect(result.avatarExpression).toBe(expectedAvatar);
      }
    });
  });
});
