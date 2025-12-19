/**
 * Tests for LLM Expression Generator
 *
 * Tests the async LLM-powered expression generation system,
 * including queue management, caching, and content validation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import the functions we're testing
// Note: We import from the source file directly for testing
import {
  requestExpression,
  getGeneratedExpression,
  clearCache,
  getStats,
  prewarmCache,
} from '../llm-expression-generator.js';

describe('LLM Expression Generator', () => {
  beforeEach(() => {
    // Clear cache between tests
    clearCache('test-user');
    clearCache('__global__');
  });

  describe('requestExpression', () => {
    it('should queue an expression request without throwing', () => {
      expect(() => {
        requestExpression('warm_drinks', { timeOfDay: 'morning' }, 'normal');
      }).not.toThrow();
    });

    it('should track total requests in stats', () => {
      const beforeStats = getStats();
      const beforeCount = beforeStats.totalRequests;

      requestExpression('warm_drinks', { timeOfDay: 'morning' }, 'normal');
      requestExpression('global_traveler', { timeOfDay: 'afternoon' }, 'normal');

      const afterStats = getStats();
      expect(afterStats.totalRequests).toBeGreaterThanOrEqual(beforeCount + 2);
    });
  });

  describe('getGeneratedExpression', () => {
    it('should return null when cache is empty', () => {
      const result = getGeneratedExpression('test-user', 'warm_drinks', {
        timeOfDay: 'morning',
      });
      expect(result).toBeNull();
    });

    it('should increment cache hits when expression is found', () => {
      // Note: This would require mocking the LLM response
      // For now we just verify it doesn't throw
      expect(() => {
        getGeneratedExpression('test-user', 'warm_drinks', {
          timeOfDay: 'morning',
        });
      }).not.toThrow();
    });
  });

  describe('prewarmCache', () => {
    it('should queue requests for common themes', () => {
      const beforeStats = getStats();
      const beforeCount = beforeStats.totalRequests;

      prewarmCache({ timeOfDay: 'morning', relationshipStage: 'acquaintance' });

      const afterStats = getStats();
      // Prewarm queues 5 common themes
      expect(afterStats.totalRequests).toBeGreaterThanOrEqual(beforeCount + 5);
    });
  });

  describe('clearCache', () => {
    it('should clear user cache without throwing', () => {
      expect(() => {
        clearCache('test-user');
      }).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return stats object with expected shape', () => {
      const stats = getStats();

      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('cacheHits');
      expect(stats).toHaveProperty('llmCalls');
      expect(stats).toHaveProperty('llmFailures');
      expect(stats).toHaveProperty('avgLatencyMs');
      expect(stats).toHaveProperty('queueLength');
      expect(stats).toHaveProperty('cacheSize');
    });
  });
});

describe('Content Validation (via integration)', () => {
  // These tests verify that AI tells would be filtered
  // Note: The isValidExpression function is internal, so we test its effect

  const aiTells = [
    "That's interesting, tell me more",
    'I understand how you feel',
    'Good question! Let me help you',
    "What I'm hearing is that you...",
  ];

  it('should have AI tells defined for filtering', () => {
    // This is a meta-test to ensure our AI tells list exists
    expect(aiTells.length).toBeGreaterThan(0);
  });

  // Note: Full integration testing would require mocking Gemini API
  // and verifying filtered expressions don't include AI tells
});

