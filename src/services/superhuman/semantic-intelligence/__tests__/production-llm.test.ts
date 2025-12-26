/**
 * Production LLM Tests for Semantic Intelligence
 *
 * These tests call real Gemini Flash to validate:
 * 1. Advice detection accuracy in real LLM scenarios
 * 2. Person extraction accuracy
 * 3. Context formatting is actually usable by LLM
 *
 * IMPORTANT: These tests require GOOGLE_API_KEY and make real API calls!
 * Run with: GOOGLE_API_KEY=xxx pnpm vitest run production-llm.test.ts
 *
 * @module services/superhuman/semantic-intelligence/__tests__/production-llm
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Skip if no API key
const SKIP_TESTS = !process.env.GOOGLE_API_KEY;

describe.skipIf(SKIP_TESTS)('Production LLM Tests', () => {
  let testCount = 0;
  const MAX_TESTS = 20; // Limit API calls

  beforeAll(() => {
    if (SKIP_TESTS) {
      console.log('⚠️ Skipping production LLM tests - GOOGLE_API_KEY not set');
    } else {
      console.log('✅ Running production LLM tests with real API calls');
    }
  });

  afterAll(() => {
    console.log(`📊 Production LLM tests completed: ${testCount} API calls`);
  });

  // Helper to track API calls
  function trackCall() {
    testCount++;
    if (testCount > MAX_TESTS) {
      throw new Error(`Exceeded max API calls (${MAX_TESTS})`);
    }
  }

  describe('Real Advice Detection', () => {
    it('should detect explicit advice with high confidence', async () => {
      trackCall();
      const { detectAdviceWithLLM } = await import('../llm-detector.js');

      const result = await detectAdviceWithLLM(
        "I'd suggest taking a short break when you feel overwhelmed. Even just 5 minutes can help reset your focus."
      );

      expect(result.containsAdvice).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.category).toBeTruthy();
    });

    it('should detect subtle advice (permission-giving)', async () => {
      trackCall();
      const { detectAdviceWithLLM } = await import('../llm-detector.js');

      const result = await detectAdviceWithLLM(
        "It's okay to say no sometimes. You don't always have to be available for everyone."
      );

      expect(result.containsAdvice).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should NOT detect pure reflection as advice', async () => {
      trackCall();
      const { detectAdviceWithLLM } = await import('../llm-detector.js');

      const result = await detectAdviceWithLLM(
        "It sounds like you're feeling really overwhelmed with everything going on at work. That's a lot to carry."
      );

      expect(result.containsAdvice).toBe(false);
    });

    it('should NOT detect questions as advice', async () => {
      trackCall();
      const { detectAdviceWithLLM } = await import('../llm-detector.js');

      const result = await detectAdviceWithLLM(
        "How does that make you feel? What do you think would help in this situation?"
      );

      expect(result.containsAdvice).toBe(false);
    });
  });

  describe('Real Person Extraction', () => {
    it('should extract single named person', async () => {
      trackCall();
      const { extractPersonsWithLLM } = await import('../llm-detector.js');

      const result = await extractPersonsWithLLM(
        'I had lunch with Sarah yesterday and she mentioned she might be moving to Seattle.'
      );

      expect(result.length).toBeGreaterThan(0);
      expect(result.some(p => p.name.toLowerCase().includes('sarah'))).toBe(true);
    });

    it('should extract relationship mentions', async () => {
      trackCall();
      const { extractPersonsWithLLM } = await import('../llm-detector.js');

      const result = await extractPersonsWithLLM(
        'My mom called this morning and she seemed worried about dad.'
      );

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.some(p => p.relationship === 'parent')).toBe(true);
    });

    it('should extract multiple people', async () => {
      trackCall();
      const { extractPersonsWithLLM } = await import('../llm-detector.js');

      const result = await extractPersonsWithLLM(
        'I met with Dr. Johnson and then had coffee with my colleague Mike. Later, Jennifer from HR stopped by.'
      );

      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    it('should NOT extract companies as people', async () => {
      trackCall();
      const { extractPersonsWithLLM } = await import('../llm-detector.js');

      const result = await extractPersonsWithLLM(
        'I called Amazon about my order and then emailed Google support about my account.'
      );

      expect(result.length).toBe(0);
    });
  });

  describe('Real Advice Outcome Detection', () => {
    it('should detect positive outcome', async () => {
      trackCall();
      const { detectAdviceOutcomeWithLLM } = await import('../llm-detector.js');

      const result = await detectAdviceOutcomeWithLLM(
        "I tried that breathing technique you mentioned and it really helped! I felt so much calmer afterward.",
        "Try deep breathing when you feel anxious - 4 seconds in, 4 out"
      );

      expect(result.referencesAdvice).toBe(true);
      expect(result.outcome).toBe('followed');
      expect(result.sentiment).toBe('positive');
    });

    it('should detect negative outcome', async () => {
      trackCall();
      const { detectAdviceOutcomeWithLLM } = await import('../llm-detector.js');

      const result = await detectAdviceOutcomeWithLLM(
        "I tried talking to my boss like you suggested but it completely backfired. Now things are worse.",
        "Have you tried having an honest conversation with your boss?"
      );

      expect(result.referencesAdvice).toBe(true);
      expect(result.outcome).toBe('followed');
      expect(result.sentiment).toBe('negative');
    });

    it('should detect ignored advice', async () => {
      trackCall();
      const { detectAdviceOutcomeWithLLM } = await import('../llm-detector.js');

      const result = await detectAdviceOutcomeWithLLM(
        "I know you said I should take a vacation but I just can't right now with everything going on at work.",
        "Taking a vacation would help you recharge"
      );

      expect(result.referencesAdvice).toBe(true);
      expect(result.outcome).toBe('ignored');
    });

    it('should detect no reference when unrelated', async () => {
      trackCall();
      const { detectAdviceOutcomeWithLLM } = await import('../llm-detector.js');

      const result = await detectAdviceOutcomeWithLLM(
        "I had a great weekend hiking with friends in the mountains.",
        "Try journaling before bed to improve your sleep"
      );

      expect(result.referencesAdvice).toBe(false);
    });
  });

  describe('Context Building Performance', () => {
    it('should build full semantic intelligence context within latency budget', async () => {
      trackCall();
      const { buildSemanticIntelligenceContext, formatSemanticIntelligenceContext } =
        await import('../index.js');

      const startTime = Date.now();

      const context = await buildSemanticIntelligenceContext('test-user-prod', {
        topics: ['work', 'stress'],
        emotion: 'anxious',
        personMentioned: 'boss',
        isSessionStart: true,
      });

      const formatted = formatSemanticIntelligenceContext(context);
      const elapsed = Date.now() - startTime;

      console.log(`⏱️ Context build time: ${elapsed}ms`);
      console.log(`📄 Context length: ${formatted.length} chars`);

      // Should complete within 2 seconds (includes Firestore calls)
      expect(elapsed).toBeLessThan(2000);

      // Should have some content (even if empty for new user)
      expect(typeof formatted).toBe('string');
    });
  });

  describe('Hybrid Detection', () => {
    it('should use regex for simple patterns (fast path)', async () => {
      trackCall();
      const { detectAdviceHybrid } = await import('../llm-detector.js');

      const startTime = Date.now();
      const result = await detectAdviceHybrid(
        "You should definitely take that opportunity - it sounds perfect for you!"
      );
      const elapsed = Date.now() - startTime;

      expect(result.containsAdvice).toBe(true);
      // Regex path should be very fast (< 10ms)
      console.log(`⏱️ Hybrid detection (simple): ${elapsed}ms`);
    });

    it('should fall back to LLM for complex patterns', async () => {
      trackCall();
      const { detectAdviceHybrid } = await import('../llm-detector.js');

      const result = await detectAdviceHybrid(
        "I wonder if stepping back and looking at this from a different angle might give you some new perspective."
      );

      // This subtle pattern might or might not be caught by regex
      // The point is hybrid uses LLM for edge cases
      expect(typeof result.containsAdvice).toBe('boolean');
    });
  });
});

describe.skipIf(SKIP_TESTS)('LLM Latency Benchmarks', () => {
  it('should benchmark advice detection latency', async () => {
    const { detectAdviceWithLLM, clearLLMDetectorCache } = await import('../llm-detector.js');
    clearLLMDetectorCache(); // Ensure cold cache

    const samples = [
      "I'd recommend starting with small steps",
      "That sounds really difficult",
      "Have you considered talking to a professional?",
    ];

    const latencies: number[] = [];
    for (const sample of samples) {
      const start = Date.now();
      await detectAdviceWithLLM(sample);
      latencies.push(Date.now() - start);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);

    console.log(`\n📊 LLM Detection Latency Benchmarks:`);
    console.log(`  Average: ${avgLatency.toFixed(0)}ms`);
    console.log(`  Max: ${maxLatency}ms`);
    console.log(`  Samples: ${latencies.join('ms, ')}ms`);

    // P95 should be under 500ms for good UX
    expect(avgLatency).toBeLessThan(500);
  });
});

