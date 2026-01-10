/**
 * Circuit Breaker Tests
 *
 * Tests the circuit breaker pattern implementation for preventing
 * cascading failures when calling external services.
 *
 * @module utils/__tests__/circuit-breaker.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
  getCircuitBreaker,
  resetAllCircuitBreakers,
  getAllCircuitBreakerStats,
  withCircuitBreaker,
  registerCircuitBreakerCallback,
  clearCircuitBreakerCallback,
} from '../circuit-breaker.js';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
    clearCircuitBreakerCallback();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic functionality', () => {
    it('should execute successful operations', async () => {
      const breaker = new CircuitBreaker('test', { failureThreshold: 3 });
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should pass through errors', async () => {
      const breaker = new CircuitBreaker('test', { failureThreshold: 3 });
      await expect(
        breaker.execute(async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');
    });

    it('should track call statistics', async () => {
      const breaker = new CircuitBreaker('test');
      await breaker.execute(async () => 'ok');
      await breaker.execute(async () => 'ok');

      const stats = breaker.getStats();
      expect(stats.totalCalls).toBe(2);
      expect(stats.state).toBe('closed');
    });
  });

  describe('circuit states', () => {
    it('should open circuit after failure threshold', async () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 2,
        resetTimeout: 1000,
      });

      // First failure
      await expect(
        breaker.execute(async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      // Second failure - should open circuit
      await expect(
        breaker.execute(async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      const stats = breaker.getStats();
      expect(stats.state).toBe('open');

      // Third call should throw CircuitOpenError
      await expect(breaker.execute(async () => 'ok')).rejects.toThrow(CircuitOpenError);
    });

    it('should transition to half-open after reset timeout', async () => {
      vi.useFakeTimers();

      const breaker = new CircuitBreaker('test', {
        failureThreshold: 2,
        resetTimeout: 1000,
      });

      // Open the circuit
      await expect(
        breaker.execute(async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();
      await expect(
        breaker.execute(async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      expect(breaker.getStats().state).toBe('open');

      // Advance time past reset timeout
      vi.advanceTimersByTime(1100);

      // Should allow one request (half-open)
      const result = await breaker.execute(async () => 'recovered');
      expect(result).toBe('recovered');
    });

    it('should close circuit after success threshold in half-open', async () => {
      vi.useFakeTimers();

      const breaker = new CircuitBreaker('test', {
        failureThreshold: 2,
        resetTimeout: 1000,
        successThreshold: 2,
      });

      // Open the circuit
      await expect(
        breaker.execute(async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();
      await expect(
        breaker.execute(async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      // Advance to half-open
      vi.advanceTimersByTime(1100);

      // First success in half-open
      await breaker.execute(async () => 'ok');

      // Second success - should close
      await breaker.execute(async () => 'ok');

      expect(breaker.getStats().state).toBe('closed');
    });

    it('should return to open state if half-open test fails', async () => {
      vi.useFakeTimers();

      const breaker = new CircuitBreaker('test', {
        failureThreshold: 2,
        resetTimeout: 1000,
      });

      // Open the circuit
      await expect(
        breaker.execute(async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();
      await expect(
        breaker.execute(async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      // Advance to half-open
      vi.advanceTimersByTime(1100);

      // Fail in half-open - should go back to open
      await expect(
        breaker.execute(async () => {
          throw new Error('still failing');
        })
      ).rejects.toThrow();

      expect(breaker.getStats().state).toBe('open');
    });
  });

  describe('canRequest', () => {
    it('should return true when circuit is closed', () => {
      const breaker = new CircuitBreaker('test');
      expect(breaker.canRequest()).toBe(true);
    });

    it('should return false when circuit is open', async () => {
      const breaker = new CircuitBreaker('test', { failureThreshold: 1 });

      await expect(
        breaker.execute(async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      expect(breaker.canRequest()).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset circuit to closed state', async () => {
      const breaker = new CircuitBreaker('test', { failureThreshold: 1 });

      // Open the circuit
      await expect(
        breaker.execute(async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      expect(breaker.getStats().state).toBe('open');

      // Reset
      breaker.reset();

      expect(breaker.getStats().state).toBe('closed');
      expect(breaker.getStats().failures).toBe(0);
    });
  });

  describe('registry functions', () => {
    it('should get or create circuit breakers by name', () => {
      const breaker1 = getCircuitBreaker('service-a');
      const breaker2 = getCircuitBreaker('service-a');

      expect(breaker1).toBe(breaker2);
    });

    it('should create different breakers for different names', () => {
      const breaker1 = getCircuitBreaker('service-a');
      const breaker2 = getCircuitBreaker('service-b');

      expect(breaker1).not.toBe(breaker2);
    });

    it('should get stats for all breakers', async () => {
      const breaker1 = getCircuitBreaker('service-a');
      const breaker2 = getCircuitBreaker('service-b');

      await breaker1.execute(async () => 'ok');
      await breaker2.execute(async () => 'ok');
      await breaker2.execute(async () => 'ok');

      const stats = getAllCircuitBreakerStats();
      expect(stats.length).toBe(2);
      expect(stats.find((s) => s.name === 'service-a')?.totalCalls).toBe(1);
      expect(stats.find((s) => s.name === 'service-b')?.totalCalls).toBe(2);
    });

    it('should reset all circuit breakers', async () => {
      const breaker1 = getCircuitBreaker('service-a', { failureThreshold: 1 });
      const breaker2 = getCircuitBreaker('service-b', { failureThreshold: 1 });

      // Open both
      await expect(
        breaker1.execute(async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();
      await expect(
        breaker2.execute(async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      // Reset all
      resetAllCircuitBreakers();

      expect(breaker1.getStats().state).toBe('closed');
      expect(breaker2.getStats().state).toBe('closed');
    });
  });

  describe('withCircuitBreaker wrapper', () => {
    it('should wrap a function with circuit breaker protection', async () => {
      const mockFn = vi.fn().mockResolvedValue('result');
      const protectedFn = withCircuitBreaker('my-service', mockFn);

      const result = await protectedFn();

      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalled();
    });

    it('should trip circuit after failures', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      const protectedFn = withCircuitBreaker('failing-service', mockFn, {
        failureThreshold: 2,
      });

      // Trigger failures
      await expect(protectedFn()).rejects.toThrow();
      await expect(protectedFn()).rejects.toThrow();

      // Third call should throw CircuitOpenError
      await expect(protectedFn()).rejects.toThrow(CircuitOpenError);
    });
  });

  describe('state change callback', () => {
    it('should notify callback on state change', async () => {
      const callback = vi.fn();
      registerCircuitBreakerCallback(callback);

      const breaker = new CircuitBreaker('callback-test', {
        failureThreshold: 2,
      });

      // Trigger failures to open circuit
      await expect(
        breaker.execute(async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();
      await expect(
        breaker.execute(async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      expect(callback).toHaveBeenCalledWith(
        'callback-test',
        'open',
        expect.any(Number),
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should clear callback', async () => {
      const callback = vi.fn();
      registerCircuitBreakerCallback(callback);
      clearCircuitBreakerCallback();

      const breaker = new CircuitBreaker('no-callback-test', {
        failureThreshold: 1,
      });

      await expect(
        breaker.execute(async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
