/**
 * Instruct Builder unit tests
 */

import { describe, expect, it } from 'vitest';
import {
  buildInstruct,
  splitIntoInstructSegments,
  translateBreaksToText,
  stripSsmlTags,
} from '../instruct-builder.js';

describe('instruct-builder', () => {
  describe('buildInstruct', () => {
    it('returns instruct and textPrefix for minimal config', () => {
      const result = buildInstruct({ personaId: 'ferni' });
      expect(result.instruct).toBeDefined();
      expect(typeof result.instruct).toBe('string');
      expect(result.textPrefix).toBeDefined();
      expect(result.addPauseBefore).toBe(false);
    });

    it('includes scene mood when provided', () => {
      const result = buildInstruct({
        personaId: 'ferni',
        sceneMood: 'warm',
        moodIntensity: 0.5,
      });
      expect(result.instruct.length).toBeGreaterThan(0);
    });
  });

  describe('splitIntoInstructSegments', () => {
    it('splits text into segments', () => {
      const segments = splitIntoInstructSegments('Hello. World.', 'ferni', {});
      expect(Array.isArray(segments)).toBe(true);
      expect(segments.length).toBeGreaterThan(0);
    });
  });

  describe('translateBreaksToText', () => {
    it('replaces break tags with ellipsis', () => {
      const text = 'Hello <break time="300ms"/> world';
      const result = translateBreaksToText(text);
      expect(result).toContain('...');
    });
  });

  describe('stripSsmlTags', () => {
    it('removes SSML tags', () => {
      const text = 'Hello <emotion value="happy"/> world';
      const result = stripSsmlTags(text);
      expect(result).not.toContain('<emotion');
      expect(result).toContain('world');
    });
  });
});
