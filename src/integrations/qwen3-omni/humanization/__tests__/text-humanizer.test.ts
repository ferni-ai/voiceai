/**
 * Text Humanizer unit tests
 */

import { describe, expect, it } from 'vitest';
import { lightHumanize } from '../text-humanizer.js';

describe('text-humanizer', () => {
  describe('lightHumanize', () => {
    it('returns plain text unchanged when no SSML', () => {
      const text = 'Hello world';
      const result = lightHumanize(text);
      expect(result).toBe('Hello world');
    });

    it('strips SSML tags', () => {
      const text = 'Hello <break time="300ms"/> world';
      const result = lightHumanize(text);
      expect(result).not.toContain('<break');
    });

    it('accepts optional personaId', () => {
      const result = lightHumanize('Test', 'ferni');
      expect(typeof result).toBe('string');
    });
  });
});
