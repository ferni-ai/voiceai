/**
 * SSML Detection Tests
 *
 * Tests for text analysis functions that detect:
 * - Emotion in text
 * - Pacing adjustments
 * - Volume adjustments
 * - Vocal cues (laughter, sighs, disfluencies, etc.)
 */

import { describe, expect, it, vi } from 'vitest';

// Mock the constants module
vi.mock('../ssml/constants.js', () => ({
  EMOTION_KEYWORDS: {
    happy: 'happy',
    excited: 'excited',
    great: 'happy',
    wonderful: 'happy',
    sad: 'sad',
    sorry: 'sad',
    angry: 'angry',
    frustrated: 'angry',
    worried: 'worried',
    anxious: 'worried',
    curious: 'curious',
    interesting: 'curious',
  },
  SLOW_PACE_KEYWORDS: ['important', 'carefully', 'seriously', 'remember', 'key point'],
  FAST_PACE_KEYWORDS: ['quickly', 'hurry', 'urgent', 'exciting', 'amazing'],
  EMPHASIS_KEYWORDS: ['very', 'really', 'absolutely', 'definitely', 'extremely'],
  WHISPER_KEYWORDS: ['secret', 'quietly', 'between us', 'confidential'],
  CONTRASTIVE_PATTERNS: [/\b(but|however|although)\b/gi],
  LAUGHTER_PATTERNS: [/\bhaha\b/gi, /\blol\b/gi, /\blmao\b/gi, /😂/g, /🤣/g],
  SIGH_PATTERNS: [/\*sigh\*/gi, /\bsigh\b/gi],
  DISFLUENCY_PATTERNS: [/\bum+\b/gi, /\buh+\b/gi, /\bhmm+\b/gi],
  REPETITION_PATTERNS: [/\b(\w+)\s+\1\b/gi],
  SARCASTIC_PATTERNS: [/\bsure\b.*\bright\b/gi, /\byeah\b.*\bsure\b/gi],
}));

import { detectEmotion, detectPacing, detectVocalCues, detectVolume } from '../ssml/detection.js';

describe('SSML Detection', () => {
  describe('detectEmotion', () => {
    it('should detect happy emotion from keywords', () => {
      expect(detectEmotion('I am so happy today!')).toBe('happy');
      expect(detectEmotion('This is great news')).toBe('happy');
      expect(detectEmotion('What a wonderful day')).toBe('happy');
    });

    it('should detect sad emotion from keywords', () => {
      expect(detectEmotion("I'm sorry to hear that")).toBe('sad');
      expect(detectEmotion('This is so sad')).toBe('sad');
    });

    it('should detect angry emotion from keywords', () => {
      expect(detectEmotion('I am so angry right now')).toBe('angry');
      expect(detectEmotion("I'm really frustrated with this")).toBe('angry');
    });

    it('should detect worried emotion from keywords', () => {
      expect(detectEmotion("I'm worried about the market")).toBe('worried');
      expect(detectEmotion('Feeling anxious about the future')).toBe('worried');
    });

    it('should detect curious emotion from keywords', () => {
      expect(detectEmotion("I'm curious about investing")).toBe('curious');
      expect(detectEmotion('That sounds interesting')).toBe('curious');
    });

    it('should return neutral when no emotion keywords found', () => {
      expect(detectEmotion('The weather is nice')).toBe('neutral');
      expect(detectEmotion('Tell me about stocks')).toBe('neutral');
    });

    it('should be case insensitive', () => {
      expect(detectEmotion('I AM HAPPY')).toBe('happy');
      expect(detectEmotion('VERY SAD')).toBe('sad');
    });

    it('should select dominant emotion when multiple present', () => {
      // 'happy' and 'great' both map to 'happy', so it should dominate
      const result = detectEmotion('I am happy and great and wonderful');
      expect(result).toBe('happy');
    });

    it('should handle empty string', () => {
      expect(detectEmotion('')).toBe('neutral');
    });
  });

  describe('detectPacing', () => {
    it('should return normal pacing by default', () => {
      const result = detectPacing('Just a normal sentence.');
      expect(result.speed).toBeCloseTo(1.0, 1);
      expect(result.reason).toContain('normal');
    });

    it('should slow down for important keywords', () => {
      const result = detectPacing('This is an important point to remember.');
      expect(result.speed).toBeLessThan(1.0);
      expect(result.reason).toContain('slow');
    });

    it('should speed up for urgency keywords', () => {
      const result = detectPacing('This is urgent and exciting news!');
      expect(result.speed).toBeGreaterThan(1.0);
      expect(result.reason).toContain('fast');
    });

    it('should slow down slightly for questions', () => {
      const result = detectPacing('What do you think about this?');
      expect(result.reason).toContain('question');
    });

    it('should speed up slightly for exclamations', () => {
      const result = detectPacing('This is amazing!');
      expect(result.reason).toContain('exclamation');
    });

    it('should slow down for long sentences', () => {
      const longSentence =
        'This is a very long sentence that contains more than thirty words because we need to test the behavior of the pacing detection function when it encounters text that is unusually lengthy and complex.';
      const result = detectPacing(longSentence);
      expect(result.reason).toContain('long sentence');
    });

    it('should clamp speed to valid range (0.6-1.5)', () => {
      // Very slow: multiple slow keywords
      const verySlowResult = detectPacing(
        'This is very important, remember carefully, this is the key point to seriously consider.'
      );
      expect(verySlowResult.speed).toBeGreaterThanOrEqual(0.6);

      // Very fast: multiple fast keywords
      const veryFastResult = detectPacing('Quickly hurry this is urgent and exciting and amazing!');
      expect(veryFastResult.speed).toBeLessThanOrEqual(1.5);
    });

    it('should prefer fast when more fast keywords than slow', () => {
      const result = detectPacing('Important but quickly and urgent and exciting!');
      expect(result.reason).toContain('fast');
    });
  });

  describe('detectVolume', () => {
    it('should return normal volume by default', () => {
      const result = detectVolume('Just a normal sentence.');
      expect(result.volume).toBeCloseTo(1.0, 1);
      expect(result.hasEmphasis).toBe(false);
      expect(result.hasWhisper).toBe(false);
    });

    it('should increase volume for emphasis keywords', () => {
      const result = detectVolume('This is very important and absolutely critical!');
      expect(result.volume).toBeGreaterThan(1.0);
      expect(result.hasEmphasis).toBe(true);
    });

    it('should decrease volume for whisper keywords', () => {
      const result = detectVolume('This is a secret, keep it between us.');
      expect(result.volume).toBeLessThan(1.0);
      expect(result.hasWhisper).toBe(true);
    });

    it('should increase volume for ALL CAPS words', () => {
      const result = detectVolume('This is VERY IMPORTANT!');
      expect(result.volume).toBeGreaterThan(1.0);
      expect(result.hasEmphasis).toBe(true);
    });

    it('should increase volume for exclamation marks', () => {
      const result = detectVolume('Wow! Amazing! Great!');
      expect(result.volume).toBeGreaterThan(1.0);
      expect(result.hasEmphasis).toBe(true);
    });

    it('should clamp volume to valid range (0.5-2.0)', () => {
      // Very quiet: multiple whisper keywords
      const veryQuietResult = detectVolume('This is a secret, confidential, quietly between us.');
      expect(veryQuietResult.volume).toBeGreaterThanOrEqual(0.5);

      // Very loud: multiple emphasis keywords + caps + exclamations
      const veryLoudResult = detectVolume(
        'THIS IS VERY REALLY ABSOLUTELY DEFINITELY EXTREMELY IMPORTANT!!!'
      );
      expect(veryLoudResult.volume).toBeLessThanOrEqual(2.0);
    });

    it('should handle empty string', () => {
      const result = detectVolume('');
      expect(result.volume).toBeCloseTo(1.0, 1);
    });
  });

  describe('detectVocalCues', () => {
    it('should detect laughter patterns', () => {
      expect(detectVocalCues('haha that is funny').hasLaughter).toBe(true);
      expect(detectVocalCues('lol').hasLaughter).toBe(true);
      expect(detectVocalCues('that was hilarious 😂').hasLaughter).toBe(true);
    });

    it('should count laughter occurrences', () => {
      const result = detectVocalCues('haha lol haha');
      expect(result.hasLaughter).toBe(true);
      expect(result.laughterCount).toBeGreaterThan(1);
    });

    it('should detect sighs', () => {
      expect(detectVocalCues('*sigh* I am tired').hasSigh).toBe(true);
      expect(detectVocalCues('sigh').hasSigh).toBe(true);
    });

    it('should detect disfluencies', () => {
      expect(detectVocalCues('um I think').hasDisfluency).toBe(true);
      expect(detectVocalCues('uh let me see').hasDisfluency).toBe(true);
      expect(detectVocalCues('hmm interesting').hasDisfluency).toBe(true);
    });

    it('should detect repetition', () => {
      expect(detectVocalCues('I I mean').hasRepetition).toBe(true);
      expect(detectVocalCues('the the problem').hasRepetition).toBe(true);
    });

    it('should detect sarcasm patterns', () => {
      expect(detectVocalCues('Oh sure, right').hasSarcasm).toBe(true);
      expect(detectVocalCues('yeah sure whatever').hasSarcasm).toBe(true);
    });

    it('should return all false for clean text', () => {
      const result = detectVocalCues('This is a clean sentence without any vocal cues.');
      expect(result.hasLaughter).toBe(false);
      expect(result.hasSigh).toBe(false);
      expect(result.hasDisfluency).toBe(false);
      expect(result.hasRepetition).toBe(false);
      expect(result.hasSarcasm).toBe(false);
      expect(result.laughterCount).toBe(0);
    });

    it('should handle empty string', () => {
      const result = detectVocalCues('');
      expect(result.hasLaughter).toBe(false);
      expect(result.laughterCount).toBe(0);
    });
  });
});
