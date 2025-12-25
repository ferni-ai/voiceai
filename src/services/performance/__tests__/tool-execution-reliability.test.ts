/**
 * Tool Execution Reliability Tests
 *
 * Tests for retry logic, circuit breaker, and metrics tracking.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  executeWithReliability,
  getToolMetrics,
  getAllToolMetrics,
  getCircuitBreakerStates,
  getReliabilityDashboard,
  resetReliabilityMetrics,
} from '../tool-execution-reliability.js';

describe('ToolExecutionReliability', () => {
  beforeEach(() => {
    resetReliabilityMetrics();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('executeWithReliability - success path', () => {
    it('should execute successfully on first attempt', async () => {
      const executor = vi.fn().mockResolvedValue('success');

      const result = await executeWithReliability('testTool', executor);

      expect(result.result).toBe('success');
      expect(result.retries).toBe(0);
      expect(result.fromFallback).toBe(false);
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should track success metrics', async () => {
      const executor = vi.fn().mockResolvedValue('data');

      await executeWithReliability('metricsTool', executor);

      const metrics = getToolMetrics('metricsTool');
      expect(metrics).not.toBeNull();
      expect(metrics?.totalCalls).toBe(1);
      expect(metrics?.successCount).toBe(1);
      expect(metrics?.failureCount).toBe(0);
      expect(metrics?.retryCount).toBe(0);
    });

    it('should normalize tool names (case insensitive)', async () => {
      const executor = vi.fn().mockResolvedValue('ok');

      await executeWithReliability('MyTool', executor);
      await executeWithReliability('mytool', executor);
      await executeWithReliability('MYTOOL', executor);

      const metrics = getToolMetrics('mytool');
      expect(metrics?.totalCalls).toBe(3);
    });
  });

  describe('executeWithReliability - retry logic', () => {
    it('should retry on retryable errors', async () => {
      const executor = vi
        .fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValue('success');

      const resultPromise = executeWithReliability('retryTool', executor, {
        retryConfig: { maxRetries: 2, initialDelayMs: 100 },
      });

      // Advance timers for retry delays
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);

      const result = await resultPromise;

      expect(result.result).toBe('success');
      expect(result.retries).toBe(2);
      expect(executor).toHaveBeenCalledTimes(3);
    });

    it('should track retry count in metrics', async () => {
      const executor = vi
        .fn()
        .mockRejectedValueOnce(new Error('500 server error'))
        .mockResolvedValue('ok');

      const resultPromise = executeWithReliability('retryMetrics', executor);
      await vi.advanceTimersByTimeAsync(200);
      await resultPromise;

      const metrics = getToolMetrics('retryMetrics');
      expect(metrics?.retryCount).toBe(1);
    });

    it('should not retry non-retryable errors', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('INVALID_ARGUMENT'));

      await expect(executeWithReliability('nonRetryable', executor)).rejects.toThrow(
        'INVALID_ARGUMENT'
      );

      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should not retry NOT_FOUND errors', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('NOT_FOUND'));

      await expect(executeWithReliability('notFound', executor)).rejects.toThrow('NOT_FOUND');

      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should not retry PERMISSION_DENIED errors', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('PERMISSION_DENIED'));

      await expect(executeWithReliability('denied', executor)).rejects.toThrow('PERMISSION_DENIED');

      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should retry 429 rate limit errors', async () => {
      const executor = vi
        .fn()
        .mockRejectedValueOnce(new Error('429 Too Many Requests'))
        .mockResolvedValue('ok');

      const resultPromise = executeWithReliability('rateLimited', executor);
      await vi.advanceTimersByTimeAsync(200);
      const result = await resultPromise;

      expect(result.retries).toBe(1);
      expect(executor).toHaveBeenCalledTimes(2);
    });

    it('should retry 502/503 errors', async () => {
      const executor = vi
        .fn()
        .mockRejectedValueOnce(new Error('502 Bad Gateway'))
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockResolvedValue('recovered');

      const resultPromise = executeWithReliability('serverError', executor);
      await vi.advanceTimersByTimeAsync(500);
      const result = await resultPromise;

      expect(result.retries).toBe(2);
      expect(result.result).toBe('recovered');
    });
  });

  describe('executeWithReliability - non-retryable tools', () => {
    it('should not retry playmusic (has side effects)', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('timeout'));

      await expect(executeWithReliability('playmusic', executor)).rejects.toThrow('timeout');

      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should not retry sendmessage', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('network error'));

      await expect(executeWithReliability('sendmessage', executor)).rejects.toThrow('network');

      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should not retry rememberaboutuser', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('500'));

      await expect(executeWithReliability('rememberaboutuser', executor)).rejects.toThrow('500');

      expect(executor).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeWithReliability - fallback values', () => {
    it('should return fallback value on failure', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('failed'));
      const fallbackValue = { default: 'data' };

      const result = await executeWithReliability('fallbackTool', executor, {
        fallbackValue,
      });

      expect(result.result).toEqual(fallbackValue);
      expect(result.fromFallback).toBe(true);
    });

    it('should throw if no fallback provided', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('critical failure'));

      await expect(executeWithReliability('noFallback', executor)).rejects.toThrow(
        'critical failure'
      );
    });
  });

  describe('circuit breaker', () => {
    it('should open circuit after threshold failures', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('always fails'));

      // Fail 5 times to open circuit (default threshold)
      for (let i = 0; i < 5; i++) {
        try {
          await executeWithReliability('getweather', executor, { useCircuitBreaker: true });
        } catch {
          // Expected
        }
      }

      const states = getCircuitBreakerStates();
      expect(states['getweather']?.state).toBe('open');
      expect(states['getweather']?.failures).toBe(5);
    });

    it('should use fallback when circuit is open', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('fail'));
      const fallback = { cached: true };

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await executeWithReliability('getnews', executor, { useCircuitBreaker: true });
        } catch {
          // Expected
        }
      }

      // Now circuit is open, should use fallback
      const result = await executeWithReliability('getnews', executor, {
        useCircuitBreaker: true,
        fallbackValue: fallback,
      });

      expect(result.result).toEqual(fallback);
      expect(result.fromFallback).toBe(true);
      // Executor should not be called when circuit is open
      expect(executor).toHaveBeenCalledTimes(5); // Only the initial 5 failures
    });

    it('should throw when circuit open and no fallback', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await executeWithReliability('getquote', executor, { useCircuitBreaker: true });
        } catch {
          // Expected
        }
      }

      await expect(
        executeWithReliability('getquote', executor, { useCircuitBreaker: true })
      ).rejects.toThrow('Circuit breaker open');
    });

    it('should transition to half-open after timeout', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await executeWithReliability('getcalendartoday', executor, { useCircuitBreaker: true });
        } catch {
          // Expected
        }
      }

      expect(getCircuitBreakerStates()['getcalendartoday']?.state).toBe('open');

      // Wait for reset timeout (30 seconds)
      await vi.advanceTimersByTimeAsync(31000);

      // Reset executor to succeed
      executor.mockResolvedValueOnce('recovered');

      // Try again - should transition to half-open and allow execution
      try {
        await executeWithReliability('getcalendartoday', executor, { useCircuitBreaker: true });
      } catch {
        // May still fail if mock wasn't set up correctly
      }

      // Should have attempted execution
      expect(executor).toHaveBeenCalledTimes(6);
    });

    it('should close circuit after success threshold in half-open', async () => {
      const executor = vi.fn();

      // First 5 calls fail to open circuit
      executor.mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 5; i++) {
        try {
          await executeWithReliability('getschedule', executor, { useCircuitBreaker: true });
        } catch {
          // Expected
        }
      }

      // Wait for timeout
      await vi.advanceTimersByTimeAsync(31000);

      // Now succeed twice to close circuit
      executor.mockResolvedValue('success');

      await executeWithReliability('getschedule', executor, { useCircuitBreaker: true });
      await executeWithReliability('getschedule', executor, { useCircuitBreaker: true });

      const states = getCircuitBreakerStates();
      expect(states['getschedule']?.state).toBe('closed');
    });

    it('should track circuit open count in metrics', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await executeWithReliability('getmarketsummary', executor, { useCircuitBreaker: true });
        } catch {
          // Expected
        }
      }

      // Try to call with open circuit (with fallback to avoid throw)
      await executeWithReliability('getmarketsummary', executor, {
        useCircuitBreaker: true,
        fallbackValue: {},
      });

      const metrics = getToolMetrics('getmarketsummary');
      expect(metrics?.circuitOpenCount).toBeGreaterThan(0);
    });
  });

  describe('getToolMetrics', () => {
    it('should return null for unknown tools', () => {
      const metrics = getToolMetrics('unknownTool');
      expect(metrics).toBeNull();
    });

    it('should track average duration', async () => {
      vi.useRealTimers(); // Need real timers for duration

      const executor = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('done'), 10))
      );

      await executeWithReliability('durationTool', executor);
      await executeWithReliability('durationTool', executor);

      const metrics = getToolMetrics('durationTool');
      expect(metrics?.avgDurationMs).toBeGreaterThan(0);

      vi.useFakeTimers();
    });

    it('should track last failure info', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('specific error'));

      try {
        await executeWithReliability('failureTool', executor);
      } catch {
        // Expected
      }

      const metrics = getToolMetrics('failureTool');
      expect(metrics?.lastFailure).toBeDefined();
      expect(metrics?.lastFailure?.error).toContain('specific error');
      expect(metrics?.lastFailure?.timestamp).toBeGreaterThan(0);
    });
  });

  describe('getAllToolMetrics', () => {
    it('should return empty object initially', () => {
      const metrics = getAllToolMetrics();
      expect(metrics).toEqual({});
    });

    it('should return all tracked tools', async () => {
      const executor = vi.fn().mockResolvedValue('ok');

      await executeWithReliability('tool1', executor);
      await executeWithReliability('tool2', executor);
      await executeWithReliability('tool3', executor);

      const metrics = getAllToolMetrics();

      expect(Object.keys(metrics)).toHaveLength(3);
      expect(metrics['tool1']).toBeDefined();
      expect(metrics['tool2']).toBeDefined();
      expect(metrics['tool3']).toBeDefined();
    });
  });

  describe('getCircuitBreakerStates', () => {
    it('should return empty object when no circuit breakers active', () => {
      const states = getCircuitBreakerStates();
      expect(states).toEqual({});
    });

    it('should track circuit breaker states', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('fail'));

      // Create some circuit activity
      try {
        await executeWithReliability('getweather', executor, { useCircuitBreaker: true });
      } catch {
        // Expected
      }

      const states = getCircuitBreakerStates();
      expect(states['getweather']).toBeDefined();
      expect(states['getweather'].state).toBe('closed'); // Not yet open (only 1 failure)
      expect(states['getweather'].failures).toBe(1);
    });
  });

  describe('getReliabilityDashboard', () => {
    it('should return comprehensive dashboard', async () => {
      const successExecutor = vi.fn().mockResolvedValue('ok');
      const failExecutor = vi.fn().mockRejectedValue(new Error('fail'));

      await executeWithReliability('successTool', successExecutor);
      await executeWithReliability('successTool', successExecutor);

      try {
        await executeWithReliability('failTool', failExecutor, { useCircuitBreaker: true });
      } catch {
        // Expected
      }

      const dashboard = getReliabilityDashboard();

      expect(dashboard.toolMetrics).toBeDefined();
      expect(dashboard.circuitBreakers).toBeDefined();
      expect(dashboard.summary).toBeDefined();

      expect(dashboard.summary.totalCalls).toBe(3);
      expect(dashboard.summary.totalFailures).toBe(1);
      expect(dashboard.summary.overallSuccessRate).toContain('%');
    });

    it('should count open circuits', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('fail'));

      // Open a circuit
      for (let i = 0; i < 5; i++) {
        try {
          await executeWithReliability('getweather', executor, { useCircuitBreaker: true });
        } catch {
          // Expected
        }
      }

      const dashboard = getReliabilityDashboard();
      expect(dashboard.summary.openCircuits).toBe(1);
    });
  });

  describe('resetReliabilityMetrics', () => {
    it('should clear all metrics', async () => {
      const executor = vi.fn().mockResolvedValue('ok');

      await executeWithReliability('resetTest', executor);
      expect(getToolMetrics('resetTest')).not.toBeNull();

      resetReliabilityMetrics();

      expect(getToolMetrics('resetTest')).toBeNull();
      expect(getAllToolMetrics()).toEqual({});
    });

    it('should reset circuit breakers', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('fail'));

      // Create circuit activity
      for (let i = 0; i < 5; i++) {
        try {
          await executeWithReliability('getweather', executor, { useCircuitBreaker: true });
        } catch {
          // Expected
        }
      }

      expect(getCircuitBreakerStates()['getweather']?.state).toBe('open');

      resetReliabilityMetrics();

      // After reset, circuit should be gone
      const states = getCircuitBreakerStates();
      expect(states['getweather']).toBeUndefined();
    });
  });
});
