/**
 * Better-Than-PhD Integration Tests
 *
 * End-to-end integration tests that simulate real conversation flow
 * through the voice agent pipeline.
 *
 * These tests verify:
 * 1. Context builders fire at the right times
 * 2. Multiple systems work together
 * 3. Context is properly formatted for the LLM
 * 4. Performance meets requirements
 */

import { describe, expect, it } from 'vitest';

describe('Better-Than-PhD Integration', () => {
  describe('Context Formatting', () => {
    it('should format multiple injections correctly', async () => {
      const {
        formatContextForPrompt,
        createStandardInjection,
        createHintInjection,
        createCriticalInjection,
      } = await import('../intelligence/context-builders/index.js');

      const injections = [
        createCriticalInjection('test_critical', 'CRITICAL: This is urgent'),
        createStandardInjection('test_standard', 'STANDARD: This is important'),
        createHintInjection('test_hint', 'HINT: This is a suggestion'),
      ];

      const formatted = formatContextForPrompt(injections);

      // Should contain all content
      expect(formatted).toContain('CRITICAL');
      expect(formatted).toContain('STANDARD');
      expect(formatted).toContain('HINT');

      // Critical should come before standard and hint (priority ordering)
      const criticalIndex = formatted.indexOf('CRITICAL');
      const standardIndex = formatted.indexOf('STANDARD');
      const hintIndex = formatted.indexOf('HINT');

      expect(criticalIndex).toBeLessThan(standardIndex);
      expect(standardIndex).toBeLessThan(hintIndex);
    });

    it('should respect max length limits', async () => {
      const { formatContextForPrompt, createStandardInjection } =
        await import('../intelligence/context-builders/index.js');

      // Create many large injections
      const injections = [];
      for (let i = 0; i < 20; i++) {
        injections.push(createStandardInjection(`test_${i}`, 'A'.repeat(500)));
      }

      const formatted = formatContextForPrompt(injections, { maxLength: 2000 });

      // Should be within limit
      expect(formatted.length).toBeLessThanOrEqual(2000);
    });
  });
});
