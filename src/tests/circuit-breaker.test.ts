/**
 * Circuit Breaker Tests
 *
 * Tests for the circuit breaker pattern implementation:
 * - State transitions (closed -> open -> half-open -> closed)
 * - Failure threshold tracking
 * - Success recovery in half-open state
 * - Registry and helper functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
  getCircuitBreaker,
  getAllCircuitBreakerStats,
  resetAllCircuitBreakers,
  withCircuitBreaker,
} from '../utils/circuit-breaker.js';

// Mock the logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAllCircuitBreakers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('should start in closed state', () => {
      const breaker = new CircuitBreaker('test');
      const stats = breaker.getStats();

      expect(stats.state).toBe('closed');
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalCalls).toBe(0);
    });

    it('should use custom options', () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 3,
        resetTimeout: 5000,
        successThreshold: 1,
      });

      expect(breaker.getStats().name).toBe('test');
    });
  });

  describe('Closed State', () => {
    it('should execute function successfully in closed state', async () => {
      const breaker = new CircuitBreaker('test');
      const fn = vi.fn().mockResolvedValue('success');

      const result = await breaker.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
      expect(breaker.getStats().totalCalls).toBe(1);
    });

    it('should track successful calls', async () => {
      const breaker = new CircuitBreaker('test');
      const fn = vi.fn().mockResolvedValue('ok');

      await breaker.execute(fn);
      await breaker.execute(fn);

      const stats = breaker.getStats();
      expect(stats.successes).toBe(2);
      expect(stats.lastSuccess).toBeDefined();
    });

    it('should track failures but stay closed below threshold', async () => {
      const breaker = new CircuitBreaker('test', { failureThreshold: 5 });
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('fail');
      }

      const stats = breaker.getStats();
      expect(stats.state).toBe('closed');
      expect(stats.failures).toBe(3);
      expect(stats.totalFailures).toBe(3);
    });

    it('should reset failure count on success', async () => {
      const breaker = new CircuitBreaker('test', { failureThreshold: 5 });
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));
      const successFn = vi.fn().mockResolvedValue('ok');

      // Accumulate some failures
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failFn)).rejects.toThrow();
      }
      expect(breaker.getStats().failures).toBe(3);

      // Success resets failure count
      await breaker.execute(successFn);
      expect(breaker.getStats().failures).toBe(0);
    });

    it('should allow requests when canRequest() is called', () => {
      const breaker = new CircuitBreaker('test');
      expect(breaker.canRequest()).toBe(true);
    });
  });

  describe('Opening the Circuit', () => {
    it('should open circuit after reaching failure threshold', async () => {
      const breaker = new CircuitBreaker('test', { failureThreshold: 3 });
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('fail');
      }

      expect(breaker.getStats().state).toBe('open');
    });

    it('should throw CircuitOpenError when open', async () => {
      const breaker = new CircuitBreaker('test', { failureThreshold: 1 });
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      // Trip the circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');

      // Next call should get CircuitOpenError
      await expect(breaker.execute(fn)).rejects.toBeInstanceOf(CircuitOpenError);
      await expect(breaker.execute(fn)).rejects.toThrow(/Circuit breaker.*is OPEN/);
    });

    it('should not execute function when circuit is open', async () => {
      const breaker = new CircuitBreaker('test', { failureThreshold: 1 });
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));
      const newFn = vi.fn().mockResolvedValue('ok');

      // Trip the circuit
      await expect(breaker.execute(failFn)).rejects.toThrow();

      // New function should not be called
      await expect(breaker.execute(newFn)).rejects.toBeInstanceOf(CircuitOpenError);
      expect(newFn).not.toHaveBeenCalled();
    });

    it('should report canRequest() as false when open', async () => {
      const breaker = new CircuitBreaker('test', { failureThreshold: 1 });
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(breaker.execute(fn)).rejects.toThrow();

      expect(breaker.canRequest()).toBe(false);
    });
  });

  describe('Half-Open State', () => {
    it('should transition to half-open after reset timeout', async () => {
      vi.useFakeTimers();

      const breaker = new CircuitBreaker('test', {
        failureThreshold: 1,
        resetTimeout: 1000,
      });
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));
      const successFn = vi.fn().mockResolvedValue('ok');

      // Trip the circuit
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      expect(breaker.getStats().state).toBe('open');

      // Advance time past reset timeout
      vi.advanceTimersByTime(1100);

      // Next call should put it in half-open
      await breaker.execute(successFn);

      // After success in half-open, might transition to closed
      expect(['half-open', 'closed']).toContain(breaker.getStats().state);
    });

    it('should close circuit after success threshold in half-open', async () => {
      vi.useFakeTimers();

      const breaker = new CircuitBreaker('test', {
        failureThreshold: 1,
        resetTimeout: 1000,
        successThreshold: 2,
      });
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));
      const successFn = vi.fn().mockResolvedValue('ok');

      // Trip the circuit
      await expect(breaker.execute(failFn)).rejects.toThrow();
      vi.advanceTimersByTime(1100);

      // Two successes should close the circuit
      await breaker.execute(successFn);
      await breaker.execute(successFn);

      expect(breaker.getStats().state).toBe('closed');
    });

    it('should reopen circuit on failure in half-open state', async () => {
      vi.useFakeTimers();

      const breaker = new CircuitBreaker('test', {
        failureThreshold: 1,
        resetTimeout: 1000,
      });
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));

      // Trip the circuit
      await expect(breaker.execute(failFn)).rejects.toThrow();

      // Wait for reset timeout
      vi.advanceTimersByTime(1100);

      // Failure in half-open should reopen
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');

      expect(breaker.getStats().state).toBe('open');
    });
  });

  describe('Manual Reset', () => {
    it('should reset circuit to closed state', async () => {
      const breaker = new CircuitBreaker('test', { failureThreshold: 1 });
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      // Trip the circuit
      await expect(breaker.execute(fn)).rejects.toThrow();
      expect(breaker.getStats().state).toBe('open');

      // Manual reset
      breaker.reset();

      const stats = breaker.getStats();
      expect(stats.state).toBe('closed');
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
    });
  });

  describe('CircuitOpenError', () => {
    it('should have correct name property', () => {
      const error = new CircuitOpenError('test message');
      expect(error.name).toBe('CircuitOpenError');
      expect(error.message).toBe('test message');
    });
  });
});

describe('Circuit Breaker Registry', () => {
  // Note: Registry uses a module-level Map, so we can't fully clear it between tests.
  // These tests use unique names to avoid conflicts.

  describe('getCircuitBreaker', () => {
    it('should return the same instance for the same name', () => {
      const breaker1 = getCircuitBreaker('api');
      const breaker2 = getCircuitBreaker('api');

      expect(breaker1).toBe(breaker2);
    });

    it('should return different instances for different names', () => {
      const breaker1 = getCircuitBreaker('api1');
      const breaker2 = getCircuitBreaker('api2');

      expect(breaker1).not.toBe(breaker2);
    });

    it('should apply options on first creation', async () => {
      const breaker = getCircuitBreaker('test', { failureThreshold: 2 });
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(breaker.execute(fn)).rejects.toThrow();
      expect(breaker.getStats().state).toBe('closed'); // Still closed

      await expect(breaker.execute(fn)).rejects.toThrow();
      expect(breaker.getStats().state).toBe('open'); // Now open after 2 failures
    });
  });

  describe('getAllCircuitBreakerStats', () => {
    it('should return stats for created breakers', async () => {
      // Use unique names for this test
      getCircuitBreaker('stats-api1');
      getCircuitBreaker('stats-api2');
      getCircuitBreaker('stats-api3');

      const stats = getAllCircuitBreakerStats();

      // Should contain at least our created breakers
      expect(stats.length).toBeGreaterThanOrEqual(3);
      expect(stats.map((s) => s.name)).toContain('stats-api1');
      expect(stats.map((s) => s.name)).toContain('stats-api2');
      expect(stats.map((s) => s.name)).toContain('stats-api3');
    });
  });

  describe('resetAllCircuitBreakers', () => {
    it('should reset all breakers to closed state', async () => {
      // Use unique names for this test
      const breaker1 = getCircuitBreaker('reset-api1', { failureThreshold: 1 });
      const breaker2 = getCircuitBreaker('reset-api2', { failureThreshold: 1 });
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      // Trip both breakers
      await expect(breaker1.execute(fn)).rejects.toThrow();
      await expect(breaker2.execute(fn)).rejects.toThrow();

      expect(breaker1.getStats().state).toBe('open');
      expect(breaker2.getStats().state).toBe('open');

      // Reset all
      resetAllCircuitBreakers();

      expect(breaker1.getStats().state).toBe('closed');
      expect(breaker2.getStats().state).toBe('closed');
    });
  });
});

describe('withCircuitBreaker', () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
  });

  it('should wrap function with circuit breaker protection', async () => {
    const originalFn = vi.fn().mockResolvedValue('result');
    const wrappedFn = withCircuitBreaker('test', originalFn);

    const result = await wrappedFn();

    expect(result).toBe('result');
    expect(originalFn).toHaveBeenCalled();
  });

  it('should pass arguments through to wrapped function', async () => {
    const originalFn = vi.fn().mockImplementation((a: number, b: number) => Promise.resolve(a + b));
    const wrappedFn = withCircuitBreaker('test', originalFn);

    const result = await wrappedFn(2, 3);

    expect(result).toBe(5);
    expect(originalFn).toHaveBeenCalledWith(2, 3);
  });

  it('should open circuit after failures', async () => {
    const originalFn = vi.fn().mockRejectedValue(new Error('fail'));
    const wrappedFn = withCircuitBreaker('test', originalFn, { failureThreshold: 2 });

    await expect(wrappedFn()).rejects.toThrow('fail');
    await expect(wrappedFn()).rejects.toThrow('fail');
    await expect(wrappedFn()).rejects.toBeInstanceOf(CircuitOpenError);
  });
});
