/**
 * SSML Performance Benchmark Tests
 *
 * Measures the performance of SSML tagging to ensure acceptable latency.
 * Voice interactions are time-sensitive - tagging must be fast!
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Import from unified ssml module
import { tagTextWithSsml, tagTextWithSsmlPersonaAware, regexCache } from '../ssml/index.js';

// ============================================================================
// TEST DATA
// ============================================================================

const SAMPLE_TEXTS = {
  short: 'Hello there, how are you today?',

  medium: `Let me tell you about index funds. The S&P 500 has historically returned about 10% annually. 
    With a low expense ratio of just 0.03%, your 401k can grow significantly over time. 
    Remember, it's time in the market, not timing the market.`,

  long: `I remember back in 1975 when we started Vanguard. The financial industry was very different then.
    Wall Street thought we were crazy to offer index funds to regular investors. "Who would want to just 
    match the market?" they asked. Well, over the past 50 years, index funds have grown from nothing to 
    over $10 trillion in assets. The S&P 500 index fund that we created has outperformed most actively 
    managed funds over any 15-year period. The key principles remain the same: keep costs low, diversify 
    broadly, stay the course, and don't let emotions drive your investment decisions. Your 401k and IRA 
    should be invested in low-cost index funds like VTI or VTSAX. The expense ratio matters more than 
    you might think - even a small difference of 50 basis points can cost you hundreds of thousands of 
    dollars over a 30-year investment horizon. Dollar cost averaging with regular contributions from your 
    HSA or 529 plan is another excellent strategy. I've seen too many investors try to time the market 
    and fail. The DJIA and NASDAQ will go up and down, but over time, patient investors are rewarded.`,

  financial_heavy: `Your 401k has grown by 12.5% YTD. The ETF allocation is 60% VTI, 20% VXUS, and 20% 
    BND. The SEC requires disclosure of the 0.03% TER. FINRA regulations apply to your IRA contributions. 
    The P/E ratio of the S&P 500 is currently around 25. Consider maxing out your HSA before your 529.`,

  emotional: `I'm so sorry to hear about your loss. I can imagine how devastating this must be. 
    Please know that I'm here for you. Take all the time you need. Your feelings are completely valid. 
    This is heartbreaking, and it's okay to grieve. I care deeply about your wellbeing.`,

  storytelling: `I remember when I was young, my father taught me about saving. He said, "Son, 
    a penny saved is a penny earned." Back in those days, we didn't have 401ks or IRAs. You know 
    what we did? We put money in a jar. Simple as that. And then one day, years later, I found myself 
    on Wall Street, surrounded by all these fancy financial instruments. But I never forgot those 
    lessons. That's why I started Vanguard - to bring simple, low-cost investing to everyone.`,
};

// ============================================================================
// PERFORMANCE HELPERS
// ============================================================================

function benchmark(fn: () => string, iterations = 100): { avgMs: number; maxMs: number } {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  return {
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    maxMs: Math.max(...times),
  };
}

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('SSML Performance Benchmarks', () => {
  beforeAll(() => {
    // Warm up the cache
    tagTextWithSsmlPersonaAware('Warm up text', { personaId: 'nayan-patel' });
  });

  describe('Legacy Tagger (tagTextWithSsml)', () => {
    it('should process short text in < 5ms average', () => {
      const result = benchmark(() => tagTextWithSsml(SAMPLE_TEXTS.short));
      console.log(`Short text: avg=${result.avgMs.toFixed(3)}ms, max=${result.maxMs.toFixed(3)}ms`);
      expect(result.avgMs).toBeLessThan(5);
    });

    it('should process medium text in < 10ms average', () => {
      const result = benchmark(() => tagTextWithSsml(SAMPLE_TEXTS.medium));
      console.log(
        `Medium text: avg=${result.avgMs.toFixed(3)}ms, max=${result.maxMs.toFixed(3)}ms`
      );
      expect(result.avgMs).toBeLessThan(10);
    });

    it('should process long text in < 20ms average', () => {
      const result = benchmark(() => tagTextWithSsml(SAMPLE_TEXTS.long));
      console.log(`Long text: avg=${result.avgMs.toFixed(3)}ms, max=${result.maxMs.toFixed(3)}ms`);
      expect(result.avgMs).toBeLessThan(20);
    });

    it('should handle financial-heavy text efficiently', () => {
      const result = benchmark(() => tagTextWithSsml(SAMPLE_TEXTS.financial_heavy));
      console.log(
        `Financial text: avg=${result.avgMs.toFixed(3)}ms, max=${result.maxMs.toFixed(3)}ms`
      );
      expect(result.avgMs).toBeLessThan(15);
    });
  });

  describe('Persona-Aware Tagger (tagTextWithSsmlPersonaAware)', () => {
    it('should process short text in < 5ms average', () => {
      const result = benchmark(() =>
        tagTextWithSsmlPersonaAware(SAMPLE_TEXTS.short, { personaId: 'ferni' })
      );
      console.log(
        `[Persona] Short text: avg=${result.avgMs.toFixed(3)}ms, max=${result.maxMs.toFixed(3)}ms`
      );
      expect(result.avgMs).toBeLessThan(5);
    });

    it('should process medium text in < 10ms average', () => {
      const result = benchmark(() =>
        tagTextWithSsmlPersonaAware(SAMPLE_TEXTS.medium, { personaId: 'nayan-patel' })
      );
      console.log(
        `[Persona] Medium text: avg=${result.avgMs.toFixed(3)}ms, max=${result.maxMs.toFixed(3)}ms`
      );
      expect(result.avgMs).toBeLessThan(10);
    });

    it('should process long text in < 20ms average', () => {
      const result = benchmark(() =>
        tagTextWithSsmlPersonaAware(SAMPLE_TEXTS.long, { personaId: 'nayan-patel' })
      );
      console.log(
        `[Persona] Long text: avg=${result.avgMs.toFixed(3)}ms, max=${result.maxMs.toFixed(3)}ms`
      );
      expect(result.avgMs).toBeLessThan(20);
    });

    it('should handle emotional text with appropriate pacing', () => {
      const result = benchmark(() =>
        tagTextWithSsmlPersonaAware(SAMPLE_TEXTS.emotional, { personaId: 'maya' })
      );
      console.log(
        `[Persona] Emotional text: avg=${result.avgMs.toFixed(3)}ms, max=${result.maxMs.toFixed(3)}ms`
      );
      expect(result.avgMs).toBeLessThan(10);
    });

    it('should handle storytelling text with enhancements', () => {
      const result = benchmark(() =>
        tagTextWithSsmlPersonaAware(SAMPLE_TEXTS.storytelling, { personaId: 'nayan-patel' })
      );
      console.log(
        `[Persona] Storytelling text: avg=${result.avgMs.toFixed(3)}ms, max=${result.maxMs.toFixed(3)}ms`
      );
      expect(result.avgMs).toBeLessThan(15);
    });
  });

  describe('Regex Cache Efficiency', () => {
    it('should have cache available for future optimization', () => {
      // The regex cache is available for use - current implementation
      // uses inline regex patterns, but cache is ready for optimization
      expect(regexCache).toBeDefined();
      expect(typeof regexCache.get).toBe('function');
      expect(typeof regexCache.clear).toBe('function');

      // Test the cache API works
      const testPattern = regexCache.get('\\btest\\b', 'gi');
      expect(testPattern).toBeInstanceOf(RegExp);
      expect(regexCache.size).toBeGreaterThan(0);
    });

    it('should maintain consistent performance across multiple calls', () => {
      const text = SAMPLE_TEXTS.long;

      // First batch
      const firstBatch = benchmark(
        () => tagTextWithSsmlPersonaAware(text, { personaId: 'nayan-patel' }),
        50
      );

      // Second batch (should be similar)
      const secondBatch = benchmark(
        () => tagTextWithSsmlPersonaAware(text, { personaId: 'nayan-patel' }),
        50
      );

      console.log(
        `First batch: avg=${firstBatch.avgMs.toFixed(3)}ms, Second batch: avg=${secondBatch.avgMs.toFixed(3)}ms`
      );
      // Performance should be consistent (within 3x variance - system load can cause fluctuations)
      expect(secondBatch.avgMs).toBeLessThan(firstBatch.avgMs * 3);
    });
  });

  describe('Comparison: Legacy vs Persona-Aware', () => {
    it('should have comparable performance for same text', () => {
      const text = SAMPLE_TEXTS.medium;

      const legacyResult = benchmark(() => tagTextWithSsml(text), 100);
      const personaResult = benchmark(
        () => tagTextWithSsmlPersonaAware(text, { personaId: 'nayan-patel' }),
        100
      );

      console.log(`Legacy: avg=${legacyResult.avgMs.toFixed(3)}ms`);
      console.log(`Persona-aware: avg=${personaResult.avgMs.toFixed(3)}ms`);

      // Persona-aware should be within 3x of legacy (it does more work)
      expect(personaResult.avgMs).toBeLessThan(legacyResult.avgMs * 3);
    });
  });

  describe('Throughput Tests', () => {
    it('should handle 100 short messages in < 500ms', () => {
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        tagTextWithSsmlPersonaAware(`Message ${i}: ${SAMPLE_TEXTS.short}`, { personaId: 'ferni' });
      }

      const elapsed = performance.now() - start;
      console.log(
        `100 short messages: ${elapsed.toFixed(2)}ms total, ${(elapsed / 100).toFixed(3)}ms avg`
      );
      expect(elapsed).toBeLessThan(500);
    });

    it('should handle rapid persona switching without degradation', () => {
      const personas = ['nayan-patel', 'peter-john', 'maya', 'alex', 'jordan', 'ferni'];
      const start = performance.now();

      for (let i = 0; i < 60; i++) {
        const persona = personas[i % personas.length];
        tagTextWithSsmlPersonaAware(SAMPLE_TEXTS.short, { personaId: persona });
      }

      const elapsed = performance.now() - start;
      console.log(
        `60 persona-switching calls: ${elapsed.toFixed(2)}ms total, ${(elapsed / 60).toFixed(3)}ms avg`
      );
      expect(elapsed).toBeLessThan(300);
    });
  });
});
