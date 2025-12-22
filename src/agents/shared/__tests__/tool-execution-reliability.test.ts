/**
 * Tool Execution Reliability Tests
 *
 * Tests for retry logic, circuit breaker, and error handling.
 *
 * @module agents/shared/__tests__/tool-execution-reliability.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  executeWithReliability,
  getToolMetrics,
  getAllToolMetrics,
  getCircuitBreakerStates,
  getReliabilityDashboard,
  resetReliabilityMetrics,
} from '../tool-execution-reliability.js';

describe('Tool Execution Reliability', () => {
  beforeEach(() => {
    resetReliabilityMetrics();
    vi.clearAllMocks();
  });

  describe('executeWithReliability', () => {
    it('should execute successfully on first attempt', async () => {
      const executor = vi.fn().mockResolvedValue('success');

      const { result, retries, fromFallback } = await executeWithReliability('testTool', executor);

      expect(result).toBe('success');
      expect(retries).toBe(0);
      expect(fromFallback).toBe(false);
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient failures', async () => {
      const executor = vi
        .fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValue('success after retries');

      const { result, retries, fromFallback } = await executeWithReliability('testTool', executor, {
        retryConfig: { maxRetries: 3, initialDelayMs: 10, maxDelayMs: 50 },
      });

      expect(result).toBe('success after retries');
      expect(retries).toBe(2);
      expect(fromFallback).toBe(false);
      expect(executor).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('INVALID_ARGUMENT: bad input'));

      await expect(
        executeWithReliability('testTool', executor, {
          retryConfig: { maxRetries: 3, initialDelayMs: 10 },
        })
      ).rejects.toThrow('INVALID_ARGUMENT');

      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should use fallback when all retries fail', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('timeout'));

      const { result, retries, fromFallback } = await executeWithReliability('testTool', executor, {
        retryConfig: { maxRetries: 2, initialDelayMs: 10, maxDelayMs: 50 },
        fallbackValue: 'fallback response',
      });

      expect(result).toBe('fallback response');
      expect(retries).toBe(2);
      expect(fromFallback).toBe(true);
      expect(executor).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('should not retry write operations', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('timeout'));

      await expect(
        executeWithReliability('rememberAboutUser', executor, {
          retryConfig: { maxRetries: 3 },
        })
      ).rejects.toThrow('timeout');

      // Write tools should only execute once (no retries)
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should track metrics per tool', async () => {
      const successExecutor = vi.fn().mockResolvedValue('ok');
      const failExecutor = vi.fn().mockRejectedValue(new Error('fail'));

      // Successful calls
      await executeWithReliability('metricsTool', successExecutor);
      await executeWithReliability('metricsTool', successExecutor);

      // Failed call with fallback
      await executeWithReliability('metricsTool', failExecutor, {
        retryConfig: { maxRetries: 0 },
        fallbackValue: 'fallback',
      });

      const metrics = getToolMetrics('metricsTool');
      expect(metrics).toBeDefined();
      expect(metrics!.totalCalls).toBe(3);
      expect(metrics!.successCount).toBe(2);
      expect(metrics!.failureCount).toBe(1);
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after threshold failures', async () => {
      const failExecutor = vi.fn().mockRejectedValue(new Error('service down'));

      // Fail 5 times (default threshold)
      for (let i = 0; i < 5; i++) {
        await executeWithReliability('circuitTool', failExecutor, {
          useCircuitBreaker: true,
          fallbackValue: 'fallback',
          retryConfig: { maxRetries: 0 },
        });
      }

      const states = getCircuitBreakerStates();
      expect(states.circuittool.state).toBe('open');
      expect(states.circuittool.failures).toBe(5);
    });

    it('should use fallback when circuit is open', async () => {
      const failExecutor = vi.fn().mockRejectedValue(new Error('service down'));

      // Trip the circuit
      for (let i = 0; i < 5; i++) {
        await executeWithReliability('openCircuitTool', failExecutor, {
          useCircuitBreaker: true,
          fallbackValue: 'fallback',
          retryConfig: { maxRetries: 0 },
        });
      }

      // Reset mock to verify it's not called when circuit is open
      failExecutor.mockClear();

      // This should return fallback without calling executor
      const { result, fromFallback } = await executeWithReliability(
        'openCircuitTool',
        failExecutor,
        {
          useCircuitBreaker: true,
          fallbackValue: 'circuit open fallback',
        }
      );

      expect(result).toBe('circuit open fallback');
      expect(fromFallback).toBe(true);
      expect(failExecutor).not.toHaveBeenCalled();

      const metrics = getToolMetrics('openCircuitTool');
      expect(metrics!.circuitOpenCount).toBeGreaterThan(0);
    });

    it('should reset failures on success', async () => {
      const executor = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce('success') // Success resets
        .mockRejectedValueOnce(new Error('fail after reset'));

      // Two failures
      await executeWithReliability('resetTool', executor, {
        useCircuitBreaker: true,
        fallbackValue: 'fb',
        retryConfig: { maxRetries: 0 },
      });
      await executeWithReliability('resetTool', executor, {
        useCircuitBreaker: true,
        fallbackValue: 'fb',
        retryConfig: { maxRetries: 0 },
      });

      let states = getCircuitBreakerStates();
      expect(states.resettool.failures).toBe(2);

      // Success resets failures
      await executeWithReliability('resetTool', executor, {
        useCircuitBreaker: true,
        retryConfig: { maxRetries: 0 },
      });

      states = getCircuitBreakerStates();
      expect(states.resettool.failures).toBe(0);
      expect(states.resettool.state).toBe('closed');
    });
  });

  describe('Reliability Dashboard', () => {
    it('should aggregate all metrics', async () => {
      const success = vi.fn().mockResolvedValue('ok');
      const fail = vi.fn().mockRejectedValue(new Error('fail'));

      await executeWithReliability('dashTool1', success);
      await executeWithReliability('dashTool2', success);
      await executeWithReliability('dashTool3', fail, {
        fallbackValue: 'fb',
        retryConfig: { maxRetries: 0 },
      });

      const dashboard = getReliabilityDashboard();

      expect(dashboard.summary.totalCalls).toBe(3);
      expect(dashboard.summary.totalFailures).toBe(1);
      expect(Object.keys(dashboard.toolMetrics)).toHaveLength(3);
    });

    it('should calculate success rate', async () => {
      const success = vi.fn().mockResolvedValue('ok');
      const fail = vi.fn().mockRejectedValue(new Error('fail'));

      // 8 successes
      for (let i = 0; i < 8; i++) {
        await executeWithReliability('rateTool', success);
      }

      // 2 failures
      for (let i = 0; i < 2; i++) {
        await executeWithReliability('rateTool', fail, {
          fallbackValue: 'fb',
          retryConfig: { maxRetries: 0 },
        });
      }

      const dashboard = getReliabilityDashboard();
      expect(dashboard.summary.overallSuccessRate).toBe('80.0%');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined fallback when circuit is open', async () => {
      const fail = vi.fn().mockRejectedValue(new Error('fail'));

      // Trip the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await executeWithReliability('noFallbackTool', fail, {
            useCircuitBreaker: true,
            retryConfig: { maxRetries: 0 },
          });
        } catch {
          // Expected
        }
      }

      // Should throw when circuit is open and no fallback
      await expect(
        executeWithReliability('noFallbackTool', fail, {
          useCircuitBreaker: true,
        })
      ).rejects.toThrow('Circuit breaker open');
    });

    it('should handle rate limit errors with retry', async () => {
      const executor = vi
        .fn()
        .mockRejectedValueOnce(new Error('429 rate limit exceeded'))
        .mockResolvedValue('success');

      const { result, retries } = await executeWithReliability('rateLimitTool', executor, {
        retryConfig: { maxRetries: 2, initialDelayMs: 10 },
      });

      expect(result).toBe('success');
      expect(retries).toBe(1);
    });

    it('should handle 5xx errors with retry', async () => {
      const executor = vi
        .fn()
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockResolvedValue('recovered');

      const { result, retries } = await executeWithReliability('serverErrorTool', executor, {
        retryConfig: { maxRetries: 2, initialDelayMs: 10 },
      });

      expect(result).toBe('recovered');
      expect(retries).toBe(1);
    });
  });
});
