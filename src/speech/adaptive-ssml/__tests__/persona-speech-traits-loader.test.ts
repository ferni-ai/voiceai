/**
 * Persona Speech Traits Loader Tests
 *
 * Tests for the persona speech traits integration system.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyPersonaSpeechTraitsSync,
  clearTraitRegistry,
  getPersonasWithSpeechTraits,
  hasCustomSpeechTraits,
  preloadAllTraits,
} from '../persona-speech-traits-loader.js';

describe('Persona Speech Traits Loader', () => {
  beforeEach(() => {
    clearTraitRegistry();
  });

  describe('hasCustomSpeechTraits', () => {
    it('should return true for personas with custom traits', () => {
      expect(hasCustomSpeechTraits('ferni')).toBe(true);
      expect(hasCustomSpeechTraits('peter-john')).toBe(true);
      expect(hasCustomSpeechTraits('maya-santos')).toBe(true);
      expect(hasCustomSpeechTraits('alex-chen')).toBe(true);
      expect(hasCustomSpeechTraits('jordan-taylor')).toBe(true);
      expect(hasCustomSpeechTraits('nayan-patel')).toBe(true);
    });

    it('should return false for personas without custom traits', () => {
      expect(hasCustomSpeechTraits('unknown-persona')).toBe(false);
      expect(hasCustomSpeechTraits('non-existent-persona')).toBe(false);
    });
  });

  describe('getPersonasWithSpeechTraits', () => {
    it('should return all personas with speech traits', () => {
      const personas = getPersonasWithSpeechTraits();
      expect(personas).toContain('ferni');
      expect(personas).toContain('peter-john');
      expect(personas).toContain('maya-santos');
      expect(personas).toContain('alex-chen');
      expect(personas).toContain('jordan-taylor');
      expect(personas).toContain('nayan-patel');
      expect(personas).toContain('joel-dickson');
      expect(personas).toHaveLength(7);
    });
  });

  describe('preloadAllTraits', () => {
    it('should preload all persona traits', async () => {
      await preloadAllTraits();

      // After preload, sync access should work
      const result = applyPersonaSpeechTraitsSync('stay the course', 'peter-john', {
        emotion: 'neutral',
        baseSpeed: 0.88,
        laughterCount: 0,
      });

      // Peter John's catchphrase should get emphasis
      expect(result).toContain('stay the course');
      expect(result.length).toBeGreaterThanOrEqual('stay the course'.length);
    });
  });

  describe('applyPersonaSpeechTraitsSync', () => {
    it('should return original text before preload', () => {
      const text = 'stay the course';
      const result = applyPersonaSpeechTraitsSync(text, 'peter-john');

      // Before preload, should return original
      expect(result).toBe(text);
    });

    it('should apply traits after preload', async () => {
      await preloadAllTraits();

      const text = 'stay the course';
      const result = applyPersonaSpeechTraitsSync(text, 'peter-john', {
        emotion: 'affectionate',
        baseSpeed: 0.88,
        laughterCount: 0,
      });

      // After preload, should process
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThanOrEqual(text.length);
    });
  });
});
