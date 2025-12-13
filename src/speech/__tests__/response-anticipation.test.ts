/**
 * Response Anticipation Tests
 *
 * Tests for the response anticipation cache and intent prediction.
 *
 * @module __tests__/response-anticipation.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getResponseAnticipationService,
  resetResponseAnticipationService,
  predictIntent,
  generatePrefetchContext,
  CACHED_PATTERNS,
  type IntentCategory,
} from '../response-anticipation.js';

// ============================================================================
// TEST SETUP
// ============================================================================

const TEST_SESSION_ID = 'test-session-response-anticipation';

describe('Response Anticipation', () => {
  beforeEach(() => {
    resetResponseAnticipationService(TEST_SESSION_ID);
  });

  afterEach(() => {
    resetResponseAnticipationService(TEST_SESSION_ID);
  });

  // ==========================================================================
  // INTENT PREDICTION TESTS
  // ==========================================================================

  describe('predictIntent', () => {
    it('should detect greetings', () => {
      const testCases = ['hi', 'hello', 'hey', 'good morning', 'howdy'];

      for (const input of testCases) {
        const result = predictIntent(input);
        expect(result.intent).toBe('greeting');
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should detect farewells', () => {
      const testCases = ['bye', 'goodbye', 'see you', 'talk later', 'gotta go'];

      for (const input of testCases) {
        const result = predictIntent(input);
        expect(result.intent).toBe('farewell');
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should detect affirmations', () => {
      const testCases = ['yes', 'yeah', 'yep', 'sure', 'okay', 'absolutely'];

      for (const input of testCases) {
        const result = predictIntent(input);
        expect(result.intent).toBe('affirmation');
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should detect negations', () => {
      const testCases = ['no', 'nope', 'not really'];

      for (const input of testCases) {
        const result = predictIntent(input);
        expect(result.intent).toBe('negation');
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should detect gratitude', () => {
      const testCases = ['thanks', 'thank you', 'appreciate it'];

      for (const input of testCases) {
        const result = predictIntent(input);
        expect(result.intent).toBe('gratitude');
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should detect emotional disclosure', () => {
      const testCases = [
        'i feel sad',
        "i'm feeling overwhelmed",
        "it's been hard lately",
        "i've been struggling",
      ];

      for (const input of testCases) {
        const result = predictIntent(input);
        expect(result.intent).toBe('emotional_disclosure');
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should detect task requests', () => {
      const testCases = ['can you help me', 'could you explain', 'help me with'];

      for (const input of testCases) {
        const result = predictIntent(input);
        expect(result.intent).toBe('task_request');
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should return unknown for unrecognized input', () => {
      const result = predictIntent('something completely random here');
      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    it('should return unknown for very short input', () => {
      const result = predictIntent('a');
      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    it('should be case insensitive', () => {
      const lower = predictIntent('hello');
      const upper = predictIntent('HELLO');
      const mixed = predictIntent('HeLLo');

      expect(lower.intent).toBe('greeting');
      expect(upper.intent).toBe('greeting');
      expect(mixed.intent).toBe('greeting');
    });
  });

  // ==========================================================================
  // SERVICE TESTS
  // ==========================================================================

  describe('ResponseAnticipationService', () => {
    it('should create a service instance', () => {
      const service = getResponseAnticipationService(TEST_SESSION_ID);
      expect(service).toBeDefined();
    });

    it('should anticipate greeting and return template', () => {
      const service = getResponseAnticipationService(TEST_SESSION_ID);
      const result = service.anticipate('hello');

      expect(result).not.toBeNull();
      expect(result!.intent).toBe('greeting');
      expect(result!.template.length).toBeGreaterThan(0);
      expect(result!.isComplete).toBe(true);
    });

    it('should return null for low confidence predictions', () => {
      const service = getResponseAnticipationService(TEST_SESSION_ID);
      const result = service.anticipate('something completely unrelated');

      expect(result).toBeNull();
    });

    it('should get complete response for greetings', () => {
      const service = getResponseAnticipationService(TEST_SESSION_ID);
      service.anticipate('hello');
      const response = service.getCompleteResponse();

      expect(response).not.toBeNull();
      expect(response!.response.length).toBeGreaterThan(0);
      expect(response!.ssml.length).toBeGreaterThan(0);
    });

    it('should track cache statistics', () => {
      const service = getResponseAnticipationService(TEST_SESSION_ID);

      // Generate some predictions
      service.anticipate('hello');
      service.anticipate('thanks');
      service.anticipate('bye');

      const stats = service.getStats();
      expect(stats.hits).toBeGreaterThan(0);
      expect(stats.mostFrequentIntents.length).toBeGreaterThan(0);
    });

    it('should provide context hints for LLM', () => {
      const service = getResponseAnticipationService(TEST_SESSION_ID);
      const hint = service.getContextHintForLLM('i feel sad about this');

      expect(hint).not.toBeNull();
      expect(hint).toContain('Hint:');
    });

    it('should clear anticipation', () => {
      const service = getResponseAnticipationService(TEST_SESSION_ID);
      service.anticipate('hello');
      service.clearAnticipation();

      const response = service.getCompleteResponse();
      expect(response).toBeNull();
    });

    it('should track and consume cache hits', () => {
      const service = getResponseAnticipationService(TEST_SESSION_ID);

      expect(service.hasCacheHit()).toBe(false);

      service.markCacheHit('greeting');
      expect(service.hasCacheHit()).toBe(true);

      const consumed = service.consumeCacheHit();
      expect(consumed).toBe('greeting');
      expect(service.hasCacheHit()).toBe(false);
    });

    it('should reset properly', () => {
      const service = getResponseAnticipationService(TEST_SESSION_ID);

      service.anticipate('hello');
      service.markCacheHit('greeting');

      service.reset();

      const stats = service.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(service.hasCacheHit()).toBe(false);
      expect(service.getCompleteResponse()).toBeNull();
    });
  });

  // ==========================================================================
  // PREFETCH CONTEXT TESTS
  // ==========================================================================

  describe('generatePrefetchContext', () => {
    it('should detect work-related topics', () => {
      const context = generatePrefetchContext(
        ['my boss is being difficult', 'work has been stressful'],
        null,
        null
      );

      expect(context.recentTopics).toContain('work');
    });

    it('should detect relationship topics', () => {
      const context = generatePrefetchContext(
        ['my family is coming to visit', 'my partner and I talked'],
        null,
        null
      );

      expect(context.recentTopics).toContain('relationships');
    });

    it('should provide emotional hints', () => {
      const context = generatePrefetchContext([], 'stressed', null);

      expect(context.emotionalHint).toContain('stressed');
      expect(context.suggestedMode).toBe('supportive');
    });

    it('should suggest coaching mode for goals', () => {
      const context = generatePrefetchContext(
        ['i want to set some goals', 'planning for my future'],
        null,
        null
      );

      expect(context.recentTopics).toContain('goals');
      expect(context.suggestedMode).toBe('coaching');
    });

    it('should include current topic in recent topics', () => {
      const context = generatePrefetchContext([], null, 'health');

      expect(context.recentTopics).toContain('health');
    });

    it('should generate user history hint', () => {
      const context = generatePrefetchContext(
        ['dealing with financial stress', 'need to budget better'],
        null,
        null
      );

      expect(context.userHistoryHint).toContain('Recent topics');
      expect(context.recentTopics).toContain('finances');
    });
  });

  // ==========================================================================
  // PATTERN COVERAGE TESTS
  // ==========================================================================

  describe('CACHED_PATTERNS', () => {
    it('should have patterns for all major intent categories', () => {
      const intents = CACHED_PATTERNS.map((p) => p.intent);
      const uniqueIntents = [...new Set(intents)];

      // Should cover at least these key intents
      expect(uniqueIntents).toContain('greeting');
      expect(uniqueIntents).toContain('farewell');
      expect(uniqueIntents).toContain('affirmation');
      expect(uniqueIntents).toContain('negation');
      expect(uniqueIntents).toContain('gratitude');
      expect(uniqueIntents).toContain('emotional_disclosure');
    });

    it('should have context hints for all patterns', () => {
      for (const pattern of CACHED_PATTERNS) {
        expect(pattern.contextHint.length).toBeGreaterThan(0);
      }
    });
  });

  // ==========================================================================
  // PERFORMANCE TESTS
  // ==========================================================================

  describe('Performance', () => {
    it('should predict intent quickly (< 5ms)', () => {
      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        predictIntent('hello there');
        predictIntent('thanks for your help');
        predictIntent('i feel overwhelmed');
      }
      
      const elapsed = performance.now() - start;
      const avgMs = elapsed / 300;
      
      expect(avgMs).toBeLessThan(5);
    });

    it('should anticipate response quickly (< 10ms)', () => {
      const service = getResponseAnticipationService(TEST_SESSION_ID);
      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        service.anticipate('hello');
        service.clearAnticipation();
      }
      
      const elapsed = performance.now() - start;
      const avgMs = elapsed / 100;
      
      expect(avgMs).toBeLessThan(10);
    });
  });
});

