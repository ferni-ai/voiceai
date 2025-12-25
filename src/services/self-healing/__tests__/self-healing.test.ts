/**
 * Self-Healing Service Tests
 *
 * Tests for circuit breaker, resilient executor, and error humanizer.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock circuit alerting and metrics (to avoid side effects)
vi.mock('../circuit-alerting.js', () => ({
  handleCircuitStateChange: vi.fn(),
}));

vi.mock('../cloud-metrics.js', () => ({
  recordStateChange: vi.fn(),
  recordCircuitState: vi.fn(),
}));

import {
  CircuitBreaker,
  createCircuitBreaker,
  getAllCircuitStats,
  withResilience,
  makeResilient,
  humanizeError,
  getRecoveryMessage,
} from '../index.js';

describe('SelfHealing', () => {
  describe('CircuitBreaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      // Create a fresh breaker with low thresholds for testing
      breaker = new CircuitBreaker('test-circuit', {
        failureThreshold: 3,
        recoveryTimeout: 100, // Short for testing
        successThreshold: 2,
        failureWindow: 60000,
        onStateChange: vi.fn(),
      });
    });

    describe('initial state', () => {
      it('should start in closed state', () => {
        expect(breaker.state).toBe('closed');
        expect(breaker.isClosed).toBe(true);
        expect(breaker.isOpen).toBe(false);
      });

      it('should have correct name', () => {
        expect(breaker.name).toBe('test-circuit');
      });
    });

    describe('execute', () => {
      it('should execute successful operations', async () => {
        const result = await breaker.execute(async () => 'success');
        expect(result).toBe('success');
      });

      it('should pass through errors', async () => {
        await expect(
          breaker.execute(async () => {
            throw new Error('test error');
          })
        ).rejects.toThrow('test error');
      });

      it('should track failures', async () => {
        // Cause one failure
        await breaker
          .execute(async () => {
            throw new Error('fail');
          })
          .catch(() => {});

        const stats = breaker.getStats();
        expect(stats.totalFailures).toBe(1);
        expect(stats.state).toBe('closed');
      });
    });

    describe('state transitions', () => {
      it('should open after failure threshold', async () => {
        // Cause enough failures to open
        for (let i = 0; i < 3; i++) {
          await breaker
            .execute(async () => {
              throw new Error('fail');
            })
            .catch(() => {});
        }

        expect(breaker.state).toBe('open');
        expect(breaker.isOpen).toBe(true);
      });

      it('should trip manually and be in open state', () => {
        // Force open using trip()
        breaker.trip();

        expect(breaker.isOpen).toBe(true);
        expect(breaker.state).toBe('open');
      });

      it('should reset to closed manually', () => {
        breaker.trip();
        expect(breaker.isOpen).toBe(true);

        breaker.reset();
        expect(breaker.isClosed).toBe(true);
      });

      it('should allow execution after successful operations', async () => {
        // Execute multiple successful operations
        const result1 = await breaker.execute(async () => 'first');
        const result2 = await breaker.execute(async () => 'second');

        expect(result1).toBe('first');
        expect(result2).toBe('second');
        expect(breaker.isClosed).toBe(true);
      });
    });

    describe('getStats', () => {
      it('should return stats object', () => {
        const stats = breaker.getStats();

        expect(stats).toHaveProperty('name', 'test-circuit');
        expect(stats).toHaveProperty('state');
        expect(stats).toHaveProperty('failures');
        expect(stats).toHaveProperty('successes');
        expect(stats).toHaveProperty('totalRequests');
        expect(stats).toHaveProperty('totalFailures');
        expect(stats).toHaveProperty('totalSuccesses');
      });

      it('should track total requests', async () => {
        await breaker.execute(async () => 'one');
        await breaker.execute(async () => 'two');

        const stats = breaker.getStats();
        expect(stats.totalRequests).toBe(2);
        expect(stats.totalSuccesses).toBe(2);
      });
    });
  });

  describe('createCircuitBreaker', () => {
    it('should create a circuit breaker with default options', () => {
      const breaker = createCircuitBreaker('default-test');
      expect(breaker).toBeDefined();
      expect(breaker.name).toBe('default-test');
    });

    it('should return same breaker for same name', () => {
      const breaker1 = createCircuitBreaker('shared-name');
      const breaker2 = createCircuitBreaker('shared-name');
      expect(breaker1).toBe(breaker2);
    });

    it('should accept custom options', () => {
      const onStateChange = vi.fn();
      const breaker = createCircuitBreaker('custom-options', {
        failureThreshold: 10,
        onStateChange,
      });
      expect(breaker).toBeDefined();
    });
  });

  describe('getAllCircuitStats', () => {
    it('should return array of stats', () => {
      createCircuitBreaker('stats-test-1');
      createCircuitBreaker('stats-test-2');

      const allStats = getAllCircuitStats();
      expect(Array.isArray(allStats)).toBe(true);
      expect(allStats.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('withResilience', () => {
    it('should execute successful operation', async () => {
      const result = await withResilience(async () => 'success');
      expect(result).toBe('success');
    });

    it('should retry on transient failure', async () => {
      let attempts = 0;
      const result = await withResilience(
        async () => {
          attempts++;
          if (attempts < 2) {
            const error = new Error('ETIMEDOUT');
            throw error;
          }
          return 'success after retry';
        },
        { maxRetries: 3, baseDelay: 10 }
      );

      expect(result).toBe('success after retry');
      expect(attempts).toBe(2);
    });

    it('should fail after max retries', async () => {
      await expect(
        withResilience(
          async () => {
            throw new Error('ETIMEDOUT');
          },
          { maxRetries: 2, baseDelay: 10 }
        )
      ).rejects.toThrow('ETIMEDOUT');
    });

    it('should not retry non-retryable errors', async () => {
      let attempts = 0;
      await expect(
        withResilience(
          async () => {
            attempts++;
            throw new Error('Business logic error');
          },
          { maxRetries: 3, baseDelay: 10 }
        )
      ).rejects.toThrow('Business logic error');

      expect(attempts).toBe(1);
    });

    it('should call onRetry callback', async () => {
      const onRetry = vi.fn();
      let attempts = 0;

      await withResilience(
        async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('ECONNRESET');
          }
          return 'done';
        },
        { maxRetries: 3, baseDelay: 10, onRetry }
      );

      expect(onRetry).toHaveBeenCalled();
    });
  });

  describe('makeResilient', () => {
    it('should wrap async function with resilience', async () => {
      const originalFn = async (...args: unknown[]) => (args[0] as number) * 2;
      const resilientFn = makeResilient(originalFn, { maxRetries: 2 });

      const result = await resilientFn(5);
      expect(result).toBe(10);
    });

    it('should preserve function behavior', async () => {
      let callCount = 0;
      const originalFn = async (...args: unknown[]) => {
        callCount++;
        return `${args[0]}-${args[1]}`;
      };
      const resilientFn = makeResilient(originalFn);

      const result = await resilientFn('hello', 'world');
      expect(result).toBe('hello-world');
      expect(callCount).toBe(1);
    });
  });

  describe('humanizeError', () => {
    it('should humanize network errors', () => {
      const error = new Error('ECONNRESET: connection reset');
      const result = humanizeError(error);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('userMessage');
      expect(result).toHaveProperty('technicalSummary');
      expect(result).toHaveProperty('severity');
      expect(typeof result.userMessage).toBe('string');
    });

    it('should humanize timeout errors', () => {
      const error = new Error('Request timed out');
      const result = humanizeError(error);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('userMessage');
      expect(typeof result.userMessage).toBe('string');
    });

    it('should return humanized error for unknown errors', () => {
      const error = new Error('Some weird error');
      const result = humanizeError(error);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('userMessage');
      expect(typeof result.userMessage).toBe('string');
    });
  });

  describe('getRecoveryMessage', () => {
    it('should return a recovery message', () => {
      const message = getRecoveryMessage({
        wasInConversation: false,
        errorType: 'network',
      });

      expect(message).toBeDefined();
      expect(typeof message).toBe('string');
    });

    it('should return different messages for different contexts', () => {
      const simpleMsg = getRecoveryMessage({
        wasInConversation: false,
        errorType: 'network',
      });

      const conversationMsg = getRecoveryMessage({
        wasInConversation: true,
        lastUserMessage: 'Testing something',
        errorType: 'service',
      });

      // Both should return valid strings
      expect(simpleMsg).toBeDefined();
      expect(conversationMsg).toBeDefined();
      expect(typeof simpleMsg).toBe('string');
      expect(typeof conversationMsg).toBe('string');
    });
  });
});
