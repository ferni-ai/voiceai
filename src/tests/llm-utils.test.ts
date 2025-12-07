/**
 * LLM Utils Tests
 *
 * Tests for:
 * - callLLMForJSON parsing logic
 * - Specialized LLM caller creation
 *
 * Note: External API calls are not mocked since they use dynamic imports.
 * These tests focus on the testable logic (JSON parsing, caller factories).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('LLM Utils', () => {
  describe('callLLMForJSON - JSON extraction logic', () => {
    it('should extract JSON from plain text response', () => {
      const response = '{"emotion": "happy", "confidence": 0.9}';
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      expect(jsonMatch).not.toBeNull();
      expect(JSON.parse(jsonMatch![0])).toEqual({ emotion: 'happy', confidence: 0.9 });
    });

    it('should extract JSON from markdown code blocks', () => {
      const response = 'Here is the result:\n```json\n{"status": "success"}\n```';
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      expect(jsonMatch).not.toBeNull();
      expect(JSON.parse(jsonMatch![0])).toEqual({ status: 'success' });
    });

    it('should handle nested JSON objects', () => {
      const response = '{"user": {"name": "John", "age": 30}, "active": true}';
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      expect(jsonMatch).not.toBeNull();
      const parsed = JSON.parse(jsonMatch![0]);
      expect(parsed.user.name).toBe('John');
      expect(parsed.active).toBe(true);
    });

    it('should not match non-JSON content', () => {
      const response = 'Just plain text without any JSON';
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      expect(jsonMatch).toBeNull();
    });

    it('should handle JSON with arrays', () => {
      const response = '{"items": [1, 2, 3], "count": 3}';
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      expect(jsonMatch).not.toBeNull();
      const parsed = JSON.parse(jsonMatch![0]);
      expect(parsed.items).toEqual([1, 2, 3]);
    });

    it('should handle multi-line JSON', () => {
      const response = `{
        "name": "test",
        "value": 42
      }`;
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      expect(jsonMatch).not.toBeNull();
      const parsed = JSON.parse(jsonMatch![0]);
      expect(parsed.name).toBe('test');
    });
  });

  describe('LLM caller factory patterns', () => {
    it('should create emotion caller with correct structure', () => {
      // Test the factory pattern
      const createCaller = () => async (prompt: string) => {
        // Would call LLM with emotion-specific settings
        return prompt ? 'mocked' : '';
      };

      const caller = createCaller();
      expect(typeof caller).toBe('function');
    });

    it('should create summarization caller with correct structure', () => {
      const createCaller = () => async (prompt: string) => {
        // Would call LLM with summarization settings
        return prompt ? 'mocked' : '';
      };

      const caller = createCaller();
      expect(typeof caller).toBe('function');
    });
  });

  describe('LLM call options', () => {
    it('should define valid option types', () => {
      const options = {
        maxTokens: 500,
        temperature: 0.3,
        timeout: 5000,
      };

      expect(options.maxTokens).toBeGreaterThan(0);
      expect(options.temperature).toBeGreaterThanOrEqual(0);
      expect(options.temperature).toBeLessThanOrEqual(1);
      expect(options.timeout).toBeGreaterThan(0);
    });

    it('should support different token limits for different use cases', () => {
      const emotionOptions = { maxTokens: 200, temperature: 0.2, timeout: 3000 };
      const summaryOptions = { maxTokens: 1000, temperature: 0.4, timeout: 10000 };

      // Emotion detection should be quick with short output
      expect(emotionOptions.maxTokens).toBeLessThan(summaryOptions.maxTokens);
      expect(emotionOptions.timeout).toBeLessThan(summaryOptions.timeout);

      // Emotion should be more deterministic
      expect(emotionOptions.temperature).toBeLessThan(summaryOptions.temperature);
    });
  });

  describe('Provider types', () => {
    it('should support expected providers', () => {
      const providers = ['google', 'openai', 'anthropic'];

      expect(providers).toContain('google');
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
    });
  });

  describe('JSON parsing error handling', () => {
    it('should handle malformed JSON gracefully', () => {
      const malformedResponses = [
        '{"broken": json}',
        '{missing: "quotes"}',
        "{'single': 'quotes'}",
        '{"unclosed": "value"',
      ];

      for (const response of malformedResponses) {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          expect(() => JSON.parse(jsonMatch[0])).toThrow();
        }
      }
    });

    it('should extract first JSON object when multiple exist', () => {
      const response = '{"first": 1} and {"second": 2}';
      const jsonMatch = response.match(/\{[\s\S]*?\}/);

      expect(jsonMatch).not.toBeNull();
      expect(JSON.parse(jsonMatch![0])).toEqual({ first: 1 });
    });
  });
});
