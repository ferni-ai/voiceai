/**
 * Persona Speech Traits Loader Tests
 *
 * Tests for the persona speech traits integration system.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyPersonaSpeechTraits,
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
      expect(hasCustomSpeechTraits('peter-john')).toBe(true);
      expect(hasCustomSpeechTraits('maya-santos')).toBe(true);
      expect(hasCustomSpeechTraits('alex-chen')).toBe(true);
      expect(hasCustomSpeechTraits('jordan-taylor')).toBe(true);
      expect(hasCustomSpeechTraits('nayan-patel')).toBe(true);
    });

    it('should return false for personas without custom traits', () => {
      expect(hasCustomSpeechTraits('ferni')).toBe(false);
      expect(hasCustomSpeechTraits('unknown-persona')).toBe(false);
    });
  });

  describe('getPersonasWithSpeechTraits', () => {
    it('should return all personas with speech traits', () => {
      const personas = getPersonasWithSpeechTraits();
      expect(personas).toContain('peter-john');
      expect(personas).toContain('maya-santos');
      expect(personas).toContain('alex-chen');
      expect(personas).toContain('jordan-taylor');
      expect(personas).toContain('nayan-patel');
      expect(personas).toHaveLength(5);
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

  describe('applyPersonaSpeechTraits (async)', () => {
    it('should apply Peter John speech traits', async () => {
      const text = 'Here is the thing about staying the course.';
      const result = await applyPersonaSpeechTraits(text, 'peter-john', {
        emotion: 'affectionate',
        baseSpeed: 0.88,
        laughterCount: 0,
      });

      // Should have processed the text
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should apply Maya Santos speech traits', async () => {
      const text = 'Systems beat willpower every time.';
      const result = await applyPersonaSpeechTraits(text, 'maya-santos', {
        emotion: 'neutral',
        baseSpeed: 0.92,
        laughterCount: 0,
      });

      expect(result).toBeDefined();
      expect(result).toContain('Systems beat');
    });

    it('should apply Alex Chen speech traits', async () => {
      const text = 'Clear is kind. First, let me explain.';
      const result = await applyPersonaSpeechTraits(text, 'alex-chen', {
        emotion: 'neutral',
        baseSpeed: 0.94,
        laughterCount: 0,
      });

      expect(result).toBeDefined();
      expect(result).toContain('Clear is kind');
    });

    it('should apply Jordan Taylor speech traits', async () => {
      const text = 'Let us celebrate this milestone in your life arc!';
      const result = await applyPersonaSpeechTraits(text, 'jordan-taylor', {
        emotion: 'happy',
        baseSpeed: 0.95,
        laughterCount: 0,
      });

      expect(result).toBeDefined();
      expect(result).toContain('celebrate');
    });

    it('should apply Nayan Patel speech traits', async () => {
      const text = 'The seeker is the sought. Are you ready?';
      const result = await applyPersonaSpeechTraits(text, 'nayan-patel', {
        emotion: 'calm',
        baseSpeed: 0.82,
        laughterCount: 0,
      });

      expect(result).toBeDefined();
      expect(result).toContain('seeker');
    });

    it('should return original text for unknown personas', async () => {
      const text = 'Hello world';
      const result = await applyPersonaSpeechTraits(text, 'unknown-persona');

      expect(result).toBe(text);
    });

    it('should return original text for ferni (no custom traits)', async () => {
      const text = 'Hello world';
      const result = await applyPersonaSpeechTraits(text, 'ferni');

      expect(result).toBe(text);
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
