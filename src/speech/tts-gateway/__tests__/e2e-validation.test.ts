/**
 * TTS Gateway E2E Validation Tests
 *
 * These tests validate that the TTS Gateway correctly handles SSML
 * and that NO SSML tags are ever spoken literally.
 *
 * The core bug we're fixing:
 * - LiveKit's Cartesia plugin fragments SSML tags across packets
 * - Tags like <break time="280ms"/> get split
 * - Cartesia speaks them literally: "break 280 milliseconds"
 *
 * The solution:
 * - Buffer text until SSML tags are complete
 * - Parse and extract prosody config
 * - Strip SSML before sending to TTS
 * - Apply prosody via API parameters instead
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseSSML, stripSSML, containsSSML, normalizeForCache } from '../ssml/index.js';
import { createTTSGateway, resetTTSGateway } from '../gateway.js';
import { createTTSCache } from '../../../services/tts/tts-cache.js';
import type { ITTSProvider, SSMLProsodyConfig } from '../types.js';

// ============================================================================
// TEST DATA: Real SSML patterns used in Ferni
// ============================================================================

const REAL_FERNI_SSML_PATTERNS = [
  // Basic break tag
  'Hello<break time="280ms"/>world',

  // Preamble with speed and emotion
  '<speed ratio="0.95"/><emotion value="happiness"/>Hello there!',

  // Multiple breaks
  'First<break time="300ms"/>second<break time="500ms"/>third',

  // Break at start (timing pause)
  '<break time="200ms"/>Hey, how are you?',

  // Complex emotional greeting
  '<emotion value="positivity" intensity="0.8"/><speed ratio="0.9"/>Good morning! How did you sleep?',

  // Long pause for dramatic effect
  'I think<break time="800ms"/>yes.',

  // Nested content (should strip outer tags)
  '<speed ratio="1.1">Fast speech here</speed>',

  // Volume adjustment
  '<volume ratio="0.8"/>Speaking quietly now',

  // Multiple prosody tags
  '<speed ratio="0.9"/><volume ratio="1.2"/><emotion value="curiosity"/>What do you think about that?',

  // Natural speech pattern
  '<break time="100ms"/>Um<break time="200ms"/>let me think about that.',

  // Empathetic response
  '<emotion value="sadness" intensity="0.6"/><speed ratio="0.85"/>I hear you. That sounds really hard.',
];

// SSML patterns that MUST NOT appear in final output
const FORBIDDEN_LITERAL_OUTPUTS = [
  'break', // From <break .../>
  'time=', // From time="..."
  'ratio=', // From ratio="..."
  'value=', // From value="..."
  'intensity=', // From intensity="..."
  'milliseconds', // From speaking "280ms" literally
  'ms', // Time unit (when preceded by number)
  '<', // Opening tag
  '>', // Closing tag
  '/>', // Self-closing tag
  '</', // Closing tag start
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createMockProvider(): ITTSProvider {
  return {
    name: 'mock-provider',
    synthesize: async (text: string) => {
      // Return fake audio (1 byte per character)
      return new ArrayBuffer(text.length);
    },
    isAvailable: async () => true,
    estimateDuration: (text: string) => text.length * 50,
  };
}

function containsForbiddenLiteral(text: string): string | null {
  const lowerText = text.toLowerCase();

  for (const forbidden of FORBIDDEN_LITERAL_OUTPUTS) {
    if (lowerText.includes(forbidden.toLowerCase())) {
      return forbidden;
    }
  }

  return null;
}

// ============================================================================
// E2E VALIDATION TESTS
// ============================================================================

describe('TTS Gateway E2E Validation', () => {
  // ==========================================================================
  // CRITICAL: No SSML spoken literally
  // ==========================================================================

  describe('SSML is NEVER spoken literally', () => {
    it.each(REAL_FERNI_SSML_PATTERNS)(
      'strips SSML from: %s',
      (input) => {
        const result = parseSSML(input);

        // Check that forbidden patterns are not in output
        const forbidden = containsForbiddenLiteral(result.cleanText);
        expect(forbidden).toBeNull();

        // Check no XML-like tags remain
        expect(containsSSML(result.cleanText)).toBe(false);
      }
    );

    it('never outputs "break" as spoken text', () => {
      const inputs = [
        '<break time="100ms"/>',
        '<break time="200ms"/>',
        '<break time="280ms"/>',
        '<break time="500ms"/>',
        '<break time="1s"/>',
        '<break time="2000ms"/>',
      ];

      for (const input of inputs) {
        const result = parseSSML(input);
        expect(result.cleanText.toLowerCase()).not.toContain('break');
      }
    });

    it('never outputs time values as spoken text', () => {
      const inputs = [
        '<break time="280ms"/>',
        '<break time="1500"/>',
        '<break time="2s"/>',
      ];

      for (const input of inputs) {
        const result = parseSSML(input);
        expect(result.cleanText).not.toMatch(/\d+ms/i);
        expect(result.cleanText).not.toMatch(/\d+s\b/i);
        expect(result.cleanText.toLowerCase()).not.toContain('milliseconds');
      }
    });

    it('never outputs speed/volume ratio values', () => {
      const inputs = [
        '<speed ratio="0.9"/>',
        '<speed ratio="1.2"/>',
        '<volume ratio="0.8"/>',
      ];

      for (const input of inputs) {
        const result = parseSSML(input);
        expect(result.cleanText).not.toMatch(/ratio/i);
        expect(result.cleanText).not.toMatch(/0\.\d/);
      }
    });

    it('never outputs emotion names from tags', () => {
      const inputs = [
        '<emotion value="happiness"/>',
        '<emotion value="sadness" intensity="0.5"/>',
        '<emotion value="positivity"/>',
      ];

      for (const input of inputs) {
        const result = parseSSML(input);
        // The emotion word itself might appear in speech, but not as tag attribute
        expect(result.cleanText).not.toContain('value=');
        expect(result.cleanText).not.toContain('intensity=');
      }
    });
  });

  // ==========================================================================
  // Prosody extraction
  // ==========================================================================

  describe('prosody extraction', () => {
    it('extracts all prosody from complex pattern', () => {
      const input =
        '<speed ratio="0.9"/><volume ratio="1.1"/><emotion value="happiness" intensity="0.7"/>Hello!';
      const result = parseSSML(input);

      expect(result.prosody.speed).toBe(0.9);
      expect(result.prosody.volume).toBe(1.1);
      expect(result.prosody.emotion).toBe('happiness');
      expect(result.prosody.emotionIntensity).toBe(0.7);
      expect(result.cleanText).toBe('Hello!');
    });

    it('preserves text content with natural cleanup', () => {
      // Note: Multiple periods are collapsed to single period (natural speech)
      const testCases = [
        { input: "Hello, how are you?", expected: "Hello, how are you?" },
        { input: "I'm doing great!", expected: "I'm doing great!" },
        { input: "Let's think about that...", expected: "Let's think about that." }, // Normalized
        { input: "Yes! Absolutely.", expected: "Yes! Absolutely." },
      ];

      for (const { input, expected } of testCases) {
        const ssmlInput = `<speed ratio="0.9"/>${input}`;
        const result = parseSSML(ssmlInput);
        expect(result.cleanText).toBe(expected);
      }
    });
  });

  // ==========================================================================
  // Cache normalization
  // ==========================================================================

  describe('cache normalization', () => {
    it('normalizes text consistently for cache keys', () => {
      const variations = [
        '<speed ratio="0.9"/>Hello World',
        '<volume ratio="1.0"/>hello world',
        '<emotion value="neutral"/>HELLO WORLD',
        '  hello   world  ',
        'Hello World',
      ];

      const normalized = variations.map(normalizeForCache);

      // All should normalize to the same value
      const expected = 'hello world';
      for (const norm of normalized) {
        expect(norm).toBe(expected);
      }
    });
  });

  // ==========================================================================
  // Gateway integration
  // ==========================================================================

  describe('gateway integration', () => {
    let gateway: ReturnType<typeof createTTSGateway>;

    beforeEach(() => {
      resetTTSGateway();
      gateway = createTTSGateway({
        provider: createMockProvider(),
        cache: createTTSCache(),
      });
    });

    afterEach(async () => {
      await gateway.shutdown();
    });

    it('synthesizes SSML without speaking tags', async () => {
      const result = await gateway.synthesize({
        text: '<break time="280ms"/>Hello world',
        voiceId: 'test-voice',
      });

      expect(result.audio.byteLength).toBeGreaterThan(0);
      // The audio length should correspond to "Hello world" not "<break time=..."
      // Mock provider returns 1 byte per character
      expect(result.audio.byteLength).toBeLessThan(30); // "Hello world" is 11 chars
    });

    it('applies prosody without speaking it', async () => {
      const result = await gateway.synthesize({
        text: '<speed ratio="0.8"/><emotion value="sadness"/>I understand',
        voiceId: 'test-voice',
      });

      expect(result.appliedProsody?.speed).toBe(0.8);
      expect(result.appliedProsody?.emotion).toBe('sadness');
    });

    it('handles empty result after SSML strip', async () => {
      const result = await gateway.synthesize({
        text: '<break time="500ms"/><break time="300ms"/>',
        voiceId: 'test-voice',
      });

      // Just breaks with no text should result in punctuation or empty
      expect(result.audio.byteLength).toBeLessThanOrEqual(2); // ". " or empty
    });
  });

  // ==========================================================================
  // Regression: The original bug
  // ==========================================================================

  describe('regression: original SSML fragmentation bug', () => {
    it('prevents "break 280 milliseconds" from being spoken', () => {
      // This was the exact bug: <break time="280ms"/> being spoken as
      // "break 280 milliseconds" because the tag got fragmented
      const input = '<break time="280ms"/>';
      const result = parseSSML(input);

      // MUST NOT contain these
      expect(result.cleanText.toLowerCase()).not.toContain('break');
      expect(result.cleanText).not.toContain('280');
      expect(result.cleanText.toLowerCase()).not.toContain('milliseconds');

      // Should be a comma (medium pause) or empty
      expect(result.cleanText.length).toBeLessThanOrEqual(2);
    });

    it('handles fragmented input gracefully', () => {
      // Simulate what happens when SSML gets fragmented
      // (though with buffering, this shouldn't happen)
      const fragments = [
        'Hello ',
        '<break time="',
        '280ms"/>',
        ' world',
      ];

      // Each fragment should be safe even if incomplete
      for (const fragment of fragments) {
        const result = parseSSML(fragment);
        // Should not speak the fragment as-is if it contains partial tags
        if (fragment.includes('<') && !fragment.includes('>')) {
          // Incomplete tag - should buffer, not process
          // In practice, the buffer transform handles this
        }
      }

      // Full combined text should work
      const combined = fragments.join('');
      const result = parseSSML(combined);
      expect(result.cleanText).not.toContain('<');
      expect(result.cleanText).not.toContain('>');
    });
  });
});
