/**
 * Processing Intelligence Tests
 *
 * Tests the unified context-aware processing phrase composition system.
 * This validates that processing phrases are dynamically composed based on:
 * - Processing type (thinking, emotional, tool_call, memory_recall)
 * - Processing weight (light, medium, heavy)
 * - Emotional state
 * - Relationship stage
 * - Time of day
 * - Persona
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
      expect(result.phrase).toBeTruthy();
      expect(result.prePause).toBeGreaterThanOrEqual(0);
      expect(result.postPause).toBeGreaterThanOrEqual(0);
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

      expect(result.phrase).toBeTruthy();
      // Heavy emotional processing should have longer pauses
      expect(result.prePause).toBeGreaterThanOrEqual(200);
    });

    it('should handle tool_call processing type', () => {
      const result = composeProcessingExpression({
        trigger: 'tool_call',
        weight: 'medium',
      });

      expect(result.phrase).toBeTruthy();
    });

    it('should handle memory_recall processing type', () => {
      const result = composeProcessingExpression({
        trigger: 'memory_recall',
        weight: 'medium',
      });

      expect(result.phrase).toBeTruthy();
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

      expect(ferniResult.phrase).toBeTruthy();
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
    it('should return a phrase for each type and weight combination', () => {
      const types = ['thinking', 'emotional', 'tool_call', 'memory_recall'] as const;
      const weights = ['light', 'medium', 'heavy'] as const;

      for (const type of types) {
        for (const weight of weights) {
          const phrase = getProcessingPhrase(type, weight);
          expect(phrase, `Missing phrase for ${type}/${weight}`).toBeTruthy();
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
      expect(result.phrase).toBeTruthy();
    });

    it('should handle unknown persona gracefully', () => {
      const result = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'medium',
        personaId: 'unknown-persona-xyz',
      });

      expect(result).toBeDefined();
      expect(result.phrase).toBeTruthy();
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
    it('should not return empty phrases', () => {
      const types = ['thinking', 'emotional', 'tool_call', 'memory_recall'] as const;
      const weights = ['light', 'medium', 'heavy'] as const;

      for (const type of types) {
        for (const weight of weights) {
          const result = composeProcessingExpression({
            trigger: type,
            weight,
          });
          expect(result.phrase.trim().length).toBeGreaterThan(0);
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
          expect(result.phrase.toLowerCase()).not.toContain('executing');
          expect(result.phrase.toLowerCase()).not.toContain('processing');
          expect(result.phrase.toLowerCase()).not.toContain('querying');
        }
      }
    });
  });
});
